import { SearchProductsDto, SortOption } from '../dto/search-products.dto';
import { AutocompleteDto } from '../dto/autocomplete.dto';

/**
 * Fully typed OpenSearch query DSL body.
 * Avoids using `any` while remaining compatible with the OpenSearch client.
 */
export type QueryBody = Record<string, unknown>;

/**
 * SearchQueryBuilder – pure stateless utility class.
 *
 * Builds the complete OpenSearch request body from validated DTOs.
 * Separated from services to keep query logic testable in isolation.
 *
 * Query architecture:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ function_score                                                      │
 * │   ├── query: bool                                                   │
 * │   │     ├── must: [text query]  ← affects score, text relevance    │
 * │   │     └── filter: [...]       ← no score impact, fast execution  │
 * │   └── functions: [popularity, rating, inStock, recency boosts]     │
 * ├── aggs: [brands, categories, price_stats, price_ranges, attrs]     │
 * ├── sort: [depends on sort param]                                     │
 * ├── highlight: { title, description }                                 │
 * └── from / size (pagination)                                          │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export class SearchQueryBuilder {
  /**
   * Builds the full search request body.
   *
   * Example OpenSearch query produced for q="iphone 15", brand=Apple, inStock=true:
   *
   * {
   *   "query": {
   *     "function_score": {
   *       "query": {
   *         "bool": {
   *           "must": [{
   *             "bool": {
   *               "should": [
   *                 { "multi_match": { "query": "iphone 15", "fields": ["title^5", "title.keyword^3"], "type": "phrase" }},
   *                 { "multi_match": { "query": "iphone 15", "fields": ["title^4", "description^1"], "fuzziness": "AUTO" }},
   *                 { "multi_match": { "query": "iphone 15", "type": "bool_prefix", "fields": ["titleSuggest", "titleSuggest._2gram"] }}
   *               ]
   *             }
   *           }],
   *           "filter": [
   *             { "term": { "brandId": "apple-uuid" }},
   *             { "term": { "inStock": true }}
   *           ]
   *         }
   *       },
   *       "functions": [
   *         { "filter": { "term": { "inStock": true }}, "weight": 1.5 },
   *         { "field_value_factor": { "field": "salesCount", "factor": 1.5, "modifier": "sqrt", "missing": 0 }},
   *         { "field_value_factor": { "field": "rating", "factor": 1.2, "modifier": "none", "missing": 0 }},
   *         { "gauss": { "createdAt": { "origin": "now", "scale": "30d", "offset": "7d", "decay": 0.5 }}, "weight": 0.5 }
   *       ],
   *       "score_mode": "sum",
   *       "boost_mode": "multiply"
   *     }
   *   },
   *   "aggs": { ... },
   *   "sort": [{ "_score": { "order": "desc" } }],
   *   "highlight": { ... },
   *   "from": 0,
   *   "size": 20
   * }
   */
  static build(dto: SearchProductsDto): QueryBody {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    return {
      query: SearchQueryBuilder.buildQuery(dto),
      aggs: SearchQueryBuilder.buildAggregations(),
      sort: SearchQueryBuilder.buildSort(dto.sort),
      highlight: SearchQueryBuilder.buildHighlight(),
      from: (page - 1) * limit,
      size: limit,
    };
  }

  /**
   * Lightweight autocomplete query.
   * Uses search_as_you_type for instant prefix matching
   * combined with edge n-gram fuzzy fallback for typo tolerance.
   *
   * Example query for q="ipho":
   * {
   *   "query": {
   *     "bool": {
   *       "should": [
   *         { "multi_match": { "query": "ipho", "type": "bool_prefix",
   *             "fields": ["titleSuggest", "titleSuggest._2gram", "titleSuggest._3gram"] }},
   *         { "match": { "title.autocomplete": { "query": "ipho", "fuzziness": 1 }}}
   *       ]
   *     }
   *   },
   *   "_source": ["id", "title", "slug", "price"],
   *   "size": 8
   * }
   */
  static buildAutocomplete(dto: AutocompleteDto): QueryBody {
    return {
      query: {
        bool: {
          should: [
            // search_as_you_type: fastest for prefix matching
            {
              multi_match: {
                query: dto.q,
                type: 'bool_prefix',
                fields: [
                  'titleSuggest',
                  'titleSuggest._2gram',
                  'titleSuggest._3gram',
                ],
              },
            },
            // Edge n-gram fallback with fuzziness for typo tolerance
            {
              match: {
                'title.autocomplete': {
                  query: dto.q,
                  // fuzziness=1: tolerate 1 character substitution/deletion
                  fuzziness: 1,
                  prefix_length: 1,
                },
              },
            },
          ],
          minimum_should_match: 1,
        },
      },
      // Return only fields needed for suggestion UI
      _source: ['id', 'title', 'slug', 'price'],
      size: dto.size ?? 8,
    };
  }

  // ─── Private query builders ───────────────────────────────────────────────

  /**
   * Wraps the bool query in function_score for multi-signal ranking.
   *
   * Ranking signals (in order of impact):
   * 1. Text relevance score (_score)
   * 2. inStock boost (weight 1.5) – items in stock rank higher
   * 3. salesCount sqrt factor (×1.5) – popular items rank higher
   * 4. rating factor (×1.2) – well-rated items rank higher
   * 5. createdAt gauss decay (weight 0.5) – newer items slightly preferred
   */
  private static buildQuery(dto: SearchProductsDto): QueryBody {
    const hasText = Boolean(dto.q?.trim());

    return {
      function_score: {
        query: {
          bool: {
            // must: affects the relevance score
            must: hasText
              ? [SearchQueryBuilder.buildTextQuery(dto.q!)]
              : [{ match_all: {} }],
            // filter: mandatory conditions, zero score contribution, cached
            filter: SearchQueryBuilder.buildFilters(dto),
          },
        },
        functions: [
          // Items in stock get a 1.5× weight boost
          {
            filter: { term: { inStock: true } },
            weight: 1.5,
          },
          // Popularity signal: sqrt smoothing prevents viral items dominating completely
          {
            field_value_factor: {
              field: 'salesCount',
              factor: 1.5,
              modifier: 'sqrt',
              missing: 0,
            },
          },
          // Rating signal
          {
            field_value_factor: {
              field: 'rating',
              factor: 1.2,
              modifier: 'none',
              missing: 0,
            },
          },
          // Recency decay: items older than 30 days decay to 50% boost
          {
            gauss: {
              createdAt: {
                origin: 'now',
                scale: '30d',
                offset: '7d',
                decay: 0.5,
              },
            },
            weight: 0.5,
          },
        ],
        // sum: adds all function scores together
        score_mode: 'sum',
        // multiply: final score = original_score × sum_of_functions
        boost_mode: 'multiply',
      },
    };
  }

  /**
   * Full-text query with three complementary strategies:
   *
   * 1. Exact phrase match (highest boost ^5): "iphone 15 pro" → exact sequence
   * 2. Fuzzy multi-match (^4 on title): handles typos via AUTO fuzziness
   * 3. bool_prefix (search_as_you_type): handles incomplete words
   *
   * Exact > Fuzzy > Prefix in terms of score contribution due to field boosts.
   */
  private static buildTextQuery(q: string): QueryBody {
    return {
      bool: {
        should: [
          // Strategy 1: exact phrase – "iphone 15" must appear as-is
          {
            multi_match: {
              query: q,
              fields: ['title^5', 'title.keyword^3'],
              type: 'phrase',
              // Slop allows words to appear within 2 positions of each other
              slop: 2,
            },
          },
          // Strategy 2: best_fields fuzzy – main full-text search
          // AUTO fuzziness: 0 for len<3, 1 for len 3-5, 2 for len>5
          {
            multi_match: {
              query: q,
              fields: ['title^4', 'description^1'],
              type: 'best_fields',
              fuzziness: 'AUTO',
              // Require first 2 chars to match exactly (reduces noise)
              prefix_length: 2,
              // At least 75% of terms must match
              minimum_should_match: '75%',
            },
          },
          // Strategy 3: search_as_you_type for incomplete last word
          {
            multi_match: {
              query: q,
              type: 'bool_prefix',
              fields: [
                'titleSuggest',
                'titleSuggest._2gram',
                'titleSuggest._3gram',
              ],
            },
          },
        ],
        minimum_should_match: 1,
      },
    };
  }

  /**
   * Filter clause – zero score impact, fast cached execution.
   * All conditions are combined with AND logic.
   */
  private static buildFilters(dto: SearchProductsDto): QueryBody[] {
    const filters: QueryBody[] = [];

    // Category filter: matches the category itself AND all child categories
    // (possible because categoryIds stores all ancestor IDs)
    if (dto.category) {
      filters.push({ term: { categoryIds: dto.category } });
    }

    if (dto.brand) {
      filters.push({ term: { brandId: dto.brand } });
    }

    if (dto.minPrice !== undefined || dto.maxPrice !== undefined) {
      const range: Record<string, number> = {};
      if (dto.minPrice !== undefined) range['gte'] = dto.minPrice;
      if (dto.maxPrice !== undefined) range['lte'] = dto.maxPrice;
      filters.push({ range: { price: range } });
    }

    if (dto.inStock === true) {
      filters.push({ term: { inStock: true } });
    }

    // Attribute filters: each key-value pair is an independent nested query
    // Combined with AND: must satisfy ALL attribute conditions
    if (dto.attributes) {
      for (const [key, rawValues] of Object.entries(dto.attributes)) {
        const values = Array.isArray(rawValues) ? rawValues : [rawValues];
        filters.push({
          nested: {
            path: 'attributes',
            query: {
              bool: {
                must: [
                  { term: { 'attributes.key': key } },
                  // terms: OR within values for same key (e.g. color=red OR color=blue)
                  { terms: { 'attributes.value': values } },
                ],
              },
            },
          },
        });
      }
    }

    return filters;
  }

  /**
   * Sort configuration.
   *
   * For relevance sort: only _score (function_score handles popularity etc.)
   * For other sorts: explicit field sort, undefined prices go last (_last).
   */
  private static buildSort(sort?: SortOption): QueryBody[] {
    switch (sort) {
      case SortOption.PRICE_ASC:
        return [{ price: { order: 'asc', missing: '_last' } }];
      case SortOption.PRICE_DESC:
        return [{ price: { order: 'desc', missing: '_first' } }];
      case SortOption.NEWEST:
        return [{ createdAt: { order: 'desc' } }];
      case SortOption.POPULARITY:
        return [
          { salesCount: { order: 'desc' } },
          { _score: { order: 'desc' } },
        ];
      case SortOption.RELEVANCE:
      default:
        return [{ _score: { order: 'desc' } }];
    }
  }

  /**
   * Faceted aggregations – always returned regardless of active filters.
   *
   * Aggregation structure:
   * - brands: top 50 brand IDs with document counts
   * - categories: top 50 category IDs with document counts
   * - price_stats: min/max/avg/count for the price range slider
   * - price_ranges: predefined buckets for quick price filter buttons
   * - attributes: nested aggregation for dynamic attribute filter panel
   *   └── keys: top 20 attribute keys
   *       └── values: top 50 values per key
   */
  private static buildAggregations(): QueryBody {
    return {
      brands: {
        terms: { field: 'brandId', size: 50 },
      },
      categories: {
        terms: { field: 'categoryIds', size: 50 },
      },
      price_stats: {
        stats: { field: 'price' },
      },
      price_ranges: {
        range: {
          field: 'price',
          ranges: [
            { key: 'under_1000', to: 1000 },
            { key: '1000_5000', from: 1000, to: 5000 },
            { key: '5000_15000', from: 5000, to: 15000 },
            { key: '15000_50000', from: 15000, to: 50000 },
            { key: 'over_50000', from: 50000 },
          ],
        },
      },
      attributes: {
        nested: { path: 'attributes' },
        aggs: {
          keys: {
            terms: { field: 'attributes.key', size: 20 },
            aggs: {
              values: {
                terms: { field: 'attributes.value', size: 50 },
              },
            },
          },
        },
      },
    };
  }

  /**
   * Highlight config – wraps matched terms with <mark> tags.
   * number_of_fragments=0 for title: return full title (no truncation).
   * number_of_fragments=2 for description: return 2 best snippets.
   */
  private static buildHighlight(): QueryBody {
    return {
      fields: {
        title: { number_of_fragments: 0 },
        description: {
          number_of_fragments: 2,
          fragment_size: 150,
        },
      },
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
    };
  }
}
