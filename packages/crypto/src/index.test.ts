import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SecretDecryptionError, createSecretCrypto } from "./index.js";

describe("secret crypto", () => {
  it("round-trips a secret through explicit encryption and decryption calls", () => {
    const crypto = createSecretCrypto({ ENCRYPTION_KEY: "a".repeat(32) });
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

  it("rejects ciphertext that has been tampered with", () => {
    const crypto = createSecretCrypto({ ENCRYPTION_KEY: "a".repeat(32) });
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
    const crypto = createSecretCrypto({ ENCRYPTION_KEY: "a".repeat(32) });
    const wrongKeyCrypto = createSecretCrypto({ ENCRYPTION_KEY: "b".repeat(32) });
    const encrypted = crypto.encrypt("smtp-password");

    assert.throws(() => wrongKeyCrypto.decrypt(encrypted), SecretDecryptionError);
  });
});
