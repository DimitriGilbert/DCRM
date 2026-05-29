import { z } from "zod";

// --- Ticket Types ---

export const TICKET_TYPES = {
  TASK: "task",
  BUG: "bug",
  FEATURE: "feature",
  QUESTION: "question",
} as const;

export type TicketTypeKey = keyof typeof TICKET_TYPES;

export type TicketType = (typeof TICKET_TYPES)[TicketTypeKey];

export const TICKET_TYPE_VALUES: readonly TicketType[] =
  Object.values(TICKET_TYPES);

export const ticketTypeSchema = z.enum([
  TICKET_TYPES.TASK,
  TICKET_TYPES.BUG,
  TICKET_TYPES.FEATURE,
  TICKET_TYPES.QUESTION,
]);

// --- Ticket Statuses ---

export const TICKET_STATUSES = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
} as const;

export type TicketStatusKey = keyof typeof TICKET_STATUSES;

export type TicketStatus = (typeof TICKET_STATUSES)[TicketStatusKey];

export const TICKET_STATUS_VALUES: readonly TicketStatus[] =
  Object.values(TICKET_STATUSES);

export const ticketStatusSchema = z.enum([
  TICKET_STATUSES.OPEN,
  TICKET_STATUSES.IN_PROGRESS,
  TICKET_STATUSES.RESOLVED,
  TICKET_STATUSES.CLOSED,
]);

// --- Ticket Priorities ---

export const TICKET_PRIORITIES = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export type TicketPriorityKey = keyof typeof TICKET_PRIORITIES;

export type TicketPriority = (typeof TICKET_PRIORITIES)[TicketPriorityKey];

export const TICKET_PRIORITY_VALUES: readonly TicketPriority[] =
  Object.values(TICKET_PRIORITIES);

export const ticketPrioritySchema = z.enum([
  TICKET_PRIORITIES.LOW,
  TICKET_PRIORITIES.MEDIUM,
  TICKET_PRIORITIES.HIGH,
  TICKET_PRIORITIES.URGENT,
]);
