import { Queue } from "bullmq";

/**
 * Data payload enqueued for each hook execution attempt.
 */
export type HookJobData = {
  readonly hookId: string;
  readonly hookType: string;
  readonly hookName: string;
  readonly eventId: string;
  readonly userId: string;
  readonly executionId: string;
  readonly config: Record<string, unknown>;
  readonly retryCount: number;
  readonly maxRetries: number;
};

/**
 * Abstraction over the queue backend.
 * Production uses BullMQ; tests swap in a no-op or in-memory spy.
 */
export type QueueAdapter = {
  readonly addJob: (data: HookJobData) => Promise<void>;
};

/**
 * Creates a BullMQ-backed queue adapter.
 * Wraps connection details so callers only deal with the QueueAdapter interface.
 */
export function createBullMQQueueAdapter(
  queueName: string,
  connection: { host: string; port: number; password?: string },
): QueueAdapter {
  const queue = new Queue(queueName, { connection });

  return {
    async addJob(data: HookJobData) {
      await queue.add("hook-execution", data, {
        attempts: data.maxRetries + 1,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      });
    },
  };
}

/**
 * No-op queue adapter for testing. Records nothing, does nothing.
 */
export function createNoopQueueAdapter(): QueueAdapter {
  return {
    async addJob() {
      /* intentionally empty */
    },
  };
}
