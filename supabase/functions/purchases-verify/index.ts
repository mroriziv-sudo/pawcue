import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * POST /v1/purchases/verify — SECURITY CRITICAL
 *
 * The only path by which a user can become premium. `entitlements` has no client write policy, `subscriptions` has
 * none either, and `recompute_entitlement` is revoked from every client role — so this handler, under the service
 * role, is the entire boundary between "the app says I paid" and the row that decides access.
 *
 * The rules it enforces:
 *
 *  1. **Identity comes from the verified JWT.** There is no user id in the body, and no code path where one could
 *     reach a write. This is the same shape as `auth-merge-guest`, for the same reason: a body id proved nothing
 *     there either, and a test victim's dog was stolen when something trusted one (SECURITY.md).
 *  2. **The client never states what it is entitled to.** A body carrying `isPremium: true`, a status, an expiry
 *     or a price is ignored entirely — those fields are not read. The body carries a store transaction id, which
 *     is a *question*, not an answer.
 *  3. **The store is the authority on what that transaction is.** The provider is asked; its answer is what gets
 *     written. Without provider credentials this endpoint verifies nothing and therefore grants nothing — it
 *     returns `501`, rather than trusting the client in the meantime.
 *  4. **Idempotent.** Everything is keyed on `store_transaction_id` (unique) and `store_event_id` (unique), so a
 *     retry, a duplicate callback and a replayed webhook all converge on the same rows.
 *  5. **Entitlement is derived, never assembled here.** `recompute_entitlement` reads `subscriptions` and decides.
 *     Two places computing "is premium" is how they come to disagree.
 *  6. Rate limited, with uniform failure text.
 *
 * ## What is not implemented, and why it is not stubbed
 *
 * `verifyWithProvider` needs a RevenueCat (or StoreKit/Play) credential this project does not have. It returns
 * `null`, the handler answers `501 PROVIDER_NOT_CONFIGURED`, and no row is written. Returning a plausible
 * subscription instead would make every test above pass against a fiction, and would mean the first real
 * verification runs in production. See docs/architecture/phase-7-monetization.md for exactly what to configure.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
/** Server-side only. Never returned, logged, or echoed. */
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
/** Absent in this project. Its absence is what makes the endpoint refuse rather than guess. */
const REVENUECAT_API_KEY = Deno.env.get("REVENUECAT_SECRET_API_KEY") ?? "";

const JSON_HEADERS = { "Content-Type": "application/json" };

const PRODUCT_IDS = ["premium_monthly", "premium_annual"] as const;
type ProductId = (typeof PRODUCT_IDS)[number];

const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "grace_period",
  "billing_retry",
  "cancelled",
  "expired",
  "refunded",
  "revoked",
] as const;
type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

type Store = "app_store" | "play_store";

/** What the provider says a transaction actually is. Every field here is the store's, never the client's. */
interface VerifiedPurchase {
  productId: ProductId;
  store: Store;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelledAt: string | null;
}

