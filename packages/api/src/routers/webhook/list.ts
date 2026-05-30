import { db } from "@DCRM/db";
import { hooks } from "@DCRM/db/schema/automation";
import { HOOK_TYPES } from "@DCRM/domain";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";

export const listOutgoingWebhooks = protectedProcedure.query(async ({ ctx }) => {
  const rows = await db
    .select({
      id: hooks.id,
      name: hooks.name,
      type: hooks.type,
      eventType: hooks.eventType,
      enabled: hooks.enabled,
      config: hooks.config,
      createdAt: hooks.createdAt,
      updatedAt: hooks.updatedAt,
    })
    .from(hooks)
    .where(and(eq(hooks.userId, ctx.user.id), eq(hooks.type, HOOK_TYPES.OUTGOING_WEBHOOK)));

  return rows.map((row) => {
    const config = row.config as Record<string, unknown>;
    const auth = config["auth"] as Record<string, unknown> | undefined;
    return {
      id: row.id,
      name: row.name,
      eventType: row.eventType,
      enabled: row.enabled,
      url: config["url"] as string,
      method: (config["method"] as string) ?? "POST",
      authMode: (auth?.["mode"] as string) ?? "none",
      headers: (config["headers"] as Record<string, string>) ?? {},
      timeoutMs: (config["timeoutMs"] as number) ?? 10_000,
      maxRetries: (config["maxRetries"] as number) ?? 3,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
});
