import { initTRPC } from "@trpc/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Context } from "../../context";

import { importClients } from "./import-clients";
import { parseCsv } from "./parse-csv";

// --- Mock setup ---

const emittedEvents: Array<unknown> = [];

vi.mock("@DCRM/events", () => ({
  emitEvent: vi.fn(async (_persister, input) => {
    emittedEvents.push(input);
    return {
      id: "event-import-1",
      type: input.type,
      userId: input.userId,
      source: input.source,
      entity: input.entity,
      payload: input.payload,
      createdAt: new Date(),
    };
  }),
  EVENT_TYPE: {
    CLIENT_CREATED: "client.created",
    IMPORT_COMPLETED: "import.completed",
  },
}));

vi.mock("nanoid", () => ({
  nanoid: () => "test-import-id",
}));

const insertedRows: Array<unknown> = [];

vi.mock("@DCRM/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(async (row: unknown) => {
        insertedRows.push(row);
      }),
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

  return { t, protectedProcedure, router: t.router };
}

// --- Tests ---

describe("parseCsv", () => {
  it("parses a simple CSV with headers", () => {
    const csv = "name,email,company\nJohn,john@test.com,Acme\nJane,jane@test.com,Globex";
    const result = parseCsv(csv, true);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(["John", "john@test.com", "Acme"]);
    expect(result[1]).toEqual(["Jane", "jane@test.com", "Globex"]);
  });

  it("parses CSV without headers", () => {
    const csv = "John,john@test.com,Acme\nJane,jane@test.com,Globex";
    const result = parseCsv(csv, false);
    expect(result).toHaveLength(2);
  });

  it("handles quoted fields with commas", () => {
    const csv = 'name,email,notes\n"John, Jr.",john@test.com,"Has, comma"';
    const result = parseCsv(csv, true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(["John, Jr.", "john@test.com", "Has, comma"]);
  });

  it("handles quoted fields with newlines", () => {
    const csv = 'name,notes\nJohn,"line1\nline2"';
    const result = parseCsv(csv, true);
    expect(result).toHaveLength(1);
    expect(result[0]?.[1]).toBe("line1\nline2");
  });

  it("handles escaped quotes inside fields", () => {
    const csv = 'name,notes\nJohn,"He said ""hello"""';
    const result = parseCsv(csv, true);
    expect(result).toHaveLength(1);
    expect(result[0]?.[1]).toBe('He said "hello"');
  });

  it("returns empty array for empty CSV body", () => {
    const csv = "name,email\n";
    const result = parseCsv(csv, true);
    expect(result).toHaveLength(0);
  });

  it("skips blank lines", () => {
    const csv = "name,email\nJohn,john@test.com\n\nJane,jane@test.com";
    const result = parseCsv(csv, true);
    expect(result).toHaveLength(2);
  });
});

describe("importClients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emittedEvents.length = 0;
    insertedRows.length = 0;
  });

  it("imports clients from CSV with header mapping", async () => {
    const csv = "Full Name,Email Address,Company\nJohn,john@test.com,Acme\nJane,jane@test.com,Globex";

    const { router } = createTestRouter();
    const testRouter = router({ importClients });
    const caller = testRouter.createCaller(mockContext);

    const result = await caller.importClients({
      csvData: csv,
      columnMappings: [
        { field: "name", columnIndex: 0 },
        { field: "email", columnIndex: 1 },
        { field: "company", columnIndex: 2 },
      ],
      hasHeader: true,
    });

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.totalRows).toBe(2);
    expect(insertedRows).toHaveLength(2);
  });

  it("skips rows with missing required name field", async () => {
    const csv = "name,email\n,john@test.com\nJane,jane@test.com";

    const { router } = createTestRouter();
    const testRouter = router({ importClients });
    const caller = testRouter.createCaller(mockContext);

    const result = await caller.importClients({
      csvData: csv,
      columnMappings: [
        { field: "name", columnIndex: 0 },
        { field: "email", columnIndex: 1 },
      ],
      hasHeader: true,
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.row).toBe(0);
    expect(result.errors[0]?.message).toContain("name");
  });

  it("emits import.completed event after import", async () => {
    const csv = "name\nJohn";

    const { router } = createTestRouter();
    const testRouter = router({ importClients });
    const caller = testRouter.createCaller(mockContext);

    await caller.importClients({
      csvData: csv,
      columnMappings: [{ field: "name", columnIndex: 0 }],
      hasHeader: true,
    });

    const { emitEvent } = await import("@DCRM/events");
    // One per client created + one import.completed
    expect(emitEvent).toHaveBeenCalledTimes(2);

    const importEvent = emittedEvents[emittedEvents.length - 1];
    expect(importEvent).toMatchObject({
      type: "import.completed",
      userId: "user-1",
      source: "app",
    });
  });

  it("handles CSV without header row", async () => {
    const csv = "John,john@test.com";

    const { router } = createTestRouter();
    const testRouter = router({ importClients });
    const caller = testRouter.createCaller(mockContext);

    const result = await caller.importClients({
      csvData: csv,
      columnMappings: [
        { field: "name", columnIndex: 0 },
        { field: "email", columnIndex: 1 },
      ],
      hasHeader: false,
    });

    expect(result.created).toBe(1);
    expect(result.totalRows).toBe(1);
  });

  it("handles empty CSV gracefully", async () => {
    const csv = "name,email\n";

    const { router } = createTestRouter();
    const testRouter = router({ importClients });
    const caller = testRouter.createCaller(mockContext);

    const result = await caller.importClients({
      csvData: csv,
      columnMappings: [{ field: "name", columnIndex: 0 }],
      hasHeader: true,
    });

    expect(result.created).toBe(0);
    expect(result.totalRows).toBe(0);
  });
});
