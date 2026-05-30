import { z } from "zod";

export const importClientsCsvSchema = z.object({
  csv: z.string().min(1),
});

export const exportEntitySchema = z.enum(["clients", "leads", "projects", "tickets", "exchanges"]);
export const exportFormatSchema = z.enum(["csv", "json"]);

export const exportListSchema = z.object({
  entity: exportEntitySchema,
  format: exportFormatSchema,
});

export type ExportEntity = z.infer<typeof exportEntitySchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
