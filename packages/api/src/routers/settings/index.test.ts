import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";

import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { Context } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";

describe("settings tRPC API", () => {
  it("persists the current user's locale in personal settings", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const userOne = appRouter.createCaller(createTestContext("user_1", crmRepository));
    const userTwo = appRouter.createCaller(createTestContext("user_2", crmRepository));

    assert.equal((await userOne.settings.get()).locale, "en");

    await userOne.settings.updateLocale({ locale: "en" });

    assert.equal((await userOne.settings.get()).locale, "en");
    assert.equal((await userTwo.settings.get()).locale, "en");
  });
});

function createTestContext(userId: string, crmRepository: CrmRepository): Context {
  return {
    auth: { kind: "session", user: { id: userId, email: `${userId}@example.com`, name: userId, image: null } },
    crmRepository,
    eventService: createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => `event_${userId}` }),
    session: null,
  };
}
