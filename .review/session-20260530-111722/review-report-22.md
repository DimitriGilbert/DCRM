# Code Review Report — Clusters 22 & 23

**Reviewer**: Code Review Expert
**Date**: 2026-05-30
**Scope**: AI Chat & Provider (Cluster 22), Import & Export (Cluster 23)
**Files Reviewed**: 24 files

---

## Summary

**2 findings** — 1 HIGH, 1 MEDIUM.

The code is generally well-structured: proper user-scoping on all queries, encrypted API key storage, good CSV parsing with row limits, and clean separation of concerns. The two issues found are a credential leak in the export path and a broken test mock.

---

### [SEVERITY: HIGH] Finding 1: Full Data Export Leaks Encrypted API Keys

**File**: `packages/api/src/routers/export/full-data-export.ts:64`

**Problem**: The `aiProviders` query uses `select()` with no column list, which returns **all** columns — including `encryptedApiKey`. This column contains the user's AI provider API keys (e.g., OpenAI, Anthropic) encrypted with the application's master encryption key. The full export response includes this sensitive credential material.

**Evidence**:
```ts
// Line 64
db.select().from(aiProviders).where(eq(aiProviders.userId, userId)),
```
`aiProviders` schema (`packages/db/src/schema/automation.ts:208`) includes:
```ts
encryptedApiKey: text("encrypted_api_key").notNull(),
```

The export response at line 85 includes the full row:
```ts
aiProviders: aiProvidersData,
```

**Impact**:
- Exported JSON contains encrypted API keys. If the export file is stored, backed up, or shared, the encrypted keys travel with it.
- If the application's `ENCRYPTION_KEY` env var is ever compromised, any exported backup file becomes a direct source of plaintext API keys.
- Users performing a "data export" likely expect CRM data (clients, projects, tickets) — not credential material. There is no indication the export contains secrets.
- Since this is a `.query()` procedure, tRPC/React Query may cache the response in the browser, keeping encrypted keys in memory/cache.

**Suggestion**: Explicitly select only safe columns from `aiProviders`:

```ts
// Replace line 64
db.select({
  id: aiProviders.id,
  provider: aiProviders.provider,
  name: aiProviders.name,
  baseUrl: aiProviders.baseUrl,
  config: aiProviders.config,
  enabled: aiProviders.enabled,
  createdAt: aiProviders.createdAt,
  updatedAt: aiProviders.updatedAt,
}).from(aiProviders).where(eq(aiProviders.userId, userId)),
```

This matches the pattern already used in `ai-provider/list.ts` and `ai-provider/read.ts`, which correctly exclude `encryptedApiKey` from their select projections.

---

### [SEVERITY: MEDIUM] Finding 2: Test Mock Missing `db.transaction` — Import Tests Cannot Pass

**File**: `packages/api/src/routers/import/procedures.test.ts:38-46`

**Problem**: The `@DCRM/db` mock provides `db.insert` but does **not** provide `db.transaction`. The `importClients` procedure (at `import-clients.ts:54`) calls `db.transaction(async (tx) => { ... })`. At runtime, `db.transaction` is `undefined`, causing a `TypeError: db.transaction is not a function` before any assertions are reached.

**Evidence**:
```ts
// procedures.test.ts lines 38-46
vi.mock("@DCRM/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(async (row: unknown) => {
        insertedRows.push(row);
      }),
    })),
    // Missing: transaction
  },
}));
```

The procedure under test requires both `db.transaction` and `tx.insert`:
```ts
// import-clients.ts:54
await db.transaction(async (tx) => {
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    // ...
    await tx.insert(clients).values(clientRow);
    response.created++;
    // ...
  }
});
```

**Impact**: Every test in the `importClients` describe block will throw an unhandled `TypeError` at the `db.transaction(...)` call. The test expectations (`expect(result.created).toBe(2)`, etc.) are never reached. These tests provide **zero actual coverage** of the import logic.

**Suggestion**: Add a `transaction` mock that yields a transaction object with an `insert` method:

```ts
vi.mock("@DCRM/db", () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: { insert: ReturnType<typeof vi.fn> }) => Promise<void>) => {
      const tx = {
        insert: vi.fn(() => ({
          values: vi.fn(async (row: unknown) => {
            insertedRows.push(row);
          }),
        })),
      };
      await fn(tx);
    }),
  },
}));
```

---

## Files With No Issues

The following files were thoroughly reviewed and found to be correct:

| File | Assessment |
|------|-----------|
| `ai-chat/index.ts` | Clean router composition |
| `ai-chat/send-message.ts` | Proper user-scoped provider lookup, encrypted key handling, clear comment about not leaking the key in response |
| `ai-chat/data-access.ts` | All 5 CRM tool queries correctly scoped by `userId` with `deletedAt` filters. Message store properly scoped. |
| `ai-chat/clear-history.ts` | Correct user-scoped delete |
| `ai-chat/list-messages.ts` | Proper user-scoped query with validated limit |
| `ai-chat/schemas.ts` | Reasonable limits (content max 4000, messages max 100) |
| `ai-provider/index.ts` | Clean router composition |
| `ai-provider/create.ts` | Encrypts API key before storage, excludes it from response |
| `ai-provider/read.ts` | Explicit column selection excluding `encryptedApiKey` |
| `ai-provider/update.ts` | Ownership check before update, re-encrypts key on change |
| `ai-provider/delete.ts` | User-scoped delete with `.returning()` |
| `ai-provider/list.ts` | Explicit column selection excluding `encryptedApiKey` |
| `ai-provider/schemas.ts` | Uses domain-level `aiProviderSchema` enum for provider type |
| `export/index.ts` | Clean router composition with re-exports |
| `export/export-list.ts` | Proper user-scoping, soft-delete filter option, format branching |
| `export/csv-utils.ts` | Correct RFC 4180 escaping |
| `export/schemas.ts` | Proper enum constraints |
| `export/csv-utils.test.ts` | Good coverage of edge cases |
| `import/index.ts` | Clean router composition |
| `import/import-clients.ts` | Transactional inserts, field allowlist validation, proper error accumulation |
| `import/parse-csv.ts` | RFC 4180 compliant, `MAX_ROWS = 10_000` limit |
| `import/schemas.ts` | 5MB CSV size limit, proper field definitions |
