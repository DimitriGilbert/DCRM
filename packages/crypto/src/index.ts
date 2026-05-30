import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { createServerEnv } from "@DCRM/env/create-server-env";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;

export type CryptoEnvironment = Pick<ReturnType<typeof createServerEnv>, "ENCRYPTION_KEY">;

export type EncryptedSecretV1 = {
  version: "dcrm.secret.v1";
  algorithm: "aes-256-gcm";
  encoding: "base64";
  ciphertext: string;
  iv: string;
  authTag: string;
};

export type SecretCrypto = {
  encrypt: (plaintext: string) => EncryptedSecretV1;
  decrypt: (encrypted: EncryptedSecretV1) => string;
};

export class SecretDecryptionError extends Error {
  constructor() {
    super("Secret decryption failed.");
    this.name = "SecretDecryptionError";
  }
}

export function createSecretCrypto(env: CryptoEnvironment): SecretCrypto {
  const masterKey = decodeMasterKey(env.ENCRYPTION_KEY);

  return {
    encrypt: (plaintext) => encryptSecret(plaintext, masterKey),
    decrypt: (encrypted) => decryptSecret(encrypted, masterKey),
  };
}

function encryptSecret(plaintext: string, masterKey: Buffer): EncryptedSecretV1 {
  const iv = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: "dcrm.secret.v1",
    algorithm: ALGORITHM,
    encoding: "base64",
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

function decryptSecret(encrypted: EncryptedSecretV1, masterKey: Buffer): string {
  try {
    const decipher = createDecipheriv(ALGORITHM, masterKey, Buffer.from(encrypted.iv, "base64"), {
      authTagLength: AUTH_TAG_BYTES,
    });

    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch {
    throw new SecretDecryptionError();
  }
}

function decodeMasterKey(key: string): Buffer {
  const trimmedKey = key.trim();

  if (/^[a-fA-F0-9]{64}$/.test(trimmedKey)) {
    return Buffer.from(trimmedKey, "hex");
  }

  const base64Key = Buffer.from(trimmedKey, "base64");
  if (base64Key.byteLength === KEY_BYTES && base64Key.toString("base64") === trimmedKey) {
    return base64Key;
  }

  throw new Error("Encryption key must be 32 bytes encoded as 64 hex characters or canonical base64.");
}
