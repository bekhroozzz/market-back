import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { OpenSearchService } from './opensearch/opensearch.service';
import { OfferIndexerService } from './indexing/offer-indexer.service';
import { BulkIndexerService } from './indexing/bulk-indexer.service';
import { OfferEntity } from '../offer/entities/offer.entity';
import { CategoryEntity } from '../category/entities/category.entity';

/**
 * SearchModule – self-contained OpenSearch integration.
 *
 * Imports TypeOrmModule directly (no OfferModule dependency) to avoid
 * circular module references when OfferModule imports SearchModule.
 *
 * Exported services:
 * - OfferIndexerService: consumed by OfferModule for CRUD event hooks
 */
@Module({
  imports: [
    // OfferEntity: needed by OfferIndexerService (single doc upsert)
    //              and BulkIndexerService (full reindex pagination)
    TypeOrmModule.forFeature([OfferEntity, CategoryEntity]),
  ],
  controllers: [SearchController],
  providers: [
    OpenSearchService,
    OfferIndexerService,
    BulkIndexerService,
    SearchService,
  ],
  exports: [
    // Exported so OfferService can call upsertOffer / removeOffer
    OfferIndexerService,
    // Exported for potential future use (e.g. a dedicated admin module)
    SearchService,
    OpenSearchService,
  ],
})
export class SearchModule {}
