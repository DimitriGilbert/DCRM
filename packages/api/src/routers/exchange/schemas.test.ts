import { describe, it, expect } from "vitest";

import {
  createExchangeSchema,
  exchangeIdSchema,
  listExchangesSchema,
  timelineSchema,
} from "./schemas";

describe("Exchange schemas", () => {
  it("createExchangeSchema validates required fields", () => {
    const result = createExchangeSchema.safeParse({
      type: "comment",
      direction: "outgoing",
    });
    expect(result.success).toBe(true);
  });

  it("createExchangeSchema rejects missing type", () => {
    const result = createExchangeSchema.safeParse({
      direction: "outgoing",
    });
    expect(result.success).toBe(false);
  });

  it("createExchangeSchema rejects missing direction", () => {
    const result = createExchangeSchema.safeParse({
      type: "comment",
    });
    expect(result.success).toBe(false);
  });

  it("createExchangeSchema accepts all optional fields", () => {
    const result = createExchangeSchema.safeParse({
      type: "email",
      clientId: "client-1",
      projectId: "proj-1",
      ticketId: "ticket-1",
      subject: "Re: Bug report",
      body: "Thanks for reporting",
      direction: "outgoing",
      metadata: { messageId: "msg-1" },
      isInternal: false,
    });
    expect(result.success).toBe(true);
  });

  it("createExchangeSchema rejects invalid type", () => {
    const result = createExchangeSchema.safeParse({
      type: "invalid",
      direction: "outgoing",
    });
    expect(result.success).toBe(false);
  });

  it("createExchangeSchema rejects invalid direction", () => {
    const result = createExchangeSchema.safeParse({
      type: "comment",
      direction: "sideways",
    });
    expect(result.success).toBe(false);
  });

  it("exchangeIdSchema validates id", () => {
    const result = exchangeIdSchema.safeParse({ id: "ex-1" });
    expect(result.success).toBe(true);
  });

  it("listExchangesSchema applies defaults", () => {
    const result = listExchangesSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it("listExchangesSchema accepts filters", () => {
    const result = listExchangesSchema.safeParse({
      clientId: "client-1",
      projectId: "proj-1",
      ticketId: "ticket-1",
      type: "comment",
    });
    expect(result.success).toBe(true);
  });

  it("timelineSchema validates with at least one filter", () => {
    const result = timelineSchema.safeParse({ clientId: "client-1" });
    expect(result.success).toBe(true);
  });

  it("timelineSchema applies defaults", () => {
    const result = timelineSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });
});
