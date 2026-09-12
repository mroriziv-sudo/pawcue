/**
 * RevenueCat's subscriber representation → this schema's `subscriptions` row.
 *
 * Pure: no I/O, no Deno, no imports. That is deliberate — this is the one place where a provider's vocabulary
 * becomes the app's, and every branch of it is a unit test in `revenuecat-mapping.test.ts`. The Edge Functions
 * import it for the real thing; Vitest imports it for the proof.
 *
 * Everything here is derived from what RevenueCat's REST API reports for a subscriber. Nothing comes from the
 * client: not the product, not the status, not the dates. A request body may only ever *name* a transaction for
 * the server to look up.
 */

export const PRODUCT_IDS = ["premium_monthly", "premium_annual"] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "grace_period",
  "billing_retry",
  "cancelled",
  "expired",
  "refunded",
  "revoked",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type Store = "app_store" | "play_store";

/** The fields of one entry in `subscriber.subscriptions[product_id]` this mapping reads. */
export interface RcSubscription {
  expires_date: string | null;
  purchase_date?: string | null;
  original_purchase_date?: string | null;
  store: string;
  period_type?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  grace_period_expires_date?: string | null;
  refunded_at?: string | null;
  store_transaction_id?: string | null;
  is_sandbox?: boolean;
}

export interface RcSubscriber {
  original_app_user_id?: string;
  subscriptions?: Record<string, RcSubscription>;
}

/** What gets written. Mirrors the `subscriptions` table's columns, snake_case, ready to upsert. */
export interface SubscriptionRow {
  product_id: ProductId;
  store: Store;
  status: SubscriptionStatus;
  store_transaction_id: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancelled_at: string | null;
}

export function isKnownProductId(id: string): id is ProductId {
  return (PRODUCT_IDS as readonly string[]).includes(id);
}

/**
 * RevenueCat store names this schema accepts.
 *
 * `promotional`, `stripe`, `amazon` and the rest are refused rather than coerced: a promotional grant in the
 * RevenueCat dashboard is not a store purchase, and writing it as one would make dashboard access a way to hand
 * out premium that bypasses the store entirely.
 */
export function storeFor(rcStore: string): Store | null {
  switch (rcStore.toLowerCase()) {
    case "app_store":
    case "mac_app_store":
      return "app_store";
    case "play_store":
      return "play_store";
    default:
      return null;
  }
}

function past(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t <= now;
}

function future(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > now;
}

/**
 * The status a subscription is in right now.
 *
 * Order encodes precedence. A refund overrides everything. Then the hard fact of the calendar: past its end date
 * it is expired unless the store is holding it open in a grace period. Before its end date, a detected billing
 * problem outranks an unsubscribe, which outranks the ordinary trial/active distinction — because each of those
 * is the more urgent thing for the user to be told.
 *
 * `cancelled` means auto-renew is off and access continues to `current_period_end`. It is an *entitling* status
 * until that date; `recompute_entitlement` honours it as such.
 */
export function statusFor(
  sub: RcSubscription,
  nowIso: string,
): SubscriptionStatus {
  const now = Date.parse(nowIso);

  if (sub.refunded_at) return "refunded";

  if (past(sub.expires_date, now)) {
    if (future(sub.grace_period_expires_date, now)) return "grace_period";
    return "expired";
  }

  if (sub.billing_issues_detected_at) return "billing_retry";
  if (sub.unsubscribe_detected_at) return "cancelled";
  if ((sub.period_type ?? "").toLowerCase() === "trial") return "trialing";
  return "active";
}

/**
 * One RevenueCat subscription → one row, or null when it cannot be represented.
 *
 * Null is the safe direction: an unknown product, an unsupported store or a missing transaction id all mean
 * "write nothing", and a row that is not written never entitles anyone.
 */
