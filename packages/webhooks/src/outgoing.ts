import type { CryptoService } from "@DCRM/crypto";
import type { DcrmEvent, HookRecord } from "@DCRM/events";
import { OUTGOING_WEBHOOK_AUTH_MODE_VALUES } from "@DCRM/domain";

import {
  type OutgoingWebhookHookConfig,
  resolveAuthHeaders,
} from "./auth";

// --- Execution result ---

export type WebhookExecutionResult = {
  readonly success: boolean;
  readonly statusCode: number | null;
  readonly responseBody?: string;
  readonly error?: string;
  readonly attempt: number;
  readonly durationMs: number;
};

// --- HTTP client abstraction (testable) ---

export type HttpClientResponse = {
  readonly status: number;
  readonly body: string;
};

export type HttpClient = {
  readonly fetch: (
    url: string,
    init: RequestInit,
  ) => Promise<HttpClientResponse>;
};

/**
 * Default Node.js fetch-based HTTP client.
 */
export function createNodeHttpClient(): HttpClient {
  return {
    async fetch(url: string, init: RequestInit): Promise<HttpClientResponse> {
      const response = await globalThis.fetch(url, init);
      const body = await response.text();
      return { status: response.status, body };
    },
  };
}

// --- Transient failure detection ---

/**
 * Returns true for status codes and errors that are worth retrying.
 * 5xx server errors, network timeouts, and connection resets are transient.
 * 4xx client errors are NOT transient (except 429 rate-limiting).
 */
export function isTransientFailure(statusCode: number | null, _error: unknown): boolean {
  // Network-level errors (no status code) are transient
  if (statusCode === null) return true;
  // 429 Too Many Requests — transient
  if (statusCode === 429) return true;
  // 5xx server errors — transient
  if (statusCode >= 500 && statusCode < 600) return true;
  return false;
}

// --- Config parsing ---

function parseConfig(raw: Record<string, unknown>): OutgoingWebhookHookConfig {
  const url = raw["url"];
  if (typeof url !== "string" || url.length === 0) {
    throw new Error(`Invalid webhook config: missing or empty "url"`);
  }

  const auth = raw["auth"] ?? { mode: "none" };
  if (typeof auth !== "object" || auth === null) {
    throw new Error(`Invalid webhook config: "auth" must be an object`);
  }

  const authMode = (auth as Record<string, unknown>)["mode"];
  if (
    typeof authMode === "string" &&
    authMode !== "none" &&
    !OUTGOING_WEBHOOK_AUTH_MODE_VALUES.includes(
      authMode as (typeof OUTGOING_WEBHOOK_AUTH_MODE_VALUES)[number],
    )
  ) {
    throw new Error(
      `Invalid webhook config: unrecognized auth mode "${authMode}"`,
    );
  }

  const method = raw["method"] as OutgoingWebhookHookConfig["method"];
  const headers = raw["headers"] as OutgoingWebhookHookConfig["headers"];
  const timeoutMs = raw["timeoutMs"] as OutgoingWebhookHookConfig["timeoutMs"];
  const maxRetries = raw["maxRetries"] as OutgoingWebhookHookConfig["maxRetries"];

  const validatedMaxRetries =
    typeof maxRetries === "number" && maxRetries >= 0 ? maxRetries : 3;

  return {
    url,
    auth: auth as OutgoingWebhookHookConfig["auth"],
    method: method ?? "POST",
    headers: headers ?? {},
    timeoutMs: timeoutMs ?? 10_000,
    maxRetries: validatedMaxRetries,
  };
}

// --- Executor ---

export type OutgoingWebhookExecutorDeps = {
  readonly crypto: CryptoService;
  readonly httpClient: HttpClient;
};

/**
 * Executes an outgoing webhook for the given hook and event.
 *
 * Handles auth resolution, HTTP dispatch, transient-failure detection,
 * and retry with exponential backoff.
 *
 * Returns the final result after all retries are exhausted or success.
 * This function does NOT throw — it always returns a result object
 * so the caller can log appropriately.
 */
export async function executeOutgoingWebhook(
  hook: HookRecord,
  event: DcrmEvent,
  deps: OutgoingWebhookExecutorDeps,
): Promise<WebhookExecutionResult> {
  const config = parseConfig(hook.config);
  const maxAttempts = (config.maxRetries ?? 3) + 1;
  const payload = buildPayload(event);

  let lastResult: WebhookExecutionResult | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await sendRequest(config, payload, deps, attempt);
    lastResult = result;

    if (result.success) {
      return result;
    }

    // If this is not a transient failure, don't retry
    if (!isTransientFailure(result.statusCode, result.error)) {
      return result;
    }

    // If we have more attempts, wait before retrying
    if (attempt < maxAttempts) {
      const delay = getRetryDelay(attempt);
      await sleep(delay);
    }
  }

  // All retries exhausted — return last failure
  return lastResult!;
}

// --- Request builder ---

function buildPayload(event: DcrmEvent): string {
  return JSON.stringify({
    id: event.id,
    type: event.type,
    source: event.source,
    entity: event.entity ?? null,
    payload: event.payload,
    changes: event.changes ?? null,
    createdAt: event.createdAt.toISOString(),
  });
}

async function sendRequest(
  config: OutgoingWebhookHookConfig,
  body: string,
  deps: OutgoingWebhookExecutorDeps,
  attempt: number,
): Promise<WebhookExecutionResult> {
  const start = performance.now();

  const allHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers ?? {}),
  };

  try {
    const resolvedAuth = resolveAuthHeaders(config.auth, deps.crypto, body);

    Object.assign(allHeaders, resolvedAuth.headers);

    const response = await deps.httpClient.fetch(config.url, {
      method: config.method ?? "POST",
      headers: allHeaders,
      body,
      signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
    });

    const durationMs = Math.round(performance.now() - start);
    const success = response.status >= 200 && response.status < 300;

    return {
      success,
      statusCode: response.status,
      responseBody: response.body,
      attempt,
      durationMs,
      error: success ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const errorMessage = err instanceof Error ? err.message : String(err);

    return {
      success: false,
      statusCode: null,
      error: errorMessage,
      attempt,
      durationMs,
    };
  }
}

// --- Retry helpers ---

const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60_000;

function getRetryDelay(attempt: number): number {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
