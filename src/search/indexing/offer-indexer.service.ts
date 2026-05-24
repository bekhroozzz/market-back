import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OfferEntity } from '../../offer/entities/offer.entity';
import { CategoryEntity } from '../../category/entities/category.entity';
import { OpenSearchService } from '../opensearch/opensearch.service';
import { ProductDocument } from '../interfaces/product-document.interface';

/**
 * OfferIndexerService – single-document CRUD operations in OpenSearch.
 *
 * Called by OfferService after each create / update / delete in PostgreSQL.
 * Failures are non-fatal: the main operation already succeeded in the DB.
 *
 * Index strategy: always upsert (index API with explicit _id) so that
 * create and update share the same code path.
 */
@Injectable()
export class OfferIndexerService {
  private readonly logger = new Logger(OfferIndexerService.name);

  constructor(
    @InjectRepository(OfferEntity)
    private readonly offerRepo: Repository<OfferEntity>,
    private readonly dataSource: DataSource,
    private readonly openSearchService: OpenSearchService,
  ) {}

  /**
   * Fetches the latest offer from PostgreSQL and upserts it in OpenSearch.
   * Used for both create and update events.
   */
  async upsertOffer(offerId: string): Promise<void> {
    const offer = await this.loadOffer(offerId);
    if (!offer) {
      this.logger.warn(`Offer ${offerId} not found in DB – skipping index.`);
      return;
    }

    const categoryIds = await this.resolveCategoryIds(offer.category_id);
    const document = this.toDocument(offer, categoryIds);

    await this.withRetry(() =>
      this.openSearchService.getClient().index({
        index: this.openSearchService.index,
        id: document.id,
        body: document,
        // refresh=false: improves throughput; document visible within refresh_interval
        refresh: 'false',
      }),
    );

    this.logger.debug(`Indexed offer ${offerId}`);
  }

  /**
   * Removes a document from OpenSearch by ID.
   * Call AFTER the record is deleted from PostgreSQL (only the ID is needed).
   */
  async removeOffer(offerId: string): Promise<void> {
    await this.withRetry(() =>
      this.openSearchService.getClient().delete({
        index: this.openSearchService.index,
        id: offerId,
        // Ignore 404: document may not exist in OpenSearch (e.g., first delete before index)
      }),
    ).catch((err: Error) => {
      // 404 is expected if offer was never indexed; log as debug, not error
      if ((err as NodeJS.ErrnoException).message?.includes('404')) {
        this.logger.debug(
          `Offer ${offerId} was not in index – nothing to remove.`,
        );
      } else {
        throw err;
      }
    });

    this.logger.debug(`Removed offer ${offerId} from index.`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async loadOffer(id: string): Promise<OfferEntity | null> {
    return this.offerRepo.findOne({
      where: { id },
      relations: ['category'],
    });
  }

  /**
   * Traverses the materialized-path category tree upward and returns all
   * ancestor category IDs including the direct category itself.
   *
   * Storing all ancestors enables: "filter by parent category → returns all children".
   */
  async resolveCategoryIds(categoryId: string | null): Promise<string[]> {
    if (!categoryId) return [];

    try {
      const categoryRepo = this.dataSource.getTreeRepository(CategoryEntity);
      const category = await this.dataSource
        .getRepository(CategoryEntity)
        .findOne({ where: { id: categoryId } });

      if (!category) return [categoryId];

      const ancestors = await categoryRepo.findAncestors(category);
      // findAncestors includes the category itself
      return ancestors.map((c) => c.id);
    } catch {
      // If tree traversal fails, store just the direct category ID
      return [categoryId];
    }
  }

  /**
   * Maps a PostgreSQL OfferEntity to an OpenSearch ProductDocument.
   * This is the source of truth for the index document shape.
   */
  toDocument(offer: OfferEntity, categoryIds: string[]): ProductDocument {
    return {
      id: offer.id,
      title: offer.title,
      titleSuggest: offer.title, // same value, different mapping (search_as_you_type)
      slug: offer.slug ?? null,
      description: offer.description,
      categoryIds,
      brandId: offer.brandId ?? null,
      attributes: offer.attributes ?? [],
      price: offer.price ?? null,
      oldPrice: offer.oldPrice ?? null,
      inStock: offer.inStock ?? true,
      rating: offer.rating ?? 0,
      salesCount: offer.salesCount ?? 0,
      createdAt: offer.createdAt?.toISOString() ?? new Date().toISOString(),
      images: offer.images ?? [],
    };
  }

  /**
   * Retry wrapper with exponential back-off.
   * maxRetries=3 with delays: 1s → 2s → 4s.
   *
   * Complements the client-level retry (handles different failure types).
   * Client-level: connection/transport errors.
   * App-level: index not ready, concurrent mapping conflicts.
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 1000,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          const delay = baseDelayMs * attempt;
          this.logger.warn(
            `OpenSearch operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${lastError.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}
