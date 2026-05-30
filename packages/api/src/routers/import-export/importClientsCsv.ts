import { protectedProcedure } from "../../index.js";
import { parseCsv } from "./csv.js";
import { importClientsCsvSchema } from "./schemas.js";

import type { ClientMutationFields } from "../../crm/types.js";

export const importClientsCsv = protectedProcedure.input(importClientsCsvSchema).mutation(async ({ ctx, input }) => {
  const rows = parseCsv(input.csv);
  const now = new Date();
  let importedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const fields = rowToClientFields(row);
    if (!fields) {
      skippedCount += 1;
      continue;
    }
    const client = await ctx.crmRepository.clients.create({ id: crypto.randomUUID(), userId: ctx.auth.user.id, fields, now });
    importedCount += 1;
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
    payload: { entityType: "client", importedCount, skippedCount, source: "csv" },
    metadata: { source: "csv" },
  });

  return { importedCount, skippedCount };
});

function rowToClientFields(row: Record<string, string>): ClientMutationFields | undefined {
  const name = row.name?.trim();
  if (!name) {
    return undefined;
  }
  return {
    name,
    email: emptyToNull(row.email),
    phone: emptyToNull(row.phone),
    company: emptyToNull(row.company),
    website: emptyToNull(row.website),
    notes: emptyToNull(row.notes),
  };
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
