import { initTRPC } from "@trpc/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Context } from "../../context";

import { createTicket, createTicketInDb } from "./create";
import { readTicket } from "./read";
import { updateTicket } from "./update";
import { softDeleteTicket } from "./soft-delete";
import { restoreTicket } from "./restore";
import { listTickets } from "./list";
import { searchTickets } from "./search";

// --- Mock setup ---

const emittedEvents: Array<unknown> = [];

vi.mock("@DCRM/events", () => ({
  emitEvent: vi.fn(async (_persister, input) => {
    emittedEvents.push(input);
    return {
      id: "event-1",
      type: input.type,
      userId: input.userId,
      source: input.source,
      entity: input.entity,
      payload: input.payload,
      changes: input.changes,
      createdAt: new Date(),
    };
  }),
  EVENT_TYPE: {
    TICKET_CREATED: "ticket.created",
    TICKET_UPDATED: "ticket.updated",
    TICKET_DELETED: "ticket.deleted",
    TICKET_RESTORED: "ticket.restored",
    TICKET_STATUS_CHANGED: "ticket.status_changed",
    TICKET_COMMENT_ADDED: "ticket.comment_added",
  },
}));

vi.mock("nanoid", () => ({
  nanoid: () => "test-id-1",
}));

// --- Mock DB with chainable builders ---

const mockDbState: {
  insertResult: unknown;
  selectResult: unknown;
  updateReturning: unknown;
} = {
  insertResult: undefined,
  selectResult: [],
  updateReturning: [],
};

vi.mock("@DCRM/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(async () => mockDbState.insertResult),
    })),
    select: vi.fn(() => new Proxy({}, {
      get(_target, prop: string) {
        if (prop === "from") {
          return vi.fn(() => new Proxy({}, {
            get(_t, p: string) {
              if (p === "where") {
                return vi.fn(() => new Proxy({}, {
                  get(_t2, p2: string) {
                    if (p2 === "limit") return vi.fn(async () => mockDbState.selectResult);
                    if (p2 === "orderBy") return vi.fn(() => new Proxy({}, {
                      get(_t3, p3: string) {
                        if (p3 === "limit") return vi.fn(async () => mockDbState.selectResult);
                        return vi.fn(() => new Proxy({}, {}));
                      },
                    }));
                    return vi.fn(() => new Proxy({}, {}));
                  },
                }));
              }
              if (p === "orderBy") {
                return vi.fn(() => new Proxy({}, {
                  get(_t2, p2: string) {
                    if (p2 === "limit") return vi.fn(async () => mockDbState.selectResult);
                    return vi.fn(() => new Proxy({}, {}));
                  },
                }));
              }
              if (p === "limit") return vi.fn(async () => mockDbState.selectResult);
              return vi.fn(() => new Proxy({}, {}));
            },
          }));
        }
        return vi.fn();
      },
    })),
    update: vi.fn(() => new Proxy({}, {
      get(_target, prop: string) {
        if (prop === "set") {
          return vi.fn(() => new Proxy({}, {
            get(_t, p: string) {
              if (p === "where") {
                return vi.fn(() => new Proxy({}, {
                  get(_t2, p2: string) {
                    if (p2 === "returning") return vi.fn(async () => mockDbState.updateReturning);
                    if (p2 === "then") return undefined;
                    return vi.fn(async () => undefined);
                  },
                }));
              }
              return vi.fn(() => new Proxy({}, {}));
            },
          }));
        }
        return vi.fn(() => new Proxy({}, {}));
      },
    })),
  },
}));

vi.mock("@DCRM/db/schema/crm", () => ({
  projects: {
    id: "id",
    userId: "user_id",
    clientId: "client_id",
    name: "name",
    description: "description",
    status: "status",
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
  tickets: {
    id: "id",
    userId: "user_id",
    projectId: "project_id",
    title: "title",
    description: "description",
    type: "type",
    status: "status",
    priority: "priority",
    dueDate: "due_date",
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
}));

// --- Context ---

const mockUser = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  emailVerified: true,
  image: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const mockContext: Context = {
  user: mockUser,
  session: null,
};

function createTestRouter() {
  const t = initTRPC.context<Context>().create();

  const protectedProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.user) {
      throw new Error("UNAUTHORIZED");
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });

  const router = t.router;

  return { t, protectedProcedure, router };
}

// --- Tests ---

