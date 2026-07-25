import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { OpenSearchService } from './opensearch/opensearch.service';
import { OfferIndexerService } from './indexing/offer-indexer.service';
import { BulkIndexerService } from './indexing/bulk-indexer.service';
import { OfferEntity } from '../offer/entities/offer.entity';
import { CategoryEntity } from '../category/entities/category.entity';
import { CategoryModule } from '../category/category.module';

/**
 * SearchModule – self-contained OpenSearch integration.
 *
 * Imports TypeOrmModule directly (no OfferModule dependency) to avoid
 * circular module references when OfferModule imports SearchModule.
 *
 * Exported services:
 * - OfferIndexerService: consumed by OfferModule / CategoryModule
 * - SearchService: consumed by CatalogModule for browse listings
 */
@Module({
  imports: [
    // OfferEntity: needed by OfferIndexerService (single doc upsert)
    //              and BulkIndexerService (full reindex pagination)
    TypeOrmModule.forFeature([OfferEntity, CategoryEntity]),
    // CategoryService resolves path→UUID; CategoryModule also imports SearchModule
    forwardRef(() => CategoryModule),
  ],
  controllers: [SearchController],
  providers: [
    OpenSearchService,
    OfferIndexerService,
    BulkIndexerService,
    SearchService,
  ],
  exports: [
    // Exported so OfferService / CategoryService can call upsert / remove
    OfferIndexerService,
    // Exported for CatalogModule and potential admin tooling
    SearchService,
    OpenSearchService,
  ],
})
export class SearchModule {}
