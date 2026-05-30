import { initTRPC } from "@trpc/server";
import { describe, it, expect } from "vitest";

import type { Context } from "../../context";

function createMockCaller(user: Context["user"]) {
  const t = initTRPC.context<Context>().create();

  const protectedProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.user) {
      throw new Error("UNAUTHORIZED");
    }
    return next({
      ctx: { ...ctx, user: ctx.user },
    });
  });

  const router = t.router;
  return { t, router, protectedProcedure };
}

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

describe("tRPC test infrastructure", () => {
  it("creates a mock caller with user context", () => {
    const { protectedProcedure } = createMockCaller(mockUser);
    expect(protectedProcedure).toBeDefined();
  });

  it("rejects unauthenticated requests", async () => {
    const t = initTRPC.context<Context>().create();
    const protectedProcedure = t.procedure.use(({ ctx, next }) => {
      if (!ctx.user) {
        throw new Error("UNAUTHORIZED");
      }
      return next({ ctx: { ...ctx, user: ctx.user } });
    });

    const router = t.router({
      test: protectedProcedure.query(() => "ok"),
    });

    const caller = router.createCaller({ user: null, session: null });
    await expect(caller.test()).rejects.toThrow("UNAUTHORIZED");
  });

  it("allows authenticated requests", async () => {
    const t = initTRPC.context<Context>().create();
    const protectedProcedure = t.procedure.use(({ ctx, next }) => {
      if (!ctx.user) {
        throw new Error("UNAUTHORIZED");
      }
      return next({ ctx: { ...ctx, user: ctx.user } });
    });

    const router = t.router({
      test: protectedProcedure.query(() => "ok"),
    });

    const caller = router.createCaller(mockContext);
    const result = await caller.test();
    expect(result).toBe("ok");
  });
});
