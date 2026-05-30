# Verified Code Review Report — Cluster 3: Infrastructure (Env, Crypto, Docker)

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Source Report**: `review-report-3.md`

---

## Verification Summary

| # | Finding | Severity | Verdict | Notes |
|---|---------|----------|---------|-------|
| 1 | Dockerfile missing workspace packages | CRITICAL | ✅ CONFIRMED | Exact count verified. 8 packages missing. |
| 2 | Healthcheck uses `curl` not in slim image | HIGH | ✅ CONFIRMED | `curl` absent from production image. Healthcheck will always fail. |
| 3 | Postgres/Redis ports exposed with weak auth | HIGH | ✅ CONFIRMED | Ports published, weak/no auth. Accurate. |
| 4 | S3 fields not validated when STORAGE_TYPE=s3 | MEDIUM | ✅ CONFIRMED (with nuance) | Env validation gap is real, but runtime validation exists with clear error. Severity characterization adjusted. |

---

## Detailed Verification

### Finding 1: Dockerfile missing workspace packages — Docker build cannot succeed

**Verdict: ✅ CONFIRMED**

**Evidence from source code:**

The `Dockerfile` (lines 9-15) copies only 6 workspace `package.json` files in the deps stage:
- `packages/config/` ✅
- `packages/env/` ✅
- `packages/db/` ✅
- `packages/auth/` ✅
- `packages/api/` ✅
- `packages/ui/` ✅

The actual `packages/` directory contains **15 packages**: ai, api, auth, billing, config, crypto, db, domain, email, env, events, i18n, storage, ui, webhooks.

`packages/api/package.json` (lines 17-28) declares `workspace:*` dependencies on 11 packages. Comparing against what's in the Dockerfile:

| Package | In api deps? | In Dockerfile? |
|---------|-------------|----------------|
| `@DCRM/ai` | Yes (line 18) | ❌ MISSING |
| `@DCRM/billing` | Yes (line 19) | ❌ MISSING |
| `@DCRM/auth` | Yes (line 20) | ✅ Present |
| `@DCRM/crypto` | Yes (line 21) | ❌ MISSING |
| `@DCRM/db` | Yes (line 22) | ✅ Present |
| `@DCRM/domain` | Yes (line 23) | ❌ MISSING |
| `@DCRM/email` | Yes (line 24) | ❌ MISSING |
| `@DCRM/env` | Yes (line 25) | ✅ Present |
| `@DCRM/events` | Yes (line 26) | ❌ MISSING |
| `@DCRM/storage` | Yes (line 27) | ❌ MISSING |
| `@DCRM/webhooks` | Yes (line 28) | ❌ MISSING |
| `@DCRM/config` | devDep (line 37) | ✅ Present |

**Exactly 8 packages are missing**, as the report states. The build stage (lines 20-28) mirrors the deps stage and is missing the same 8 packages plus their source code.

**Additional note**: The `packages/i18n/` package exists in the workspace but is not listed as a dependency of `@DCRM/api` or `web`. It may be a transitive dependency of one of the missing packages. If so, the total number of missing packages could be 9 once all transitive workspace deps are resolved. The report's count of 8 is accurate for direct dependencies.

**Impact confirmed**: `pnpm install --frozen-lockfile` will fail because workspace protocol references require the target package.json to exist on disk. The Docker image cannot be built.

---

### Finding 2: Healthcheck uses `curl` which is not available in the production image

**Verdict: ✅ CONFIRMED**

**Evidence from source code:**

`docker-compose.yml` line 20:
```yaml
test: ["CMD-SHELL", "curl -sf http://localhost:3001/robots.txt || exit 1"]
```

`Dockerfile` lines 35-36:
```dockerfile
FROM node:22-bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*
```

Only `dumb-init` is installed via apt-get. The `node:22-bookworm-slim` image does not ship `curl`. The healthcheck command will fail with `sh: curl: not found`, causing Docker to mark the container as unhealthy after retries are exhausted.

**Impact confirmed**: The `app` service healthcheck will always fail. Any `depends_on: condition: service_healthy` referencing the app service will never resolve. Container orchestration tools will treat the container as failing.

---

### Finding 3: Postgres and Redis ports exposed to host with weak/no authentication

**Verdict: ✅ CONFIRMED**

**Evidence from source code:**

