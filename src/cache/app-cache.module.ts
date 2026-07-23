import { CacheModule } from '@nestjs/cache-manager';
import { Global, Logger, Module } from '@nestjs/common';
import { redisStore } from 'cache-manager-redis-yet';
import { AppCacheService } from './app-cache.service';

/**
 * Global Redis-backed cache.
 *
 * Registered once and exported everywhere via {@link AppCacheService}, which
 * wraps every operation so a Redis outage degrades gracefully to the database
 * instead of failing requests.
 */
@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        const logger = new Logger('AppCache');
        const host = process.env.REDIS_HOST ?? 'redis';
        const port = Number(process.env.REDIS_PORT ?? 6379);
        const password = process.env.REDIS_PASSWORD || undefined;
        const defaultTtl = Number(process.env.CACHE_DEFAULT_TTL ?? 60) * 1000;

        const connectTimeoutMs = Number(
          process.env.REDIS_CONNECT_TIMEOUT ?? 5000,
        );

        try {
          const store = await Promise.race([
            redisStore({
              socket: {
                host,
                port,
                // Bounded so an unreachable Redis fails fast at boot.
                reconnectStrategy: (retries) =>
                  retries > 20 ? false : Math.min(retries * 200, 3000),
              },
              password,
              ttl: defaultTtl,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(`connect timeout after ${connectTimeoutMs}ms`),
                  ),
                connectTimeoutMs,
              ),
            ),
          ]);

          store.client.on('error', (err: Error) => {
            logger.warn(`Redis connection error: ${err.message}`);
          });

          logger.log(`Redis cache connected at ${host}:${port}`);
          return { store, ttl: defaultTtl };
        } catch (err) {
          // Never block startup on cache: fall back to an in-memory store.
          logger.error(
            `Redis unavailable at ${host}:${port} (${(err as Error).message}). ` +
              'Falling back to in-memory cache.',
          );
          return { ttl: defaultTtl };
        }
      },
    }),
  ],
  providers: [AppCacheService],
  exports: [AppCacheService],
})
export class AppCacheModule {}