export function toSubscriptionRow(
  productId: string,
  sub: RcSubscription,
  nowIso: string,
): SubscriptionRow | null {
  if (!isKnownProductId(productId)) return null;
  const store = storeFor(sub.store);
  if (!store) return null;
  const transactionId = sub.store_transaction_id;
  if (!transactionId) return null;

  const status = statusFor(sub, nowIso);
  const isTrial = (sub.period_type ?? "").toLowerCase() === "trial";

  return {
    product_id: productId,
    store,
    status,
    store_transaction_id: transactionId,
    current_period_end: sub.expires_date ?? null,
    trial_ends_at: isTrial ? (sub.expires_date ?? null) : null,
    cancelled_at: sub.unsubscribe_detected_at ?? null,
  };
}

/** Every representable subscription a subscriber holds. */
export function rowsForSubscriber(
  subscriber: RcSubscriber,
  nowIso: string,
): SubscriptionRow[] {
  const rows: SubscriptionRow[] = [];
  for (const [productId, sub] of Object.entries(
    subscriber.subscriptions ?? {},
  )) {
    const row = toSubscriptionRow(productId, sub, nowIso);
    if (row) rows.push(row);
  }
  return rows;
}

/** True when the subscriber holds a representable subscription with this store transaction id. */
export function subscriberHasTransaction(
  subscriber: RcSubscriber,
  storeTransactionId: string,
  nowIso: string,
): boolean {
  return rowsForSubscriber(subscriber, nowIso).some(
    (row) => row.store_transaction_id === storeTransactionId,
  );
}

/* -------------------------------------------------------------------------- */
/* Webhook events                                                              */
/* -------------------------------------------------------------------------- */

export const PURCHASE_EVENT_TYPES = [
  "purchase_verified",
  "renewal",
  "cancellation",
  "grace_period_entered",
  "billing_retry",
  "expiration",
  "refund",
  "revoked",
  "restore",
] as const;
export type PurchaseEventType = (typeof PURCHASE_EVENT_TYPES)[number];

/**
 * A RevenueCat webhook event type → this schema's audit-log vocabulary, or null for events that carry no
 * subscription state worth recording (`TEST`, and anything this build does not recognise).
 *
 * The audit row is a *record that something happened*. It is never the source of subscription state — after any
 * event the subscriber is re-fetched and re-derived — so an approximate mapping here costs nothing but a less
 * precise history.
 */
export function eventTypeFor(
  rcType: string,
  cancelReason?: string | null,
): PurchaseEventType | null {
  switch (rcType) {
    case "INITIAL_PURCHASE":
    case "NON_RENEWING_PURCHASE":
      return "purchase_verified";
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "SUBSCRIPTION_EXTENDED":
      return "renewal";
    case "CANCELLATION":
      return cancelReason === "CUSTOMER_SUPPORT" || cancelReason === "REFUND"
        ? "refund"
        : "cancellation";
    case "SUBSCRIPTION_PAUSED":
      return "cancellation";
    case "BILLING_ISSUE":
      return "billing_retry";
    case "EXPIRATION":
      return "expiration";
    case "TRANSFER":
      return "restore";
    default:
      return null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a RevenueCat app user id is one of *ours*.
 *
 * This app always configures the SDK with the Supabase user id, so a real identity is a UUID. RevenueCat's own
 * anonymous ids (`$RCAnonymousID:…`) can still appear in `transferred_from`, and they are not profiles — they are
 * skipped, never written as a user id.
 */
export function isAppUserId(id: unknown): id is string {
  return typeof id === "string" && UUID.test(id);
}

/** The subset of a webhook body this handler reads. Everything else is ignored. */
export interface RcWebhookEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  cancel_reason?: string | null;
  transferred_from?: string[];
  transferred_to?: string[];
  store?: string;
}

/** Every one of our identities an event touches, de-duplicated. */
export function affectedUserIds(event: RcWebhookEvent): string[] {
  const ids = new Set<string>();
  for (const candidate of [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ]) {
    if (isAppUserId(candidate)) ids.add(candidate);
  }
  return [...ids];
}
