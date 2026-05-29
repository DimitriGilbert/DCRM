/**
 * Event source values matching the DB enum.
 */
export type EventSource = "app" | "email" | "webhook" | "api" | "hook" | "system";

/**
 * All typed event type constants for the DCRM event engine.
 */
export const EVENT_TYPE = {
  // Client lifecycle
  CLIENT_CREATED: "client.created",
  CLIENT_UPDATED: "client.updated",
  CLIENT_DELETED: "client.deleted",
  CLIENT_RESTORED: "client.restored",

  // Lead lifecycle
  LEAD_CREATED: "lead.created",
  LEAD_UPDATED: "lead.updated",
  LEAD_DELETED: "lead.deleted",
  LEAD_RESTORED: "lead.restored",
  LEAD_STAGE_CHANGED: "lead.stage_changed",
  LEAD_CONVERTED: "lead.converted",

  // Project lifecycle
  PROJECT_CREATED: "project.created",
  PROJECT_UPDATED: "project.updated",
  PROJECT_DELETED: "project.deleted",
  PROJECT_RESTORED: "project.restored",
  PROJECT_STATUS_CHANGED: "project.status_changed",

  // Ticket lifecycle
  TICKET_CREATED: "ticket.created",
  TICKET_UPDATED: "ticket.updated",
  TICKET_DELETED: "ticket.deleted",
  TICKET_RESTORED: "ticket.restored",
  TICKET_STATUS_CHANGED: "ticket.status_changed",
  TICKET_COMMENT_ADDED: "ticket.comment_added",

  // Exchange lifecycle
  EXCHANGE_CREATED: "exchange.created",
  EXCHANGE_UPDATED: "exchange.updated",
  EXCHANGE_DELETED: "exchange.deleted",

  // File events
  FILE_ATTACHED: "file.attached",
  FILE_DETACHED: "file.detached",

  // Import
  IMPORT_COMPLETED: "import.completed",

  // Webhook
  WEBHOOK_RECEIVED: "webhook.received",

  // Email
  EMAIL_SYNCED: "email.synced",
  EMAIL_SENT: "email.sent",

  // System
  SYSTEM_EVENT: "system.event",
} as const;

export type EventType = (typeof EVENT_TYPE)[keyof typeof EVENT_TYPE];
