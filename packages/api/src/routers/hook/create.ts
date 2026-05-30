import { db } from "@DCRM/db";
import { hooks } from "@DCRM/db/schema/automation";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { createHookSchema } from "./schemas";

export const createHook = protectedProcedure
  .input(createHookSchema)
  .mutation(async ({ ctx, input }) => {
    const id = nanoid();
    const now = new Date();

    const fieldMapping = input.fieldMapping ?? null;
    const outputSchema = input.outputSchema ?? null;

    await db.insert(hooks).values({
      id,
      userId: ctx.user.id,
      name: input.name,
      type: input.type,
      eventType: input.eventType,
      enabled: input.enabled,
      config: input.config,
      outputSchema,
      fieldMapping,
      writeBehavior: input.writeBehavior,
      emitDownstreamEvents: input.emitDownstreamEvents,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      name: input.name,
      type: input.type,
      eventType: input.eventType,
      enabled: input.enabled,
      config: input.config,
      outputSchema,
      fieldMapping,
      writeBehavior: input.writeBehavior,
      emitDownstreamEvents: input.emitDownstreamEvents,
      createdAt: now,
      updatedAt: now,
    };
  });