`docker-compose.yml` lines 30-33 (Postgres):
```yaml
POSTGRES_DB: ${POSTGRES_DB:-dcrm}
POSTGRES_USER: ${POSTGRES_USER:-dcrm}
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dcrm}
```
Lines 42-43:
```yaml
ports:
  - "5432:5432"
```

`docker-compose.yml` lines 49 (Redis):
```yaml
command: redis-server --appendonly yes
```
Lines 58-59:
```yaml
ports:
  - "6379:6379"
```

Both services publish their ports to the host network by default. Postgres defaults to password `"dcrm"` (same as username). Redis has no `--requirepass` set, meaning it accepts connections without authentication.

**Nuance**: The file does include advisory comments (lines 41 and 57) saying "Do not expose to the host in production", which shows developer awareness. However, the ports are actively published by default, and there is no `docker-compose.override.yml` pattern to separate dev/prod. Anyone running `docker compose up -d` will have these ports exposed.

**Impact confirmed**: On any host running this compose file, ports 5432 and 6379 are reachable from the host network. An attacker can connect to Redis with no credentials or to Postgres with `dcrm`/`dcrm`.

---

### Finding 4: S3 config fields not validated as required when STORAGE_TYPE is "s3"

**Verdict: ✅ CONFIRMED (with nuance — severity partially mitigated)**

**Evidence from source code:**

`packages/env/src/server.ts` lines 23-30:
```typescript
STORAGE_TYPE: z.enum(["local", "s3"]).default("local"),

// S3-compatible storage (only when STORAGE_TYPE=s3)
S3_ENDPOINT: z.string().min(1).optional(),
S3_BUCKET: z.string().min(1).optional(),
S3_ACCESS_KEY_ID: z.string().min(1).optional(),
S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
S3_REGION: z.string().min(1).optional(),
```

All 5 S3 fields are individually optional with no cross-field validation. Setting `STORAGE_TYPE=s3` without providing any S3 credentials will pass env validation at startup.

**However — the report's characterization of the runtime error is partially inaccurate.** The storage factory (`packages/storage/src/storage.ts` lines 35-38) **does** validate the required fields at creation time:

```typescript
if (config.STORAGE_TYPE === "s3") {
  if (!config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 storage requires S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY");
  }
}
```

This provides:
- A **clear error message** (not "an opaque S3 SDK error" as the report claims)
- Validation of 3 of 5 S3 fields (S3_ENDPOINT is optional even in the S3 client; S3_REGION defaults to `"us-east-1"` at line 44)

**Mitigated impact**: The failure will produce a clear error message, but it will occur at runtime (when `createStorage()` is called) rather than at startup during env validation. If storage is lazily initialized, this could surface on the first file upload attempt rather than during application boot.

**The core finding is valid**: The env validation layer does not enforce S3 field requirements when `STORAGE_TYPE=s3`. The suggestion to add Zod `refine()` or startup validation remains appropriate for fail-fast behavior. But the severity is somewhat lower than stated because runtime validation with a clear message does exist.

**Adjusted severity**: MEDIUM (unchanged) — but the report's description of "confusing 'access denied' or 'missing credentials' error" is inaccurate. The actual runtime error is a clear, descriptive message.

---

## Non-issues Verification

The report's "Non-issues" section was also spot-checked against source code:

- **Crypto SHA-256 key derivation** (`encrypt.ts:34-36`): ✅ Correct assessment. `createHash("sha256")` is appropriate for high-entropy key extraction. The master key is enforced as ≥32 chars (line 45).

- **AES-256-GCM implementation** (`encrypt.ts:54-70`): ✅ Correct. 12-byte random IV via `randomBytes()`, 16-byte auth tag, authenticated encryption. Implementation is sound.

- **Test coverage** (`encrypt.test.ts`, `server.test.ts`): ✅ Verified. Tests cover roundtrip, empty strings, unicode, tamper detection, wrong key, IV uniqueness, env validation edge cases. Well-structured with `vi.resetModules()`.

---

## Final Assessment

All 4 findings are **real issues**. No false positives were found.

- **Findings 1-3** are confirmed without qualification. They represent real, verifiable defects in the Docker configuration.
- **Finding 4** is confirmed but the report slightly mischaracterizes the runtime error. The storage module does have validation with a clear error message, but it runs at a different lifecycle point than env validation. The suggested fix (adding Zod cross-field validation or startup checks) remains valid for fail-fast behavior.
