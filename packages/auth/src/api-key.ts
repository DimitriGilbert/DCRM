import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** The expected prefix for all DCRM API keys. */
export const API_KEY_PREFIX = "dcrm_";

/** Number of random bytes (32 hex chars = 16 bytes). */
const RANDOM_BYTE_COUNT = 16;

/**
 * Result of generating a new API key.
 * The raw key is shown once; the hash is stored in the database.
 */
export type GeneratedApiKey = {
  /** The full raw key shown to the user exactly once (e.g. "dcrm_aabb..."). */
  readonly raw: string;
  /** SHA-256 hex digest of the raw key — store this in the database. */
  readonly hash: string;
  /** The key prefix for identification (always "dcrm_"). */
  readonly prefix: string;
};

/**
 * Generates a new API key with the format `dcrm_` followed by 32 hex characters.
 *
 * The raw key must be shown to the user exactly once and never stored.
 * The hash should be persisted in the `apiKeys` table.
 */
export function generateApiKey(): GeneratedApiKey {
  const randomHex = randomBytes(RANDOM_BYTE_COUNT).toString("hex");
  const raw = `${API_KEY_PREFIX}${randomHex}`;
  const hash = hashApiKey(raw);

  return { raw, hash, prefix: API_KEY_PREFIX };
}

/**
 * Hashes an API key using SHA-256.
 *
 * @param key - The full raw API key string.
 * @returns The lowercase hex digest (64 characters).
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * Verifies that a raw API key matches the stored hash.
 *
 * @param rawKey - The raw key provided by the caller.
 * @param storedHash - The SHA-256 hash stored in the database.
 * @returns `true` when the key matches, `false` otherwise.
 */
export function verifyApiKey(rawKey: string, storedHash: string): boolean {
  const computedHash = hashApiKey(rawKey);
  const a = Buffer.from(computedHash, "utf8");
  const b = Buffer.from(storedHash, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Extracts the prefix portion of a key for identification display.
 * Returns "dcrm_" for valid keys, or the full string otherwise.
 */
export function extractKeyPrefix(key: string): string {
  if (key.startsWith(API_KEY_PREFIX)) {
    return API_KEY_PREFIX;
  }
  return key;
}

/**
 * Checks whether a string looks like a DCRM API key.
 * Valid format: `dcrm_` followed by exactly 32 hex characters.
 */
export function isApiKeyFormat(value: string): boolean {
  return /^dcrm_[0-9a-f]{32}$/.test(value);
}
