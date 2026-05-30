export const WEB_LEAD_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;

export type WebLeadStage = (typeof WEB_LEAD_STAGES)[number];
