/**
 * Retry policy for hook execution.
 */
export type RetryPolicy = {
  readonly maxRetries: number;
  readonly retryCount: number;
};

/**
 * Returns true when the current attempt has not yet reached maxRetries.
 */
export function shouldRetry(policy: RetryPolicy): boolean {
  return policy.retryCount < policy.maxRetries;
}
