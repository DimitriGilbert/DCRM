import { z } from "zod";

export const IMPORT_CLIENTS_CSV_MAX_BYTES = 512 * 1024;
export const IMPORT_CLIENTS_CSV_MAX_ROWS = 1_000;

export const importClientsCsvSchema = z.object({
  csv: z.string().min(1).refine((value) => new TextEncoder().encode(value).byteLength <= IMPORT_CLIENTS_CSV_MAX_BYTES, { message: "CSV import exceeds the maximum payload size." }),
});

export const exportEntitySchema = z.enum(["clients", "leads", "projects", "tickets", "exchanges"]);
export const exportFormatSchema = z.enum(["csv", "json"]);

export const exportListSchema = z.object({
  entity: exportEntitySchema,
  format: exportFormatSchema,
});

export type ExportEntity = z.infer<typeof exportEntitySchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
