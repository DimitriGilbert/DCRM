# ---- Base: install all dependencies ----
FROM node:22-bookworm AS base
RUN corepack enable
WORKDIR /app

# ----_deps: production dependency install ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/ai/package.json packages/ai/
COPY packages/api/package.json packages/api/
COPY packages/auth/package.json packages/auth/
COPY packages/billing/package.json packages/billing/
COPY packages/config/package.json packages/config/
COPY packages/crypto/package.json packages/crypto/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/email/package.json packages/email/
COPY packages/env/package.json packages/env/
COPY packages/events/package.json packages/events/
COPY packages/i18n/package.json packages/i18n/
COPY packages/storage/package.json packages/storage/
COPY packages/ui/package.json packages/ui/
COPY packages/webhooks/package.json packages/webhooks/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

# ---- Build: compile all packages and the web app ----
FROM deps AS build
COPY packages/ai/ packages/ai/
COPY packages/api/ packages/api/
COPY packages/auth/ packages/auth/
COPY packages/billing/ packages/billing/
COPY packages/config/ packages/config/
COPY packages/crypto/ packages/crypto/
COPY packages/db/ packages/db/
COPY packages/domain/ packages/domain/
COPY packages/email/ packages/email/
COPY packages/env/ packages/env/
COPY packages/events/ packages/events/
COPY packages/i18n/ packages/i18n/
COPY packages/storage/ packages/storage/
COPY packages/ui/ packages/ui/
COPY packages/webhooks/ packages/webhooks/
COPY apps/web/ apps/web/

RUN pnpm turbo build --filter=web

# Prune devDependencies for the production image
RUN pnpm prune --prod

# ---- Production ----
FROM node:22-bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/apps/web/package.json ./package.json

ENV NODE_ENV=production
EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server/server.js"]
