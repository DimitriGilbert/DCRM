import { describe, it, expect } from "vitest";

import {
  createTicketSchema,
  updateTicketSchema,
  ticketIdSchema,
  listTicketsSchema,
  searchTicketsSchema,
} from "./schemas";

describe("Ticket schemas", () => {
  it("createTicketSchema validates required fields", () => {
    const result = createTicketSchema.safeParse({
      projectId: "proj-1",
      title: "Fix login bug",
    });
    expect(result.success).toBe(true);
  });

  it("createTicketSchema rejects missing projectId", () => {
    const result = createTicketSchema.safeParse({ title: "Fix login bug" });
    expect(result.success).toBe(false);
  });

  it("createTicketSchema rejects missing title", () => {
    const result = createTicketSchema.safeParse({ projectId: "proj-1" });
    expect(result.success).toBe(false);
  });

  it("createTicketSchema accepts all optional fields", () => {
    const result = createTicketSchema.safeParse({
      projectId: "proj-1",
      title: "Fix login bug",
      description: "Users cannot log in",
      type: "bug",
      status: "open",
      priority: "high",
      dueDate: "2025-12-31",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("bug");
      expect(result.data.priority).toBe("high");
    }
  });

  it("createTicketSchema rejects invalid type", () => {
    const result = createTicketSchema.safeParse({
      projectId: "proj-1",
      title: "Test",
      type: "invalid_type",
    });
    expect(result.success).toBe(false);
  });

  it("createTicketSchema rejects invalid status", () => {
    const result = createTicketSchema.safeParse({
      projectId: "proj-1",
      title: "Test",
      status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });

  it("createTicketSchema rejects invalid priority", () => {
    const result = createTicketSchema.safeParse({
      projectId: "proj-1",
      title: "Test",
      priority: "critical",
    });
    expect(result.success).toBe(false);
  });

  it("updateTicketSchema requires id", () => {
    const result = updateTicketSchema.safeParse({ id: "ticket-1", title: "Updated" });
    expect(result.success).toBe(true);
  });

  it("updateTicketSchema rejects missing id", () => {
    const result = updateTicketSchema.safeParse({ title: "Updated" });
    expect(result.success).toBe(false);
  });

  it("ticketIdSchema validates id", () => {
    const result = ticketIdSchema.safeParse({ id: "ticket-1" });
    expect(result.success).toBe(true);
  });

  it("listTicketsSchema applies defaults", () => {
    const result = listTicketsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.includeDeleted).toBe(false);
    }
  });

  it("listTicketsSchema accepts filters", () => {
    const result = listTicketsSchema.safeParse({
      projectId: "proj-1",
      status: "open",
      type: "bug",
      priority: "high",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.projectId).toBe("proj-1");
      expect(result.data.status).toBe("open");
    }
  });

  it("searchTicketsSchema validates query", () => {
    const result = searchTicketsSchema.safeParse({ query: "login" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it("searchTicketsSchema rejects empty query", () => {
    const result = searchTicketsSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });
});
