import type { AppRouter } from "@DCRM/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type ClientOptionRecord = RouterOutputs["clients"]["list"][number];
export type ProjectRecord = RouterOutputs["projects"]["get"];
export type ProjectListRecord = RouterOutputs["projects"]["list"][number];
export type TicketRecord = RouterOutputs["tickets"]["get"];
export type TicketListRecord = RouterOutputs["tickets"]["list"][number];
export type ExchangeTimelineRecord = RouterOutputs["exchanges"]["timeline"][number];
