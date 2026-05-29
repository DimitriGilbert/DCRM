import { describe, expect, it } from "vitest";

describe("Custom field types", () => {
  it("exports all required custom field types from PRD", async () => {
    const { CUSTOM_FIELD_TYPES } = await import("../src/custom-field");

    expect(CUSTOM_FIELD_TYPES).toEqual({
      TEXT: "text",
      NUMBER: "number",
      DATE: "date",
      SELECT: "select",
      CHECKBOX: "checkbox",
      TEXTAREA: "textarea",
      URL: "url",
    });
  });

  it("validates correct custom field types via schema", async () => {
    const { CUSTOM_FIELD_TYPES, customFieldTypeSchema } = await import("../src/custom-field");

    for (const type of Object.values(CUSTOM_FIELD_TYPES)) {
      expect(customFieldTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects invalid custom field type values", async () => {
    const { customFieldTypeSchema } = await import("../src/custom-field");

    expect(customFieldTypeSchema.safeParse("file").success).toBe(false);
  });

  it("exports CUSTOM_FIELD_TYPE_VALUES array", async () => {
    const { CUSTOM_FIELD_TYPE_VALUES } = await import("../src/custom-field");

    expect(CUSTOM_FIELD_TYPE_VALUES).toEqual([
      "text",
      "number",
      "date",
      "select",
      "checkbox",
      "textarea",
      "url",
    ]);
  });
});