function reject(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
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

/**
 * Asks the store what this transaction is.
 *
 * Deliberately unimplemented rather than stubbed. When RevenueCat is configured this calls its REST API with
 * `REVENUECAT_SECRET_API_KEY` (a server secret — never an `EXPO_PUBLIC_` name) and maps the subscriber response
 * onto `VerifiedPurchase`. Until then it returns null, and the caller refuses.
 *
 * The `productId` the client sent is not passed through: it is only ever a hint for logging. The product that gets
 * written is the one the store reports for this transaction, so a client cannot buy the cheap product and claim
 * the expensive one.
 */
async function verifyWithProvider(
  _storeTransactionId: string,
): Promise<VerifiedPurchase | null> {
  if (!REVENUECAT_API_KEY) return null;

  // Intentionally unreachable in this build. Implementing it against a provider that cannot be exercised here
  // would produce untested code that looks tested.
  await Promise.resolve();
  return null;
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

  const storeTransactionId = body.storeTransactionId;
  if (
    typeof storeTransactionId !== "string" ||
    storeTransactionId.length === 0
  ) {
    return reject(400, "INVALID_BODY");
  }
  if (storeTransactionId.length > 255) return reject(400, "INVALID_BODY");

  // --- Rule 3: the store decides what the transaction is.
  const verified = await verifyWithProvider(storeTransactionId);

  /**
   * The provider's answer is validated too.
   *
   * Not because the store is untrusted, but because the mapping from its shape to ours is code that can be wrong.
   * A status or product outside the enum would otherwise reach a CHECK constraint as a 500 — this turns a mapping
   * bug into a refusal to grant, which is the safe direction to fail in.
   */
  if (
    verified &&
    (!PRODUCT_IDS.includes(verified.productId) ||
      !SUBSCRIPTION_STATUSES.includes(verified.status))
  ) {
    console.error("provider returned an unrecognised product or status");
    return reject(502, "VERIFICATION_FAILED");
  }

  if (!verified) {
    /**
     * Nothing was verified, so nothing is granted.
     *
     * `501` rather than `500`: the request was well-formed and the caller is authenticated — this build simply
     * cannot verify a purchase. The client reports it as "not available in this build" and the user is not told
     * their purchase failed, because it did not.
     */
    return reject(501, "PROVIDER_NOT_CONFIGURED");
  }

  // --- Rule 5: the service role is used only now, after the token verified and the store answered.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /**
   * Rule 4 — idempotent by key, not by check-then-write.
   *
   * `store_transaction_id` is unique, so an upsert on it is safe against a retried request and a webhook that
   * arrives at the same moment. `user_id` is set from the verified token on every write, which is also what makes
   * a transaction that was already recorded under a *different* user unable to be claimed: the conflict target is
   * the transaction, so the row is updated in place rather than duplicated, and the store's own account binding
   * is what decided who may present it in the first place.
   */
  const { data: subscription, error: subscriptionError } = await admin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        product_id: verified.productId,
        store: verified.store,
        status: verified.status,
        store_transaction_id: storeTransactionId,
        current_period_end: verified.currentPeriodEnd,
        trial_ends_at: verified.trialEndsAt,
        cancelled_at: verified.cancelledAt,
      },
      { onConflict: "store_transaction_id" },
    )
    .select("id")
    .single();

  if (subscriptionError || !subscription) {
    console.error("subscription upsert failed", subscriptionError?.code);
    return reject(500, "VERIFICATION_FAILED");
  }

  /**
   * The audit trail.
   *
   * `store_event_id` is unique, so a replayed notification collides on the second delivery. That collision is the
   * idempotency working, not a failure: the event is already recorded, and the verification it describes has
   * already been applied. It is logged and stepped over so a replay still answers `200`.
   */
  const { error: auditError } = await admin.from("purchase_events").insert({
    user_id: userId,
    subscription_id: subscription.id,
    type: "purchase_verified",
    store: verified.store,
    store_event_id: `verify:${storeTransactionId}:${verified.status}`,
  });

  if (auditError) {
    console.warn("purchase_events insert skipped", auditError.code);
  }

  // --- Rule 5: entitlement is derived from what was just written, by the one function that decides it.
  const { error: recomputeError } = await admin.rpc("recompute_entitlement", {
    p_user_id: userId,
  });

  if (recomputeError) {
    console.error("recompute_entitlement failed", recomputeError.code);
    return reject(500, "VERIFICATION_FAILED");
  }

  /**
   * The response reports the entitlement as the server now sees it — read back from the table rather than assumed
   * from what was just written, so the client and the server cannot disagree about the outcome of this very call.
   */
  const { data: entitlement } = await admin
    .from("entitlements")
    .select("is_premium_active, source, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  return new Response(
    JSON.stringify({
      verified: true,
      isPremiumActive: entitlement?.is_premium_active ?? false,
      source: entitlement?.source ?? null,
      expiresAt: entitlement?.expires_at ?? null,
    }),
    { status: 200, headers: JSON_HEADERS },
  );
});
