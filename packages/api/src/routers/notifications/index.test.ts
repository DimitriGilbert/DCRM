import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import type { EventService } from "@DCRM/events";

import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { Context } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";

describe("notifications tRPC API", () => {
  it("lists and marks only current-user in-app notifications", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const userOne = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const userTwo = appRouter.createCaller(createTestContext("user_2", crmRepository, eventService));

    const notification = await userOne.notifications.create({ title: "Import completed", body: "2 clients imported" });
    await userTwo.notifications.create({ title: "Other user" });

    assert.deepEqual(
      (await userOne.notifications.list({ unreadOnly: true })).map((item) => item.title),
      ["Import completed"],
    );

    await userOne.notifications.markRead({ id: notification.id });

    assert.deepEqual(await userOne.notifications.list({ unreadOnly: true }), []);
  });
});

function createTestContext(userId: string, crmRepository: CrmRepository, eventService: EventService): Context {
  return {
    auth: { kind: "session", user: { id: userId, email: `${userId}@example.com`, name: userId, image: null } },
    crmRepository,
    eventService,
    session: null,
  };
}

function createTestEventService(): EventService {
  return createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" });
}
