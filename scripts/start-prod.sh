#!/bin/sh
# Production entrypoint: apply migrations exactly once, then start the PM2
# cluster. Running migrations here (before forking) avoids the race that would
# happen if every cluster worker tried to migrate on boot.
set -e

echo "[entrypoint] Applying database migrations..."
./node_modules/.bin/typeorm migration:run -d dist/db/data-source.js

echo "[entrypoint] Starting PM2 cluster..."
exec ./node_modules/.bin/pm2-runtime start ecosystem.config.js
