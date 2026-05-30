import { protectedProcedure, publicProcedure, router } from "../index.js";

import { aiRouter } from "./ai/index.js";
import { automationRouter } from "./automation/index.js";
import { attachmentsRouter } from "./attachments/index.js";
import { billingRouter } from "./billing/index.js";
import { clientsRouter } from "./clients/index.js";
import { dashboardRouter } from "./dashboard/index.js";
import { emailRouter } from "./email/index.js";
import { exchangesRouter } from "./exchanges/index.js";
import { importExportRouter } from "./import-export/index.js";
import { leadsRouter } from "./leads/index.js";
import { notificationsRouter } from "./notifications/index.js";
import { projectsRouter } from "./projects/index.js";
import { searchRouter } from "./search/index.js";
import { settingsRouter } from "./settings/index.js";
import { tagsRouter } from "./tags/index.js";
import { ticketsRouter } from "./tickets/index.js";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.auth.user,
    };
  }),
  ai: aiRouter,
  automation: automationRouter,
  clients: clientsRouter,
  leads: leadsRouter,
  projects: projectsRouter,
  tags: tagsRouter,
  tickets: ticketsRouter,
  exchanges: exchangesRouter,
  attachments: attachmentsRouter,
  billing: billingRouter,
  dashboard: dashboardRouter,
  email: emailRouter,
  search: searchRouter,
  importExport: importExportRouter,
  notifications: notificationsRouter,
  settings: settingsRouter,
});
export type AppRouter = typeof appRouter;
