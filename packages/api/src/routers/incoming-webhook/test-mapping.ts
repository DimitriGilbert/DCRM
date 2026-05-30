import { TRPCError } from "@trpc/server";
import { mapPayload, validateMappingConfig, type MappingConfig } from "@DCRM/webhooks";

import { db } from "@DCRM/db";
import { incomingWebhooks } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { testMappingSchema } from "./schemas";

export const testMapping = protectedProcedure
  .input(testMappingSchema)
  .mutation(async ({ ctx, input }) => {
    const [row] = await db
      .select({
        id: incomingWebhooks.id,
        mappingConfig: incomingWebhooks.mappingConfig,
      })
      .from(incomingWebhooks)
      .where(
        and(
          eq(incomingWebhooks.id, input.id),
          eq(incomingWebhooks.userId, ctx.user.id),
        ),
      );

    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Incoming webhook not found" });
    }

    if (!row.mappingConfig) {
      return {
        success: false,
        errors: ["No mapping configuration defined"],
        payload: {},
        mappingErrors: [],
      };
    }

    // Validate the config structure
    const configErrors = validateMappingConfig(row.mappingConfig);
    if (configErrors.length > 0) {
      return {
        success: false,
        errors: configErrors,
        payload: {},
        mappingErrors: [],
      };
    }

    const config = row.mappingConfig as MappingConfig;
    const result = mapPayload(input.samplePayload, config);

    return {
      success: result.success,
      errors: [],
      payload: result.payload,
      mappingErrors: result.errors,
      eventType: config.eventType,
    };
  });
