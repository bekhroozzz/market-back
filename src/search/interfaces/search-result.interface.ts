import { ProductDocument } from './product-document.interface';
import { SearchFacets } from './facets.interface';

/** A single search hit with relevance score and optional highlighted snippets */
export interface ProductHit {
  /** The full product document from _source */
  document: ProductDocument;

  /** OpenSearch relevance score (higher = more relevant) */
  score: number;

  /**
   * HTML snippets with <mark> tags around matched terms.
   * Present only when the query includes a text search term.
   */
  highlight?: {
    title?: string[];
    description?: string[];
  };
}

/** Full paginated search response */
export interface SearchResult {
  /** Total matching documents (before pagination) */
  total: number;

  /** Current page number (1-based) */
  page: number;

  /** Items per page */
  limit: number;

  /** Total pages = ceil(total / limit) */
  pages: number;

  /** Documents for the current page */
  items: ProductHit[];

  /** Aggregations for filter panel rendering */
  facets: SearchFacets;

  /** OpenSearch query execution time in ms */
  took: number;
}

/** Lightweight suggestion item for autocomplete */
export interface AutocompleteSuggestion {
  id: string;
  title: string;
  slug: string | null;
  price: number | null;
}

export interface AutocompleteResult {
  suggestions: AutocompleteSuggestion[];
  took: number;
}

/** Raw OpenSearch response types */
export interface OpenSearchTotal {
  value: number;
  relation: 'eq' | 'gte';
}

export interface OpenSearchHit<T> {
  _index: string;
  _id: string;
  _score: number;
  _source: T;
  highlight?: Record<string, string[]>;
}

export interface OpenSearchResponse<T> {
  hits: {
    total: OpenSearchTotal;
    hits: OpenSearchHit<T>[];
  };
  aggregations?: Record<string, unknown>;
  took: number;
}
