import { describe, expect, it } from "vitest";

describe("Event sources", () => {
  it("exports all required event sources from PRD", async () => {
    const { EVENT_SOURCES } = await import("../src/event");

    expect(EVENT_SOURCES).toEqual({
      APP: "app",
      EMAIL: "email",
      WEBHOOK: "webhook",
      API: "api",
      HOOK: "hook",
      SYSTEM: "system",
    });
  });

  it("validates correct event sources via schema", async () => {
    const { EVENT_SOURCES, eventSourceSchema } = await import("../src/event");

    for (const source of Object.values(EVENT_SOURCES)) {
      expect(eventSourceSchema.safeParse(source).success).toBe(true);
    }
  });

  it("rejects invalid event source values", async () => {
    const { eventSourceSchema } = await import("../src/event");

    expect(eventSourceSchema.safeParse("cron").success).toBe(false);
  });

  it("exports EVENT_SOURCE_VALUES array", async () => {
    const { EVENT_SOURCE_VALUES } = await import("../src/event");

    expect(EVENT_SOURCE_VALUES).toEqual([
      "app",
      "email",
      "webhook",
      "api",
      "hook",
      "system",
    ]);
  });
});
