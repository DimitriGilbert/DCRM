import { protectedProcedure } from "../../index.js";

export const exportAll = protectedProcedure.query(async ({ ctx }) => {
  const userId = ctx.auth.user.id;
  return {
    exportedAt: new Date().toISOString(),
    userId,
    data: {
      clients: await ctx.crmRepository.clients.list({ userId, includeDeleted: true }),
      leads: await ctx.crmRepository.leads.list({ userId, includeDeleted: true, includeConverted: true }),
      projects: await ctx.crmRepository.projects.list({ userId, includeDeleted: true }),
      tickets: await ctx.crmRepository.tickets.list({ userId, includeDeleted: true }),
      exchanges: await ctx.crmRepository.exchanges.list({ userId, includeDeleted: true }),
      tags: await ctx.crmRepository.tags.list({ userId, includeDeleted: true }),
      notifications: await ctx.crmRepository.notifications.listAll({ userId }),
      events: await ctx.eventService.listForUser(userId),
    },
  };
});
