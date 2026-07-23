# Production deployment with Dokploy

The production stack is defined in `docker-compose.yml`:

- `api`: NestJS API built from `Dockerfile`
- `opensearch`: single-node OpenSearch with authentication and persistent storage
- `redis`: in-memory cache (no persistence) fronting hot read endpoints

PostgreSQL is managed by the existing Dokploy database application and is not
duplicated in this stack. OpenSearch is available only on the backend Compose
network.

## 1. Server requirements

- Point the `api.locafun.uz` DNS `A` record to the Dokploy server.
- Allocate at least 4 GB RAM to the server. OpenSearch is limited to 2 GB and
  uses a 1 GB JVM heap.
- Configure the OpenSearch kernel requirement on the host:

  ```bash
  sudo sysctl -w vm.max_map_count=262144
  echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-opensearch.conf
  sudo sysctl --system
  ```

- Configure a swap file as an OOM safety net (the RAM budget is tight on an
  8 GB host). Swap is a last resort, not a runtime target — container memory
  limits below keep normal operation within RAM:

  ```bash
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab
  sudo sysctl -w vm.swappiness=10
  ```

## 1a. Resource limits and hardening

`docker-compose.yml` caps each service so one component cannot starve the
others or trigger a host-wide OOM cascade (the usual cause of "the server fell
over under load"):

- `api`: `mem_limit 1g` / `cpus 1.5`, with `NODE_OPTIONS=--max-old-space-size=768`
  to keep the V8 heap under the container limit.
- `opensearch`: `mem_limit 2g` / `cpus 1.5` (JVM heap stays at 1 GB).
- Both services disable container swap (`memswap_limit` == `mem_limit`) and rotate
  Docker logs (`max-size 10m`, `max-file 3`) so the disk cannot fill up.
- Cap the Dokploy-managed PostgreSQL memory and tune `shared_buffers` /
  `work_mem` / `max_connections` in its application settings so it fits the
  remaining budget alongside OpenSearch.

The API is rate-limited per client IP via `@nestjs/throttler`
(`THROTTLE_LIMIT` requests per `THROTTLE_TTL` seconds, default 300/60s).
`app.set('trust proxy', 1)` makes the limiter use the real client IP forwarded
by Traefik. Static uploads and the Socket.IO chat gateway are intentionally
exempt from the limiter.

## 1b. Redis cache

Hot read endpoints are cached in Redis to offload PostgreSQL and OpenSearch on
a read-heavy catalog:

- Category tree (`GET /category/get-all`) — 10 min TTL.
- Offer listings and single offers (`GET /offer/all|find-by-id|find-by-slug`).
- Search and autocomplete (`GET /search/products*`) — short 30 s TTL.

Behaviour and safety:

- Cached offer/category payloads are sanitized with `instanceToPlain` before
  being stored, so `@Exclude` fields (user password, refresh token) never reach
  Redis or API responses.
- Writes (create/update/delete, rating changes, category edits) invalidate the
  relevant cache instantly via a version-bump scheme — no stale data after a
  mutation.
- The cache is failure-tolerant: if Redis is down, requests transparently fall
  back to the database/OpenSearch instead of erroring, and the app still starts
  (in-memory fallback).

Redis runs as a **cache only**: persistence is disabled (`--save ""`,
`--appendonly no`) and it evicts least-recently-used keys at a 256 MB cap
(`allkeys-lru`). Losing the Redis volume has no data-loss impact. Set a strong
`REDIS_PASSWORD` in the Environment tab; the service is only reachable on the
internal `backend` network and its port is never published.

## 1c. Multi-core scaling (PM2 cluster)

The API runs as a **PM2 cluster** inside a single container, so all vCPUs are
used without splitting into separate Dokploy services (the standard Docker
Compose deployment type is kept — no Swarm/Stack migration required).

- `ecosystem.config.js` runs `PM2_INSTANCES` workers (default 2) in cluster
  mode; each worker's V8 heap is capped at 512 MB. The `api` container is sized
  at `mem_limit 1.5g` / `cpus 2` for two workers. **Only raise `PM2_INSTANCES`
  together with `mem_limit`** — otherwise the container will OOM.
- Workers share port 4000 via Node's cluster module, so Traefik/Dokploy still
  see one container with one health check.
- **Migrations run exactly once**, before the cluster forks:
  `scripts/start-prod.sh` applies TypeORM migrations, then launches
  `pm2-runtime`. Workers boot with `RUN_MIGRATIONS_ON_BOOT=false` so they never
  race to migrate.
- **Socket.IO across workers**: `src/config/redis-io.adapter.ts` wires the
  `@socket.io/redis-adapter` so chat/notification events emitted on one worker
  reach clients on any worker. Both clients already connect with
  `transports: ['websocket']`, so connections stay pinned to one worker and no
  Traefik sticky-session configuration is needed. If Redis is unreachable the
  API still starts on the in-memory adapter (cross-worker broadcast degraded
  until Redis returns).

## 2. Create the Compose application

1. In Dokploy, create a **Docker Compose** application from this repository.
2. Use `docker-compose.yml` and the regular Docker Compose deployment type,
   not Docker Swarm Stack.
3. Copy `.env.example` to the Dokploy **Environment** tab and replace every
   placeholder with a unique secret.
4. Set `DB_HOST` to the internal hostname shown by the existing PostgreSQL
   application. The current template uses `market-db-2wwcav`; replace it if
   Dokploy shows another hostname. Ensure both applications can communicate
   over a shared Dokploy network.
5. Generate JWT secrets, for example:

   ```bash
   openssl rand -hex 32
   ```

6. The OpenSearch password must contain uppercase, lowercase, numeric and
   special characters. Do not change it after the first deployment without
   following the OpenSearch password rotation procedure: the initial variable
   only initializes a new data volume.

## 3. Configure the domain

In the Compose application's **Domains** tab:

1. Add `api.locafun.uz`.
2. Select service `api`.
3. Set container port `4000`.
4. Use path `/`.
5. Enable HTTPS and Let's Encrypt.

Dokploy injects the Traefik network and labels automatically. Do not publish
ports `5432`, `9200` or `9600`. Socket.IO uses the same API domain and Dokploy's
Traefik proxy supports the WebSocket upgrade.

If Cloudflare proxying is enabled, use SSL/TLS mode **Full (strict)**.

## 4. Deploy and verify

Deploy the Compose application and verify:

```text
https://api.locafun.uz/api/health
https://api.locafun.uz/api
```

Back up the existing PostgreSQL database before the first deployment. The
first API startup automatically applies TypeORM migrations. The
`uuid-ossp` extension migration runs before tables that use
`uuid_generate_v4()`.

After the initial deployment or a search mapping change, authenticate as an
admin and run:

```text
POST https://api.locafun.uz/api/search/reindex
```

## 5. Persistent data and backups

Do not delete these volumes during redeployment:

- `opensearch_data`
- `uploads_data`

Configure scheduled PostgreSQL backups in Dokploy. OpenSearch is a derived
search index and can be rebuilt from PostgreSQL, but uploaded files cannot be
recovered without a backup of `uploads_data`.

## Local development

The production Compose file intentionally does not publish infrastructure
ports. For local development use:

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm dev
```
