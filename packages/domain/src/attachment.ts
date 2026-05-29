import { z } from "zod";

export const ATTACHMENT_ENTITY_TYPES = {
  CLIENT: "client",
  LEAD: "lead",
  PROJECT: "project",
  TICKET: "ticket",
  EXCHANGE: "exchange",
} as const;

export type AttachmentEntityTypeKey = keyof typeof ATTACHMENT_ENTITY_TYPES;

export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[AttachmentEntityTypeKey];

export const ATTACHMENT_ENTITY_TYPE_VALUES: readonly AttachmentEntityType[] =
  Object.values(ATTACHMENT_ENTITY_TYPES);

export const attachmentEntityTypeSchema = z.enum([
  ATTACHMENT_ENTITY_TYPES.CLIENT,
  ATTACHMENT_ENTITY_TYPES.LEAD,
  ATTACHMENT_ENTITY_TYPES.PROJECT,
  ATTACHMENT_ENTITY_TYPES.TICKET,
  ATTACHMENT_ENTITY_TYPES.EXCHANGE,
]);
