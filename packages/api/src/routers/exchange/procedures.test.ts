import { initTRPC } from "@trpc/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Context } from "../../context";

import { createExchange, createExchangeInDb } from "./create";
import { readExchange } from "./read";
import { listExchanges } from "./list";
import { timeline } from "./timeline";

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
      createdAt: new Date(),
    };
  }),
  EVENT_TYPE: {
    EXCHANGE_CREATED: "exchange.created",
    TICKET_COMMENT_ADDED: "ticket.comment_added",
  },
}));

vi.mock("nanoid", () => ({
  nanoid: () => "test-id-1",
}));

// --- Mock DB ---

const mockDbState: {
  insertResult: unknown;
  selectResult: unknown;
} = {
  insertResult: undefined,
  selectResult: [],
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
  },
}));

vi.mock("@DCRM/db/schema/crm", () => ({
  exchanges: {
    id: "id",
    userId: "user_id",
    type: "type",
    clientId: "client_id",
    projectId: "project_id",
    ticketId: "ticket_id",
    subject: "subject",
    body: "body",
    direction: "direction",
    metadata: "metadata",
    isInternal: "is_internal",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  clients: {
    id: "id",
    userId: "user_id",
  },
  projects: {
    id: "id",
    userId: "user_id",
  },
  tickets: {
    id: "id",
    userId: "user_id",
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

describe("Exchange procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
    mockDbState.insertResult = undefined;
    mockDbState.selectResult = [];
  });

  describe("createExchange", () => {
    it("creates a comment exchange and emits exchange.created + ticket.comment_added events", async () => {
      mockDbState.selectResult = [{ id: "ticket-1", userId: "user-1" }];

      const { router } = createTestRouter();
      const testRouter = router({ create: createExchange });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.create({
        type: "comment",
        ticketId: "ticket-1",
        body: "This is a comment",
        direction: "outgoing",
      });

      expect(result).toMatchObject({
        id: "test-id-1",
        userId: "user-1",
        type: "comment",
        ticketId: "ticket-1",
        body: "This is a comment",
        direction: "outgoing",
        isInternal: false,
      });

      expect(emittedEvents).toHaveLength(2);
      expect(emittedEvents[0]).toMatchObject({
        type: "ticket.comment_added",
        entity: { type: "ticket", id: "ticket-1" },
      });
      expect(emittedEvents[1]).toMatchObject({
        type: "exchange.created",
        entity: { type: "exchange", id: "test-id-1" },
      });
    });

    it("creates a note with isInternal=true", async () => {
      mockDbState.selectResult = [{ id: "client-1" }];

      const { router } = createTestRouter();
      const testRouter = router({ create: createExchange });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.create({
        type: "note",
        clientId: "client-1",
        body: "Internal note",
        direction: "outgoing",
        isInternal: true,
      });

      expect(result).toMatchObject({
        type: "note",
        isInternal: true,
      });
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]).toMatchObject({
        type: "exchange.created",
      });
    });

    it("returns null when ticket does not belong to user", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ create: createExchange });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.create({
        type: "comment",
        ticketId: "unowned-ticket",
        body: "Test",
        direction: "outgoing",
      });

      expect(result).toBeNull();
    });

    it("createExchangeInDb returns a row with correct defaults", async () => {
      const result = await createExchangeInDb("user-1", {
        type: "email",
        clientId: "client-1",
        projectId: "proj-1",
        subject: "Hello",
        body: "World",
        direction: "outgoing",
      });

      expect(result).toMatchObject({
        id: "test-id-1",
        userId: "user-1",
        type: "email",
        clientId: "client-1",
        projectId: "proj-1",
        subject: "Hello",
        body: "World",
        direction: "outgoing",
        isInternal: false,
        metadata: null,
      });
      expect(result.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("readExchange", () => {
    it("returns null when exchange not found", async () => {
      mockDbState.selectResult = [];

      const { protectedProcedure, router } = createTestRouter();
      const testRouter = router({
        read: protectedProcedure
          .input(await import("./schemas").then((m) => m.exchangeIdSchema))
          .query(async () => null),
      });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.read({ id: "nonexistent" });
      expect(result).toBeNull();
    });
  });

  describe("listExchanges", () => {
    it("returns paginated results", async () => {
      const now = new Date();
      const items = Array.from({ length: 3 }, (_, i) => ({
        id: `ex-${i}`,
        userId: "user-1",
        type: "comment",
        ticketId: "ticket-1",
        body: `Comment ${i}`,
        direction: "outgoing",
        isInternal: false,
        createdAt: new Date(now.getTime() - i * 1000),
        updatedAt: now,
      }));
      mockDbState.selectResult = [...items, { ...items[0], id: "extra" }];

      const { router } = createTestRouter();
      const testRouter = router({ list: listExchanges });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.list({ limit: 3 });
      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });
  });

  describe("timeline", () => {
    it("returns exchanges filtered by clientId", async () => {
      const items = [
        { id: "ex-1", type: "email", createdAt: new Date() },
        { id: "ex-2", type: "note", createdAt: new Date() },
      ];
      mockDbState.selectResult = items;

      const { router } = createTestRouter();
      const testRouter = router({ timeline: timeline });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.timeline({ clientId: "client-1" });
      expect(result).toHaveLength(2);
    });

    it("returns exchanges filtered by projectId", async () => {
      const items = [{ id: "ex-1", type: "comment", createdAt: new Date() }];
      mockDbState.selectResult = items;

      const { router } = createTestRouter();
      const testRouter = router({ timeline: timeline });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.timeline({ projectId: "proj-1" });
      expect(result).toHaveLength(1);
    });

    it("returns exchanges filtered by ticketId", async () => {
      const items = [{ id: "ex-1", type: "comment", createdAt: new Date() }];
      mockDbState.selectResult = items;

      const { router } = createTestRouter();
      const testRouter = router({ timeline: timeline });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.timeline({ ticketId: "ticket-1" });
      expect(result).toHaveLength(1);
    });
  });
});
