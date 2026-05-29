import { describe, expect, it } from "vitest";

import {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  extractKeyPrefix,
  isApiKeyFormat,
} from "../src/api-key";

describe("API Key Module", () => {
  describe("generateApiKey", () => {
    it("generates a key with the dcrm_ prefix", () => {
      const result = generateApiKey();

      expect(result.raw).toMatch(/^dcrm_[0-9a-f]{32}$/);
    });

    it("generates a key with correct prefix stored separately", () => {
      const result = generateApiKey();

      expect(result.prefix).toBe("dcrm_");
    });

    it("generates unique keys on successive calls", () => {
      const a = generateApiKey();
      const b = generateApiKey();

      expect(a.raw).not.toBe(b.raw);
      expect(a.hash).not.toBe(b.hash);
    });

    it("produces a deterministic SHA-256 hex hash", () => {
      const result = generateApiKey();

      // SHA-256 hex digest is always 64 characters
      expect(result.hash).toHaveLength(64);
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("hashApiKey", () => {
    it("produces a consistent hash for the same input", () => {
      const key = "dcrm_aabbccdd11223344aabbccdd11223344";
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);

      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different inputs", () => {
      const hash1 = hashApiKey("dcrm_aabbccdd11223344aabbccdd11223344");
      const hash2 = hashApiKey("dcrm_1234567890abcdef1234567890abcdef");

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyApiKey", () => {
    it("returns true for a matching key and hash", () => {
      const result = generateApiKey();

      expect(verifyApiKey(result.raw, result.hash)).toBe(true);
    });

    it("returns false for a wrong key against a hash", () => {
      const result = generateApiKey();
      const wrongKey = "dcrm_00000000000000000000000000000000";

      expect(verifyApiKey(wrongKey, result.hash)).toBe(false);
    });

    it("returns false for a completely malformed key", () => {
      const result = generateApiKey();

      expect(verifyApiKey("not-a-valid-key", result.hash)).toBe(false);
    });
  });

  describe("extractKeyPrefix", () => {
    it("extracts dcrm_ prefix from a valid key", () => {
      expect(extractKeyPrefix("dcrm_aabbccdd11223344aabbccdd11223344")).toBe(
        "dcrm_",
      );
    });

    it("returns the raw string when no recognized prefix exists", () => {
      expect(extractKeyPrefix("something_else")).toBe("something_else");
    });
  });

  describe("isApiKeyFormat", () => {
    it("returns true for a valid dcrm_ key", () => {
      expect(isApiKeyFormat("dcrm_aabbccdd11223344aabbccdd11223344")).toBe(
        true,
      );
    });

    it("returns false for a string without the dcrm_ prefix", () => {
      expect(isApiKeyFormat("sk_test_abc123")).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(isApiKeyFormat("")).toBe(false);
    });

    it("returns false for a dcrm_ prefix with wrong length", () => {
      expect(isApiKeyFormat("dcrm_short")).toBe(false);
    });
  });
});
