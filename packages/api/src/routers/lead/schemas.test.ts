import { z } from "zod";
import { describe, it, expect } from "vitest";

import {
  createLeadSchema,
  updateLeadSchema,
  leadIdSchema,
  listLeadsSchema,
  updateLeadStageSchema,
  convertLeadSchema,
  searchLeadsSchema,
} from "./schemas";

describe("Lead schemas", () => {
  it("createLeadSchema validates required name", () => {
    const result = createLeadSchema.safeParse({ name: "Acme Corp" });
    expect(result.success).toBe(true);
  });

  it("createLeadSchema rejects missing name", () => {
    const result = createLeadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("createLeadSchema accepts all optional fields", () => {
    const result = createLeadSchema.safeParse({
      name: "Acme Corp",
      email: "contact@acme.com",
      phone: "+1234567890",
      company: "Acme",
      website: "https://acme.com",
      notes: "Hot lead",
      source: "referral",
      stage: "qualified",
      estimatedValue: 5000,
      currency: "EUR",
      socialLinks: { twitter: "@acme" },
      address: { city: "Berlin" },
      customFields: { priority: "high" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Acme Corp");
      expect(result.data.stage).toBe("qualified");
      expect(result.data.estimatedValue).toBe(5000);
    }
  });

  it("createLeadSchema rejects invalid stage", () => {
    const result = createLeadSchema.safeParse({
      name: "Acme",
      stage: "invalid_stage",
    });
    expect(result.success).toBe(false);
  });

  it("updateLeadSchema requires id", () => {
    const result = updateLeadSchema.safeParse({ id: "lead-1", name: "Updated" });
    expect(result.success).toBe(true);
  });

  it("updateLeadSchema rejects missing id", () => {
    const result = updateLeadSchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(false);
  });

  it("leadIdSchema validates id", () => {
    const result = leadIdSchema.safeParse({ id: "lead-1" });
    expect(result.success).toBe(true);
  });

  it("listLeadsSchema applies defaults", () => {
    const result = listLeadsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.includeDeleted).toBe(false);
    }
  });

  it("listLeadsSchema accepts stage filter", () => {
    const result = listLeadsSchema.safeParse({ stage: "qualified" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stage).toBe("qualified");
    }
  });

  it("updateLeadStageSchema validates id and stage", () => {
    const result = updateLeadStageSchema.safeParse({ id: "lead-1", stage: "won" });
    expect(result.success).toBe(true);
  });

  it("updateLeadStageSchema rejects invalid stage", () => {
    const result = updateLeadStageSchema.safeParse({ id: "lead-1", stage: "bogus" });
    expect(result.success).toBe(false);
  });

  it("convertLeadSchema validates id", () => {
    const result = convertLeadSchema.safeParse({ id: "lead-1" });
    expect(result.success).toBe(true);
  });

  it("searchLeadsSchema validates query", () => {
    const result = searchLeadsSchema.safeParse({ query: "acme" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it("searchLeadsSchema rejects empty query", () => {
    const result = searchLeadsSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });
});
