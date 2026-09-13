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
 * Three operations, all under the service role and all server-side only:
 *
 *   - `fetchSubscriber` asks RevenueCat's REST API what a subscriber holds, authenticated with the **secret** API
 *     key. This is the only authority on purchases the app recognises. `CustomerInfo` on the device is a cache
 *     the SDK maintains for UI; it is never sent here and would not be believed if it were.
 *   - `reconcileSubscriber` writes what RevenueCat said into `subscriptions`, keyed on the store's transaction id,
 *     and asks `recompute_entitlement` to decide what that means. Keying on the transaction id is what makes a
 *     verify call, a restore, a webhook and a replay of any of them converge on the same rows.
 *   - `deleteSubscriber` erases the customer on RevenueCat's side when the account is deleted.
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
  /** `status` is RevenueCat's HTTP status, or 0 when the request itself could not be made or read. */
  | { kind: "provider_error"; status: number; detail?: ProviderFailureDetail };

/**
 * Why a request to RevenueCat could not be made at all. Coarse on purpose: enough for an operator to know
 * whether to fix the secret or wait for the network, never enough to learn anything about the secret itself.
 */
export type ProviderFailureDetail =
  /** The secret's value is not a valid HTTP header value — a stray newline, quote or non-ASCII character. */
  "invalid_secret_format" | "network" | "unknown";

export function classifyFetchFailure(error: unknown): ProviderFailureDetail {
  const message = error instanceof Error ? error.message : String(error);
  if (/header/i.test(message)) return "invalid_secret_format";
  if (
    /(dns|network|connect|sending request|tls|timed out|timeout)/i.test(message)
  ) {
    return "network";
  }
  return "unknown";
}

/**
 * Performs one request to RevenueCat and never throws.
 *
 * `fetch` rejects for more than network failure: a secret whose value carries a stray newline or quote is an
 * invalid header value and throws before any request is sent. An uncaught rejection here is a raw `500` from the
 * runtime — the one response shape the handlers are built never to produce — so every failure mode is turned into
 * a `provider_error` the handler answers with its own `502`. The cause is logged server-side, never returned.
 */
async function callRevenueCat(
  path: string,
  init: RequestInit,
  secretApiKey: string,
): Promise<
  | { ok: true; response: Response }
  | { ok: false; status: number; detail: ProviderFailureDetail }
> {
  let response: Response;
  try {
    response = await fetch(`${REVENUECAT_API}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${secretApiKey.trim()}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    const detail = classifyFetchFailure(error);
    console.error(
      "revenuecat request failed",
      detail,
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, status: 0, detail };
  }
  return { ok: true, response };
}

export async function fetchSubscriber(
  appUserId: string,
  secretApiKey: string,
): Promise<SubscriberLookup> {
  if (!secretApiKey) return { kind: "not_configured" };

  const result = await callRevenueCat(
    `/subscribers/${encodeURIComponent(appUserId)}`,
    {
      method: "GET",
      // Ask for the platform-neutral shape; the mapping does not depend on it but the response is smaller.
      headers: { "X-Platform": "server" },
    },
    secretApiKey,
  );
  if (!result.ok) {
    return {
      kind: "provider_error",
      status: result.status,
      detail: result.detail,
    };
  }
  const { response } = result;

  if (response.status === 404) return { kind: "unknown_subscriber" };
  if (!response.ok) return { kind: "provider_error", status: response.status };

  let body: { subscriber?: RcSubscriber };
  try {
    body = (await response.json()) as { subscriber?: RcSubscriber };
  } catch {
    return { kind: "provider_error", status: 0 };
  }
  if (!body.subscriber) return { kind: "provider_error", status: 502 };
  return { kind: "found", subscriber: body.subscriber };
}

export type SubscriberDeletion =
  /** RevenueCat confirmed the customer is gone — or never existed, which is the same end state. */
  | { kind: "deleted" }
  /** No secret key: nothing could have been verified for this user, so there is nothing to erase here. */
  | { kind: "not_configured" }
  | { kind: "provider_error"; status: number; detail?: ProviderFailureDetail };

/**
 * Erases a customer from RevenueCat as part of account deletion.
 *
 * `DELETE /v1/subscribers/{id}` permanently removes the customer record and its attributes on RevenueCat's side.
 * It does not — cannot — cancel the store subscription: that belongs to the Apple ID or Google account, and the
 * user manages it there. If they reinstall, "Restore Purchases" attaches the store's receipt to whatever identity
 * the new install has, through the same verification path as any restore.
 *
 * 404 is success: idempotency for the retry after a dropped response, and the common case for a user who never
 * opened the paywall.
 */
export async function deleteSubscriber(
  appUserId: string,
  secretApiKey: string,
): Promise<SubscriberDeletion> {
  if (!secretApiKey) return { kind: "not_configured" };

  const result = await callRevenueCat(
    `/subscribers/${encodeURIComponent(appUserId)}`,
    { method: "DELETE" },
    secretApiKey,
  );
  if (!result.ok) {
    return {
      kind: "provider_error",
      status: result.status,
      detail: result.detail,
    };
  }
  const { response } = result;

  if (response.ok || response.status === 404) return { kind: "deleted" };
  return { kind: "provider_error", status: response.status };
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
