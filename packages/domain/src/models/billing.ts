import { z } from "zod";
import { timestampedSchema, uuidSchema } from "./shared";

/** Stable internal product IDs — never a hardcoded price string anywhere in the app (brief §9 Screen 9, §15). */
export const productIdSchema = z.enum(["premium_monthly", "premium_annual"]);
export type ProductId = z.infer<typeof productIdSchema>;

export const storeSchema = z.enum(["app_store", "play_store"]);

export const subscriptionStatusSchema = z.enum([
  "trialing",
  "active",
  "grace_period",
  "billing_retry",
  "cancelled",
  "expired",
  "refunded",
  "revoked",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/**
 * Server-verified subscription state — written only by the billing webhook handler / restore flow, never by an
 * arbitrary client mutation (brief §15: "Entitlement is controlled server-side").
 */
export const subscriptionSchema = z
  .object({
    id: uuidSchema,
    userId: uuidSchema,
    productId: productIdSchema,
    store: storeSchema,
    status: subscriptionStatusSchema,
    /** Store's own transaction/subscription identifier — used as the idempotency key for webhook replay (brief §36). */
    storeTransactionId: z.string(),
    currentPeriodEnd: z.iso.datetime({ offset: true }).nullable(),
    trialEndsAt: z.iso.datetime({ offset: true }).nullable(),
    cancelledAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .extend(timestampedSchema.shape);
export type Subscription = z.infer<typeof subscriptionSchema>;

/**
 * The single question the rest of the app is allowed to ask about billing: "can this user do X." Derived from
 * `subscriptions`, recomputed on every relevant webhook/restore event — this is the only table client code may
 * read to gate premium features (brief §15: never a client `isPremium=true` boolean).
 */
export const entitlementSchema = z
  .object({
    id: uuidSchema,
    userId: uuidSchema,
    isPremiumActive: z.boolean(),
    source: subscriptionStatusSchema.nullable(),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .extend(timestampedSchema.shape);
export type Entitlement = z.infer<typeof entitlementSchema>;

/** Raw audit log of every receipt/webhook payload received (brief §11 `purchase_events`) — service-role read only. */
export const purchaseEventTypeSchema = z.enum([
  "purchase_verified",
  "renewal",
  "cancellation",
  "grace_period_entered",
  "billing_retry",
  "expiration",
  "refund",
  "revoked",
  "restore",
]);

export const purchaseEventSchema = z
  .object({
    id: uuidSchema,
    userId: uuidSchema,
    subscriptionId: uuidSchema.nullable(),
    type: purchaseEventTypeSchema,
    store: storeSchema,
    /** Store's notification/transaction ID — the idempotency key so webhook replay can't double-apply an event. */
    storeEventId: z.string(),
    receivedAt: z.iso.datetime({ offset: true }),
  })
  .extend(timestampedSchema.shape);
export type PurchaseEvent = z.infer<typeof purchaseEventSchema>;
