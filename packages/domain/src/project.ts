import { z } from "zod";

export const PROJECT_STATUSES = {
  PLANNING: "planning",
  ACTIVE: "active",
  ON_HOLD: "on_hold",
  COMPLETED: "completed",
  ARCHIVED: "archived",
} as const;

export type ProjectStatusKey = keyof typeof PROJECT_STATUSES;

export type ProjectStatus = (typeof PROJECT_STATUSES)[ProjectStatusKey];

export const PROJECT_STATUS_VALUES: readonly ProjectStatus[] =
  Object.values(PROJECT_STATUSES);

export const projectStatusSchema = z.enum([
  PROJECT_STATUSES.PLANNING,
  PROJECT_STATUSES.ACTIVE,
  PROJECT_STATUSES.ON_HOLD,
  PROJECT_STATUSES.COMPLETED,
  PROJECT_STATUSES.ARCHIVED,
]);
