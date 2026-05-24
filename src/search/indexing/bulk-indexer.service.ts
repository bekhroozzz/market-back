import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfferEntity } from '../../offer/entities/offer.entity';
import { OpenSearchService } from '../opensearch/opensearch.service';
import { OfferIndexerService } from './offer-indexer.service';
import { BULK_BATCH_SIZE } from '../constants/opensearch.constants';
import { ProductDocument } from '../interfaces/product-document.interface';

export interface ReindexReport {
  indexed: number;
  errors: number;
  durationMs: number;
}

/**
 * BulkIndexerService – full reindex of all offers.
 *
 * Use cases:
 * - Initial setup after deploying the search feature
 * - After mapping changes (requires index recreation)
 * - After data migrations that change offer data
 *
 * Strategy:
 * - Recreate the index with fresh mapping (ensures no stale data)
 * - Process offers in batches to control memory usage
 * - Use OpenSearch Bulk API for high-throughput indexing
 * - Report per-batch errors without aborting the entire reindex
 *
 * Scaling notes:
 * - For millions of documents: increase BULK_BATCH_SIZE to 500–1000
 * - For fast reindex: temporarily set refresh_interval=-1, restore after
 * - For zero-downtime reindex: use index aliases (blue/green pattern)
 */
@Injectable()
export class BulkIndexerService {
  private readonly logger = new Logger(BulkIndexerService.name);

  constructor(
    @InjectRepository(OfferEntity)
    private readonly offerRepo: Repository<OfferEntity>,
    private readonly openSearchService: OpenSearchService,
    private readonly offerIndexer: OfferIndexerService,
  ) {}

  /**
   * Full reindex: recreates the index and indexes all offers from PostgreSQL.
   *
   * This is a destructive operation – all existing OpenSearch data is replaced.
   * PostgreSQL remains untouched (it is the source of truth).
   */
  async reindexAll(): Promise<ReindexReport> {
    const startTime = Date.now();
    this.logger.log('Starting full reindex…');

    // Step 1: recreate the index with fresh mapping
    await this.openSearchService.recreateIndex();

    // Step 2: count total for progress logging
    const totalCount = await this.offerRepo.count();
    this.logger.log(`Total offers to index: ${totalCount}`);

    let indexed = 0;
    let errors = 0;
    let skip = 0;

    // Step 3: process in batches
    while (true) {
      const batch = await this.fetchBatch(skip, BULK_BATCH_SIZE);
      if (batch.length === 0) break;

      const { indexed: batchIndexed, errors: batchErrors } =
        await this.indexBatch(batch);

      indexed += batchIndexed;
      errors += batchErrors;
      skip += BULK_BATCH_SIZE;

      this.logger.log(
        `Reindex progress: ${indexed}/${totalCount} (${batchErrors} errors in last batch)`,
      );

      // All records processed
      if (batch.length < BULK_BATCH_SIZE) break;
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `Reindex complete: ${indexed} indexed, ${errors} errors, ${durationMs}ms`,
    );

    return { indexed, errors, durationMs };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async fetchBatch(skip: number, take: number): Promise<OfferEntity[]> {
    return this.offerRepo.find({
      skip,
      take,
      relations: ['category'],
      order: { createdAt: 'asc' },
    });
  }

  /**
   * Sends one batch to the OpenSearch Bulk API.
   *
   * Bulk API body format:
   *   { index: { _index: "products", _id: "uuid" } }
   *   { id: "uuid", title: "...", ... }
   *   { index: { _index: "products", _id: "uuid2" } }
   *   { id: "uuid2", ... }
   */
  private async indexBatch(
    offers: OfferEntity[],
  ): Promise<{ indexed: number; errors: number }> {
    // Build documents with ancestor category IDs for each offer
    const documents = await Promise.all(
      offers.map(async (offer) => {
        const categoryIds = await this.offerIndexer.resolveCategoryIds(
          offer.category_id,
        );
        return this.offerIndexer.toDocument(offer, categoryIds);
      }),
    );

    const body = this.buildBulkBody(documents);

    const response = await this.openSearchService.getClient().bulk({
      body,
      // refresh=false during reindex for maximum throughput
      refresh: 'false',
    });

    // Parse per-item errors from bulk response
    let errors = 0;
    if ((response.body as { errors: boolean }).errors) {
      const items = (response.body as { items: BulkResponseItem[] }).items;
      for (const item of items) {
        if (item.index?.error) {
          errors++;
          this.logger.error(
            `Failed to index ${item.index._id}: ${item.index.error.reason}`,
          );
        }
      }
    }

    return {
      indexed: documents.length - errors,
      errors,
    };
  }

  private buildBulkBody(documents: ProductDocument[]): unknown[] {
    const body: unknown[] = [];
    for (const doc of documents) {
      // Action line: tells OpenSearch to index (upsert) this document
      body.push({
        index: {
          _index: this.openSearchService.index,
          _id: doc.id,
        },
      });
      // Document line: the actual content
      body.push(doc);
    }
    return body;
  }
}

// ─── Internal types for bulk API response parsing ─────────────────────────

interface BulkItemResult {
  _id: string;
  error?: {
    type: string;
    reason: string;
  };
}

interface BulkResponseItem {
  index?: BulkItemResult;
}
