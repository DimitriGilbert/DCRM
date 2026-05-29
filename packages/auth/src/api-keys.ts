import { createHmac, randomBytes as createRandomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import type { apiKeys } from "@DCRM/db/schema/automation-integrations";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

const API_KEY_PREFIX = "dcrm_";
const API_KEY_RANDOM_BYTES = 32;
const API_KEY_LOOKUP_PREFIX_LENGTH = 17;

export type StoredApiKey = InferSelectModel<typeof apiKeys>;

export type InsertApiKeyInput = Omit<
  InferInsertModel<typeof apiKeys>,
  "lastUsedAt" | "revokedAt" | "updatedAt"
>;

export type PublicApiKey = Omit<StoredApiKey, "keyHash" | "revokedAt" | "updatedAt">;

export type CreatedApiKey = {
  apiKey: PublicApiKey;
  key: string;
};

export type VerifiedApiKey = {
  apiKey: Pick<PublicApiKey, "id" | "name" | "createdAt" | "lastUsedAt">;
  user: {
    id: string;
  };
};

export type ApiKeyRepository = {
  insertApiKey(input: InsertApiKeyInput): Promise<StoredApiKey>;
  findApiKeysByPrefix(keyPrefix: string, now: Date): Promise<StoredApiKey[]>;
  markApiKeyUsed(id: string, lastUsedAt: Date): Promise<Date>;
};

type ApiKeyServiceOptions = {
  repository: ApiKeyRepository;
  secret: string;
  generateId?: () => string;
  now?: () => Date;
  randomBytes?: () => Buffer;
};

type CreateApiKeyInput = {
  userId: string;
  name: string;
  expiresAt?: Date | null;
};

export type ApiKeyService = {
  createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey>;
  verifyApiKey(key: string): Promise<VerifiedApiKey | null>;
};

export function createApiKeyService(options: ApiKeyServiceOptions): ApiKeyService {
  const generateId = options.generateId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const randomBytes = options.randomBytes ?? (() => createRandomBytes(API_KEY_RANDOM_BYTES));

  return {
    async createApiKey(input) {
      const createdAt = now();
      const key = `${API_KEY_PREFIX}${randomBytes().toString("base64url")}`;
      const keyPrefix = extractLookupPrefix(key);
      const keyHash = hashApiKey(key, options.secret);
      const record = await options.repository.insertApiKey({
        id: generateId(),
        userId: input.userId,
        name: normalizeApiKeyName(input.name),
        keyPrefix,
        keyHash,
        expiresAt: input.expiresAt ?? null,
        createdAt,
      });

      return {
        apiKey: toPublicApiKey(record),
        key,
      };
    },
    async verifyApiKey(key) {
      if (!key.startsWith(API_KEY_PREFIX)) {
        return null;
      }

      const checkedAt = now();
      const candidates = await options.repository.findApiKeysByPrefix(extractLookupPrefix(key), checkedAt);
      const verified = candidates.find((candidate) => isUsableApiKey(candidate, checkedAt) && hashesMatch(key, candidate.keyHash, options.secret));

      if (!verified) {
        return null;
      }

      await options.repository.markApiKeyUsed(verified.id, checkedAt);

      return {
        apiKey: {
          id: verified.id,
          name: verified.name,
          createdAt: verified.createdAt,
          lastUsedAt: checkedAt,
        },
        user: {
          id: verified.userId,
        },
      };
    },
  };
}

export async function verifyApiKeyFromHeaders(
  headers: Headers,
  service: ApiKeyService,
): Promise<VerifiedApiKey | null> {
  const authorization = headers.get("authorization");

  if (authorization !== null) {
    if (!authorization.startsWith("Bearer ")) {
      return null;
    }

    const bearerKey = authorization.slice("Bearer ".length).trim();
    if (bearerKey.length === 0) {
      return null;
    }

    return service.verifyApiKey(bearerKey);
  }

  const apiKey = headers.get("x-api-key")?.trim();

  if (!apiKey) {
    return null;
  }

  return service.verifyApiKey(apiKey);
}

function normalizeApiKeyName(name: string) {
  const normalized = name.trim();
  if (normalized.length === 0 || normalized.length > 120) {
    throw new Error("API key name must be between 1 and 120 characters.");
  }
  return normalized;
}

function extractLookupPrefix(key: string) {
  return key.slice(0, API_KEY_LOOKUP_PREFIX_LENGTH);
}

function hashApiKey(key: string, secret: string) {
  return createHmac("sha256", secret).update(key).digest("hex");
}

function hashesMatch(key: string, expectedHash: string, secret: string) {
  const actual = Buffer.from(hashApiKey(key, secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isUsableApiKey(record: StoredApiKey, now: Date) {
  return record.revokedAt === null && (record.expiresAt === null || record.expiresAt > now);
}

function toPublicApiKey(record: StoredApiKey): PublicApiKey {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    keyPrefix: record.keyPrefix,
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
  };
}
