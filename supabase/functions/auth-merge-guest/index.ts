import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * POST /v1/auth/merge-guest — SECURITY CRITICAL
 *
 * Re-parents a guest's data onto a permanent account. The database cannot defend this operation:
 * `merge_guest_session` is `SECURITY DEFINER`, its EXECUTE grant is revoked from every client role, and its two
 * UUID arguments prove nothing about who is entitled to the merge. **This handler is the entire authorization
 * boundary.** During Phase 0 validation the RPC was reachable directly and a test victim's dog was stolen; see
 * SECURITY.md.
 *
 * The rules it enforces, from supabase/functions/README.md:
 *
 *  1. Caller's authenticated JWT required; the merge TARGET comes from that verified token's `sub`.
 *  2. Guest's anonymous JWT required, verified independently; the merge SOURCE comes from *its* verified `sub`.
 *  3. Body IDs are never authoritative. An `anonymousSessionId` in the body may only be cross-checked against the
 *     guest token and rejected on mismatch.
 *  4. The guest token must be an anonymous identity and the target must not be.
 *  5. The service role key never leaves the server.
 *  6. Idempotent and replay-safe.
 *  7. An existing-account conflict is surfaced, never silently resolved.
 *  8. Rate limited, and failures must not reveal whether an id exists.
 *
 * Note the shape of the code below: `targetUserId` and `sourceUserId` are assigned **only** from `getUser()`
 * results. There is deliberately no code path where a body value reaches the RPC call.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
/** Server-side only. Never returned, logged, or echoed. */
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Deliberately uniform failure text.
 *
 * Rule 8: a caller must not be able to tell "that guest id does not exist" from "that guest id is not yours".
 * Distinct machine-readable codes are fine; distinct *reasons* are not.
 */
function reject(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: JSON_HEADERS,
  });
}

/**
 * Per-caller rate limit.
 *
 * In-memory, so it is per-instance and resets when the instance recycles — it raises the cost of a brute-force
 * loop rather than eliminating it. Recorded as a known limitation rather than presented as complete: a durable
 * limit needs shared state, and the platform's own limits sit in front of this.
 */
const RATE_LIMIT_MAX = 10;
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

  // --- Rule 1: the caller's authenticated JWT, which supplies the merge TARGET.
  const callerToken = bearer(request.headers.get("Authorization"));
  if (!callerToken) return reject(401, "MISSING_CALLER_TOKEN");

  // --- Rule 2: the guest's JWT, which supplies the merge SOURCE. Required, and verified separately below.
  const guestToken = bearer(request.headers.get("X-Guest-Authorization"));
  if (!guestToken) return reject(401, "MISSING_GUEST_TOKEN");

  if (callerToken === guestToken) {
    // A single token cannot be both sides of a merge; the RPC would reject it too, but failing here keeps the
    // service role out of a request that is already known to be invalid.
    return reject(403, "SOURCE_AND_TARGET_IDENTICAL");
  }

  const verifier = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Each token is verified on its own. Signature and expiry are checked by Supabase Auth, not by this handler.
  const [callerResult, guestResult] = await Promise.all([
    verifier.auth.getUser(callerToken),
    verifier.auth.getUser(guestToken),
  ]);

  const callerUser = callerResult.data?.user;
  if (callerResult.error || !callerUser)
    return reject(401, "INVALID_CALLER_TOKEN");

  if (rateLimited(callerUser.id)) return reject(429, "RATE_LIMITED");

  const guestUser = guestResult.data?.user;
  if (guestResult.error || !guestUser)
    return reject(401, "INVALID_GUEST_TOKEN");

  // These two assignments are the only source of identity in this handler.
  const targetUserId = callerUser.id;
  const sourceUserId = guestUser.id;

  // --- Rule 3: a body id may be cross-checked, never trusted.
  let body: { anonymousSessionId?: unknown } = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return reject(400, "INVALID_BODY");
  }
  if (
    typeof body.anonymousSessionId === "string" &&
    body.anonymousSessionId !== sourceUserId
  ) {
    // The Phase 0 exploit in endpoint form: a caller naming someone else's session. The merge still could only
    // ever have acted on the token's own session, but a mismatch is a signal worth refusing outright.
    return reject(403, "GUEST_TOKEN_SESSION_MISMATCH");
  }

  // --- Rule 4: the source must be anonymous and the target must not be.
  if (!guestUser.is_anonymous) return reject(403, "GUEST_NOT_ANONYMOUS");
  if (callerUser.is_anonymous) return reject(403, "TARGET_NOT_PERMANENT");
  if (targetUserId === sourceUserId)
    return reject(403, "SOURCE_AND_TARGET_IDENTICAL");

  // --- Rule 5: the service role is used only now, after both tokens have verified.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Rule 6: a completed merge is a no-op, checked before the conflict rule so a replay stays 200.
  const { data: existingMerge } = await admin
    .from("anonymous_sessions")
    .select("merged_at, merged_into_user_id")
    .eq("id", sourceUserId)
    .maybeSingle();

  if (existingMerge?.merged_at) {
    return new Response(JSON.stringify({ merged: true, alreadyMerged: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  // --- Rule 7: an account that already owns data gets a choice, not a silent merge.
  const [targetDogs, guestDogs] = await Promise.all([
    admin.from("dogs").select("id").eq("owner_user_id", targetUserId),
    admin.from("dogs").select("id").eq("owner_user_id", sourceUserId),
  ]);

  if ((targetDogs.data?.length ?? 0) > 0 && (guestDogs.data?.length ?? 0) > 0) {
    const countSessions = async (dogIds: string[]) => {
      if (dogIds.length === 0) return 0;
      const { count } = await admin
        .from("training_sessions")
        .select("id", { count: "exact", head: true })
        .in("dog_id", dogIds)
        .eq("status", "completed");
      return count ?? 0;
    };

    return new Response(
      JSON.stringify({
        code: "GUEST_MERGE_CONFLICT",
        guestSummary: {
          dogCount: guestDogs.data?.length ?? 0,
          sessionsCompleted: await countSessions(
            (guestDogs.data ?? []).map((row) => row.id as string),
          ),
        },
        accountSummary: {
          dogCount: targetDogs.data?.length ?? 0,
          sessionsCompleted: await countSessions(
            (targetDogs.data ?? []).map((row) => row.id as string),
          ),
        },
      }),
      { status: 409, headers: JSON_HEADERS },
    );
  }

  const { error } = await admin.rpc("merge_guest_session", {
    p_anonymous_user_id: sourceUserId,
    p_target_user_id: targetUserId,
  });

  if (error) {
    // The RPC's own guards (anonymous source, permanent target, already-merged) are a second line of defence.
    // Its message is not echoed: it names ids.
    console.error("merge_guest_session failed", error.code);
    return reject(409, "MERGE_FAILED");
  }

  return new Response(JSON.stringify({ merged: true }), {
    status: 200,
    headers: JSON_HEADERS,
  });
});
