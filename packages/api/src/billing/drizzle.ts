import { createDb } from "@DCRM/db";
import { billingSubscriptions } from "@DCRM/db/schema/automation-integrations";
import { eq } from "drizzle-orm";

import type { BillingRepository } from "./repository.js";
import type { SubscriptionRecord, SubscriptionStatus } from "./types.js";

type BillingDatabase = ReturnType<typeof createDb>;
type BillingSubscriptionRow = typeof billingSubscriptions.$inferSelect;
type BillingSubscriptionMetadata = {
  readonly stripePriceId?: string;
  readonly stripeStatus?: SubscriptionStatus;
  readonly cancelAt?: string | null;
  readonly canceledAt?: string | null;
};

export function createDrizzleBillingRepository(database: BillingDatabase = createDb()): BillingRepository {
  return {
    async getByUserId(input) {
      const rows = await database.select().from(billingSubscriptions).where(eq(billingSubscriptions.userId, input.userId)).limit(1);
      return rows[0] ? rowToSubscription(rows[0]) : undefined;
    },
    async getByStripeCustomerId(input) {
      const rows = await database.select().from(billingSubscriptions).where(eq(billingSubscriptions.stripeCustomerId, input.stripeCustomerId)).limit(1);
      return rows[0] ? rowToSubscription(rows[0]) : undefined;
    },
    async upsertForUser(input) {
      const existingRows = await database.select().from(billingSubscriptions).where(eq(billingSubscriptions.userId, input.userId)).limit(1);
      const existing = existingRows[0] ? rowToSubscription(existingRows[0]) : undefined;
      const stripePriceId = input.stripePriceId === undefined ? existing?.stripePriceId ?? null : input.stripePriceId;
      const status = input.status ?? existing?.status ?? "unknown";
      const currentPeriodEnd = input.currentPeriodEnd === undefined ? existing?.currentPeriodEnd ?? null : input.currentPeriodEnd;
      const cancelAt = input.cancelAt === undefined ? existing?.cancelAt ?? null : input.cancelAt;
      const canceledAt = input.canceledAt === undefined ? existing?.canceledAt ?? null : input.canceledAt;
      const metadata = createBillingMetadata({ stripePriceId, status, cancelAt, canceledAt });
      const stripeSubscriptionId = input.stripeSubscriptionId === undefined ? existing?.stripeSubscriptionId ?? null : input.stripeSubscriptionId;
      const rows = await database
        .insert(billingSubscriptions)
        .values({
          id: existing?.id ?? input.id,
          userId: input.userId,
          stripeCustomerId: input.stripeCustomerId === undefined ? existing?.stripeCustomerId ?? null : input.stripeCustomerId,
          stripeSubscriptionId,
          status: toBillingSubscriptionStatus(status),
          currentPeriodEnd,
          metadata,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoUpdate({
          target: billingSubscriptions.userId,
          set: {
            stripeCustomerId: input.stripeCustomerId === undefined ? existing?.stripeCustomerId ?? null : input.stripeCustomerId,
            stripeSubscriptionId,
            status: toBillingSubscriptionStatus(status),
            currentPeriodEnd,
            metadata,
            updatedAt: input.now,
          },
        })
        .returning();
      const row = rows[0];
      if (!row) {
        throw new Error(`Subscription could not be persisted for user: ${input.userId}`);
      }
      return rowToSubscription(row);
    },
  };
}

function rowToSubscription(row: BillingSubscriptionRow): SubscriptionRecord {
  const metadata = parseBillingMetadata(row.metadata);
  return {
    id: row.id,
    userId: row.userId,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    stripePriceId: metadata.stripePriceId ?? null,
    status: metadata.stripeStatus ?? (row.status === "active" ? "active" : "unknown"),
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAt: isoStringToDate(metadata.cancelAt),
    canceledAt: isoStringToDate(metadata.canceledAt),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function createBillingMetadata(input: { readonly stripePriceId: string | null; readonly status: SubscriptionStatus; readonly cancelAt: Date | null; readonly canceledAt: Date | null }): BillingSubscriptionMetadata {
  const metadata: BillingSubscriptionMetadata = {
    stripeStatus: input.status,
    cancelAt: input.cancelAt?.toISOString() ?? null,
    canceledAt: input.canceledAt?.toISOString() ?? null,
  };
  return input.stripePriceId ? { ...metadata, stripePriceId: input.stripePriceId } : metadata;
}

function parseBillingMetadata(value: Record<string, unknown>): BillingSubscriptionMetadata {
  return {
    stripePriceId: typeof value.stripePriceId === "string" ? value.stripePriceId : undefined,
    stripeStatus: isSubscriptionStatus(value.stripeStatus) ? value.stripeStatus : undefined,
    cancelAt: typeof value.cancelAt === "string" || value.cancelAt === null ? value.cancelAt : undefined,
    canceledAt: typeof value.canceledAt === "string" || value.canceledAt === null ? value.canceledAt : undefined,
  };
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && ["unknown", "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"].some((status) => status === value);
}

function isoStringToDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toBillingSubscriptionStatus(status: SubscriptionStatus): "inactive" | "active" {
  return status === "active" || status === "trialing" ? "active" : "inactive";
}
