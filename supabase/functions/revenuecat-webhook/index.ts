import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchSubscriber, reconcileSubscriber } from "../_shared/revenuecat.ts";
import {
  affectedUserIds,
  eventTypeFor,
  isAppUserId,
  storeFor,
  type RcWebhookEvent,
} from "../_shared/revenuecat-mapping.ts";

/**
 * POST /revenuecat-webhook — RevenueCat → server notifications
 *
 * Renewals, expirations, refunds, billing issues, cancellations and transfers all arrive here, without the app
 * being open. This is what keeps `entitlements` true between launches: a subscription that lapses at 3am is
 * revoked at 3am, not when the user next opens the app and asks.
 *
 * ## The one design decision
 *
 * **The event is a trigger, not a source of truth.** Whatever the event says happened, the handler re-fetches
 * the subscriber from RevenueCat's REST API and derives state from that. Two reasons: events can arrive out of
 * order, and a handler that wrote state from event fields would be a second place — beside `purchases-verify` —
 * where a provider's vocabulary becomes the app's, and two places is how they drift. The event's only contributions
 * are *which users* to look at and an audit line.
 *
 * ## Rules
 *
 *  1. **Authenticated.** RevenueCat sends the configured `Authorization` value on every request; anything else is
 *     `401` before the body is read. Without a configured secret, the endpoint refuses everything (`501`) rather
 *     than accepting anything.
 *  2. **Idempotent on the event id.** The audit row for `rc-event:<id>` is inserted first; a duplicate delivery
 *     hits the unique index and returns `200` without touching subscriptions. RevenueCat retries on non-2xx, so a
 *     transient failure is retried and a processed event is not re-applied.
 *  3. **Only our identities are written.** RevenueCat anonymous ids can appear in `transferred_from`; they are not
 *     profiles and are skipped. A UUID that is not a profile fails the foreign key and is logged, not invented.
 *  4. **TRANSFER re-parents by transaction id.** Reconciling the new owner upserts the same `store_transaction_id`
 *     with the new `user_id`; reconciling the old owner then recomputes them without it. Both happen here.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
/** Server-side only. Never returned, logged, or echoed. */
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REVENUECAT_SECRET_API_KEY =
  Deno.env.get("REVENUECAT_SECRET_API_KEY") ?? "";
/** The value RevenueCat is configured to send in `Authorization`. Any string; treated as a shared secret. */
const REVENUECAT_WEBHOOK_AUTH = Deno.env.get("REVENUECAT_WEBHOOK_AUTH") ?? "";

const JSON_HEADERS = { "Content-Type": "application/json" };

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Constant-time comparison, so a wrong secret costs the same as a nearly-right one. */
function secretsMatch(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST")
    return respond(405, { error: "METHOD_NOT_ALLOWED" });

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return respond(500, { error: "SERVER_MISCONFIGURED" });
  }
  // --- Rule 1: fail closed. An unconfigured webhook accepts nothing.
  if (!REVENUECAT_WEBHOOK_AUTH || !REVENUECAT_SECRET_API_KEY) {
    return respond(501, { error: "PROVIDER_NOT_CONFIGURED" });
  }

  const presented = (request.headers.get("Authorization") ?? "").trim();
  // RevenueCat sends the configured value verbatim; a "Bearer " prefix is accepted for operators who set one.
  const token = presented.replace(/^Bearer\s+/i, "");
  if (!secretsMatch(token, REVENUECAT_WEBHOOK_AUTH)) {
    return respond(401, { error: "UNAUTHORIZED" });
  }

  let event: RcWebhookEvent;
  try {
    const body = (await request.json()) as { event?: RcWebhookEvent };
    if (!body.event || typeof body.event !== "object")
      throw new Error("no event");
    event = body.event;
  } catch {
    return respond(400, { error: "INVALID_BODY" });
  }

  const eventId =
    typeof event.id === "string" && event.id.length > 0 ? event.id : null;
  const rcType = typeof event.type === "string" ? event.type : "";
  if (!eventId) return respond(400, { error: "INVALID_BODY" });

  const auditType = eventTypeFor(rcType, event.cancel_reason ?? null);
  if (!auditType) {
    // TEST events and unknown types: acknowledged so RevenueCat stops retrying, never acted on.
    return respond(200, { received: true, ignored: rcType || "unknown" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const users = affectedUserIds(event);
  const primaryUser = isAppUserId(event.app_user_id) ? event.app_user_id : null;
  const store = storeFor(event.store ?? "") ?? "app_store";

  // --- Rule 2: claim the event id before doing anything. A duplicate stops here.
  const { error: claimError } = await admin.from("purchase_events").insert({
    user_id: primaryUser,
    subscription_id: null,
    type: auditType,
    store,
    store_event_id: `rc-event:${eventId}`,
  });

  if (claimError) {
    if (claimError.code === "23505") {
      return respond(200, { received: true, duplicate: true });
    }
    // A foreign-key failure means `app_user_id` is not one of our profiles. Log it; do not invent a profile.
    console.error("webhook audit insert failed", claimError.code);
    return respond(500, { error: "AUDIT_FAILED" });
  }

  // --- Rules 3 and 4: re-derive every touched identity from what RevenueCat says *now*.
  const nowIso = new Date().toISOString();
  const outcomes: Record<string, string> = {};

  for (const userId of users) {
    const lookup = await fetchSubscriber(userId, REVENUECAT_SECRET_API_KEY);

    if (lookup.kind === "found") {
      try {
        await reconcileSubscriber(admin, userId, lookup.subscriber, nowIso);
        outcomes[userId] = "reconciled";
      } catch (error) {
        console.error(
          "reconcile failed",
          error instanceof Error ? error.message : "unknown",
        );
        outcomes[userId] = "failed";
      }
    } else if (lookup.kind === "unknown_subscriber") {
      // A transferred-from identity RevenueCat no longer tracks. Recompute so any stale entitlement drops.
      const { error } = await admin.rpc("recompute_entitlement", {
        p_user_id: userId,
      });
      outcomes[userId] = error ? "failed" : "recomputed_empty";
    } else {
      outcomes[userId] = "provider_unavailable";
    }
  }

  /**
   * A failure for any user is reported as 5xx so RevenueCat retries the delivery.
   *
   * The event id has already been claimed, so the retry would be treated as a duplicate — which is why the
   * claim row is released here on failure. The alternative, leaving it, would make one transient provider
   * outage a permanent gap in that user's entitlement.
   */
  const failed = Object.values(outcomes).some(
    (o) => o === "failed" || o === "provider_unavailable",
  );
  if (failed) {
    await admin
      .from("purchase_events")
      .delete()
      .eq("store_event_id", `rc-event:${eventId}`);
    return respond(502, { received: false, outcomes });
  }

  return respond(200, { received: true, outcomes });
});
