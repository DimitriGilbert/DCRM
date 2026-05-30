import { TRPCError } from "@trpc/server";

import { protectedProcedure } from "../../index.js";
import { normalizeCreateClientFields } from "../clients/helpers.js";
import { clientFieldsSchema } from "../clients/schemas.js";
import { CsvRowLimitError, parseCsv } from "./csv.js";
import { IMPORT_CLIENTS_CSV_MAX_ROWS, importClientsCsvSchema } from "./schemas.js";

import type { ClientMutationFields, ClientRecord } from "../../crm/types.js";

export const importClientsCsv = protectedProcedure.input(importClientsCsvSchema).mutation(async ({ ctx, input }) => {
  const rows = parseCsvForImport(input.csv);
  const fieldsList = rows.map(rowToClientFields);
  const importId = crypto.randomUUID();
  const now = new Date();
  let importedCount = 0;
  const createdClients: ClientRecord[] = [];
  const rowResults: ImportClientCsvRowResult[] = [];

  for (const [index, fields] of fieldsList.entries()) {
    try {
      const client = await ctx.crmRepository.clients.create({ id: crypto.randomUUID(), userId: ctx.auth.user.id, fields, now });
      importedCount += 1;
      createdClients.push(client);
      rowResults.push({ rowNumber: index + 1, status: "imported", clientId: client.id });
    } catch (error) {
      const failedRowNumber = index + 1;
      rowResults.push({ rowNumber: failedRowNumber, status: "failed" });
      await ctx.eventService.emitApi({
        type: "import.import_failed",
        userId: ctx.auth.user.id,
        entity: { type: "import", id: importId },
        payload: { entityType: "client", importedCount, skippedCount: 0, failedRowNumber, source: "csv", rowResults },
        metadata: { source: "csv", failureMode: "partial_persistence" },
      });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Client CSV import failed during persistence. Some rows may have been imported; review the import failure event for row-level completion state.", cause: error });
    }
  }

  for (const client of createdClients) {
    await ctx.eventService.emitApi({
      type: "client.created",
      userId: ctx.auth.user.id,
      entity: { type: "client", id: client.id },
      payload: { id: client.id, name: client.name, importSource: "csv" },
      changes: { after: { name: client.name, email: client.email, company: client.company } },
      metadata: { importSource: "csv" },
    });
  }

  await ctx.eventService.emitApi({
    type: "import.import_completed",
    userId: ctx.auth.user.id,
    entity: { type: "import", id: importId },
    payload: { entityType: "client", importedCount, skippedCount: 0, source: "csv" },
    metadata: { source: "csv" },
  });

  return { importedCount, skippedCount: 0 };
});

function parseCsvForImport(input: string) {
  try {
    return parseCsv(input, { maxRows: IMPORT_CLIENTS_CSV_MAX_ROWS });
  } catch (error) {
    if (error instanceof CsvRowLimitError) {
      throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: error.message });
    }
    throw error;
  }
}

function rowToClientFields(row: Record<string, string>): ClientMutationFields {
  const parsed = clientFieldsSchema.safeParse({
    name: row.name,
    email: emptyToNull(row.email),
    phone: emptyToNull(row.phone),
    company: emptyToNull(row.company),
    website: emptyToNull(row.website),
    notes: emptyToNull(row.notes),
  });
  if (!parsed.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid client CSV row: ${parsed.error.issues.map((issue) => issue.message).join("; ")}` });
  }
  return normalizeCreateClientFields(parsed.data);
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

type ImportClientCsvRowResult =
  | { readonly rowNumber: number; readonly status: "imported"; readonly clientId: string }
  | { readonly rowNumber: number; readonly status: "failed" };
