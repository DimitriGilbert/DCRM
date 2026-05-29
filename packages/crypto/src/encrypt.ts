import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Current encryption algorithm version. Increment when algorithm changes. */
const ALGORITHM_VERSION = 1;

const ALGORITHM = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;
const KEY_BYTE_LENGTH = 32;

/** Structured result of AES-256-GCM authenticated encryption. */
export type EncryptedValue = {
  /** Ciphertext encoded as base64. */
  readonly ciphertext: string;
  /** Initialization vector (nonce) encoded as base64. */
  readonly iv: string;
  /** GCM authentication tag encoded as base64. */
  readonly authTag: string;
  /** Algorithm version for future migration support. */
  readonly version: number;
};

export type CryptoService = {
  /** Encrypt a plaintext string using AES-256-GCM. */
  encrypt(plaintext: string): EncryptedValue;
  /** Decrypt an EncryptedValue back to the original plaintext. */
  decrypt(encrypted: EncryptedValue): string;
};

/**
 * Derives a 256-bit key from the master key string using SHA-256.
 * Returns the raw hash bytes — exactly 32 bytes for AES-256.
 */
function deriveKey(masterKey: string): Buffer {
  return createHash("sha256").update(masterKey, "utf8").digest();
}

/**
 * Creates a crypto service bound to the given master key.
 *
 * @param masterKey - At least 32 characters. Used to derive the AES-256 key.
 * @throws {Error} If the key is shorter than 32 characters.
 */
export function createCrypto(masterKey: string): CryptoService {
  if (masterKey.length < KEY_BYTE_LENGTH) {
    throw new Error(
      `Encryption key must be at least ${KEY_BYTE_LENGTH} characters, got ${masterKey.length}`,
    );
  }

  const key = deriveKey(masterKey);

  return {
    encrypt(plaintext: string): EncryptedValue {
      const iv = randomBytes(IV_BYTE_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_BYTE_LENGTH,
      });
      const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return {
        ciphertext: encrypted.toString("base64"),
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
        version: ALGORITHM_VERSION,
      };
    },

    decrypt(encrypted: EncryptedValue): string {
      const iv = Buffer.from(encrypted.iv, "base64");
      const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
      const authTag = Buffer.from(encrypted.authTag, "base64");

      const decipher = createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_BYTE_LENGTH,
      });
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    },
  };
}
