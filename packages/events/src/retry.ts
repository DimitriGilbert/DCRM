/**
 * Retry policy for hook execution.
 */
export type RetryPolicy = {
  readonly maxRetries: number;
  readonly retryCount: number;
};

const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60_000;

/**
 * Returns true when the current attempt has not yet reached maxRetries.
 */
export function shouldRetry(policy: RetryPolicy): boolean {
  return policy.retryCount < policy.maxRetries;
}

/**
 * Returns exponential backoff delay in milliseconds.
 * Capped at MAX_RETRY_DELAY_MS.
 */
export function getRetryDelayMs(retryCount: number): number {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}
