import { db } from "@DCRM/db";
import {
  clients,
  leads,
  projects,
  tickets,
  exchanges,
  tags,
  entityTags,
  attachments,
  userSettings,
} from "@DCRM/db/schema/crm";
import {
  events,
  hooks,
  hookExecutions,
  aiProviders,
  aiInsights,
  notifications,
} from "@DCRM/db/schema/automation";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { fullDataExportSchema } from "./schemas";

export const fullDataExport = protectedProcedure
  .input(fullDataExportSchema)
  .query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const [
      clientsData,
      leadsData,
      projectsData,
      ticketsData,
      exchangesData,
      tagsData,
      entityTagsData,
      attachmentsData,
      userSettingsData,
      eventsData,
      hooksData,
      hookExecutionsData,
      aiProvidersData,
      aiInsightsData,
      notificationsData,
    ] = await Promise.all([
      db.select().from(clients).where(eq(clients.userId, userId)),
      db.select().from(leads).where(eq(leads.userId, userId)),
      db.select().from(projects).where(eq(projects.userId, userId)),
      db.select().from(tickets).where(eq(tickets.userId, userId)),
      db.select().from(exchanges).where(eq(exchanges.userId, userId)),
      db.select().from(tags).where(eq(tags.userId, userId)),
      db.select().from(entityTags).where(eq(entityTags.tagId, userId)).catch(() => []),
      db.select().from(attachments).where(eq(attachments.userId, userId)),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)).catch(() => []),
      db.select().from(events).where(eq(events.userId, userId)),
      db.select().from(hooks).where(eq(hooks.userId, userId)),
      db.select().from(hookExecutions).where(eq(hookExecutions.userId, userId)),
      db.select().from(aiProviders).where(eq(aiProviders.userId, userId)),
      db.select().from(aiInsights).where(eq(aiInsights.userId, userId)),
      db.select().from(notifications).where(eq(notifications.userId, userId)),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      data: {
        clients: clientsData,
        leads: leadsData,
        projects: projectsData,
        tickets: ticketsData,
        exchanges: exchangesData,
        tags: tagsData,
        entityTags: entityTagsData,
        attachments: attachmentsData,
        userSettings: userSettingsData,
        events: eventsData,
        hooks: hooksData,
        hookExecutions: hookExecutionsData,
        aiProviders: aiProvidersData,
        aiInsights: aiInsightsData,
        notifications: notificationsData,
      },
    };
  });
