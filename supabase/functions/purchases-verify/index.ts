import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  fetchSubscriber,
  readEntitlement,
  reconcileSubscriber,
} from "../_shared/revenuecat.ts";
import { subscriberHasTransaction } from "../_shared/revenuecat-mapping.ts";

/**
 * POST /v1/purchases/verify — SECURITY CRITICAL
 *
 * The only client-initiated path by which a user can become premium. `entitlements` has no client write policy,
 * `subscriptions` has none either, and `recompute_entitlement` is revoked from every client role — so this
 * handler, under the service role, is the entire boundary between "the app says I paid" and the row that decides
 * access.
 *
 * The rules it enforces:
 *
 *  1. **Identity comes from the verified JWT.** There is no user id in the body, and no code path where one could
 *     reach a write. This is the same shape as `auth-merge-guest`, for the same reason: a body id proved nothing
 *     there either, and a test victim's dog was stolen when something trusted one (SECURITY.md).
 *  2. **The client never states what it is entitled to.** The body may carry a `storeTransactionId` — a
 *     *question* the server can look up — and nothing else that is read. `isPremium`, a product, a status, an
 *     expiry: none of those fields exist to this handler.
 *  3. **RevenueCat is the authority on what the user holds.** The server asks RevenueCat's REST API for the
 *     subscriber, with the secret key, and writes what it answers. The device's `CustomerInfo` is never sent and
 *     would not be believed. Without the secret key nothing is verified and nothing is granted: `501`.
 *  4. **Idempotent.** Rows are keyed on the store's transaction id; a retry, a restore and a webhook for the same
 *     purchase converge on the same row.
 *  5. **Entitlement is derived, never assembled here.** `recompute_entitlement` decides; the response reads the
 *     result back rather than reporting what was intended.
 *  6. Rate limited, with uniform failure text.
 *
 * Restore uses this same endpoint with no transaction id: "look at everything I hold". Purchase sends the id the
 * store just returned, and the server refuses to confirm a purchase RevenueCat cannot see for this user — which
 * is the check that stops a client presenting someone else's transaction id.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
/** Server-side only. Never returned, logged, or echoed. */
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
/** RevenueCat secret API key (`sk_…`). Server-side only; its absence makes this endpoint refuse, not guess. */
const REVENUECAT_SECRET_API_KEY =
  Deno.env.get("REVENUECAT_SECRET_API_KEY") ?? "";

const JSON_HEADERS = { "Content-Type": "application/json" };

function reject(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ error: code, ...extra }), {
    status,
    headers: JSON_HEADERS,
  });
}

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function bearer(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return reject(405, "METHOD_NOT_ALLOWED");

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    // Never leak which variable is missing.
    return reject(500, "SERVER_MISCONFIGURED");
  }

  // --- Rule 1: identity comes from the token, and only from the token.
  const callerToken = bearer(request.headers.get("Authorization"));
  if (!callerToken) return reject(401, "MISSING_CALLER_TOKEN");

  const verifier = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerError } =
    await verifier.auth.getUser(callerToken);
  const callerUser = callerData?.user;
  if (callerError || !callerUser) return reject(401, "INVALID_CALLER_TOKEN");

  if (rateLimited(callerUser.id)) return reject(429, "RATE_LIMITED");

  // The single source of identity in this handler.
  const userId = callerUser.id;

  // --- Rule 2: the body may name a transaction. It may not name a user, a status, or an entitlement.
  let body: { storeTransactionId?: unknown } = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return reject(400, "INVALID_BODY");
  }

  let storeTransactionId: string | null = null;
  if (body.storeTransactionId !== undefined) {
    if (
      typeof body.storeTransactionId !== "string" ||
      body.storeTransactionId.length === 0 ||
      body.storeTransactionId.length > 255
    ) {
      return reject(400, "INVALID_BODY");
    }
    storeTransactionId = body.storeTransactionId;
  }

  // --- Rule 3: RevenueCat is asked, with the secret key, about *this* user and nobody else.
  const lookup = await fetchSubscriber(userId, REVENUECAT_SECRET_API_KEY);

  if (lookup.kind === "not_configured") {
    /**
     * Nothing was verified, so nothing is granted.
     *
     * `501` rather than `500`: the request was well-formed and the caller is authenticated — this deployment
     * simply cannot verify a purchase yet. The client reports "not available in this build" rather than a failed
     * purchase, because the purchase did not fail. Configure `REVENUECAT_SECRET_API_KEY` to turn this on.
     */
    return reject(501, "PROVIDER_NOT_CONFIGURED");
  }
  if (lookup.kind === "provider_error") {
    // The provider's HTTP status (0 = the request could not be made) is the one diagnostic worth returning:
    // it separates "RevenueCat rejected our key" from "RevenueCat unreachable" without exposing anything.
    console.error("revenuecat lookup failed", lookup.status);
    return reject(502, "PROVIDER_UNAVAILABLE", {
      providerStatus: lookup.status,
      ...(lookup.detail ? { providerDetail: lookup.detail } : {}),
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nowIso = new Date().toISOString();

  if (lookup.kind === "unknown_subscriber") {
    if (storeTransactionId) {
      // The client claims a purchase RevenueCat has never heard of for this user. Refuse; do not write.
      return reject(409, "TRANSACTION_NOT_VERIFIED");
    }
    // A restore for a user with no purchases: a real, verified answer of "nothing".
    const { error } = await admin.rpc("recompute_entitlement", {
      p_user_id: userId,
    });
    if (error) return reject(500, "VERIFICATION_FAILED");
    return new Response(
      JSON.stringify({
        verified: true,
        ...(await readEntitlement(admin, userId)),
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  }

  /**
   * A named transaction must belong to this subscriber.
   *
   * The subscriber was fetched by the *caller's* id, so a transaction id lifted from someone else's device is
   * simply absent here — and absent means refused. Nothing is written for a claim the provider does not confirm.
   */
  if (
    storeTransactionId &&
    !subscriberHasTransaction(lookup.subscriber, storeTransactionId, nowIso)
  ) {
    return reject(409, "TRANSACTION_NOT_VERIFIED");
  }

  // --- Rules 4 and 5: write what RevenueCat said, keyed on its transaction ids, then let the function decide.
  try {
    await reconcileSubscriber(admin, userId, lookup.subscriber, nowIso);
  } catch (error) {
    console.error(
      "reconcile failed",
      error instanceof Error ? error.message : "unknown",
    );
    return reject(500, "VERIFICATION_FAILED");
  }

  return new Response(
    JSON.stringify({
      verified: true,
      ...(await readEntitlement(admin, userId)),
    }),
    { status: 200, headers: JSON_HEADERS },
  );
});
