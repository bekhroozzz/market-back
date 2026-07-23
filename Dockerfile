# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable \
    && corepack prepare pnpm@11.1.2 --activate


FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile


FROM base AS build

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN pnpm run build


FROM base AS production-dependencies

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile


FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    PM2_HOME=/tmp/.pm2

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node ecosystem.config.js ./ecosystem.config.js
COPY --chown=node:node scripts/start-prod.sh ./scripts/start-prod.sh

# Uploaded files must be persisted with a Dokploy volume mounted at /app/uploads.
RUN mkdir -p uploads/gallery uploads/images \
    && chown -R node:node uploads

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Migrate once, then run the PM2 cluster (see scripts/start-prod.sh).
CMD ["sh", "scripts/start-prod.sh"]
