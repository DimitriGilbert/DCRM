import type { AppRouter } from "@DCRM/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type ClientRecord = RouterOutputs["clients"]["get"];
export type ClientListRecord = RouterOutputs["clients"]["list"][number];
export type LeadRecord = RouterOutputs["leads"]["get"];
export type LeadListRecord = RouterOutputs["leads"]["list"][number];
export type LeadPipelineStage = RouterOutputs["leads"]["pipeline"][number];
export type TagRecord = RouterOutputs["tags"]["list"][number];
export type EntityTagRecord = RouterOutputs["tags"]["listEntity"][number];
