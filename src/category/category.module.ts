import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { CategoryEntity } from './entities/category.entity';
import { OfferEntity } from '../offer/entities/offer.entity';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    // OfferEntity: needed when deleting a category branch and reassigning offers
    TypeOrmModule.forFeature([CategoryEntity, OfferEntity]),
    // OfferIndexerService for reindex after category delete
    forwardRef(() => SearchModule),
  ],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
