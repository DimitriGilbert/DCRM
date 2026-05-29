import { describe, expect, it } from "vitest";

describe("Exchange types", () => {
  it("exports all required exchange types from PRD", async () => {
    const { EXCHANGE_TYPES } = await import("../src/exchange");

    expect(EXCHANGE_TYPES).toEqual({
      EMAIL: "email",
      NOTE: "note",
      CALL: "call",
      MEETING: "meeting",
      COMMENT: "comment",
    });
  });

  it("validates correct exchange types via schema", async () => {
    const { EXCHANGE_TYPES, exchangeTypeSchema } = await import("../src/exchange");

    for (const type of Object.values(EXCHANGE_TYPES)) {
      expect(exchangeTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects invalid exchange type values", async () => {
    const { exchangeTypeSchema } = await import("../src/exchange");

    expect(exchangeTypeSchema.safeParse("sms").success).toBe(false);
  });

  it("exports EXCHANGE_TYPE_VALUES array", async () => {
    const { EXCHANGE_TYPE_VALUES } = await import("../src/exchange");

    expect(EXCHANGE_TYPE_VALUES).toEqual([
      "email",
      "note",
      "call",
      "meeting",
      "comment",
    ]);
  });
});
