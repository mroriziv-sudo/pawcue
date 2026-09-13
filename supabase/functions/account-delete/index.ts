import { createClient } from "jsr:@supabase/supabase-js@2";
import { deleteSubscriber } from "../_shared/revenuecat.ts";

/**
 * POST /v1/account/delete — SECURITY CRITICAL, IRREVERSIBLE
 *
 * Deletes the calling user: the `auth.users` row, and through `ON DELETE CASCADE` from `profiles`, every table
 * that holds their personal data — dogs, plans, sessions, events, progress, streaks, entitlement. `subscriptions`
 * and `purchase_events` survive with `user_id` set to null: billing and audit history with a retention reason,
 * unlinked from the person (DATABASE.md, DATA_MAP.md). The schema decides all of that; this handler decides only
 * *whose* row is deleted, and that decision has exactly one input.
 *
 * ## Rules
 *
 *  1. **The identity deleted is the verified JWT's `sub`, and nothing else.** There is no user id in the body and
 *     no code path where one could reach the delete. The Phase 0 merge exploit showed what an id in a body is
 *     worth (SECURITY.md); a delete that trusted one would let any caller erase any account.
 *  2. **A body that names an identity is refused outright.** `userId`, `id`, `user_id` — the request is `400` and
 *     nothing happens. Silently ignoring it would hide a client bug or an attempt; refusing it makes both visible.
 *  3. **Intent is stated, not implied.** The body must carry `{ "confirm": "delete" }`. This is not authentication;
 *     it is the server's half of "no accidental one-tap deletion" — a stray call from a retry loop or a mis-wired
 *     button cannot delete anything.
 *  4. **Guests are deleted like accounts.** An anonymous identity owns a dog and a training history too, and "erase
 *     my data" is theirs to ask for. The client creates a fresh guest afterwards.
 *  5. **RevenueCat is erased first, then the account.** Order matters for retries: if the provider succeeds and the
 *     account delete fails, the retry finds a `404` at RevenueCat (success) and deletes the account. The reverse
 *     order would leave a customer record nobody can address, because the identity that names it is gone.
 *  6. **Failure is a failure.** A provider outage is `502` and the account is untouched; a database failure is
 *     `500`. The response is `200` only after the profile is confirmed absent. The client never has to guess.
 *  7. **Idempotent by construction.** After success the JWT's subject no longer exists, so a replay is `401` —
 *     the client treats "my token's user is gone" as the deletion having happened.
 *  8. Rate limited, with uniform failure text.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
/** Server-side only. Never returned, logged, or echoed. */
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
/** RevenueCat secret API key (`sk_…`). Absent means nothing was ever verified for anyone, so nothing to erase. */
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

const RATE_LIMIT_MAX = 5;
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

/** Body keys that would name an identity. Their presence, whatever the value, is refused (rule 2). */
const IDENTITY_KEYS = ["userId", "user_id", "id", "sub", "email"];

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

  // --- Rules 2 and 3: the body states intent and may not name anyone.
  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return reject(400, "INVALID_BODY");
    }
  } catch {
    return reject(400, "INVALID_BODY");
  }

  if (IDENTITY_KEYS.some((key) => key in body)) {
    return reject(400, "BODY_IDENTITY_REJECTED");
  }
  if (body.confirm !== "delete") {
    return reject(400, "CONFIRMATION_REQUIRED");
  }

  // --- Rule 5: the provider first. A failure here leaves the account exactly as it was.
  const provider = await deleteSubscriber(userId, REVENUECAT_SECRET_API_KEY);
  if (provider.kind === "provider_error") {
    console.error("revenuecat subscriber delete failed", provider.status);
    return reject(502, "PROVIDER_UNAVAILABLE", {
      providerStatus: provider.status,
      ...(provider.detail ? { providerDetail: provider.detail } : {}),
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /**
   * Hard delete. `shouldSoftDelete` is left at its default of false: the schema's cascade is the deletion
   * pipeline, and a soft-deleted auth row would keep every personal-data row alive beneath it.
   */
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("auth.admin.deleteUser failed", deleteError.status);
    return reject(500, "DELETION_FAILED");
  }

  // --- Rule 6: report what the table says, not what was intended.
  const { data: remaining, error: readError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (readError || remaining) {
    console.error("profile still present after delete", readError?.code);
    return reject(500, "DELETION_FAILED");
  }

  return new Response(JSON.stringify({ deleted: true }), {
    status: 200,
    headers: JSON_HEADERS,
  });
});
