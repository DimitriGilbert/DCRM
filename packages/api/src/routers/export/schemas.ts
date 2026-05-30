import { z } from "zod";

export const entityTypeSchema = z.enum([
  "clients",
  "leads",
  "projects",
  "tickets",
  "exchanges",
  "tags",
]);

export type EntityType = z.infer<typeof entityTypeSchema>;

export const exportFormatSchema = z.enum(["csv", "json"]);

export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const exportListSchema = z.object({
  entityType: entityTypeSchema,
  format: exportFormatSchema.default("csv"),
  includeDeleted: z.boolean().default(false),
});

export type ExportListInput = z.infer<typeof exportListSchema>;

export const fullDataExportSchema = z.object({
  format: z.literal("json").default("json"),
});

export type FullDataExportInput = z.infer<typeof fullDataExportSchema>;
