import { describe, expect, it } from "vitest";

describe("Ticket types", () => {
  it("exports all required ticket types from PRD", async () => {
    const { TICKET_TYPES } = await import("../src/ticket");

    expect(TICKET_TYPES).toEqual({
      TASK: "task",
      BUG: "bug",
      FEATURE: "feature",
      QUESTION: "question",
    });
  });

  it("validates correct ticket types via schema", async () => {
    const { TICKET_TYPES, ticketTypeSchema } = await import("../src/ticket");

    for (const type of Object.values(TICKET_TYPES)) {
      expect(ticketTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects invalid ticket type values", async () => {
    const { ticketTypeSchema } = await import("../src/ticket");

    expect(ticketTypeSchema.safeParse("epic").success).toBe(false);
  });
});

describe("Ticket statuses", () => {
  it("exports all required ticket statuses from PRD", async () => {
    const { TICKET_STATUSES } = await import("../src/ticket");

    expect(TICKET_STATUSES).toEqual({
      OPEN: "open",
      IN_PROGRESS: "in_progress",
      RESOLVED: "resolved",
      CLOSED: "closed",
    });
  });

  it("validates correct ticket statuses via schema", async () => {
    const { TICKET_STATUSES, ticketStatusSchema } = await import("../src/ticket");

    for (const status of Object.values(TICKET_STATUSES)) {
      expect(ticketStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects invalid ticket status values", async () => {
    const { ticketStatusSchema } = await import("../src/ticket");

    expect(ticketStatusSchema.safeParse("reopened").success).toBe(false);
  });
});

describe("Ticket priorities", () => {
  it("exports all required ticket priorities from PRD", async () => {
    const { TICKET_PRIORITIES } = await import("../src/ticket");

    expect(TICKET_PRIORITIES).toEqual({
      LOW: "low",
      MEDIUM: "medium",
      HIGH: "high",
      URGENT: "urgent",
    });
  });

  it("validates correct ticket priorities via schema", async () => {
    const { TICKET_PRIORITIES, ticketPrioritySchema } = await import("../src/ticket");

    for (const priority of Object.values(TICKET_PRIORITIES)) {
      expect(ticketPrioritySchema.safeParse(priority).success).toBe(true);
    }
  });

  it("rejects invalid ticket priority values", async () => {
    const { ticketPrioritySchema } = await import("../src/ticket");

    expect(ticketPrioritySchema.safeParse("critical").success).toBe(false);
  });
});
