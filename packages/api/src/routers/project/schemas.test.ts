import { z } from "zod";
import { describe, it, expect } from "vitest";

import {
  createProjectSchema,
  updateProjectSchema,
  projectIdSchema,
  listProjectsSchema,
  searchProjectsSchema,
} from "./schemas";

describe("Project schemas", () => {
  it("createProjectSchema validates required name and clientId", () => {
    const result = createProjectSchema.safeParse({ name: "Web Redesign", clientId: "client-1" });
    expect(result.success).toBe(true);
  });

  it("createProjectSchema rejects missing name", () => {
    const result = createProjectSchema.safeParse({ clientId: "client-1" });
    expect(result.success).toBe(false);
  });

  it("createProjectSchema rejects missing clientId", () => {
    const result = createProjectSchema.safeParse({ name: "Web Redesign" });
    expect(result.success).toBe(false);
  });

  it("createProjectSchema accepts all optional fields", () => {
    const result = createProjectSchema.safeParse({
      name: "Web Redesign",
      clientId: "client-1",
      description: "Complete redesign",
      status: "active",
      budgetAmount: 5000,
      budgetCurrency: "USD",
      estimatedHours: 120,
      actualHours: 30,
      customFields: { priority: "high" },
      startDate: "2025-01-01",
      endDate: "2025-06-30",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Web Redesign");
      expect(result.data.clientId).toBe("client-1");
      expect(result.data.status).toBe("active");
      expect(result.data.budgetAmount).toBe(5000);
      expect(result.data.estimatedHours).toBe(120);
    }
  });

  it("createProjectSchema rejects invalid status", () => {
    const result = createProjectSchema.safeParse({
      name: "Project",
      clientId: "c1",
      status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });

  it("updateProjectSchema requires id", () => {
    const result = updateProjectSchema.safeParse({ id: "project-1", name: "Updated" });
    expect(result.success).toBe(true);
  });

  it("updateProjectSchema rejects missing id", () => {
    const result = updateProjectSchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(false);
  });

  it("projectIdSchema validates id", () => {
    const result = projectIdSchema.safeParse({ id: "project-1" });
    expect(result.success).toBe(true);
  });

  it("listProjectsSchema applies defaults", () => {
    const result = listProjectsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.includeDeleted).toBe(false);
    }
  });

  it("listProjectsSchema accepts clientId and status filters", () => {
    const result = listProjectsSchema.safeParse({ clientId: "c1", status: "active" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clientId).toBe("c1");
      expect(result.data.status).toBe("active");
    }
  });

  it("searchProjectsSchema validates query", () => {
    const result = searchProjectsSchema.safeParse({ query: "redesign" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it("searchProjectsSchema rejects empty query", () => {
    const result = searchProjectsSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });
});
