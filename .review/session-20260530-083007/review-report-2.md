# Code Review Report — Cluster 2: Auth Package

**Reviewer**: Code Review Expert (Security Focus)
**Date**: 2026-05-30
**Files Reviewed**:
1. `packages/auth/src/index.ts`
2. `packages/auth/src/resolve-auth.ts`
3. `packages/auth/src/api-key.ts`
4. `packages/auth/src/types.ts`
5. `packages/auth/__tests__/api-key.test.ts`

---

## Summary

The auth package is well-structured overall. Session resolution correctly delegates hash comparison to the database (avoiding Node.js timing attacks), API keys have sufficient entropy (128 bits), the `keyHash` column has a unique index, and SHA-256 is appropriate for high-entropy key hashing (vs. password hashing which needs bcrypt/argon2). Two real issues were found.

---

### [SEVERITY: MEDIUM] Finding 1: Fire-and-forget DB update can cause unhandled promise rejection

**File**: `packages/auth/src/resolve-auth.ts:122-125`
**Problem**: The `lastUsedAt` update uses `void` to discard the promise without a `.catch()` handler. If the database operation fails (connection blip, timeout, constraint error), the rejected promise has no handler. In Node.js with the default `--unhandled-rejections=throw` behavior, this can crash the process or emit loud warnings in production.
**Evidence**:
```typescript
// Update lastUsedAt (fire-and-forget — do not await)
void db
  .update(apiKeys)
  .set({ lastUsedAt: new Date() })
  .where(eq(apiKeys.id, matchedKey.id));
```
**Impact**: A transient database error during an authenticated API-key request could trigger an unhandled promise rejection. In production Node.js, this either crashes the server (if `--unhandled-rejections=throw`) or spams error logs. Since this fires on every API-key-authenticated request, the likelihood of hitting it during a database hiccup is non-trivial.
**Suggestion**: Add a `.catch()` to silently swallow the error (since `lastUsedAt` is non-critical metadata):
```typescript
void db
  .update(apiKeys)
  .set({ lastUsedAt: new Date() })
  .where(eq(apiKeys.id, matchedKey.id))
  .catch(() => {
    // lastUsedAt is non-critical; swallow to avoid unhandled rejection
  });
```

---

### [SEVERITY: MEDIUM] Finding 2: `verifyApiKey` uses timing-unsafe string comparison

**File**: `packages/auth/src/api-key.ts:53-55`
**Problem**: The exported `verifyApiKey` function compares the computed hash against the stored hash using `===`, which short-circuits on the first differing byte. An attacker who can measure response timing with high precision could exploit this to recover the stored hash character-by-character via a timing side-channel. Notably, the same codebase already uses `timingSafeEqual` correctly in `packages/webhooks/src/incoming.ts:104`.
**Evidence**:
```typescript
export function verifyApiKey(rawKey: string, storedHash: string): boolean {
  return hashApiKey(rawKey) === storedHash;
}
```
**Impact**: While the current auth flow in `resolve-auth.ts` correctly delegates hash comparison to the database (avoiding this issue entirely), `verifyApiKey` is an exported public API. Any consumer that uses this function for authentication — including future code in this same codebase — would introduce a timing-attack vulnerability. The function's name and documentation signal it as the intended way to verify keys, making misuse likely.
**Suggestion**: Use `crypto.timingSafeEqual` for the comparison, consistent with the pattern already established in the webhooks package:
```typescript
import { createHash, timingSafeEqual } from "node:crypto";

export function verifyApiKey(rawKey: string, storedHash: string): boolean {
  const computedHash = hashApiKey(rawKey);
  if (computedHash.length !== storedHash.length) return false;
  return timingSafeEqual(
    Buffer.from(computedHash, "utf8"),
    Buffer.from(storedHash, "utf8"),
  );
}
```
Since SHA-256 hex output is always 64 characters, the length check is a constant-time guard against early-exit optimization. An alternative simpler form that skips the length check (since both sides are always 64 chars) is also acceptable.

---

## Items Reviewed — No Issues Found

- **`packages/auth/src/index.ts`**: Better Auth configuration is sound. Secret comes from validated env (`BETTER_AUTH_SECRET` with `min(32)` constraint). Trusted origins are appropriate for the monorepo's mobile/desktop targets. Plugin setup is standard.

- **`packages/auth/src/resolve-auth.ts` — Auth resolution order**: API key checked before session is a correct and common pattern. The `isApiKeyFormat` pre-filter avoids unnecessary DB lookups for non-API-key bearer tokens.

- **`packages/auth/src/resolve-auth.ts` — Database-side hash comparison**: `resolveApiKeyAuth` queries `WHERE key_hash = ?` which delegates comparison to PostgreSQL. This is immune to Node.js timing attacks. Correct approach.

- **`packages/auth/src/resolve-auth.ts` — User lookup after key match**: Two-step query (key → user) is fine. Foreign key cascade (`onDelete: cascade`) ensures a deleted user's keys are removed, preventing orphaned key matches.

- **`packages/auth/src/api-key.ts` — Key entropy**: 16 bytes from `crypto.randomBytes` = 128 bits of entropy. SHA-256 is appropriate for hashing high-entropy tokens (unlike passwords which need adaptive hashing).

- **`packages/auth/src/api-key.ts` — `isApiKeyFormat` regex**: Correctly validates `dcrm_` prefix + exactly 32 lowercase hex chars. Consistent with `randomBytes(16).toString("hex")` output.

- **`packages/auth/src/types.ts`**: Clean type definition matching the auth user schema. No issues.

- **`packages/auth/__tests__/api-key.test.ts`**: Tests cover generation, hashing, verification, prefix extraction, and format validation. Well-structured. No issues flagged per review constraints (no test audits).

- **`packages/api/src/context.ts`**: Correctly delegates to `resolveAuth` with the full `auth.api` object. Clean integration.
