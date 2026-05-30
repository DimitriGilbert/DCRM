import { protectedProcedure, publicProcedure, router } from "../index";

import { aiChatRouter } from "./ai-chat";
import { aiProviderRouter } from "./ai-provider";
import { attachmentRouter } from "./attachment";
import { clientRouter } from "./client";
import { entityTagRouter } from "./entity-tag";
import { exchangeRouter } from "./exchange";
import { exportRouter } from "./export";
import { hookRouter } from "./hook";
import { importRouter } from "./import";
import { leadRouter } from "./lead";
import { notificationRouter } from "./notification";
import { projectRouter } from "./project";
import { searchRouter } from "./search";
import { settingsRouter } from "./settings";
import { tagRouter } from "./tag";
import { ticketRouter } from "./ticket";
import { incomingWebhookRouter } from "./incoming-webhook";
import { emailAccountRouter } from "./email-account";
import { billingRouter } from "./billing";
import { webhookRouter } from "./webhook";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.user,
    };
  }),
  aiProvider: aiProviderRouter,
  aiChat: aiChatRouter,
  attachment: attachmentRouter,
  client: clientRouter,
  hook: hookRouter,
  lead: leadRouter,
  project: projectRouter,
  tag: tagRouter,
  entityTag: entityTagRouter,
  ticket: ticketRouter,
  exchange: exchangeRouter,
  search: searchRouter,
  import: importRouter,
  export: exportRouter,
  notification: notificationRouter,
  settings: settingsRouter,
  webhook: webhookRouter,
  incomingWebhook: incomingWebhookRouter,
  emailAccount: emailAccountRouter,
  billing: billingRouter,
});
export type AppRouter = typeof appRouter;
