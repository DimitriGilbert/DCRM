import { protectedProcedure, publicProcedure, router } from "../index";

import { clientRouter } from "./client";
import { entityTagRouter } from "./entity-tag";
import { exchangeRouter } from "./exchange";
import { leadRouter } from "./lead";
import { projectRouter } from "./project";
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
  client: clientRouter,
  lead: leadRouter,
  project: projectRouter,
  tag: tagRouter,
  entityTag: entityTagRouter,
  ticket: ticketRouter,
  exchange: exchangeRouter,
});
export type AppRouter = typeof appRouter;
