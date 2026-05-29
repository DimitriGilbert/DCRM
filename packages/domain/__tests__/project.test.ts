import { describe, expect, it } from "vitest";

describe("Project statuses", () => {
  it("exports all required statuses from PRD", async () => {
    const { PROJECT_STATUSES } = await import("../src/project");

    expect(PROJECT_STATUSES).toEqual({
      PLANNING: "planning",
      ACTIVE: "active",
      ON_HOLD: "on_hold",
      COMPLETED: "completed",
      ARCHIVED: "archived",
    });
  });

  it("validates correct project statuses via schema", async () => {
    const { PROJECT_STATUSES, projectStatusSchema } = await import("../src/project");

    const validStatuses = Object.values(PROJECT_STATUSES);
    for (const status of validStatuses) {
      expect(projectStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects invalid project status values", async () => {
    const { projectStatusSchema } = await import("../src/project");

    expect(projectStatusSchema.safeParse("cancelled").success).toBe(false);
    expect(projectStatusSchema.safeParse("").success).toBe(false);
  });

  it("exports PROJECT_STATUS_VALUES array", async () => {
    const { PROJECT_STATUS_VALUES } = await import("../src/project");

    expect(PROJECT_STATUS_VALUES).toEqual([
      "planning",
      "active",
      "on_hold",
      "completed",
      "archived",
    ]);
  });
});
