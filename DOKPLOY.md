# Production deployment with Dokploy

The production stack is defined in `docker-compose.yml`:

- `api`: NestJS API built from `Dockerfile`
- `opensearch`: single-node OpenSearch with authentication and persistent storage

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
