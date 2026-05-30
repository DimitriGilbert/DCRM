import { describe, it, expect } from "vitest";

import { attachTagSchema, detachTagSchema } from "./schemas";

describe("Entity-Tag schemas", () => {
  it("attachTagSchema validates required fields", () => {
    const result = attachTagSchema.safeParse({
      tagId: "tag-1",
      entityType: "client",
      entityId: "client-1",
    });
    expect(result.success).toBe(true);
  });

  it("attachTagSchema rejects missing fields", () => {
    const result = attachTagSchema.safeParse({ tagId: "tag-1" });
    expect(result.success).toBe(false);
  });

  it("detachTagSchema validates required fields", () => {
    const result = detachTagSchema.safeParse({
      tagId: "tag-1",
      entityType: "client",
      entityId: "client-1",
    });
    expect(result.success).toBe(true);
  });

  it("detachTagSchema rejects missing entityId", () => {
    const result = detachTagSchema.safeParse({
      tagId: "tag-1",
      entityType: "client",
    });
    expect(result.success).toBe(false);
  });
});
