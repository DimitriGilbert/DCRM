import { describe, expect, it } from "vitest";

describe("Lead stages", () => {
  it("exports all required stages from PRD", async () => {
    const { LEAD_STAGES } = await import("../src/lead");

    expect(LEAD_STAGES).toEqual({
      NEW: "new",
      CONTACTED: "contacted",
      QUALIFIED: "qualified",
      PROPOSAL: "proposal",
      NEGOTIATION: "negotiation",
      WON: "won",
      LOST: "lost",
    });
  });

  it("derives LeadStage type from constant keys", async () => {
    const { LEAD_STAGES, leadStageSchema } = await import("../src/lead");

    const validStages = Object.values(LEAD_STAGES);
    for (const stage of validStages) {
      expect(leadStageSchema.safeParse(stage).success).toBe(true);
    }
  });

  it("rejects invalid lead stage values", async () => {
    const { leadStageSchema } = await import("../src/lead");

    expect(leadStageSchema.safeParse("converted").success).toBe(false);
    expect(leadStageSchema.safeParse("").success).toBe(false);
    expect(leadStageSchema.safeParse(123).success).toBe(false);
  });

  it("exports a LEAD_STAGE_VALUES array with all stage strings", async () => {
    const { LEAD_STAGE_VALUES } = await import("../src/lead");

    expect(LEAD_STAGE_VALUES).toEqual([
      "new",
      "contacted",
      "qualified",
      "proposal",
      "negotiation",
      "won",
      "lost",
    ]);
  });
});
