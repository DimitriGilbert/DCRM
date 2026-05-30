import { z } from "zod";

// --- Exchange Types ---

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

// --- Exchange Directions ---

export const EXCHANGE_DIRECTIONS = {
  INCOMING: "incoming",
  OUTGOING: "outgoing",
} as const;

export type ExchangeDirectionKey = keyof typeof EXCHANGE_DIRECTIONS;

export type ExchangeDirection = (typeof EXCHANGE_DIRECTIONS)[ExchangeDirectionKey];

export const EXCHANGE_DIRECTION_VALUES: readonly ExchangeDirection[] =
  Object.values(EXCHANGE_DIRECTIONS);

export const exchangeDirectionSchema = z.enum([
  EXCHANGE_DIRECTIONS.INCOMING,
  EXCHANGE_DIRECTIONS.OUTGOING,
]);
