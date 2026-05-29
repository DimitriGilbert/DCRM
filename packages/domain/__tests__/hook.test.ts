import { describe, expect, it } from "vitest";

describe("Hook types", () => {
  it("exports all required hook types from PRD", async () => {
    const { HOOK_TYPES } = await import("../src/hook");

    expect(HOOK_TYPES).toEqual({
      AI: "ai",
      OUTGOING_WEBHOOK: "outgoing_webhook",
      BUILT_IN: "built_in",
    });
  });

  it("validates correct hook types via schema", async () => {
    const { HOOK_TYPES, hookTypeSchema } = await import("../src/hook");

    for (const type of Object.values(HOOK_TYPES)) {
      expect(hookTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects invalid hook type values", async () => {
    const { hookTypeSchema } = await import("../src/hook");

    expect(hookTypeSchema.safeParse("custom").success).toBe(false);
  });
});

describe("Hook write behaviors", () => {
  it("exports all required write behaviors from PRD", async () => {
    const { HOOK_WRITE_BEHAVIORS } = await import("../src/hook");

    expect(HOOK_WRITE_BEHAVIORS).toEqual({
      PROPOSE_FIRST: "propose_first",
      DIRECT_WRITE: "direct_write",
    });
  });

  it("validates correct write behaviors via schema", async () => {
    const { HOOK_WRITE_BEHAVIORS, hookWriteBehaviorSchema } = await import("../src/hook");

    for (const behavior of Object.values(HOOK_WRITE_BEHAVIORS)) {
      expect(hookWriteBehaviorSchema.safeParse(behavior).success).toBe(true);
    }
  });

  it("rejects invalid write behavior values", async () => {
    const { hookWriteBehaviorSchema } = await import("../src/hook");

    expect(hookWriteBehaviorSchema.safeParse("auto").success).toBe(false);
  });
});

describe("Hook execution statuses", () => {
  it("exports all required execution statuses from PRD", async () => {
    const { HOOK_EXECUTION_STATUSES } = await import("../src/hook");

    expect(HOOK_EXECUTION_STATUSES).toEqual({
      PENDING: "pending",
      RUNNING: "running",
      SUCCESS: "success",
      FAILED: "failed",
    });
  });

  it("validates correct execution statuses via schema", async () => {
    const { HOOK_EXECUTION_STATUSES, hookExecutionStatusSchema } = await import("../src/hook");

    for (const status of Object.values(HOOK_EXECUTION_STATUSES)) {
      expect(hookExecutionStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects invalid execution status values", async () => {
    const { hookExecutionStatusSchema } = await import("../src/hook");

    expect(hookExecutionStatusSchema.safeParse("cancelled").success).toBe(false);
  });
});
