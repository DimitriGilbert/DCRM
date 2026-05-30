import { createCrypto } from "@DCRM/crypto";
import { env } from "@DCRM/env/server";

import {
  encryptBearerToken,
  encryptBasicAuth,
  encryptHmacAuth,
  encryptCustomHeaders,
  type OutgoingWebhookAuthConfig,
  type NoneAuthConfig,
} from "@DCRM/webhooks";

type RawAuthInput =
  | { mode: "none" }
  | { mode: "bearer"; token: string }
  | { mode: "basic"; username: string; password: string }
  | { mode: "hmac"; secret: string; headerName: string; algorithm?: "sha256" | "sha512" }
  | { mode: "custom_headers"; headers: Array<{ name: string; value: string }> };

/**
 * Builds the encrypted auth config from raw plaintext values.
 * Requires ENCRYPTION_KEY env var.
 */
export function buildEncryptedAuth(raw: RawAuthInput): OutgoingWebhookAuthConfig | NoneAuthConfig {
  const crypto = createCrypto(env.ENCRYPTION_KEY);

  switch (raw.mode) {
    case "none":
      return { mode: "none" };

    case "bearer":
      return encryptBearerToken(raw.token, crypto);

    case "basic":
      return encryptBasicAuth(raw.username, raw.password, crypto);

    case "hmac":
      return encryptHmacAuth(raw.secret, raw.headerName, raw.algorithm ?? "sha256", crypto);

    case "custom_headers":
      return encryptCustomHeaders(raw.headers, crypto);

    default: {
      const _: never = raw;
      void _;
      return { mode: "none" };
    }
  }
}
