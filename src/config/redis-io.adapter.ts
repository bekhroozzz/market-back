import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import type { ServerOptions, Server } from 'socket.io';

/**
 * Socket.IO adapter backed by Redis pub/sub.
 *
 * Required when the API runs as multiple processes (PM2 cluster / replicas):
 * an event emitted on one worker (e.g. a chat message) is fanned out through
 * Redis so clients connected to *any* worker receive it. Without it, each
 * worker only reaches its own sockets.
 *
 * Clients use `transports: ['websocket']`, so a connection stays pinned to the
 * worker that accepted it — no sticky sessions are needed, only this adapter
 * for cross-worker broadcast.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: RedisClientType;
  private subClient?: RedisClientType;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const host = process.env.REDIS_HOST ?? 'redis';
    const port = Number(process.env.REDIS_PORT ?? 6379);
    const password = process.env.REDIS_PASSWORD || undefined;
    const connectTimeoutMs = Number(process.env.REDIS_CONNECT_TIMEOUT ?? 5000);

    const pubClient: RedisClientType = createClient({
      socket: {
        host,
        port,
        // Bounded so an unreachable Redis fails fast at boot instead of hanging.
        reconnectStrategy: (retries) =>
          retries > 20 ? false : Math.min(retries * 200, 3000),
      },
      password,
    });
    const subClient: RedisClientType = pubClient.duplicate();

    pubClient.on('error', (err: Error) =>
      this.logger.warn(`Redis pub client error: ${err.message}`),
    );
    subClient.on('error', (err: Error) =>
      this.logger.warn(`Redis sub client error: ${err.message}`),
    );

    try {
      await Promise.race([
        Promise.all([pubClient.connect(), subClient.connect()]),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`connect timeout after ${connectTimeoutMs}ms`)),
            connectTimeoutMs,
          ),
        ),
      ]);
    } catch (err) {
      // Tear down half-open clients so they don't keep retrying in the
      // background after we fall back to the in-memory adapter.
      await Promise.allSettled([
        pubClient.disconnect(),
        subClient.disconnect(),
      ]);
      throw err;
    }

    this.pubClient = pubClient;
    this.subClient = subClient;
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log(`Socket.IO Redis adapter connected at ${host}:${port}`);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
