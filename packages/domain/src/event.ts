import { z } from "zod";

export const EVENT_SOURCES = {
  APP: "app",
  EMAIL: "email",
  WEBHOOK: "webhook",
  API: "api",
  HOOK: "hook",
  SYSTEM: "system",
} as const;

export type EventSourceKey = keyof typeof EVENT_SOURCES;

export type EventSource = (typeof EVENT_SOURCES)[EventSourceKey];

export const EVENT_SOURCE_VALUES: readonly EventSource[] =
  Object.values(EVENT_SOURCES);

export const eventSourceSchema = z.enum([
  EVENT_SOURCES.APP,
  EVENT_SOURCES.EMAIL,
  EVENT_SOURCES.WEBHOOK,
  EVENT_SOURCES.API,
  EVENT_SOURCES.HOOK,
  EVENT_SOURCES.SYSTEM,
]);
