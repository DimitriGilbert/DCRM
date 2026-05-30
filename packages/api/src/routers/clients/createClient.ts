import { protectedProcedure } from "../../index.js";
import { normalizeCreateClientFields } from "./helpers.js";
import { clientFieldsSchema } from "./schemas.js";

export const createClient = protectedProcedure.input(clientFieldsSchema).mutation(async ({ ctx, input }) => {
  const now = new Date();
  const client = await ctx.crmRepository.clients.create({
    id: crypto.randomUUID(),
    userId: ctx.auth.user.id,
    fields: normalizeCreateClientFields(input),
    now,
  });
  await ctx.eventService.emitApi({
    type: "client.created",
    userId: ctx.auth.user.id,
    entity: { type: "client", id: client.id },
    payload: { id: client.id, name: client.name },
    changes: { after: { name: client.name, email: client.email, company: client.company } },
  });
  return client;
});
