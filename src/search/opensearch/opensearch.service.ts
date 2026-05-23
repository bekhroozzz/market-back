import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';
import {
  INDEX_NUMBER_OF_REPLICAS,
  INDEX_NUMBER_OF_SHARDS,
  PRODUCTS_INDEX,
} from '../constants/opensearch.constants';

/**
 * Core OpenSearch service.
 *
 * Responsibilities:
 * - Manages the OpenSearch client instance (singleton)
 * - Runs cluster healthcheck on startup
 * - Owns the index lifecycle (create, delete, verify)
 * - Exposes the raw client for services that need full DSL control
 *
 * Scaling notes:
 * - For production cluster: pass array of node URLs to `node`
 * - For auth: populate OPENSEARCH_USER / OPENSEARCH_PASSWORD
 * - For TLS: set `ssl.rejectUnauthorized` based on cert validity
 */
@Injectable()
export class OpenSearchService implements OnModuleInit {
  private readonly logger = new Logger(OpenSearchService.name);
  private readonly client: Client;
  private readonly indexName: string;

  constructor(private readonly configService: ConfigService) {
    const node = this.configService.get<string>(
      'OPENSEARCH_URL',
      'http://localhost:9200',
    );
    const user = this.configService.get<string>('OPENSEARCH_USER', '');
    const password = this.configService.get<string>('OPENSEARCH_PASSWORD', '');

    this.indexName = this.configService.get<string>(
      'OPENSEARCH_PRODUCTS_INDEX',
      PRODUCTS_INDEX,
    );

    this.client = new Client({
      node,
      ...(user && password ? { auth: { username: user, password } } : {}),
      ssl: {
        // Allow self-signed certs in dev/stage environments.
        // Set to true in production with valid certificates.
        rejectUnauthorized: false,
      },
      // Client-level retry handles transient network issues.
      // Application-level retry in services handles business logic failures.
      maxRetries: 3,
      requestTimeout: 30_000,
      sniffOnStart: false, // disable for single-node dev setup
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ping();
    await this.ensureIndex();
  }

  /** Returns the raw client for advanced queries in other services */
  getClient(): Client {
    return this.client;
  }

  get index(): string {
    return this.indexName;
  }

  // ─── Cluster health ───────────────────────────────────────────────────────

  async ping(): Promise<void> {
    try {
      const response = await this.client.cluster.health({});
      this.logger.log(
        `OpenSearch cluster status: ${(response.body as Record<string, unknown>).status} ` +
          `(${(response.body as Record<string, unknown>).number_of_nodes} node(s))`,
      );
    } catch (error) {
      this.logger.error(
        'OpenSearch is unreachable. Search features will be degraded.',
        error,
      );
    }
  }

  // ─── Index lifecycle ──────────────────────────────────────────────────────

  /**
   * Creates the products index if it does not exist.
   * Safe to call on every startup (idempotent).
   */
  async ensureIndex(): Promise<void> {
    const exists = await this.indexExists();
    if (exists) {
      this.logger.log(
        `Index "${this.indexName}" already exists – skipping creation.`,
      );
      return;
    }
    await this.createIndex();
  }

  async indexExists(): Promise<boolean> {
    const response = await this.client.indices.exists({
      index: this.indexName,
    });
    return response.statusCode === 200;
  }

  async createIndex(): Promise<void> {
    this.logger.log(`Creating index "${this.indexName}"…`);
    await this.client.indices.create({
      index: this.indexName,
      body: this.buildIndexSettings(),
    });
    this.logger.log(`Index "${this.indexName}" created successfully.`);
  }

  /**
   * Deletes and recreates the index.
   * Used before a full reindex to ensure a clean mapping state.
   *
   * WARNING: destroys all indexed data. Only call from BulkIndexerService.
   */
  async recreateIndex(): Promise<void> {
    this.logger.warn(
      `Recreating index "${this.indexName}" – all data will be deleted.`,
    );
    await this.client.indices.delete({ index: this.indexName });
    await this.createIndex();
  }

  // ─── Index settings & mappings ────────────────────────────────────────────

  /**
   * Full index configuration with custom analyzers and field mappings.
   *
   * Analyzer strategy:
   * ┌─────────────────────────┬──────────────────────────────────────────────┐
   * │ Analyzer                │ Purpose                                      │
   * ├─────────────────────────┼──────────────────────────────────────────────┤
   * │ main_analyzer           │ Full-text search (RU + EN, stemming, stop)   │
   * │ autocomplete_index      │ Edge n-gram for prefix/partial matching       │
   * │ autocomplete_search     │ No n-gram expansion on search side            │
   * └─────────────────────────┴──────────────────────────────────────────────┘
   */
  private buildIndexSettings(): Record<string, unknown> {
    return {
      settings: {
        number_of_shards: INDEX_NUMBER_OF_SHARDS,
        number_of_replicas: INDEX_NUMBER_OF_REPLICAS,
        // Refresh interval for near-real-time search.
        // Production: increase to '30s' or '60s' for higher indexing throughput.
        refresh_interval: '1s',
        analysis: {
          filter: {
            // Russian morphological stemmer
            ru_stemmer: {
              type: 'stemmer',
              language: 'russian',
            },
            // English morphological stemmer
            en_stemmer: {
              type: 'stemmer',
              language: 'english',
            },
            // Russian stopwords (и, в, на, по, для, из, ...)
            ru_stop: {
              type: 'stop',
              stopwords: '_russian_',
            },
            // English stopwords (the, a, an, is, ...)
            en_stop: {
              type: 'stop',
              stopwords: '_english_',
            },
            // Edge n-gram: index substrings from the start.
            // min_gram=2 → starts matching from 2 chars (avoids noise from single chars).
            // max_gram=20 → covers typical product names.
            edge_ngram_filter: {
              type: 'edge_ngram',
              min_gram: 2,
              max_gram: 20,
            },
          },
          analyzer: {
            /**
             * Main search analyzer (index + search).
             * Pipeline: tokenize → lowercase → ascii fold → remove stopwords → stem
             *
             * asciifolding: converts é→e, ü→u etc. (handles accented chars in brands).
             * Stemming: reduces "смартфоны" → "смартфон", "phones" → "phone".
             */
            main_analyzer: {
              type: 'custom',
              tokenizer: 'standard',
              filter: [
                'lowercase',
                'asciifolding',
                'ru_stop',
                'en_stop',
                'ru_stemmer',
                'en_stemmer',
              ],
            },
            /**
             * Autocomplete INDEX-time analyzer.
             * Generates edge n-grams: "ipho" → ["ip", "iph", "ipho"]
             * Allows matching partial words from the beginning.
             */
            autocomplete_index: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'asciifolding', 'edge_ngram_filter'],
            },
            /**
             * Autocomplete SEARCH-time analyzer.
             * Does NOT expand n-grams – just normalizes the query token.
             * Without this, a search for "iphone" would match all n-gram prefixes.
             */
            autocomplete_search: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'asciifolding'],
            },
          },
        },
      },
      mappings: {
        // Strict mapping: unknown fields are ignored (prevents index bloat).
        dynamic: false,
        properties: {
          id: { type: 'keyword' },

          /**
           * title: multi-field setup for different matching strategies.
           *
           * title          → full-text with stemming (main search)
           * title.keyword  → exact match, sorting, aggregations
           * title.autocomplete → edge n-gram prefix matching
           */
          title: {
            type: 'text',
            analyzer: 'main_analyzer',
            // Boost exact phrase matches by searching title.keyword
            fields: {
              keyword: {
                type: 'keyword',
                ignore_above: 256,
              },
              autocomplete: {
                type: 'text',
                analyzer: 'autocomplete_index',
                search_analyzer: 'autocomplete_search',
              },
            },
          },

          /**
           * search_as_you_type field: OpenSearch auto-creates subfields:
           *   titleSuggest._2gram, titleSuggest._3gram, titleSuggest._index_prefix
           * Used with type: "bool_prefix" for instant search-as-you-type experience.
           */
          titleSuggest: {
            type: 'search_as_you_type',
            analyzer: 'main_analyzer',
            search_analyzer: 'autocomplete_search',
          },

          slug: { type: 'keyword' },

          description: {
            type: 'text',
            analyzer: 'main_analyzer',
          },

          // Array of all ancestor category IDs.
          // Enables hierarchical filtering: filter by parent returns all children.
          categoryIds: { type: 'keyword' },

          brandId: { type: 'keyword' },

          /**
           * Nested type for attributes.
           * Critical: without nested, "color=red AND size=L" could match
           * a document where color=blue, size=L (cross-object matching).
           * Nested ensures both conditions apply to the SAME attribute object.
           */
          attributes: {
            type: 'nested',
            properties: {
              key: { type: 'keyword' },
              value: { type: 'keyword' },
            },
          },

          price: { type: 'double' },
          oldPrice: { type: 'double' },
          inStock: { type: 'boolean' },

          // float sufficient for 0–5 star range
          rating: { type: 'float' },

          salesCount: { type: 'integer' },

          // date type enables range queries and decay functions
          createdAt: { type: 'date' },
        },
      },
    };
  }
}
