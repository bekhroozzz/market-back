/**
 * Injection token for the raw OpenSearch Client instance.
 * Used with @Inject(OPENSEARCH_CLIENT) when direct client access is needed.
 */
export const OPENSEARCH_CLIENT = 'OPENSEARCH_CLIENT' as const;

/**
 * Default index name for the products catalog.
 * Can be overridden via OPENSEARCH_PRODUCTS_INDEX env variable.
 *
 * Naming convention for multi-environment setups:
 *   dev:     products_dev
 *   staging: products_staging
 *   prod:    products
 */
export const PRODUCTS_INDEX = 'products' as const;

/**
 * Default batch size for bulk reindex operations.
 * Lower values: less memory pressure, slower reindex.
 * Higher values: more memory, faster reindex.
 * Recommendation: 200–500 for production.
 */
export const BULK_BATCH_SIZE = 300 as const;

/**
 * Number of shards for the products index.
 * Rule of thumb: aim for 10–40 GB per shard.
 * For production with millions of products: 3–5 shards.
 */
export const INDEX_NUMBER_OF_SHARDS = 1 as const;

/**
 * Number of replicas per shard.
 * Development: 0 (no redundancy, saves resources).
 * Production: 1+ (high availability).
 */
export const INDEX_NUMBER_OF_REPLICAS = 0 as const;
