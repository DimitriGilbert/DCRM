import { protectedProcedure } from "../../index.js";
import { stringifyCsv } from "./csv.js";
import { exportListSchema } from "./schemas.js";

import type { CrmRepository } from "../../crm/repository.js";
import type { ExportEntity, ExportFormat } from "./schemas.js";

export const exportList = protectedProcedure.input(exportListSchema).query(async ({ ctx, input }) => {
  const records = await listExportRecords(ctx.auth.user.id, input.entity, ctx.crmRepository);
  const content = input.format === "json" ? stringifyJson(records) : stringifyCsv(records);
  return {
    entity: input.entity,
    format: input.format,
    rowCount: records.length,
    content,
    contentType: contentType(input.format),
    filename: `${input.entity}.${input.format}`,
  };
});

async function listExportRecords(userId: string, entity: ExportEntity, repository: CrmRepository): Promise<readonly Record<string, unknown>[]> {
  switch (entity) {
    case "clients":
      return repository.clients.list({ userId, includeDeleted: true });
    case "leads":
      return repository.leads.list({ userId, includeDeleted: true, includeConverted: true });
    case "projects":
      return repository.projects.list({ userId, includeDeleted: true });
    case "tickets":
      return repository.tickets.list({ userId, includeDeleted: true });
    case "exchanges":
      return repository.exchanges.list({ userId, includeDeleted: true });
  }
}

function stringifyJson(records: readonly Record<string, unknown>[]): string {
  return JSON.stringify(records, dateReplacer, 2);
}

function dateReplacer(_key: string, value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function contentType(format: ExportFormat): string {
  return format === "json" ? "application/json" : "text/csv";
}
