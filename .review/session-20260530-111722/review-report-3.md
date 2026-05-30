# Code Review Report — Cluster 3

**Reviewer**: Code Review Expert (Security Focus)
**Date**: 2026-05-30
**Files Reviewed**: 12 files across `packages/auth`, `packages/crypto`, `packages/env`

---

## Findings: 0

After thorough review of all 12 assigned files, **no real issues were found**. The code is security-conscious, well-structured, and follows best practices for the domain.

---

## Detailed Assessment

### packages/auth/src/api-key.ts — API Key Generation & Verification

- **Cryptographic strength**: 16 random bytes (128 bits of entropy) via `node:crypto.randomBytes`. Adequate for API keys — computationally infeasible to brute-force.
- **Timing-safe comparison**: `verifyApiKey` correctly uses `timingSafeEqual` to compare hash digests, preventing timing side-channel attacks.
- **Format validation**: `isApiKeyFormat` uses an anchored regex (`^dcrm_[0-9a-f]{32}$`) that rejects overlong/malformed inputs before any DB lookup — good defense-in-depth.
- **Hashing**: SHA-256 is appropriate for API key hashing (keys are high-entropy, not passwords, so no need for bcrypt/argon2).

### packages/auth/src/resolve-auth.ts — Auth Resolution

- **Resolution order**: API key (via `Authorization: Bearer dcrm_...`) is tried first, then session fallback. This is correct — if an explicit Bearer credential is present, it should be the sole auth method. Falling back to session on invalid Bearer would create a confused-deputy vulnerability.
- **Early return on valid-format Bearer token**: Prevents session confusion attacks. If someone sends a Bearer token that looks like a DCRM key, the system commits to API-key auth exclusively.
- **Fire-and-forget `lastUsedAt` update**: `void db.update(...).catch(() => {})` is acceptable for this best-effort telemetry field. The `.catch()` prevents unhandled rejection; the `void` marks intent. Does not affect auth outcome.
- **Orphan key handling**: If an API key exists but the user was deleted, the function correctly returns `{ user: null, session: null }` (unauthenticated). The `onDelete: "cascade"` FK constraint on `apiKeys.userId` should prevent this in practice.
- **Downstream enforcement**: The tRPC `protectedProcedure` middleware (`packages/api/src/index.ts:11-24`) properly checks `!ctx.user` and throws `UNAUTHORIZED`, then narrows the TypeScript type to `UserRecord` (non-null). All protected routes use `ctx.user.id` safely.

### packages/auth/src/types.ts & packages/auth/src/index.ts

- **Type definitions**: Clean, minimal, and well-documented.
- **Singleton auth instance**: `export const auth = createAuth()` creates one Better Auth instance at module load. Standard Better Auth pattern.
- **Separate DB pools**: `createAuth()` creates its own `createDb()` for the Better Auth adapter, while `resolve-auth.ts` imports the shared `db` from `@DCRM/db`. Two pools to the same database — acceptable for a single-user CRM; Better Auth needs its own adapter instance.

### packages/crypto/src/encrypt.ts — AES-256-GCM Encryption

- **Algorithm**: AES-256-GCM with 12-byte IV (standard nonce length for GCM) and 16-byte auth tag. Correct and authenticated.
- **Key derivation**: `deriveKey` uses `SHA-256(masterKey)` to produce a 32-byte key. This is appropriate because the master key is already a high-entropy secret (validated as `min(32)` chars), not a password. HKDF/PBKDF2 would add no security benefit here.
- **Fresh IV per encryption**: `randomBytes(IV_BYTE_LENGTH)` generates a unique 12-byte nonce for every `encrypt()` call. Verified by tests that successive calls produce different IVs and ciphertexts.
- **Tamper detection**: GCM authentication tag ensures any modification to ciphertext, IV, or auth tag causes decryption to fail. Tests confirm tamper detection for all three components.
- **Version field**: `ALGORITHM_VERSION = 1` included in `EncryptedValue` for future algorithm migration — forward-thinking design.
- **Key length validation**: `createCrypto` enforces `masterKey.length >= 32` characters, consistent with `ENCRYPTION_KEY: z.string().min(32)` in env validation.

### packages/env/src/server.ts — Server Environment Validation

- **Secret minimum lengths**: `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` both require `min(32)` characters. Appropriate for cryptographic secrets.
- **URL validation**: `BETTER_AUTH_URL`, `CORS_ORIGIN`, `REDIS_URL`, `APP_URL` all use `z.url()` — strict URL format enforcement.
- **Conditional S3 refinement**: `createFinalSchema` correctly requires `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` when `STORAGE_TYPE === "s3"`. `S3_ENDPOINT` and `S3_REGION` remain optional (correct for AWS S3 with default region/endpoint or S3-compatible services).
- **Boolean transform**: `BILLING_ENABLED` uses `.transform((val) => val === "true")` to convert the string env var to a proper boolean. Clean.
- **`emptyStringAsUndefined: true`**: Prevents empty strings from passing `min(1)` or `min(32)` validations. Important for Docker/Kubernetes environments that sometimes set empty env vars.

### packages/env/src/web.ts & packages/env/src/native.ts

- **Web**: Empty client config (no public env vars yet). Correct `VITE_` prefix and `import.meta.env` runtime source for Vite.
- **Native**: Single `EXPO_PUBLIC_SERVER_URL` with `z.url()` validation. Correct `EXPO_PUBLIC_` prefix for Expo.

### packages/auth/__tests__/api-key.test.ts & packages/crypto/__tests__/encrypt.test.ts

- Comprehensive coverage of generation, hashing, verification, format validation, roundtrip encryption, tamper detection, and wrong-key scenarios.
- Tests are well-structured and verify the security properties (uniqueness, determinism, tamper resistance).

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 0     |
| MEDIUM   | 0     |

**Total findings: 0**

The authentication, API key, encryption, and environment validation code is well-implemented with appropriate security measures at every layer. The auth resolution correctly prevents confused-deputy attacks by committing to a single auth method per request. The encryption uses authenticated encryption (AES-256-GCM) with proper nonce management. Env validation enforces minimum secret lengths and uses strict URL parsing. No actionable issues found.
