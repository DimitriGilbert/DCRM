import { db } from "@DCRM/db";
import { clients } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import {
  importClientsSchema,
  IMPORTABLE_CLIENT_FIELDS,
} from "./schemas";
import { parseCsv } from "./parse-csv";

import type { ImportClientsResponse, ColumnMapping } from "./schemas";

function mapRowToClient(
  row: string[],
  mappings: ColumnMapping[],
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const mapping of mappings) {
    const value = row[mapping.columnIndex];
    if (value !== undefined && value.length > 0) {
      result[mapping.field] = value;
    }
  }

  return result;
}

export const importClients = protectedProcedure
  .input(importClientsSchema)
  .mutation(async ({ ctx, input }): Promise<ImportClientsResponse> => {
    const rows = parseCsv(input.csvData, input.hasHeader);

    const response: ImportClientsResponse = {
      totalRows: rows.length,
      created: 0,
      skipped: 0,
      errors: [],
    };

    const validFields = new Set<string>(IMPORTABLE_CLIENT_FIELDS);
    for (const mapping of input.columnMappings) {
      if (!validFields.has(mapping.field)) {
        response.errors.push({
          row: -1,
          message: `Invalid field mapping: "${mapping.field}" is not an importable client field`,
        });
        return response;
      }
    }

    await db.transaction(async (tx) => {
      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        if (!row) continue;

        const mapped = mapRowToClient(row, input.columnMappings);

        if (!mapped.name || mapped.name.trim().length === 0) {
          response.skipped++;
          response.errors.push({
            row: rowIdx,
            message: `Row ${rowIdx + 1}: missing required field "name"`,
          });
          continue;
        }

        const id = nanoid();
        const now = new Date();

        const clientRow = {
          id,
          userId: ctx.user.id,
          name: mapped.name.trim(),
          email: mapped.email?.trim() ?? null,
          phone: mapped.phone?.trim() ?? null,
          company: mapped.company?.trim() ?? null,
          website: mapped.website?.trim() ?? null,
          notes: mapped.notes?.trim() ?? null,
          socialLinks: null,
          address: null,
          customFields: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };

        await tx.insert(clients).values(clientRow);
        response.created++;

        await emitEvent(
          { insert: async () => {} },
          {
            type: EVENT_TYPE.CLIENT_CREATED,
            userId: ctx.user.id,
            source: "app",
            entity: { type: "client", id },
            payload: { name: clientRow.name, email: clientRow.email, source: "import" },
          },
        );
      }
    });

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.IMPORT_COMPLETED,
        userId: ctx.user.id,
        source: "app",
        payload: {
          entityType: "client",
          totalRows: response.totalRows,
          created: response.created,
          skipped: response.skipped,
          errorCount: response.errors.length,
        },
      },
    );

    return response;
  });
