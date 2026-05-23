import { Injectable, Logger } from '@nestjs/common';
import { OpenSearchService } from './opensearch/opensearch.service';
import {
  BulkIndexerService,
  ReindexReport,
} from './indexing/bulk-indexer.service';
import { SearchQueryBuilder } from './query/search-query.builder';
import { SearchProductsDto } from './dto/search-products.dto';
import { AutocompleteDto } from './dto/autocomplete.dto';
import { ProductDocument } from './interfaces/product-document.interface';
import {
  AutocompleteResult,
  AutocompleteSuggestion,
  OpenSearchHit,
  OpenSearchResponse,
  ProductHit,
  SearchResult,
} from './interfaces/search-result.interface';
import {
  AttributeFacet,
  BrandFacet,
  CategoryFacet,
  PriceRangeFacet,
  SearchFacets,
} from './interfaces/facets.interface';

/**
 * SearchService – orchestrates search and autocomplete operations.
 *
 * Delegates:
 * - Query building → SearchQueryBuilder
 * - OpenSearch communication → OpenSearchService
 * - Aggregation parsing → private parser methods
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly openSearchService: OpenSearchService,
    private readonly bulkIndexer: BulkIndexerService,
  ) {}

  // ─── Search ───────────────────────────────────────────────────────────────

  async searchProducts(dto: SearchProductsDto): Promise<SearchResult> {
    const query = SearchQueryBuilder.build(dto);

    const rawResponse = await this.openSearchService.getClient().search({
      index: this.openSearchService.index,
      body: query,
    });

    const body =
      rawResponse.body as unknown as OpenSearchResponse<ProductDocument>;
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const total = body.hits.total.value;

    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      items: this.parseHits(body.hits.hits),
      facets: this.parseAggregations(body.aggregations ?? {}),
      took: body.took,
    };
  }

  // ─── Autocomplete ─────────────────────────────────────────────────────────

  /**
   * Fast suggestions endpoint.
   * Designed for debounced input (trigger after 150–300ms of inactivity).
   * Returns lightweight documents (id, title, slug, price only).
   */
  async autocomplete(dto: AutocompleteDto): Promise<AutocompleteResult> {
    if (dto.q.trim().length < 2) {
      return { suggestions: [], took: 0 };
    }

    const query = SearchQueryBuilder.buildAutocomplete(dto);

    const rawResponse = await this.openSearchService.getClient().search({
      index: this.openSearchService.index,
      body: query,
    });

    const body =
      rawResponse.body as unknown as OpenSearchResponse<ProductDocument>;

    const suggestions: AutocompleteSuggestion[] = body.hits.hits.map((hit) => ({
      id: hit._source.id,
      title: hit._source.title,
      slug: hit._source.slug,
      price: hit._source.price,
    }));

    return { suggestions, took: body.took };
  }

  // ─── Reindex ──────────────────────────────────────────────────────────────

  async reindexAll(): Promise<ReindexReport> {
    return this.bulkIndexer.reindexAll();
  }

  // ─── Aggregation parsers ──────────────────────────────────────────────────

  private parseHits(hits: OpenSearchHit<ProductDocument>[]): ProductHit[] {
    return hits.map((hit) => ({
      document: hit._source,
      score: hit._score,
      highlight: hit.highlight
        ? {
            title: hit.highlight['title'],
            description: hit.highlight['description'],
          }
        : undefined,
    }));
  }

  private parseAggregations(aggs: Record<string, unknown>): SearchFacets {
    return {
      brands: this.parseBuckets(aggs, 'brands'),
      categories: this.parseBuckets(aggs, 'categories'),
      priceStats: this.parsePriceStats(aggs),
      priceRanges: this.parsePriceRanges(aggs),
      attributes: this.parseAttributeAggs(aggs),
    };
  }

  private parseBuckets(
    aggs: Record<string, unknown>,
    key: string,
  ): BrandFacet[] | CategoryFacet[] {
    const bucket = aggs[key] as AggsTermsBucket | undefined;
    if (!bucket?.buckets) return [];
    return bucket.buckets.map((b) => ({
      id: String(b.key),
      count: b.doc_count,
    }));
  }

  private parsePriceStats(
    aggs: Record<string, unknown>,
  ): SearchFacets['priceStats'] {
    const stats = aggs['price_stats'] as AggsStats | undefined;
    return {
      min: stats?.min ?? 0,
      max: stats?.max ?? 0,
      avg: stats?.avg ?? 0,
      count: stats?.count ?? 0,
    };
  }

  private parsePriceRanges(aggs: Record<string, unknown>): PriceRangeFacet[] {
    const rangeAgg = aggs['price_ranges'] as AggsRangeBucket | undefined;
    if (!rangeAgg?.buckets) return [];
    return rangeAgg.buckets.map((b) => ({
      key: String(b.key),
      from: b.from,
      to: b.to,
      count: b.doc_count,
    }));
  }

  /**
   * Parses nested aggregation for dynamic attribute filter panel.
   *
   * OpenSearch returns:
   * {
   *   attributes: {
   *     keys: { buckets: [
   *       { key: "color", values: { buckets: [{ key: "red", doc_count: 10 }] } }
   *     ]}
   *   }
   * }
   */
  private parseAttributeAggs(aggs: Record<string, unknown>): AttributeFacet[] {
    const attrAgg = aggs['attributes'] as AggsNestedBucket | undefined;
    const keysAgg = attrAgg?.keys as AggsTermsBucket | undefined;
    if (!keysAgg?.buckets) return [];

    return keysAgg.buckets.map((keyBucket) => ({
      key: String(keyBucket.key),
      values:
        (keyBucket.values as AggsTermsBucket | undefined)?.buckets?.map(
          (vb) => ({
            value: String(vb.key),
            count: vb.doc_count,
          }),
        ) ?? [],
    }));
  }
}

// ─── Internal aggregation response types ──────────────────────────────────

interface AggsBucket {
  key: string | number;
  doc_count: number;
  [key: string]: unknown;
}

interface AggsTermsBucket {
  buckets: AggsBucket[];
}

interface AggsRangeBucket {
  buckets: Array<AggsBucket & { from?: number; to?: number }>;
}

interface AggsStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  sum: number;
}

interface AggsNestedBucket {
  doc_count: number;
  keys?: AggsTermsBucket;
  [key: string]: unknown;
}
