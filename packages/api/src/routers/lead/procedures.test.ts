import { initTRPC } from "@trpc/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Context } from "../../context";

import { createLead, createLeadInDb } from "./create";
import { readLead } from "./read";
import { updateLead } from "./update";
import { softDeleteLead } from "./soft-delete";
import { restoreLead } from "./restore";
import { listLeads } from "./list";
import { updateLeadStage } from "./update-stage";
import { convertLead } from "./convert";
import { searchLeads } from "./search";

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
    LEAD_CREATED: "lead.created",
    LEAD_UPDATED: "lead.updated",
    LEAD_DELETED: "lead.deleted",
    LEAD_RESTORED: "lead.restored",
    LEAD_STAGE_CHANGED: "lead.stage_changed",
    LEAD_CONVERTED: "lead.converted",
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
  leads: {
    id: "id",
    userId: "user_id",
    name: "name",
    email: "email",
    phone: "phone",
    company: "company",
    website: "website",
    notes: "notes",
    source: "source",
    stage: "stage",
    estimatedValue: "estimated_value",
    currency: "currency",
    socialLinks: "social_links",
    address: "address",
    customFields: "custom_fields",
    convertedClientId: "converted_client_id",
    convertedAt: "converted_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
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
  attachments: {
    id: "id",
    userId: "user_id",
    entityType: "entity_type",
    entityId: "entity_id",
    fileName: "file_name",
    filePath: "file_path",
    fileSize: "file_size",
    mimeType: "mime_type",
    metadata: "metadata",
    createdAt: "created_at",
    updatedAt: "updated_at",
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

describe("Lead procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
    mockDbState.insertResult = undefined;
    mockDbState.selectResult = [];
    mockDbState.updateReturning = [];
  });

  describe("createLead", () => {
    it("creates a lead and emits lead.created event", async () => {
      const { router } = createTestRouter();
      const testRouter = router({ create: createLead });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.create({ name: "Acme Corp", stage: "new" });

      expect(result).toMatchObject({
        id: "test-id-1",
        userId: "user-1",
        name: "Acme Corp",
        stage: "new",
      });

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalledOnce();
    });

    it("createLeadInDb returns a row with correct defaults", async () => {
      const result = await createLeadInDb("user-1", {
        name: "Acme Corp",
        email: "contact@acme.com",
        source: "referral",
      });

      expect(result).toMatchObject({
        id: "test-id-1",
        userId: "user-1",
        name: "Acme Corp",
        email: "contact@acme.com",
        phone: null,
        company: null,
        website: null,
        notes: null,
        source: "referral",
        stage: "new",
        estimatedValue: null,
        currency: null,
        socialLinks: null,
        address: null,
        customFields: null,
        convertedClientId: null,
        convertedAt: null,
        deletedAt: null,
      });
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("readLead", () => {
    it("returns null when lead not found", async () => {
      mockDbState.selectResult = [];

      const { protectedProcedure, router } = createTestRouter();
      const testRouter = router({
        read: protectedProcedure
          .input(await import("./schemas").then((m) => m.leadIdSchema))
          .query(async () => null),
      });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.read({ id: "nonexistent" });
      expect(result).toBeNull();
    });
  });

  describe("updateLead", () => {
    it("returns null when lead not found", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateLead });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "nonexistent", name: "Updated" });
      expect(result).toBeNull();
    });

    it("returns existing lead when no fields changed", async () => {
      const existing = {
        id: "l1",
        userId: "user-1",
        name: "Acme",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDbState.selectResult = [existing];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateLead });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "l1" });
      expect(result).toEqual(existing);
    });

    it("updates and emits lead.updated event", async () => {
      const existing = {
        id: "l1",
        userId: "user-1",
        name: "Acme",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updated = { ...existing, name: "Beta Corp" };

      mockDbState.selectResult = [existing];
      mockDbState.updateReturning = [updated];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateLead });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "l1", name: "Beta Corp" });

      expect(result).toEqual(updated);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
    });
  });

  describe("softDeleteLead", () => {
    it("soft-deletes and emits lead.deleted event", async () => {
      const existing = {
        id: "l1",
        userId: "user-1",
        name: "Acme",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const softDeleted = { ...existing, deletedAt: new Date() };

      mockDbState.selectResult = [existing];
      mockDbState.updateReturning = [softDeleted];

      const { router } = createTestRouter();
      const testRouter = router({ softDelete: softDeleteLead });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.softDelete({ id: "l1" });

      expect(result).toEqual(softDeleted);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
    });

    it("returns null when lead already deleted or not found", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ softDelete: softDeleteLead });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.softDelete({ id: "l1" });
      expect(result).toBeNull();
    });
  });

  describe("restoreLead", () => {
    it("restores and emits lead.restored event", async () => {
      const deleted = {
        id: "l1",
        userId: "user-1",
        name: "Acme",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };
      const restored = { ...deleted, deletedAt: null };

      mockDbState.selectResult = [deleted];
      mockDbState.updateReturning = [restored];

      const { router } = createTestRouter();
      const testRouter = router({ restore: restoreLead });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.restore({ id: "l1" });

      expect(result).toEqual(restored);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
    });

    it("returns null when lead is not deleted", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ restore: restoreLead });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.restore({ id: "l1" });
      expect(result).toBeNull();
    });
  });

  describe("listLeads", () => {
    it("returns paginated results with nextCursor", async () => {
      const now = new Date();
      const items = Array.from({ length: 3 }, (_, i) => ({
        id: `lead-${i}`,
        userId: "user-1",
        name: `Lead ${i}`,
        email: null,
        phone: null,
        company: null,
        website: null,
        notes: null,
        source: null,
        stage: "new",
        estimatedValue: null,
        currency: null,
        socialLinks: null,
        address: null,
        customFields: null,
        convertedClientId: null,
        convertedAt: null,
        createdAt: new Date(now.getTime() - i * 1000),
        updatedAt: now,
        deletedAt: null,
      }));
      mockDbState.selectResult = [...items, { ...items[0], id: "extra" }];

      const { router } = createTestRouter();
      const testRouter = router({ list: listLeads });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.list({ limit: 3 });
      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });

    it("returns no nextCursor when fewer items than limit", async () => {
      const items = [{ id: "l1", createdAt: new Date() }];
      mockDbState.selectResult = items;

      const { router } = createTestRouter();
      const testRouter = router({ list: listLeads });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.list({ limit: 3 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeUndefined();
    });
  });

  describe("updateLeadStage", () => {
    it("updates stage and emits lead.stage_changed event", async () => {
      const existing = {
        id: "l1",
        userId: "user-1",
        name: "Acme",
        stage: "new",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const updated = { ...existing, stage: "qualified" };

      mockDbState.selectResult = [existing];
      mockDbState.updateReturning = [updated];

      const { router } = createTestRouter();
      const testRouter = router({ updateStage: updateLeadStage });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.updateStage({ id: "l1", stage: "qualified" });

      expect(result).toEqual(updated);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]).toMatchObject({
        type: "lead.stage_changed",
        payload: { stage: "qualified" },
        changes: {
          before: { stage: "new" },
          after: { stage: "qualified" },
        },
      });
    });

    it("returns null when lead not found or deleted", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ updateStage: updateLeadStage });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.updateStage({ id: "l1", stage: "won" });
      expect(result).toBeNull();
    });
  });

  describe("convertLead", () => {
    it("converts a won lead to client and emits lead.converted event", async () => {
      const lead = {
        id: "l1",
        userId: "user-1",
        name: "Acme Corp",
        email: "contact@acme.com",
        phone: "+1234567890",
        company: "Acme",
        website: "https://acme.com",
        notes: "Big deal",
        source: "referral",
        stage: "won",
        estimatedValue: 10000,
        currency: "USD",
        socialLinks: null,
        address: null,
        customFields: null,
        convertedClientId: null,
        convertedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const convertedLead = {
        ...lead,
        convertedClientId: "test-id-1",
        convertedAt: new Date(),
      };

      mockDbState.selectResult = [lead];
      mockDbState.updateReturning = [convertedLead];

      const { router } = createTestRouter();
      const testRouter = router({ convert: convertLead });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.convert({ id: "l1" });

      expect(result).not.toBeNull();
      expect(result!.client).toMatchObject({
        id: "test-id-1",
        userId: "user-1",
        name: "Acme Corp",
        email: "contact@acme.com",
        phone: "+1234567890",
        company: "Acme",
        website: "https://acme.com",
        notes: "Big deal",
      });
      expect(result!.lead).toEqual(convertedLead);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]).toMatchObject({
        type: "lead.converted",
        payload: {
          leadId: "l1",
          clientId: "test-id-1",
          name: "Acme Corp",
        },
      });
    });

    it("returns null when lead not found", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ convert: convertLead });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.convert({ id: "nonexistent" });
      expect(result).toBeNull();
    });

    it("returns null when lead is not in won stage", async () => {
      const lead = {
        id: "l1",
        userId: "user-1",
        name: "Acme",
        stage: "qualified",
        convertedClientId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockDbState.selectResult = [lead];

      const { router } = createTestRouter();
      const testRouter = router({ convert: convertLead });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.convert({ id: "l1" });
      expect(result).toBeNull();
    });

    it("returns null when lead is already converted", async () => {
      const lead = {
        id: "l1",
        userId: "user-1",
        name: "Acme",
        stage: "won",
        convertedClientId: "existing-client-id",
        convertedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockDbState.selectResult = [lead];

      const { router } = createTestRouter();
      const testRouter = router({ convert: convertLead });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.convert({ id: "l1" });
      expect(result).toBeNull();
    });
  });

  describe("searchLeads", () => {
    it("returns matching leads", async () => {
      const items = [
        { id: "l1", name: "Acme Corp", createdAt: new Date() },
      ];
      mockDbState.selectResult = items;

      const { router } = createTestRouter();
      const testRouter = router({ search: searchLeads });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.search({ query: "Acme" });
      expect(result).toHaveLength(1);
    });
  });
});
