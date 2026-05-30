import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SecretDecryptionError, createSecretCrypto } from "./index.js";

const validHexEncryptionKey = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const validOtherHexEncryptionKey = "1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100";
const validBase64EncryptionKey = Buffer.from(validHexEncryptionKey, "hex").toString("base64");

describe("secret crypto", () => {
  it("round-trips a secret through explicit encryption and decryption calls", () => {
    const crypto = createSecretCrypto({ ENCRYPTION_KEY: validHexEncryptionKey });
    const encrypted = crypto.encrypt("smtp-password");

    assert.equal(encrypted.version, "dcrm.secret.v1");
    assert.equal(encrypted.algorithm, "aes-256-gcm");
    assert.equal(encrypted.encoding, "base64");
    assert.ok(encrypted.iv.length > 0);
    assert.ok(encrypted.authTag.length > 0);
    assert.notEqual(encrypted.ciphertext, "smtp-password");
    assert.equal(JSON.stringify(encrypted).includes("smtp-password"), false);
    assert.equal(crypto.decrypt(encrypted), "smtp-password");
  });

  it("accepts base64-encoded 32-byte master encryption keys", () => {
    const crypto = createSecretCrypto({ ENCRYPTION_KEY: validBase64EncryptionKey });
    const encrypted = crypto.encrypt("smtp-password");

    assert.equal(crypto.decrypt(encrypted), "smtp-password");
  });

  it("rejects raw printable UTF-8 master encryption keys", () => {
    assert.throws(
      () => createSecretCrypto({ ENCRYPTION_KEY: "a".repeat(32) }),
      /Encryption key must be 32 bytes encoded as 64 hex characters or canonical base64\./,
    );
  });

  it("rejects ciphertext that has been tampered with", () => {
    const crypto = createSecretCrypto({ ENCRYPTION_KEY: validHexEncryptionKey });
    const encrypted = crypto.encrypt("smtp-password");

    assert.throws(
      () =>
        crypto.decrypt({
          ...encrypted,
          ciphertext: Buffer.from("tampered", "utf8").toString("base64"),
        }),
      /Secret decryption failed\./,
    );
  });

  it("rejects decryption with a different master encryption key", () => {
    const crypto = createSecretCrypto({ ENCRYPTION_KEY: validHexEncryptionKey });
    const wrongKeyCrypto = createSecretCrypto({ ENCRYPTION_KEY: validOtherHexEncryptionKey });
    const encrypted = crypto.encrypt("smtp-password");

    assert.throws(() => wrongKeyCrypto.decrypt(encrypted), SecretDecryptionError);
  });
});
