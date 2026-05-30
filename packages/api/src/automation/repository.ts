import type { HookExecutionStatus } from "@DCRM/domain";

type JsonObject = Record<string, unknown>;

export type HookExecutionStatusRecord = {
  readonly id: string;
  readonly userId: string;
  readonly hookId: string;
  readonly hookName: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly status: HookExecutionStatus;
  readonly error: JsonObject | null;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly queuedAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly nextRetryAt: Date | null;
  readonly createdAt: Date;
};

export type AutomationRepository = {
  readonly hookExecutions: {
    readonly listFailures: (input: { readonly userId: string; readonly limit?: number }) => Promise<readonly HookExecutionStatusRecord[]>;
  };
};

export function createInMemoryAutomationRepository(records: readonly HookExecutionStatusRecord[] = []): AutomationRepository {
  const hookExecutionRecords = [...records];
  return {
    hookExecutions: {
      async listFailures(input) {
        return hookExecutionRecords
          .filter((record) => record.userId === input.userId && record.status === "failed")
          .slice()
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, input.limit ?? 10);
      },
    },
  };
}
