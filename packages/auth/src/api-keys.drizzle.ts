import { createDb } from "@DCRM/db";
import { apiKeys } from "@DCRM/db/schema/automation-integrations";
import { env } from "@DCRM/env/server";
import { and, eq, gt, isNull, or } from "drizzle-orm";

import { createApiKeyService } from "./api-keys.js";

import type { ApiKeyRepository, ApiKeyService } from "./api-keys.js";

export function createDrizzleApiKeyRepository(): ApiKeyRepository {
  const db = createDb();

  return {
    async insertApiKey(input) {
      const rows = await db.insert(apiKeys).values(input).returning();
      const record = rows[0];
      if (!record) {
        throw new Error("API key could not be created.");
      }
      return record;
    },
    async findApiKeysByPrefix(keyPrefix, now) {
      return db
        .select()
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.keyPrefix, keyPrefix),
            isNull(apiKeys.revokedAt),
            or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
          ),
        );
    },
    async markApiKeyUsed(id, lastUsedAt) {
      await db.update(apiKeys).set({ lastUsedAt }).where(eq(apiKeys.id, id));
      return lastUsedAt;
    },
  };
}

export function createDcrmApiKeyService(): ApiKeyService {
  return createApiKeyService({
    repository: createDrizzleApiKeyRepository(),
    secret: env.BETTER_AUTH_SECRET,
  });
}
