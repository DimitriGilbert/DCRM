import { z } from "zod";

/**
 * Maps a CSV column header to a client field.
 * `field` is the target client field name.
 * `columnIndex` is the 0-based position in the CSV header row.
 */
export const columnMappingSchema = z.object({
  field: z.string().min(1),
  columnIndex: z.number().int().min(0),
});

export type ColumnMapping = z.infer<typeof columnMappingSchema>;

export const importClientsSchema = z.object({
  csvData: z.string().min(1).max(5_000_000),
  columnMappings: z.array(columnMappingSchema).min(1),
  hasHeader: z.boolean().default(true),
});

export type ImportClientsInput = z.infer<typeof importClientsSchema>;

/**
 * Valid client fields that can be mapped from CSV columns.
 */
export const IMPORTABLE_CLIENT_FIELDS = [
  "name",
  "email",
  "phone",
  "company",
  "website",
  "notes",
] as const;

export type ImportableClientField = (typeof IMPORTABLE_CLIENT_FIELDS)[number];

export const importableClientFieldSchema = z.enum(IMPORTABLE_CLIENT_FIELDS);

export const importClientsResponseSchema = z.object({
  totalRows: z.number().int().min(0),
  created: z.number().int().min(0),
  skipped: z.number().int().min(0),
  errors: z.array(
    z.object({
      row: z.number().int().min(0),
      message: z.string().min(1),
    }),
  ),
});

export type ImportClientsResponse = z.infer<typeof importClientsResponseSchema>;
