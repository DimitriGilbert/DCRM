import { TRPCError } from "@trpc/server";
import { db } from "@DCRM/db";
import { clients } from "@DCRM/db/schema/crm";
import { eq, and, isNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { removeAuthorizedAddressSchema } from "./schemas";

export const removeAuthorizedAddress = protectedProcedure
  .input(removeAuthorizedAddressSchema)
  .mutation(async ({ ctx, input }) => {
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
      const updated = existing.filter((p) => p !== input.pattern);

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
