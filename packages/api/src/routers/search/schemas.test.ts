import { initTRPC } from "@trpc/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Context } from "../../context";

import { globalSearchSchema, searchEntityTypeSchema, SEARCH_ENTITY_TYPES } from "./schemas";

// --- Mock setup ---

const mockDbState: {
  selectResult: unknown;
} = {
  selectResult: [],
};

vi.mock("@DCRM/db", () => ({
  db: {
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
  projects: {
    id: "id",
    userId: "user_id",
    clientId: "client_id",
    name: "name",
    description: "description",
    status: "status",
    budgetAmount: "budget_amount",
    budgetCurrency: "budget_currency",
    estimatedHours: "estimated_hours",
    actualHours: "actual_hours",
    customFields: "custom_fields",
    startDate: "start_date",
    endDate: "end_date",
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

// --- Tests ---

describe("Search schemas", () => {
  describe("globalSearchSchema", () => {
    it("validates minimal input with just query", () => {
      const result = globalSearchSchema.safeParse({ query: "test" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.entityTypes).toBeUndefined();
        expect(result.data.tagIds).toBeUndefined();
        expect(result.data.dateFrom).toBeUndefined();
        expect(result.data.dateTo).toBeUndefined();
      }
    });

    it("validates full input with all filters", () => {
      const result = globalSearchSchema.safeParse({
        query: "acme",
        limit: 10,
        entityTypes: ["client", "project"],
        tagIds: ["tag-1", "tag-2"],
        dateFrom: "2025-01-01",
        dateTo: "2025-12-31",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.entityTypes).toEqual(["client", "project"]);
        expect(result.data.tagIds).toEqual(["tag-1", "tag-2"]);
      }
    });

    it("rejects empty query", () => {
      const result = globalSearchSchema.safeParse({ query: "" });
      expect(result.success).toBe(false);
    });

    it("rejects limit over 100", () => {
      const result = globalSearchSchema.safeParse({ query: "test", limit: 101 });
      expect(result.success).toBe(false);
    });

    it("rejects invalid entity type", () => {
      const result = globalSearchSchema.safeParse({
        query: "test",
        entityTypes: ["invalid"],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("searchEntityTypeSchema", () => {
    it("accepts all valid entity types", () => {
      for (const type of SEARCH_ENTITY_TYPES) {
        const result = searchEntityTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      }
    });

    it("rejects unknown entity type", () => {
      const result = searchEntityTypeSchema.safeParse("unknown");
      expect(result.success).toBe(false);
    });
  });
});

describe("Global search procedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbState.selectResult = [];
  });

  it("returns empty results when nothing matches", async () => {
    mockDbState.selectResult = [];

    const t = initTRPC.context<Context>().create();
    const protectedProcedure = t.procedure.use(({ ctx, next }) => {
      if (!ctx.user) throw new Error("UNAUTHORIZED");
      return next({ ctx: { ...ctx, user: ctx.user } });
    });

    const { globalSearch } = await import("./global");
    const router = t.router({ global: globalSearch });
    const caller = router.createCaller(mockContext);

    const result = await caller.global({ query: "nonexistent" });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("returns results across multiple entity types", async () => {
    const now = new Date();
    const clientRow = {
      id: "c1",
      userId: "user-1",
      name: "Acme Corp",
      email: "info@acme.com",
      phone: null,
      company: "Acme",
      website: null,
      notes: null,
      socialLinks: null,
      address: null,
      customFields: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const projectRow = {
      id: "p1",
      userId: "user-1",
      clientId: "c1",
      name: "Acme Website",
      description: "Build website",
      status: "planning",
      budgetAmount: null,
      budgetCurrency: "USD",
      estimatedHours: null,
      actualHours: null,
      customFields: null,
      startDate: null,
      endDate: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    // The mock returns the same result for all queries
    mockDbState.selectResult = [clientRow, projectRow];

    const t = initTRPC.context<Context>().create();
    const protectedProcedure = t.procedure.use(({ ctx, next }) => {
      if (!ctx.user) throw new Error("UNAUTHORIZED");
      return next({ ctx: { ...ctx, user: ctx.user } });
    });

    // Need to reimport since we're in the same test file
    vi.resetModules();

    // Re-setup mocks after resetModules
    vi.doMock("@DCRM/db", () => ({
      db: {
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

    vi.doMock("@DCRM/db/schema/crm", () => ({
      clients: {
        id: "id", userId: "user_id", name: "name", email: "email",
        phone: "phone", company: "company", website: "website",
        notes: "notes", socialLinks: "social_links", address: "address",
        customFields: "custom_fields", createdAt: "created_at",
        updatedAt: "updated_at", deletedAt: "deleted_at",
      },
      leads: {
        id: "id", userId: "user_id", name: "name", email: "email",
        phone: "phone", company: "company", website: "website",
        notes: "notes", source: "source", stage: "stage",
        estimatedValue: "estimated_value", currency: "currency",
        socialLinks: "social_links", address: "address",
        customFields: "custom_fields", convertedClientId: "converted_client_id",
        convertedAt: "converted_at", createdAt: "created_at",
        updatedAt: "updated_at", deletedAt: "deleted_at",
      },
      projects: {
        id: "id", userId: "user_id", clientId: "client_id", name: "name",
        description: "description", status: "status",
        budgetAmount: "budget_amount", budgetCurrency: "budget_currency",
        estimatedHours: "estimated_hours", actualHours: "actual_hours",
        customFields: "custom_fields", startDate: "start_date",
        endDate: "end_date", createdAt: "created_at",
        updatedAt: "updated_at", deletedAt: "deleted_at",
      },
      tickets: {
        id: "id", userId: "user_id", projectId: "project_id",
        title: "title", description: "description", type: "type",
        status: "status", priority: "priority", dueDate: "due_date",
        createdAt: "created_at", updatedAt: "updated_at", deletedAt: "deleted_at",
      },
      exchanges: {
        id: "id", userId: "user_id", type: "type", clientId: "client_id",
        projectId: "project_id", ticketId: "ticket_id", subject: "subject",
        body: "body", direction: "direction", metadata: "metadata",
        isInternal: "is_internal", createdAt: "created_at", updatedAt: "updated_at",
      },
      entityTags: {
        id: "id", tagId: "tag_id", entityType: "entity_type",
        entityId: "entity_id", createdAt: "created_at",
      },
    }));

    const { globalSearch: freshGlobalSearch } = await import("./global");
    const router2 = t.router({ global: freshGlobalSearch });
    const caller2 = router2.createCaller(mockContext);

    const result = await caller2.global({ query: "acme" });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it("filters by entity types when specified", async () => {
    mockDbState.selectResult = [];

    const t = initTRPC.context<Context>().create();

    const { globalSearch: proc } = await import("./global");
    const router = t.router({ global: proc });
    const caller = router.createCaller(mockContext);

    const result = await caller.global({
      query: "test",
      entityTypes: ["client"],
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
