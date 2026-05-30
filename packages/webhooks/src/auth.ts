import { createHmac } from "node:crypto";

import type { CryptoService, EncryptedValue } from "@DCRM/crypto";
import {
  OUTGOING_WEBHOOK_AUTH_MODES,
} from "@DCRM/domain";

// --- Auth config shapes ---

export type BearerAuthConfig = {
  readonly mode: typeof OUTGOING_WEBHOOK_AUTH_MODES.BEARER;
  /** Encrypted bearer token. */
  readonly encryptedToken: EncryptedValue;
};

export type BasicAuthConfig = {
  readonly mode: typeof OUTGOING_WEBHOOK_AUTH_MODES.BASIC;
  /** Encrypted username. */
  readonly encryptedUsername: EncryptedValue;
  /** Encrypted password. */
  readonly encryptedPassword: EncryptedValue;
};

export type HmacAuthConfig = {
  readonly mode: typeof OUTGOING_WEBHOOK_AUTH_MODES.HMAC;
  /** Encrypted HMAC secret. */
  readonly encryptedSecret: EncryptedValue;
  /** Header name for the signature, e.g. "X-Signature-256". */
  readonly headerName: string;
  /** Hash algorithm. Defaults to "sha256". */
  readonly algorithm?: "sha256" | "sha512";
};

export type CustomHeadersAuthConfig = {
  readonly mode: typeof OUTGOING_WEBHOOK_AUTH_MODES.CUSTOM_HEADERS;
  /** Array of { name, encryptedValue } pairs. */
  readonly headers: ReadonlyArray<{
    readonly name: string;
    readonly encryptedValue: EncryptedValue;
  }>;
};

export type OutgoingWebhookAuthConfig =
  | BearerAuthConfig
  | BasicAuthConfig
  | HmacAuthConfig
  | CustomHeadersAuthConfig;

export type NoneAuthConfig = {
  readonly mode: "none";
};

// --- Config stored in hook.config JSONB ---

export type OutgoingWebhookHookConfig = {
  readonly url: string;
  readonly auth: OutgoingWebhookAuthConfig | NoneAuthConfig;
  /** Additional custom headers sent with every request (not secret-bearing). */
  readonly headers?: Record<string, string>;
  /** HTTP method. Defaults to POST. */
  readonly method?: "POST" | "PUT" | "PATCH";
  /** Request timeout in ms. Defaults to 10000. */
  readonly timeoutMs?: number;
  /** Max retries for transient failures. Defaults to 3. */
  readonly maxRetries?: number;
};

// --- Resolved (decrypted) headers ready for a fetch call ---

export type ResolvedAuthHeaders = {
  readonly headers: Record<string, string>;
};

/**
 * Decrypts the auth config and produces HTTP headers for the outgoing request.
 * Secrets are never logged or returned outside this function.
 */
export function resolveAuthHeaders(
  auth: OutgoingWebhookAuthConfig | NoneAuthConfig,
  crypto: CryptoService,
  body: string,
): ResolvedAuthHeaders {
  switch (auth.mode) {
    case "none":
      return { headers: {} };

    case OUTGOING_WEBHOOK_AUTH_MODES.BEARER: {
      const token = crypto.decrypt(auth.encryptedToken);
      return { headers: { Authorization: `Bearer ${token}` } };
    }

    case OUTGOING_WEBHOOK_AUTH_MODES.BASIC: {
      const username = crypto.decrypt(auth.encryptedUsername);
      const password = crypto.decrypt(auth.encryptedPassword);
      const encoded = Buffer.from(`${username}:${password}`).toString("base64");
      return { headers: { Authorization: `Basic ${encoded}` } };
    }

    case OUTGOING_WEBHOOK_AUTH_MODES.HMAC: {
      const secret = crypto.decrypt(auth.encryptedSecret);
      const algo = auth.algorithm ?? "sha256";
      const hmac = createHmac(algo, secret);
      hmac.update(body);
      const signature = hmac.digest("hex");
      const headerName = auth.headerName;
      return { headers: { [headerName]: signature } };
    }

    case OUTGOING_WEBHOOK_AUTH_MODES.CUSTOM_HEADERS: {
      const result: Record<string, string> = {};
      for (const h of auth.headers) {
        result[h.name] = crypto.decrypt(h.encryptedValue);
      }
      return { headers: result };
    }

    default: {
      const _: never = auth;
      void _;
      return { headers: {} };
    }
  }
}

/**
 * Encrypts a bearer token for storage.
 */
export function encryptBearerToken(
  token: string,
  crypto: CryptoService,
): BearerAuthConfig {
  return {
    mode: OUTGOING_WEBHOOK_AUTH_MODES.BEARER,
    encryptedToken: crypto.encrypt(token),
  };
}

/**
 * Encrypts basic auth credentials for storage.
 */
export function encryptBasicAuth(
  username: string,
  password: string,
  crypto: CryptoService,
): BasicAuthConfig {
  return {
    mode: OUTGOING_WEBHOOK_AUTH_MODES.BASIC,
    encryptedUsername: crypto.encrypt(username),
    encryptedPassword: crypto.encrypt(password),
  };
}

/**
 * Encrypts HMAC secret for storage.
 */
export function encryptHmacAuth(
  secret: string,
  headerName: string,
  algorithm: "sha256" | "sha512" = "sha256",
  crypto: CryptoService,
): HmacAuthConfig {
  return {
    mode: OUTGOING_WEBHOOK_AUTH_MODES.HMAC,
    encryptedSecret: crypto.encrypt(secret),
    headerName,
    algorithm,
  };
}

/**
 * Encrypts custom header values for storage.
 */
export function encryptCustomHeaders(
  headers: ReadonlyArray<{ name: string; value: string }>,
  crypto: CryptoService,
): CustomHeadersAuthConfig {
  return {
    mode: OUTGOING_WEBHOOK_AUTH_MODES.CUSTOM_HEADERS,
    headers: headers.map((h) => ({
      name: h.name,
      encryptedValue: crypto.encrypt(h.value),
    })),
  };
}
