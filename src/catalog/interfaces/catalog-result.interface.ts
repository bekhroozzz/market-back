import { SearchResult } from '../../search/interfaces/search-result.interface';

export interface CatalogBreadcrumb {
  id: string;
  slug: string;
  name: string;
  path: string;
}

export interface CatalogCategoryInfo {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  path: string;
  breadcrumbs: CatalogBreadcrumb[];
}

export interface CatalogResult extends SearchResult {
  category: CatalogCategoryInfo | null;
}
