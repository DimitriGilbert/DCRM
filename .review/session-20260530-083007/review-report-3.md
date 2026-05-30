# Code Review Report — Cluster 3: Infrastructure (Env, Crypto, Docker)

**Reviewer**: Code Review Expert (Cluster 3)
**Date**: 2026-05-30
**Files Reviewed**:
1. `packages/env/src/server.ts`
2. `packages/env/src/web.ts`
3. `packages/env/src/native.ts`
4. `packages/env/__tests__/server.test.ts`
5. `packages/crypto/src/index.ts`
6. `packages/crypto/src/encrypt.ts`
7. `packages/crypto/__tests__/encrypt.test.ts`
8. `docker-compose.yml`
9. `Dockerfile`

---

## Summary

The env validation and crypto implementations are solid. The real problems are in the Docker configuration: the Dockerfile is critically incomplete (missing 8+ workspace packages that the API depends on, making Docker builds impossible), the healthcheck uses a binary that doesn't exist in the production image, and the compose file exposes database/Redis ports with weak or no authentication.

**Files with issues**: `Dockerfile`, `docker-compose.yml`
**Files clean**: `packages/env/src/*`, `packages/crypto/src/*`, all test files

---

### [SEVERITY: CRITICAL] Finding 1: Dockerfile missing workspace packages — Docker build cannot succeed

**File**: `Dockerfile:[6-16]` (deps stage) and `Dockerfile:[20-28]` (build stage)
**Problem**: The Dockerfile only copies 6 of the 15 workspace packages. The API (`@DCRM/api`) depends on 11 workspace packages, but the Dockerfile omits 8 of them — including `@DCRM/crypto`, the core encryption service this cluster is responsible for. `pnpm install --frozen-lockfile` will fail because workspace references (`workspace:*`) require the target package.json to exist on disk. Even if install somehow passed, `pnpm turbo build --filter=web` would fail because source code is missing.

**Evidence**:
```
# deps stage — only these package.json files are copied:
COPY packages/config/package.json packages/config/
COPY packages/env/package.json packages/env/
COPY packages/db/package.json packages/db/
COPY packages/auth/package.json packages/auth/
COPY packages/api/package.json packages/api/
COPY packages/ui/package.json packages/ui/
```

But `packages/api/package.json` declares dependencies on:
```json
"@DCRM/ai": "workspace:*",
"@DCRM/billing": "workspace:*",
"@DCRM/crypto": "workspace:*",
"@DCRM/domain": "workspace:*",
"@DCRM/email": "workspace:*",
"@DCRM/events": "workspace:*",
"@DCRM/storage": "workspace:*",
"@DCRM/webhooks": "workspace:*"
```

None of these 8 packages have their `package.json` or source code copied in either stage.

**Impact**: The Docker image cannot be built. Deployment is completely broken. This blocks any containerized deployment of the application.

**Suggestion**: Add the missing packages to both stages. For each missing package, add lines like:
```dockerfile
# In deps stage:
COPY packages/crypto/package.json packages/crypto/
COPY packages/ai/package.json packages/ai/
COPY packages/billing/package.json packages/billing/
COPY packages/domain/package.json packages/domain/
COPY packages/email/package.json packages/email/
COPY packages/events/package.json packages/events/
COPY packages/storage/package.json packages/storage/
COPY packages/webhooks/package.json packages/webhooks/

# In build stage:
COPY packages/crypto/ packages/crypto/
COPY packages/ai/ packages/ai/
COPY packages/billing/ packages/billing/
COPY packages/domain/ packages/domain/
COPY packages/email/ packages/email/
COPY packages/events/ packages/events/
COPY packages/storage/ packages/storage/
COPY packages/webhooks/ packages/webhooks/
```

Alternatively, simplify by copying all workspace packages at once:
```dockerfile
COPY packages/*/package.json packages/*/
# ... and later:
COPY packages/ packages/
```

---

### [SEVERITY: HIGH] Finding 2: Healthcheck uses `curl` which is not available in the production image

**File**: `docker-compose.yml:[20]` and `Dockerfile:[35]`
**Problem**: The `app` service healthcheck uses `curl -sf http://localhost:3001/robots.txt || exit 1`, but the production image is `node:22-bookworm-slim` and only installs `dumb-init` via apt. The Debian slim variant does not include `curl`. The healthcheck will always fail with "command not found", causing Docker to mark the container as unhealthy after the retry limit is exhausted.

**Evidence**:
```yaml
# docker-compose.yml line 20
healthcheck:
  test: ["CMD-SHELL", "curl -sf http://localhost:3001/robots.txt || exit 1"]
```
```dockerfile
# Dockerfile line 35-36 — production image, no curl installed
FROM node:22-bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*
```

**Impact**: Docker will mark the `dcrm-app` container as unhealthy. Any orchestration or monitoring that relies on the healthcheck (Docker Swarm, watchtower, restart policies dependent on health status) will treat the container as failing. `depends_on: condition: service_healthy` in compose files that reference the app service will never resolve.

**Suggestion**: Replace `curl` with a Node.js one-liner since Node.js is already in the image:
```yaml
healthcheck:
  test: ["CMD-SHELL", "node -e \"fetch('http://localhost:3001/robots.txt').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\""]
  interval: 15s
  timeout: 5s
  retries: 5
  start_period: 30s
```

