import { Module } from '@nestjs/common';
import { CategoryModule } from '../category/category.module';
import { SearchModule } from '../search/search.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [SearchModule, CategoryModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
