import { TRPCError } from "@trpc/server";
import { db } from "@DCRM/db";
import { clients } from "@DCRM/db/schema/crm";
import { isValidPattern } from "@DCRM/email";
import { eq, and, isNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { addAuthorizedAddressSchema } from "./schemas";

export const addAuthorizedAddress = protectedProcedure
  .input(addAuthorizedAddressSchema)
  .mutation(async ({ ctx, input }) => {
    // Validate patterns
    for (const pattern of input.patterns) {
      if (!isValidPattern(pattern)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid authorized address pattern: "${pattern}". Use exact email or *@domain.com format.`,
        });
      }
    }

    const result = await db.transaction(async (tx) => {
      // Fetch current client with row lock
      const [client] = await tx
        .select({
          id: clients.id,
          authorizedAddresses: clients.authorizedAddresses,
        })
        .from(clients)
        .where(
          and(
            eq(clients.id, input.clientId),
            eq(clients.userId, ctx.user.id),
            isNull(clients.deletedAt),
          ),
        )
        .limit(1)
        .for("update");

      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      }

      const existing = client.authorizedAddresses ?? [];
      const newPatterns = input.patterns.filter((p) => !existing.includes(p));

      if (newPatterns.length === 0) {
        return { clientId: input.clientId, authorizedAddresses: existing };
      }

      const updated = [...existing, ...newPatterns];

      await tx
        .update(clients)
        .set({
          authorizedAddresses: updated,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, input.clientId));

      return { clientId: input.clientId, authorizedAddresses: updated };
    });

    return result;
  });
