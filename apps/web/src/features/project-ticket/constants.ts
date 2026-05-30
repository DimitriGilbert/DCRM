export const WEB_PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "archived"] as const;
export const WEB_TICKET_TYPES = ["task", "issue", "bug", "feature", "question"] as const;
export const WEB_TICKET_STATUSES = ["open", "closed"] as const;
export const WEB_TICKET_PRIORITIES = ["normal", "urgent"] as const;
export const WEB_EXCHANGE_TYPES = ["email", "note", "call", "meeting", "comment"] as const;
export const WEB_EXCHANGE_VISIBILITIES = ["internal", "external"] as const;

export type WebProjectStatus = (typeof WEB_PROJECT_STATUSES)[number];
export type WebTicketType = (typeof WEB_TICKET_TYPES)[number];
export type WebTicketStatus = (typeof WEB_TICKET_STATUSES)[number];
export type WebTicketPriority = (typeof WEB_TICKET_PRIORITIES)[number];
export type WebExchangeType = (typeof WEB_EXCHANGE_TYPES)[number];
export type WebExchangeVisibility = (typeof WEB_EXCHANGE_VISIBILITIES)[number];
