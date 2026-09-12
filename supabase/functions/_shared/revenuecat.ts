import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  rowsForSubscriber,
  storeFor,
  type RcSubscriber,
  type SubscriptionRow,
} from "./revenuecat-mapping.ts";

/**
 * The server's conversation with RevenueCat.
 *
 * Two operations, both under the service role and both server-side only:
 *
 *   - `fetchSubscriber` asks RevenueCat's REST API what a subscriber holds, authenticated with the **secret** API
 *     key. This is the only authority on purchases the app recognises. `CustomerInfo` on the device is a cache
 *     the SDK maintains for UI; it is never sent here and would not be believed if it were.
 *   - `reconcileSubscriber` writes what RevenueCat said into `subscriptions`, keyed on the store's transaction id,
 *     and asks `recompute_entitlement` to decide what that means. Keying on the transaction id is what makes a
 *     verify call, a restore, a webhook and a replay of any of them converge on the same rows.
 *
 * The secret key is read from the function's environment and never returned, logged, or echoed. When it is
 * absent, `fetchSubscriber` returns `{ kind: "not_configured" }` and every caller fails closed: nothing is written
 * and nobody becomes premium (SECURITY.md, BILLING.md).
 */

const REVENUECAT_API = "https://api.revenuecat.com/v1";

export type SubscriberLookup =
  | { kind: "found"; subscriber: RcSubscriber }
  /** RevenueCat has never seen this app user id. A real answer: no purchases. */
  | { kind: "unknown_subscriber" }
  | { kind: "not_configured" }
  | { kind: "provider_error"; status: number };

export async function fetchSubscriber(
  appUserId: string,
  secretApiKey: string,
): Promise<SubscriberLookup> {
  if (!secretApiKey) return { kind: "not_configured" };

  const response = await fetch(
    `${REVENUECAT_API}/subscribers/${encodeURIComponent(appUserId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretApiKey}`,
        "Content-Type": "application/json",
        // Ask for the platform-neutral shape; the mapping does not depend on it but the response is smaller.
        "X-Platform": "server",
      },
    },
  );

  if (response.status === 404) return { kind: "unknown_subscriber" };
  if (!response.ok) return { kind: "provider_error", status: response.status };

  const body = (await response.json()) as { subscriber?: RcSubscriber };
  if (!body.subscriber) return { kind: "provider_error", status: 502 };
  return { kind: "found", subscriber: body.subscriber };
}

export interface ReconcileResult {
  written: SubscriptionRow[];
  /** Rows RevenueCat reported that could not be represented (unknown product, unsupported store, no id). */
  skipped: number;
}

/**
 * Writes a subscriber's subscriptions for `userId` and recomputes their entitlement.
 *
 * `user_id` is set from the *verified caller* (or the webhook's app user id), never from a body. On conflict the
 * row is updated in place — including `user_id`, which is how a TRANSFER re-parents a subscription from a guest
 * identity to the account it became.
 *
 * Audit rows are keyed so that a replay of the same state is a no-op, while a change in state (a renewal moving
 * the expiry, a cancellation) records a new line. That is the idempotency the schema asks for: replay-safe, not
 * history-blind.
 */
export async function reconcileSubscriber(
  admin: SupabaseClient,
  userId: string,
  subscriber: RcSubscriber,
  nowIso: string,
): Promise<ReconcileResult> {
  const total = Object.keys(subscriber.subscriptions ?? {}).length;
  const rows = rowsForSubscriber(subscriber, nowIso);

  for (const row of rows) {
    const { data: upserted, error } = await admin
      .from("subscriptions")
      .upsert(
        { user_id: userId, ...row },
        { onConflict: "store_transaction_id" },
      )
      .select("id")
      .single();

    if (error || !upserted) {
      throw new Error(`subscription upsert failed: ${error?.code ?? "no row"}`);
    }

    // Idempotent on (transaction, status, period end): the same state twice writes once.
    const { error: auditError } = await admin.from("purchase_events").insert({
      user_id: userId,
      subscription_id: upserted.id,
      type: auditTypeFor(row.status),
      store: row.store,
      store_event_id: `rc:${row.store_transaction_id}:${row.status}:${row.current_period_end ?? "none"}`,
    });
    if (auditError && auditError.code !== "23505") {
      // Anything but a duplicate is worth knowing about; a duplicate is the idempotency working.
      console.warn("purchase_events insert failed", auditError.code);
    }
  }

  const { error: recomputeError } = await admin.rpc("recompute_entitlement", {
    p_user_id: userId,
  });
  if (recomputeError) {
    throw new Error(`recompute_entitlement failed: ${recomputeError.code}`);
  }

  return { written: rows, skipped: total - rows.length };
}

/** Which audit type a reconciled status corresponds to. Approximate by design; the state is in `subscriptions`. */
function auditTypeFor(status: SubscriptionRow["status"]): string {
  switch (status) {
    case "trialing":
    case "active":
      return "purchase_verified";
    case "grace_period":
      return "grace_period_entered";
    case "billing_retry":
      return "billing_retry";
    case "cancelled":
      return "cancellation";
    case "expired":
      return "expiration";
    case "refunded":
      return "refund";
    case "revoked":
      return "revoked";
  }
}

/** Reads the entitlement row back after a recompute, so a response reports what the table says. */
export async function readEntitlement(
  admin: SupabaseClient,
  userId: string,
): Promise<{
  isPremiumActive: boolean;
  source: string | null;
  expiresAt: string | null;
}> {
  const { data } = await admin
    .from("entitlements")
    .select("is_premium_active, source, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    isPremiumActive: Boolean(data?.is_premium_active),
    source: (data?.source as string | null) ?? null,
    expiresAt: (data?.expires_at as string | null) ?? null,
  };
}

/** Re-exported so handlers validate store names through one definition. */
export { storeFor };
