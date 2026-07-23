import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

/**
 * Thin, failure-tolerant wrapper around the cache manager.
 *
 * Every method swallows cache errors and logs them, so a Redis outage never
 * turns into a 5xx — reads simply fall through to the origin (database /
 * OpenSearch). Group invalidation is done with a monotonically increasing
 * version number per namespace: bumping the version makes every key built
 * from the old version unreachable at once, without SCAN/pattern deletes.
 */
@Injectable()
export class AppCacheService {
  private readonly logger = new Logger(AppCacheService.name);

  // Version keys must outlive cached values; keep them effectively persistent.
  private static readonly VERSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.cache.get<T>(key);
      return value ?? undefined;
    } catch (err) {
      this.logger.warn(`cache get failed for "${key}": ${(err as Error).message}`);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttlMs);
    } catch (err) {
      this.logger.warn(`cache set failed for "${key}": ${(err as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
    } catch (err) {
      this.logger.warn(`cache del failed for "${key}": ${(err as Error).message}`);
    }
  }

  /**
   * Return the cached value for `key`, or compute it with `factory`, store it
   * and return it. On any cache error the factory result is returned directly.
   */
  async wrap<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }
    const fresh = await factory();
    if (fresh !== undefined && fresh !== null) {
      await this.set(key, fresh, ttlMs);
    }
    return fresh;
  }

  /** Current version number for a cache namespace (1 if unset). */
  async version(namespace: string): Promise<number> {
    const key = `ver:${namespace}`;
    const current = await this.get<number>(key);
    if (typeof current === 'number') {
      return current;
    }
    await this.set(key, 1, AppCacheService.VERSION_TTL_MS);
    return 1;
  }

  /** Invalidate every key built from the namespace's current version. */
  async bump(namespace: string): Promise<void> {
    const key = `ver:${namespace}`;
    const current = (await this.get<number>(key)) ?? 1;
    await this.set(key, current + 1, AppCacheService.VERSION_TTL_MS);
  }
}
