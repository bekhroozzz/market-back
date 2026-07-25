import { Injectable } from '@nestjs/common';
import { SearchService } from '../search/search.service';
import { SortOption } from '../search/dto/search-products.dto';
import { CategoryService } from '../category/category.service';
import { CategoryEntity } from '../category/entities/category.entity';
import { CatalogFiltersDto } from './dto/catalog-filters.dto';
import { CatalogResult } from './interfaces/catalog-result.interface';

@Injectable()
export class CatalogService {
  constructor(
    private readonly searchService: SearchService,
    private readonly categoryService: CategoryService,
  ) {}

  /** Category tree for storefront navigation (includes slugs). */
  getCategories(): Promise<CategoryEntity[]> {
    return this.categoryService.getCategories();
  }

  /**
   * Browse catalog by nested path, e.g. woman/odezhda/tolstovky-i-svitshoty.
   * Empty path = root catalog (all products).
   */
  async browseByPath(
    path: string,
    filters: CatalogFiltersDto,
  ): Promise<CatalogResult> {
    const segments = path
      .split('/')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let categoryId: string | undefined;
    let categoryInfo: CatalogResult['category'] = null;

    if (segments.length > 0) {
      const resolved = await this.categoryService.resolveCategoryPath(segments);
      categoryId = resolved.category.id;
      categoryInfo = {
        id: resolved.category.id,
        slug: resolved.category.slug,
        name: resolved.category.name,
        description: resolved.category.description ?? null,
        path: resolved.path,
        breadcrumbs: resolved.breadcrumbs,
      };
    }

    const products = await this.searchService.searchProducts({
      ...filters,
      category: categoryId,
      sort: filters.sort ?? SortOption.POPULARITY,
    });

    return {
      ...products,
      category: categoryInfo,
    };
  }
}
