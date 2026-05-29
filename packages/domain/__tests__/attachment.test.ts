import { describe, expect, it } from "vitest";

describe("Attachment entity types", () => {
  it("exports all entity types that can receive attachments", async () => {
    const { ATTACHMENT_ENTITY_TYPES } = await import("../src/attachment");

    expect(ATTACHMENT_ENTITY_TYPES).toEqual({
      CLIENT: "client",
      LEAD: "lead",
      PROJECT: "project",
      TICKET: "ticket",
      EXCHANGE: "exchange",
    });
  });

  it("validates correct attachment entity types via schema", async () => {
    const { ATTACHMENT_ENTITY_TYPES, attachmentEntityTypeSchema } = await import("../src/attachment");

    for (const type of Object.values(ATTACHMENT_ENTITY_TYPES)) {
      expect(attachmentEntityTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects invalid attachment entity type values", async () => {
    const { attachmentEntityTypeSchema } = await import("../src/attachment");

    expect(attachmentEntityTypeSchema.safeParse("user").success).toBe(false);
  });
});
