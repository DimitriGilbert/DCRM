import { z } from "zod";

export const LEAD_STAGES = {
  NEW: "new",
  CONTACTED: "contacted",
  QUALIFIED: "qualified",
  PROPOSAL: "proposal",
  NEGOTIATION: "negotiation",
  WON: "won",
  LOST: "lost",
} as const;

export type LeadStageKey = keyof typeof LEAD_STAGES;

export type LeadStage = (typeof LEAD_STAGES)[LeadStageKey];

export const LEAD_STAGE_VALUES: readonly LeadStage[] = Object.values(LEAD_STAGES);

export const leadStageSchema = z.enum([
  LEAD_STAGES.NEW,
  LEAD_STAGES.CONTACTED,
  LEAD_STAGES.QUALIFIED,
  LEAD_STAGES.PROPOSAL,
  LEAD_STAGES.NEGOTIATION,
  LEAD_STAGES.WON,
  LEAD_STAGES.LOST,
]);
