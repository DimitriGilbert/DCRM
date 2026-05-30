import { describe, it, expect } from "vitest";

import { createTagSchema, updateTagSchema, tagIdSchema, listTagsSchema } from "./schemas";

describe("Tag schemas", () => {
  it("createTagSchema validates required name", () => {
    const result = createTagSchema.safeParse({ name: "VIP" });
    expect(result.success).toBe(true);
  });

  it("createTagSchema accepts optional color", () => {
    const result = createTagSchema.safeParse({ name: "VIP", color: "#ff0000" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.color).toBe("#ff0000");
    }
  });

  it("createTagSchema rejects missing name", () => {
    const result = createTagSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("updateTagSchema validates id + fields", () => {
    const result = updateTagSchema.safeParse({ id: "tag-1", name: "Premium" });
    expect(result.success).toBe(true);
  });

  it("updateTagSchema rejects missing id", () => {
    const result = updateTagSchema.safeParse({ name: "Premium" });
    expect(result.success).toBe(false);
  });

  it("tagIdSchema validates id", () => {
    const result = tagIdSchema.safeParse({ id: "tag-1" });
    expect(result.success).toBe(true);
  });

  it("listTagsSchema applies defaults", () => {
    const result = listTagsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });
});