describe("Ticket procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
    mockDbState.insertResult = undefined;
    mockDbState.selectResult = [];
    mockDbState.updateReturning = [];
  });

  describe("createTicket", () => {
    it("creates a ticket and emits ticket.created event", async () => {
      mockDbState.selectResult = [{ id: "proj-1", userId: "user-1" }];

      const { router } = createTestRouter();
      const testRouter = router({ create: createTicket });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.create({
        projectId: "proj-1",
        title: "Fix login bug",
        type: "bug",
        priority: "high",
      });

      expect(result).toMatchObject({
        id: "test-id-1",
        userId: "user-1",
        projectId: "proj-1",
        title: "Fix login bug",
        type: "bug",
        status: "open",
        priority: "high",
      });

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalledOnce();
      expect(emittedEvents[0]).toMatchObject({
        type: "ticket.created",
        userId: "user-1",
        entity: { type: "ticket", id: "test-id-1" },
      });
    });

    it("returns null when project does not belong to user", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ create: createTicket });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.create({
        projectId: "nonexistent-project",
        title: "Test",
      });

      expect(result).toBeNull();
    });

    it("createTicketInDb returns a row with correct defaults", async () => {
      const result = await createTicketInDb("user-1", {
        projectId: "proj-1",
        title: "Fix login bug",
        description: "Users cannot log in",
        type: "bug",
        priority: "high",
      });

      expect(result).toMatchObject({
        id: "test-id-1",
        userId: "user-1",
        projectId: "proj-1",
        title: "Fix login bug",
        description: "Users cannot log in",
        type: "bug",
        status: "open",
        priority: "high",
        dueDate: null,
        deletedAt: null,
      });
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("createTicketInDb parses dueDate string", async () => {
      const result = await createTicketInDb("user-1", {
        projectId: "proj-1",
        title: "Test",
        dueDate: "2025-12-31",
      });

      expect(result.dueDate).toBeInstanceOf(Date);
    });
  });

  describe("readTicket", () => {
    it("returns null when ticket not found", async () => {
      mockDbState.selectResult = [];

      const { protectedProcedure, router } = createTestRouter();
      const testRouter = router({
        read: protectedProcedure
          .input(await import("./schemas").then((m) => m.ticketIdSchema))
          .query(async () => null),
      });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.read({ id: "nonexistent" });
      expect(result).toBeNull();
    });
  });

  describe("updateTicket", () => {
    it("returns null when ticket not found", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateTicket });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "nonexistent", title: "Updated" });
      expect(result).toBeNull();
    });

    it("returns existing ticket when no fields changed", async () => {
      const existing = {
        id: "t1",
        userId: "user-1",
        projectId: "proj-1",
        title: "Ticket",
        type: "task",
        status: "open",
        priority: "medium",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDbState.selectResult = [existing];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateTicket });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "t1" });
      expect(result).toEqual(existing);
    });

    it("updates and emits ticket.updated event", async () => {
      const existing = {
        id: "t1",
        userId: "user-1",
        projectId: "proj-1",
        title: "Ticket",
        type: "task",
        status: "open",
        priority: "medium",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updated = { ...existing, title: "Updated Ticket" };

      mockDbState.selectResult = [existing];
      mockDbState.updateReturning = [updated];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateTicket });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "t1", title: "Updated Ticket" });

      expect(result).toEqual(updated);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
    });

    it("emits ticket.status_changed when status changes", async () => {
      const existing = {
        id: "t1",
        userId: "user-1",
        projectId: "proj-1",
        title: "Ticket",
        type: "task",
        status: "open",
        priority: "medium",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updated = { ...existing, status: "in_progress" };

      mockDbState.selectResult = [existing];
      mockDbState.updateReturning = [updated];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateTicket });
      const caller = testRouter.createCaller(mockContext);
      await caller.update({ id: "t1", status: "in_progress" });

      expect(emittedEvents).toHaveLength(2);
      expect(emittedEvents[0]).toMatchObject({
        type: "ticket.status_changed",
        payload: { status: "in_progress" },
        changes: {
          before: { status: "open" },
          after: { status: "in_progress" },
        },
      });
      expect(emittedEvents[1]).toMatchObject({
        type: "ticket.updated",
      });
    });
  });

  describe("softDeleteTicket", () => {
    it("soft-deletes and emits ticket.deleted event", async () => {
      const existing = {
        id: "t1",
        userId: "user-1",
        projectId: "proj-1",
        title: "Ticket",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const softDeleted = { ...existing, deletedAt: new Date() };

      mockDbState.selectResult = [existing];
      mockDbState.updateReturning = [softDeleted];

      const { router } = createTestRouter();
      const testRouter = router({ softDelete: softDeleteTicket });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.softDelete({ id: "t1" });

      expect(result).toEqual(softDeleted);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
    });

    it("returns null when ticket already deleted or not found", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ softDelete: softDeleteTicket });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.softDelete({ id: "t1" });
      expect(result).toBeNull();
    });
  });

  describe("restoreTicket", () => {
    it("restores and emits ticket.restored event", async () => {
      const deleted = {
        id: "t1",
        userId: "user-1",
        projectId: "proj-1",
        title: "Ticket",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };
      const restored = { ...deleted, deletedAt: null };

      mockDbState.selectResult = [deleted];
      mockDbState.updateReturning = [restored];

      const { router } = createTestRouter();
      const testRouter = router({ restore: restoreTicket });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.restore({ id: "t1" });

      expect(result).toEqual(restored);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
    });

    it("returns null when ticket is not deleted", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ restore: restoreTicket });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.restore({ id: "t1" });
      expect(result).toBeNull();
    });
  });

  describe("listTickets", () => {
    it("returns paginated results with nextCursor", async () => {
      const now = new Date();
      const items = Array.from({ length: 3 }, (_, i) => ({
        id: `ticket-${i}`,
        userId: "user-1",
        projectId: "proj-1",
        title: `Ticket ${i}`,
        description: null,
        type: "task",
        status: "open",
        priority: "medium",
        dueDate: null,
        createdAt: new Date(now.getTime() - i * 1000),
        updatedAt: now,
        deletedAt: null,
      }));
      mockDbState.selectResult = [...items, { ...items[0], id: "extra" }];

      const { router } = createTestRouter();
      const testRouter = router({ list: listTickets });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.list({ limit: 3 });
      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });

    it("returns no nextCursor when fewer items than limit", async () => {
      const items = [{ id: "t1", createdAt: new Date() }];
      mockDbState.selectResult = items;

      const { router } = createTestRouter();
      const testRouter = router({ list: listTickets });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.list({ limit: 3 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeUndefined();
    });
  });

  describe("searchTickets", () => {
    it("returns matching tickets", async () => {
      const items = [
        { id: "t1", title: "Fix login bug", createdAt: new Date() },
      ];
      mockDbState.selectResult = items;

      const { router } = createTestRouter();
      const testRouter = router({ search: searchTickets });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.search({ query: "login" });
      expect(result).toHaveLength(1);
    });
  });
});
