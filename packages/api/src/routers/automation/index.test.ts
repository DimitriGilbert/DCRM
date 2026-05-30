import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";

import { createInMemoryAutomationRepository } from "../../automation/repository.js";
import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { AutomationRepository } from "../../automation/repository.js";
import type { Context } from "../../context.js";

describe("automation tRPC API", () => {
  it("surfaces current-user failed hook executions without creating notifications", async () => {
    const createdAt = new Date("2026-05-30T03:00:00.000Z");
    const automationRepository = createInMemoryAutomationRepository([
      {
        id: "execution_1",
        userId: "user_1",
        hookId: "hook_1",
        hookName: "Summarize intake",
        eventId: "event_1",
        eventType: "client.created",
        status: "failed",
        error: { message: "Provider timeout" },
        attempt: 2,
        maxAttempts: 3,
        queuedAt: createdAt,
        startedAt: createdAt,
        finishedAt: createdAt,
        nextRetryAt: null,
        createdAt,
      },
      {
        id: "execution_2",
        userId: "user_2",
        hookId: "hook_2",
        hookName: "Other user hook",
        eventId: "event_2",
        eventType: "lead.created",
        status: "failed",
        error: { message: "Should not leak" },
        attempt: 1,
        maxAttempts: 1,
        queuedAt: createdAt,
        startedAt: createdAt,
        finishedAt: createdAt,
        nextRetryAt: null,
        createdAt,
      },
    ]);
    const caller = appRouter.createCaller(createTestContext("user_1", automationRepository));

    const failures = await caller.automation.listFailedHookExecutions({ limit: 10 });
    const notifications = await caller.notifications.list({ limit: 10 });

    assert.deepEqual(failures.map((failure) => failure.id), ["execution_1"]);
    assert.deepEqual(notifications, []);
  });
});

function createTestContext(userId: string, automationRepository: AutomationRepository): Context {
  return {
    auth: { kind: "session", user: { id: userId, email: `${userId}@example.com`, name: userId, image: null } },
    automationRepository,
    crmRepository: createInMemoryCrmRepository(),
    eventService: createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" }),
    session: null,
  };
}
