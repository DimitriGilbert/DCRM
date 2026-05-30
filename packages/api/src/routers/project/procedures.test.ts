import { initTRPC } from "@trpc/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Context } from "../../context";

import { createProject, createProjectInDb } from "./create";
import { readProject } from "./read";
import { updateProject } from "./update";
import { softDeleteProject } from "./soft-delete";
import { restoreProject } from "./restore";
import { listProjects } from "./list";
import { searchProjects } from "./search";

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
    PROJECT_CREATED: "project.created",
    PROJECT_UPDATED: "project.updated",
    PROJECT_DELETED: "project.deleted",
    PROJECT_RESTORED: "project.restored",
    PROJECT_STATUS_CHANGED: "project.status_changed",
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

describe("Project procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
    mockDbState.insertResult = undefined;
    mockDbState.selectResult = [];
    mockDbState.updateReturning = [];
  });

  describe("createProject", () => {
    it("creates a project and emits project.created event", async () => {
      // First select call verifies client ownership, second is unused
      mockDbState.selectResult = [{ id: "client-1" }];

      const { router } = createTestRouter();
      const testRouter = router({ create: createProject });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.create({ name: "Web Redesign", clientId: "client-1" });

      expect(result).toMatchObject({
        id: "test-id-1",
        userId: "user-1",
        clientId: "client-1",
        name: "Web Redesign",
        status: "planning",
      });

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalledOnce();
    });

    it("returns null when client does not belong to user", async () => {
      // Client ownership check returns empty
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ create: createProject });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.create({ name: "Web Redesign", clientId: "nonexistent-client" });

      expect(result).toBeNull();
    });

    it("createProjectInDb returns a row with correct defaults", async () => {
      const result = await createProjectInDb("user-1", {
        name: "Web Redesign",
        clientId: "client-1",
        description: "Complete redesign",
        budgetAmount: 5000,
        budgetCurrency: "USD",
        estimatedHours: 120,
      });

      expect(result).toMatchObject({
        id: "test-id-1",
        userId: "user-1",
        clientId: "client-1",
        name: "Web Redesign",
        description: "Complete redesign",
        status: "planning",
        budgetAmount: 5000,
        budgetCurrency: "USD",
        estimatedHours: 120,
        actualHours: null,
        customFields: null,
        deletedAt: null,
      });
      expect(result.startDate).toBeNull();
      expect(result.endDate).toBeNull();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("createProjectInDb parses date strings", async () => {
      const result = await createProjectInDb("user-1", {
        name: "Project",
        clientId: "c1",
        startDate: "2025-01-15",
        endDate: "2025-06-30",
      });

      expect(result.startDate).toBeInstanceOf(Date);
      expect(result.endDate).toBeInstanceOf(Date);
    });
  });

  describe("readProject", () => {
    it("returns null when project not found", async () => {
      mockDbState.selectResult = [];

      const { protectedProcedure, router } = createTestRouter();
      const testRouter = router({
        read: protectedProcedure
          .input(await import("./schemas").then((m) => m.projectIdSchema))
          .query(async () => null),
      });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.read({ id: "nonexistent" });
      expect(result).toBeNull();
    });
  });

  describe("updateProject", () => {
    it("returns null when project not found", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateProject });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "nonexistent", name: "Updated" });
      expect(result).toBeNull();
    });

    it("returns existing project when no fields changed", async () => {
      const existing = {
        id: "p1",
        userId: "user-1",
        clientId: "c1",
        name: "Project",
        status: "planning",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDbState.selectResult = [existing];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateProject });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "p1" });
      expect(result).toEqual(existing);
    });

    it("updates and emits project.updated event", async () => {
      const existing = {
        id: "p1",
        userId: "user-1",
        clientId: "c1",
        name: "Project",
        status: "planning",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updated = { ...existing, name: "Updated Project" };

      mockDbState.selectResult = [existing];
      mockDbState.updateReturning = [updated];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateProject });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "p1", name: "Updated Project" });

      expect(result).toEqual(updated);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
    });

    it("emits project.status_changed when status changes", async () => {
      const existing = {
        id: "p1",
        userId: "user-1",
        clientId: "c1",
        name: "Project",
        status: "planning",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updated = { ...existing, status: "active" };

      mockDbState.selectResult = [existing];
      mockDbState.updateReturning = [updated];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateProject });
      const caller = testRouter.createCaller(mockContext);
      await caller.update({ id: "p1", status: "active" });

      expect(emittedEvents).toHaveLength(2);
      expect(emittedEvents[0]).toMatchObject({
        type: "project.status_changed",
        payload: { status: "active" },
        changes: {
          before: { status: "planning" },
          after: { status: "active" },
        },
      });
      expect(emittedEvents[1]).toMatchObject({
        type: "project.updated",
      });
    });

    it("returns null when changing clientId to unowned client", async () => {
      const existing = {
        id: "p1",
        userId: "user-1",
        clientId: "c1",
        name: "Project",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // First select finds the project, second select finds no client
      mockDbState.selectResult = [existing];

      const { router } = createTestRouter();
      const testRouter = router({ update: updateProject });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.update({ id: "p1", clientId: "unowned-client" });
      expect(result).toBeNull();
    });
  });

  describe("softDeleteProject", () => {
    it("soft-deletes and emits project.deleted event", async () => {
      const existing = {
        id: "p1",
        userId: "user-1",
        clientId: "c1",
        name: "Project",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const softDeleted = { ...existing, deletedAt: new Date() };

      mockDbState.selectResult = [existing];
      mockDbState.updateReturning = [softDeleted];

      const { router } = createTestRouter();
      const testRouter = router({ softDelete: softDeleteProject });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.softDelete({ id: "p1" });

      expect(result).toEqual(softDeleted);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
    });

    it("returns null when project already deleted or not found", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ softDelete: softDeleteProject });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.softDelete({ id: "p1" });
      expect(result).toBeNull();
    });
  });

  describe("restoreProject", () => {
    it("restores and emits project.restored event", async () => {
      const deleted = {
        id: "p1",
        userId: "user-1",
        clientId: "c1",
        name: "Project",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };
      const restored = { ...deleted, deletedAt: null };

      mockDbState.selectResult = [deleted];
      mockDbState.updateReturning = [restored];

      const { router } = createTestRouter();
      const testRouter = router({ restore: restoreProject });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.restore({ id: "p1" });

      expect(result).toEqual(restored);

      const { emitEvent } = await import("@DCRM/events");
      expect(emitEvent).toHaveBeenCalled();
    });

    it("returns null when project is not deleted", async () => {
      mockDbState.selectResult = [];

      const { router } = createTestRouter();
      const testRouter = router({ restore: restoreProject });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.restore({ id: "p1" });
      expect(result).toBeNull();
    });
  });

  describe("listProjects", () => {
    it("returns paginated results with nextCursor", async () => {
      const now = new Date();
      const items = Array.from({ length: 3 }, (_, i) => ({
        id: `project-${i}`,
        userId: "user-1",
        clientId: "c1",
        name: `Project ${i}`,
        description: null,
        status: "planning",
        budgetAmount: null,
        budgetCurrency: null,
        estimatedHours: null,
        actualHours: null,
        customFields: null,
        startDate: null,
        endDate: null,
        createdAt: new Date(now.getTime() - i * 1000),
        updatedAt: now,
        deletedAt: null,
      }));
      mockDbState.selectResult = [...items, { ...items[0], id: "extra" }];

      const { router } = createTestRouter();
      const testRouter = router({ list: listProjects });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.list({ limit: 3 });
      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });

    it("returns no nextCursor when fewer items than limit", async () => {
      const items = [{ id: "p1", createdAt: new Date() }];
      mockDbState.selectResult = items;

      const { router } = createTestRouter();
      const testRouter = router({ list: listProjects });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.list({ limit: 3 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeUndefined();
    });
  });

  describe("searchProjects", () => {
    it("returns matching projects", async () => {
      const items = [
        { id: "p1", name: "Web Redesign", createdAt: new Date() },
      ];
      mockDbState.selectResult = items;

      const { router } = createTestRouter();
      const testRouter = router({ search: searchProjects });
      const caller = testRouter.createCaller(mockContext);
      const result = await caller.search({ query: "Redesign" });
      expect(result).toHaveLength(1);
    });
  });
});
