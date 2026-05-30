import type { SubscriptionRecord, SubscriptionUpsert } from "./types.js";

export type BillingRepository = {
  readonly getByUserId: (input: { readonly userId: string }) => Promise<SubscriptionRecord | undefined>;
  readonly getByStripeCustomerId: (input: { readonly stripeCustomerId: string }) => Promise<SubscriptionRecord | undefined>;
  readonly upsertForUser: (input: SubscriptionUpsert) => Promise<SubscriptionRecord>;
};

export function createInMemoryBillingRepository(initialRecords: readonly SubscriptionRecord[] = []): BillingRepository {
  const records = [...initialRecords];

  return {
    async getByUserId(input) {
      return records.find((record) => record.userId === input.userId);
    },
    async getByStripeCustomerId(input) {
      return records.find((record) => record.stripeCustomerId === input.stripeCustomerId);
    },
    async upsertForUser(input) {
      const existingIndex = records.findIndex((record) => record.userId === input.userId);
      const existing = existingIndex === -1 ? undefined : records[existingIndex];
      const record: SubscriptionRecord = {
        id: existing?.id ?? input.id,
        userId: input.userId,
        stripeCustomerId: input.stripeCustomerId === undefined ? existing?.stripeCustomerId ?? null : input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId === undefined ? existing?.stripeSubscriptionId ?? null : input.stripeSubscriptionId,
        stripePriceId: input.stripePriceId === undefined ? existing?.stripePriceId ?? null : input.stripePriceId,
        status: input.status ?? existing?.status ?? "unknown",
        currentPeriodEnd: input.currentPeriodEnd === undefined ? existing?.currentPeriodEnd ?? null : input.currentPeriodEnd,
        cancelAt: input.cancelAt === undefined ? existing?.cancelAt ?? null : input.cancelAt,
        canceledAt: input.canceledAt === undefined ? existing?.canceledAt ?? null : input.canceledAt,
        createdAt: existing?.createdAt ?? input.now,
        updatedAt: input.now,
      };
      if (existingIndex === -1) {
        records.push(record);
      } else {
        records[existingIndex] = record;
      }
      return record;
    },
  };
}
