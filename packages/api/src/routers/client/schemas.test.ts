import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { describe, it, expect } from "vitest";

import type { Context } from "../../context";

import { createClientSchema, updateClientSchema, clientIdSchema, listClientsSchema, searchClientsSchema } from "./schemas";

// --- tRPC test helpers ---

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

  return { t, protectedProcedure };
}

// --- Schema validation tests ---

describe("Client schemas", () => {
  it("createClientSchema validates required name", () => {
    const result = createClientSchema.safeParse({ name: "John" });
    expect(result.success).toBe(true);
  });

  it("createClientSchema rejects missing name", () => {
    const result = createClientSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("createClientSchema accepts all optional fields", () => {
    const result = createClientSchema.safeParse({
      name: "John",
      email: "john@example.com",
      phone: "+1234567890",
      company: "Acme",
      website: "https://acme.com",
      notes: "A note",
      socialLinks: { twitter: "@john" },
      address: { city: "NYC" },
      customFields: { rating: 5 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("John");
      expect(result.data.email).toBe("john@example.com");
      expect(result.data.customFields).toEqual({ rating: 5 });
    }
  });

  it("updateClientSchema requires id", () => {
    const result = updateClientSchema.safeParse({ id: "client-1", name: "Updated" });
    expect(result.success).toBe(true);
  });

  it("updateClientSchema rejects missing id", () => {
    const result = updateClientSchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(false);
  });

  it("clientIdSchema validates id", () => {
    const result = clientIdSchema.safeParse({ id: "client-1" });
    expect(result.success).toBe(true);
  });

  it("listClientsSchema applies defaults", () => {
    const result = listClientsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.includeDeleted).toBe(false);
    }
  });

  it("searchClientsSchema validates query", () => {
    const result = searchClientsSchema.safeParse({ query: "test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it("searchClientsSchema rejects empty query", () => {
    const result = searchClientsSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });
});

describe("Client procedure authorization", () => {
  it("protected procedures reject unauthenticated context", async () => {
    const { protectedProcedure } = createTestRouter();
    const router = createTestRouter().t.router({
      test: protectedProcedure.input(createClientSchema).mutation(async ({ ctx }) => ctx.user.id),
    });

    const caller = router.createCaller({ user: null, session: null });
    await expect(caller.test({ name: "Test" })).rejects.toThrow("UNAUTHORIZED");
  });

  it("protected procedures allow authenticated context", async () => {
    const { protectedProcedure } = createTestRouter();
    const router = createTestRouter().t.router({
      test: protectedProcedure.input(createClientSchema).mutation(async ({ ctx }) => ctx.user.id),
    });

    const caller = router.createCaller(mockContext);
    const result = await caller.test({ name: "Test" });
    expect(result).toBe("user-1");
  });
});
