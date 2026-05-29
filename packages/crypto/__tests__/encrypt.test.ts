import { describe, expect, it } from "vitest";

import { createCrypto } from "../src/index.js";

const VALID_KEY = "abcdefghijklmnopqrstuvwxyz012345"; // 32+ chars
const DIFFERENT_KEY = "0123456789abcdefghijklmnopqrstuv"; // 32+ chars, different

describe("createCrypto", () => {
  it("rejects a key shorter than 32 characters", () => {
    expect(() => createCrypto("short")).toThrow();
  });

  describe("encrypt/decrypt roundtrip", () => {
    it("roundtrips a plaintext string", () => {
      const crypto = createCrypto(VALID_KEY);
      const plaintext = "hello world";
      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("roundtrips an empty string", () => {
      const crypto = createCrypto(VALID_KEY);
      const encrypted = crypto.encrypt("");
      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe("");
    });

    it("roundtrips a JSON string", () => {
      const crypto = createCrypto(VALID_KEY);
      const plaintext = JSON.stringify({ host: "imap.example.com", port: 993, password: "s3cret!" });
      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("roundtrips unicode content", () => {
      const crypto = createCrypto(VALID_KEY);
      const plaintext = "日本語テスト 🚀 émoji";
      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("encrypted value structure", () => {
    it("returns ciphertext, iv, authTag as base64 strings", () => {
      const crypto = createCrypto(VALID_KEY);
      const encrypted = crypto.encrypt("test");

      expect(typeof encrypted.ciphertext).toBe("string");
      expect(typeof encrypted.iv).toBe("string");
      expect(typeof encrypted.authTag).toBe("string");

      // Valid base64: only base64 chars and optional = padding
      const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
      expect(encrypted.ciphertext).toMatch(base64Pattern);
      expect(encrypted.iv).toMatch(base64Pattern);
      expect(encrypted.authTag).toMatch(base64Pattern);
    });

    it("includes a version number", () => {
      const crypto = createCrypto(VALID_KEY);
      const encrypted = crypto.encrypt("test");
      expect(typeof encrypted.version).toBe("number");
      expect(encrypted.version).toBeGreaterThan(0);
    });

    it("produces different IVs on successive calls", () => {
      const crypto = createCrypto(VALID_KEY);
      const a = crypto.encrypt("same plaintext");
      const b = crypto.encrypt("same plaintext");
      expect(a.iv).not.toBe(b.iv);
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });
  });

  describe("tamper detection", () => {
    /** Find first non-padding base64 character and flip it. */
    function flipFirstDataChar(base64: string): string {
      const chars = base64.split("");
      for (let i = 0; i < chars.length; i++) {
        if (chars[i] !== "=") {
          chars[i] = chars[i] === "A" ? "B" : "A";
          return chars.join("");
        }
      }
      // Fallback: prepend a byte
      return "AA" + base64;
    }

    it("fails when ciphertext is modified", () => {
      const crypto = createCrypto(VALID_KEY);
      const encrypted = crypto.encrypt("secret data");

      const tampered = { ...encrypted, ciphertext: flipFirstDataChar(encrypted.ciphertext) };
      expect(() => crypto.decrypt(tampered)).toThrow();
    });

    it("fails when authTag is modified", () => {
      const crypto = createCrypto(VALID_KEY);
      const encrypted = crypto.encrypt("secret data");

      const tampered = { ...encrypted, authTag: flipFirstDataChar(encrypted.authTag) };
      expect(() => crypto.decrypt(tampered)).toThrow();
    });

    it("fails when IV is modified", () => {
      const crypto = createCrypto(VALID_KEY);
      const encrypted = crypto.encrypt("secret data");

      const tampered = { ...encrypted, iv: flipFirstDataChar(encrypted.iv) };
      expect(() => crypto.decrypt(tampered)).toThrow();
    });
  });

  describe("wrong key", () => {
    it("fails to decrypt with a different key", () => {
      const encryptor = createCrypto(VALID_KEY);
      const decryptor = createCrypto(DIFFERENT_KEY);

      const encrypted = encryptor.encrypt("top secret");
      expect(() => decryptor.decrypt(encrypted)).toThrow();
    });
  });
});
