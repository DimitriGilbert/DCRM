import { protectedProcedure, publicProcedure, router } from "../index";

import { attachmentRouter } from "./attachment";
import { clientRouter } from "./client";
import { entityTagRouter } from "./entity-tag";
import { exchangeRouter } from "./exchange";
import { exportRouter } from "./export";
import { importRouter } from "./import";
import { leadRouter } from "./lead";
import { notificationRouter } from "./notification";
import { projectRouter } from "./project";
import { searchRouter } from "./search";
import { settingsRouter } from "./settings";
import { tagRouter } from "./tag";
import { ticketRouter } from "./ticket";

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
  attachment: attachmentRouter,
  client: clientRouter,
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
});
export type AppRouter = typeof appRouter;
