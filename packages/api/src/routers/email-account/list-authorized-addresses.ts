import { db } from "@DCRM/db";
import { clients } from "@DCRM/db/schema/crm";
import { eq, and, isNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { emailAccountIdSchema } from "./schemas";

export const listAuthorizedAddresses = protectedProcedure
  .input(emailAccountIdSchema)
  .query(async ({ ctx, input }) => {
    const [client] = await db
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        authorizedAddresses: clients.authorizedAddresses,
      })
      .from(clients)
      .where(
        and(
          eq(clients.id, input.id),
          eq(clients.userId, ctx.user.id),
          isNull(clients.deletedAt),
        ),
      )
      .limit(1);

    if (!client) {
      return null;
    }

    return {
      clientId: client.id,
      clientName: client.name,
      clientEmail: client.email,
      authorizedAddresses: client.authorizedAddresses ?? [],
    };
  });
