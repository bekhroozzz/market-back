/**
 * Shape of a single attribute entry stored in OpenSearch.
 * Using nested type for precise multi-field filtering.
 *
 * Example query: find products where color=red AND size=XL
 */
export interface ProductAttributeEntry {
  key: string;
  value: string;
}

/**
 * The document shape stored in the OpenSearch products index.
 *
 * Design decisions:
 * - categoryIds: all ancestor category IDs (enables tree-aware filtering)
 * - titleSuggest: dedicated search_as_you_type field for fast autocomplete
 * - attributes: nested type for precise key+value pair filtering
 * - price/rating/salesCount: numeric fields for range queries and boosting
 */
export interface ProductDocument {
  /** UUID from PostgreSQL offers.id – used as OpenSearch document _id */
  id: string;

  /** Full title text – main search field, boosted most heavily */
  title: string;

  /**
   * Mirrors title for the search_as_you_type mapping.
   * OpenSearch auto-creates _2gram, _3gram, _index_prefix subfields.
   */
  titleSuggest: string;

  /** URL-friendly identifier */
  slug: string | null;

  /** Long-form description – lower search boost than title */
  description: string;

  /**
   * All ancestor category IDs including the direct category.
   * Enables filtering: "show products in category X and all sub-categories".
   */
  categoryIds: string[];

  /** Brand UUID – keyword field for exact match filter */
  brandId: string | null;

  /** Key-value attribute pairs (color, size, material, etc.) */
  attributes: ProductAttributeEntry[];

  /** Current selling price */
  price: number | null;

  /** Price before discount (for display) */
  oldPrice: number | null;

  /** Whether the item is available right now */
  inStock: boolean;

  /** Average review rating 0–5 – used for ranking boost */
  rating: number;

  /** Total sales – used for popularity ranking boost */
  salesCount: number;

  /** ISO 8601 timestamp – used for recency boost decay function */
  createdAt: string;
}
