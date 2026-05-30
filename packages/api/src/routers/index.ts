import { protectedProcedure, publicProcedure, router } from "../index.js";

import { clientsRouter } from "./clients/index.js";
import { exchangesRouter } from "./exchanges/index.js";
import { leadsRouter } from "./leads/index.js";
import { projectsRouter } from "./projects/index.js";
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
  clients: clientsRouter,
  leads: leadsRouter,
  projects: projectsRouter,
  tags: tagsRouter,
  tickets: ticketsRouter,
  exchanges: exchangesRouter,
});
export type AppRouter = typeof appRouter;
