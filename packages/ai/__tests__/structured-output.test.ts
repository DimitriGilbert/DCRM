import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  validateStructuredOutput,
  safeValidateStructuredOutput,
  buildStructuredOutputConfig,
} from "../src/structured-output";

describe("structured output validation", () => {
  const contactSchema = z.object({
    name: z.string(),
    email: z.string(),
    company: z.string().optional(),
  });

  describe("validateStructuredOutput", () => {
    it("validates and returns parsed data for valid input", () => {
      const input = { name: "Jane", email: "jane@example.com", company: "Acme" };
      const result = validateStructuredOutput(input, contactSchema);

      expect(result).toEqual(input);
    });

    it("strips unknown fields", () => {
      const input = {
        name: "Jane",
        email: "jane@example.com",
        extra: "ignored",
      };
      const result = validateStructuredOutput(input, contactSchema);

      expect(result).toEqual({ name: "Jane", email: "jane@example.com" });
    });

    it("throws ZodError for invalid input", () => {
      const input = { name: 123, email: "jane@example.com" };

      expect(() => validateStructuredOutput(input, contactSchema)).toThrow();
    });

    it("validates nested objects", () => {
      const nestedSchema = z.object({
        user: z.object({
          name: z.string(),
          address: z.object({
            city: z.string(),
            zip: z.string(),
          }),
        }),
      });

      const input = {
        user: {
          name: "Jane",
          address: { city: "NYC", zip: "10001" },
        },
      };

      const result = validateStructuredOutput(input, nestedSchema);
      expect(result).toEqual(input);
    });

    it("validates arrays", () => {
      const listSchema = z.object({
        items: z.array(z.string()),
      });

      const input = { items: ["a", "b", "c"] };
      const result = validateStructuredOutput(input, listSchema);
      expect(result).toEqual(input);
    });

    it("validates enums", () => {
      const enumSchema = z.object({
        status: z.enum(["active", "inactive"]),
      });

      expect(validateStructuredOutput({ status: "active" }, enumSchema)).toEqual({
        status: "active",
      });
      expect(() =>
        validateStructuredOutput({ status: "unknown" }, enumSchema),
      ).toThrow();
    });
  });

  describe("safeValidateStructuredOutput", () => {
    it("returns success result for valid input", () => {
      const input = { name: "Jane", email: "jane@example.com" };
      const result = safeValidateStructuredOutput(input, contactSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    it("returns error result for invalid input", () => {
      const input = { name: 123 };
      const result = safeValidateStructuredOutput(input, contactSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe("buildStructuredOutputConfig", () => {
    it("produces a JSON schema and validate function", () => {
      const config = buildStructuredOutputConfig(contactSchema, "A contact");

      expect(config.schema).toBeDefined();
      expect(typeof config.schema).toBe("object");
      expect(config.validate).toBeInstanceOf(Function);
    });

    it("validate function works correctly", () => {
      const config = buildStructuredOutputConfig(contactSchema);
      const input = { name: "Jane", email: "jane@example.com" };

      const result = config.validate(input);
      expect(result).toEqual(input);
    });

    it("validate function rejects invalid data", () => {
      const config = buildStructuredOutputConfig(contactSchema);

      expect(() => config.validate({ name: 123 })).toThrow();
    });
  });
});
