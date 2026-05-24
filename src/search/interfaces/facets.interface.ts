/**
 * Faceted aggregation results returned alongside search hits.
 * Allows the frontend to render dynamic filter panels.
 */

export interface BrandFacet {
  id: string;
  count: number;
}

export interface CategoryFacet {
  id: string;
  count: number;
}

export interface AttributeValueFacet {
  value: string;
  count: number;
}

export interface AttributeFacet {
  key: string;
  values: AttributeValueFacet[];
}

export interface PriceRangeFacet {
  key: string;
  from?: number;
  to?: number;
  count: number;
}

export interface PriceStatsFacet {
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface SearchFacets {
  brands: BrandFacet[];
  categories: CategoryFacet[];
  priceStats: PriceStatsFacet;
  priceRanges: PriceRangeFacet[];
  /** Dynamic attributes aggregated from matching documents */
  attributes: AttributeFacet[];
}
