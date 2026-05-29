import { z } from "zod";

export const EXCHANGE_TYPES = {
  EMAIL: "email",
  NOTE: "note",
  CALL: "call",
  MEETING: "meeting",
  COMMENT: "comment",
} as const;

export type ExchangeTypeKey = keyof typeof EXCHANGE_TYPES;

export type ExchangeType = (typeof EXCHANGE_TYPES)[ExchangeTypeKey];

export const EXCHANGE_TYPE_VALUES: readonly ExchangeType[] =
  Object.values(EXCHANGE_TYPES);

export const exchangeTypeSchema = z.enum([
  EXCHANGE_TYPES.EMAIL,
  EXCHANGE_TYPES.NOTE,
  EXCHANGE_TYPES.CALL,
  EXCHANGE_TYPES.MEETING,
  EXCHANGE_TYPES.COMMENT,
]);
