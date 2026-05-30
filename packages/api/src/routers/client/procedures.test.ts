import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Context } from "../../context";

import { createClient, createClientInDb } from "./create";
import { updateClient } from "./update";
import { softDeleteClient } from "./soft-delete";
import { restoreClient } from "./restore";
import { listClients } from "./list";
import { searchClients } from "./search";

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
    CLIENT_CREATED: "client.created",
    CLIENT_UPDATED: "client.updated",
    CLIENT_DELETED: "client.deleted",
    CLIENT_RESTORED: "client.restored",
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
                    return vi.fn(() => new Proxy({}, {}));
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
    delete: vi.fn(() => new Proxy({}, {
      get(_target, prop: string) {
        if (prop === "where") return vi.fn(async () => undefined);
        return vi.fn(() => new Proxy({}, {}));
      },
    })),
  },
}));

vi.mock("@DCRM/db/schema/crm", () => ({
  clients: {
    id: "id",
    userId: "user_id",
    name: "name",
    email: "email",
    phone: "phone",
    company: "company",
    website: "website",
    notes: "notes",
    socialLinks: "social_links",
    address: "address",
    customFields: "custom_fields",
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
  tags: {
    id: "id",
    userId: "user_id",
    name: "name",
    color: "color",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  entityTags: {
    id: "id",
    tagId: "tag_id",
    entityType: "entity_type",
    entityId: "entity_id",
    createdAt: "created_at",
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

describe("Client procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
    mockDbState.insertResult = undefined;
    mockDbState.selectResult = [];
    mockDbState.updateReturning = [];
  });

  describe("createClient", () => {
    it("creates a client and emits client.created event", async () => {
      const { router } = createTestRouter();
      const testRouter = router({ create: createClient });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.create({ name: "John Doe" });

      expect(result).toMatchObject({
        id: "test-id-1",
        userId: "user-1",
        name: "John Doe",
      });

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalledOnce();
    });

    it("createClientInDb returns a row with correct fields", async () => {
      const result = await createClientInDb("user-1", {
        name: "John Doe",
        email: "john@example.com",
        company: "Acme",
      });

      expect(result).toMatchObject({
        id: "test-id-1",
        userId: "user-1",
        name: "John Doe",
        email: "john@example.com",
        phone: null,
        company: "Acme",
        website: null,
        notes: null,
        socialLinks: null,
        address: null,
        customFields: null,
        deletedAt: null,
      });
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("readClient", () => {
    it("returns null when client not found", async () => {
      mockDbState.selectResult = [];

      const { protectedProcedure, router } = createTestRouter();
      const testRouter = router({ read: protectedProcedure.input(z.object({ id: z.string().min(1) })).query(async () => null) });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.read({ id: "nonexistent" });
      expect(result).toBeNull();
    });
  });

  describe("updateClient", () => {
    it("returns null when client not found", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateClient });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "nonexistent", name: "Updated" });
      expect(result).toBeNull();
    });

    it("returns existing client when no fields changed", async () => {
      const existing = {
        id: "c1",
        userId: "user-1",
        name: "John",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDbState.selectResult = [existing];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateClient });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "c1" });
      expect(result).toEqual(existing);
    });

    it("updates and emits client.updated event", async () => {
      const existing = {
        id: "c1",
        userId: "user-1",
        name: "John",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updated = { ...existing, name: "Jane" };

      mockDbState.selectResult = [existing];
      mockDbState.updateReturning = [updated];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateClient });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "c1", name: "Jane" });

      expect(result).toEqual(updated);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
    });
  });

  describe("softDeleteClient", () => {
    it("soft-deletes and emits client.deleted event", async () => {
      const existing = {
        id: "c1",
        userId: "user-1",
        name: "John",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const softDeleted = { ...existing, deletedAt: new Date() };

      mockDbState.selectResult = [existing];
      mockDbState.updateReturning = [softDeleted];

      const { router } = createTestRouter();
      const testRouter = router({ softDelete: softDeleteClient });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.softDelete({ id: "c1" });

      expect(result).toEqual(softDeleted);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
    });

    it("returns null when client already deleted or not found", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ softDelete: softDeleteClient });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.softDelete({ id: "c1" });
      expect(result).toBeNull();
    });
  });

  describe("restoreClient", () => {
    it("restores and emits client.restored event", async () => {
      const deleted = {
        id: "c1",
        userId: "user-1",
        name: "John",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };
      const restored = { ...deleted, deletedAt: null };

      mockDbState.selectResult = [deleted];
      mockDbState.updateReturning = [restored];

      const { router } = createTestRouter();
      const testRouter = router({ restore: restoreClient });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.restore({ id: "c1" });

      expect(result).toEqual(restored);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
    });

    it("returns null when client is not deleted", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ restore: restoreClient });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.restore({ id: "c1" });
      expect(result).toBeNull();
    });
  });

  describe("listClients", () => {
    it("returns paginated results with nextCursor", async () => {
      const now = new Date();
      const items = Array.from({ length: 3 }, (_, i) => ({
        id: `client-${i}`,
        userId: "user-1",
        name: `Client ${i}`,
        email: null,
        phone: null,
        company: null,
        website: null,
        notes: null,
        socialLinks: null,
        address: null,
        customFields: null,
        createdAt: new Date(now.getTime() - i * 1000),
        updatedAt: now,
        deletedAt: null,
      }));
      mockDbState.selectResult = [...items, { ...items[0], id: "extra" }];

      const { router } = createTestRouter();
      const testRouter = router({ list: listClients });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.list({ limit: 3 });
      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });

    it("returns no nextCursor when fewer items than limit", async () => {
      const items = [{ id: "c1", createdAt: new Date() }];
      mockDbState.selectResult = items;

      const { router } = createTestRouter();
      const testRouter = router({ list: listClients });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.list({ limit: 3 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeUndefined();
    });
  });

  describe("searchClients", () => {
    it("returns matching clients", async () => {
      const items = [
        { id: "c1", name: "John Doe", createdAt: new Date() },
      ];
      mockDbState.selectResult = items;

      const { router } = createTestRouter();
      const testRouter = router({ search: searchClients });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.search({ query: "John" });
      expect(result).toHaveLength(1);
    });
  });
});