Alternatively, install `curl` in the production image if you prefer the simpler command:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init curl && rm -rf /var/lib/apt/lists/*
```

---

### [SEVERITY: HIGH] Finding 3: Postgres and Redis ports exposed to host with weak/no authentication

**File**: `docker-compose.yml:[42-43]` and `docker-compose.yml:[58-59]`
**Problem**: This is the sole docker-compose file for the application — there is no separate production compose override. Yet Postgres (port 5432) and Redis (port 6379) are both published to the host with weak or no authentication. Postgres defaults to password "dcrm" (same as username), and Redis has no authentication at all (`--requirepass` is not set). The inline comments say "Do not expose to the host in production" but the ports are actively published by default. Anyone deploying with `docker compose up -d` will have these services exposed.

**Evidence**:
```yaml
# Postgres — weak default password, port exposed
postgres:
  environment:
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dcrm}  # default = "dcrm"
  ports:
    - "5432:5432"  # exposed to host

# Redis — no auth, port exposed
redis:
  command: redis-server --appendonly yes  # no --requirepass
  ports:
    - "6379:6379"  # exposed to host
```

**Impact**: On any host where this compose file is run, port 5432 and 6379 are reachable from the host network and potentially from other containers or the internet (depending on firewall rules). An attacker can connect to Redis with no credentials, or to Postgres with username `dcrm` / password `dcrm`. This allows full read/write access to all application data, session tokens, and queued jobs.

**Suggestion**: Remove the `ports` directives from Postgres and Redis. The `app` service communicates with them over the Docker internal network and does not need host port mapping:

```yaml
postgres:
  # ... no "ports" key at all (app reaches it as "postgres:5432" internally)

redis:
  # ... no "ports" key at all (app reaches it as "redis:6379" internally)
```

If local access is needed for development, create a `docker-compose.override.yml` that adds the ports only in dev:
```yaml
# docker-compose.override.yml (auto-merged by docker compose, .gitignored)
services:
  postgres:
    ports:
      - "5432:5432"
  redis:
    ports:
      - "6379:6379"
```

For Redis specifically, also add authentication:
```yaml
redis:
  command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-changeme}
```

---

### [SEVERITY: MEDIUM] Finding 4: S3 config fields not validated as required when STORAGE_TYPE is "s3"

**File**: `packages/env/src/server.ts:[26-30]`
**Problem**: When `STORAGE_TYPE` is set to `"s3"`, all five S3 fields (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`) are individually optional in the Zod schema. The env validation will pass even if `STORAGE_TYPE=s3` but no S3 credentials are provided. The failure will occur later at runtime — likely as a confusing "access denied" or "missing credentials" error from the S3 client rather than a clear startup validation message.

**Evidence**:
```typescript
STORAGE_TYPE: z.enum(["local", "s3"]).default("local"),

// S3-compatible storage (only when STORAGE_TYPE=s3)
S3_ENDPOINT: z.string().min(1).optional(),
S3_BUCKET: z.string().min(1).optional(),
S3_ACCESS_KEY_ID: z.string().min(1).optional(),
S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
S3_REGION: z.string().min(1).optional(),
```

**Impact**: A misconfigured deployment (setting `STORAGE_TYPE=s3` without providing S3 credentials) will pass env validation at startup but fail when the application first attempts a storage operation. The error will be an opaque S3 SDK error rather than a clear "required environment variable missing" message, making it harder to diagnose.

**Suggestion**: Use a Zod `.refine()` or `.superRefine()` to enforce that all S3 fields are present when `STORAGE_TYPE` is `"s3"`:

```typescript
server: {
  STORAGE_TYPE: z.enum(["local", "s3"]).default("local"),
  S3_ENDPOINT: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
},
// Add to createEnv options:
validatedEnvSchema: {
  // (Not directly supported by @t3-oss/env-core; alternative approach below)
}
```

Since `@t3-oss/env-core` validates each field independently, the pragmatic fix is to use Zod's `.refine()` on a wrapper schema, or handle this validation in the application's startup path:

```typescript
// After env is created, in the storage module initialization:
if (env.STORAGE_TYPE === "s3") {
  const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_REGION"] as const;
  for (const key of required) {
    if (!env[key]) {
      throw new Error(`STORAGE_TYPE is "s3" but ${key} is not set`);
    }
  }
}
```

---

## Non-issues (things reviewed and found acceptable)

- **Crypto key derivation via SHA-256** (`packages/crypto/src/encrypt.ts:34-36`): Using `SHA-256(masterKey)` as a key extractor is appropriate here because the master key is a high-entropy string (enforced as >= 32 chars), not a user password. A full KDF like HKDF or PBKDF2 would add iteration overhead without meaningful security benefit when the input already has sufficient entropy.

- **AES-256-GCM implementation** (`packages/crypto/src/encrypt.ts:54-70`): Correct use of 12-byte random IV via `randomBytes()`, 16-byte auth tag, authenticated encryption. IV uniqueness is guaranteed by CSPRNG. Tamper detection is properly tested.

- **`CORS_ORIGIN` as single URL** (`packages/env/src/server.ts:10`): For a single-user CRM, one origin is the correct model. Native mobile apps (Expo) are not subject to CORS. No issue.

- **Web env empty client schema** (`packages/env/src/web.ts:5`): No client-exposed env vars needed currently. The schema is a placeholder that provides the `clientPrefix` convention for future use. No leakage risk.

- **Native env** (`packages/env/src/native.ts`): Correctly validates only `EXPO_PUBLIC_SERVER_URL`. Minimal and appropriate.

- **Tests** (`packages/env/__tests__/server.test.ts`, `packages/crypto/__tests__/encrypt.test.ts`): Test coverage is thorough — roundtrip encryption, empty strings, unicode, tamper detection, wrong key, IV uniqueness, and env validation edge cases. Well-structured with proper module isolation via `vi.resetModules()`.
