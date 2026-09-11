#!/usr/bin/env node
/**
 * Security tests for `POST /v1/auth/merge-guest` against the **deployed** edge function.
 *
 * These are the cases TESTING.md requires before the guest merge can be called done. They exist because the
 * database deliberately cannot defend this operation: `merge_guest_session` is `SECURITY DEFINER`, its EXECUTE
 * grant is revoked from every client role, and its UUID arguments prove nothing about who is entitled to the
 * merge. The endpoint is the entire authorization boundary, and a regression here is another account takeover —
 * during Phase 0 validation a test victim's dog was actually stolen (SECURITY.md).
 *
 * Every case asserts on **observable data effects** read back through RLS as the affected user, not merely on a
 * status code. A 401 that still moved the data would pass a status-only test.
 *
 * Run with `pnpm test:merge` (requires .env.local; no service-role key is used or needed here).
 */

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY",
  );
  process.exit(1);
}

const FUNCTION_URL = `${URL}/functions/v1/auth-merge-guest`;

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function createGuest() {
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const body = await response.json();
  if (!body.access_token) throw new Error("anonymous sign-in failed");
  return { id: body.user.id, token: body.access_token };
}

async function createAccount() {
  const email = `phase4-merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test-Password-123!" }),
  });
  const body = await response.json();
  if (!body.access_token) throw new Error("account sign-up failed");
  return { id: body.user.id, token: body.access_token, email };
}

async function createDog(token, name, ownerUserId) {
  const response = await fetch(`${URL}/rest/v1/dogs`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    // owner_user_id is set explicitly: the column has no default, and RLS's WITH CHECK guarantees a caller can
    // only ever name itself here.
    body: JSON.stringify({
      name,
      sex: "unspecified",
      owner_user_id: ownerUserId,
    }),
  });
  const body = await response.json();
  if (!Array.isArray(body) || !body[0]) {
    throw new Error(`dog creation failed: ${JSON.stringify(body)}`);
  }
  return body[0];
}

/** Reads a user's own dogs through RLS — the real access path, not an admin bypass. */
async function dogsOf(token) {
  const response = await fetch(`${URL}/rest/v1/dogs?select=id,name`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  return Array.isArray(body) ? body : [];
}

async function merge({ callerToken, guestToken, body }) {
  const headers = { apikey: ANON, "Content-Type": "application/json" };
  if (callerToken) headers.Authorization = `Bearer ${callerToken}`;
  if (guestToken) headers["X-Guest-Authorization"] = `Bearer ${guestToken}`;

  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* some rejections have no body */
  }
  return { status: response.status, payload };
}

/** A structurally valid JWT with a broken signature — tests verification, not merely parsing. */
function forgedJwt(subject) {
  const encode = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const claims = encode({
    sub: subject,
    role: "authenticated",
    is_anonymous: true,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `${header}.${claims}.not-a-real-signature`;
}

function expiredJwt(subject) {
  const encode = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const claims = encode({
    sub: subject,
    role: "authenticated",
    is_anonymous: true,
    exp: Math.floor(Date.now() / 1000) - 3600,
  });
  return `${header}.${claims}.not-a-real-signature`;
}

/** Writes a completed training session and its events exactly as the client's sync does: upserts keyed by id. */
async function syncSession(token, { sessionId, dogId, lessonId, eventIds }) {
  const headers = {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };

  const sessionResponse = await fetch(`${URL}/rest/v1/training_sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: sessionId,
      dog_id: dogId,
      lesson_id: lessonId,
      status: "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }),
  });
  if (!sessionResponse.ok) {
    throw new Error(`session sync failed: ${await sessionResponse.text()}`);
  }

  const eventsResponse = await fetch(`${URL}/rest/v1/session_events`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify(
      eventIds.map((id) => ({
        id,
        session_id: sessionId,
        type: "session_completed",
        occurred_at: new Date().toISOString(),
      })),
    ),
  });
  if (!eventsResponse.ok) {
    throw new Error(`event sync failed: ${await eventsResponse.text()}`);
  }
}

async function sessionsOf(token) {
  const response = await fetch(
    `${URL}/rest/v1/training_sessions?select=id,dog_id`,
    {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    },
  );
  const body = await response.json();
  return Array.isArray(body) ? body : [];
}

async function eventsOf(token) {
  const response = await fetch(`${URL}/rest/v1/session_events?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  return Array.isArray(body) ? body : [];
}

async function firstLessonId() {
  const response = await fetch(
    `${URL}/rest/v1/lessons?select=id&slug=eq.name_game`,
    {
      headers: { apikey: ANON },
    },
  );
  const body = await response.json();
  return body[0]?.id ?? null;
}

async function main() {
  console.log("Setting up real identities and data…");

  const guestA = await createGuest();
  const guestB = await createGuest();
  const userP = await createAccount();
  const userQ = await createAccount();

  const dogA = await createDog(guestA.token, "Guest A Dog", guestA.id);
  const dogB = await createDog(guestB.token, "Guest B Dog", guestB.id);

  console.log(`  guest A ${guestA.id} owns ${dogA.id}`);
  console.log(`  guest B ${guestB.id} owns ${dogB.id}`);
  console.log(`  account P ${userP.id}, account Q ${userQ.id}\n`);

  // -------------------------------------------------------------------------------------------------------------
  console.log("Case 2 — missing caller JWT (guest JWT present)");
  {
    const { status } = await merge({ guestToken: guestA.token });
    check("rejected", status === 401 || status === 403, `got ${status}`);
    const stillGuestA = await dogsOf(guestA.token);
    check(
      "guest A still owns its dog",
      stillGuestA.some((d) => d.id === dogA.id),
    );
  }

  console.log("\nCase 3 — missing guest JWT (caller JWT present)");
  {
    const { status } = await merge({ callerToken: userP.token });
    check("rejected 401", status === 401, `got ${status}`);
    const pDogs = await dogsOf(userP.token);
    check(
      "account P gained nothing",
      pDogs.length === 0,
      `saw ${pDogs.length}`,
    );
  }

  console.log("\nCase 4a — invalid guest JWT (garbage)");
  {
    const { status } = await merge({
      callerToken: userP.token,
      guestToken: "not-a-jwt-at-all",
    });
    check("rejected 401", status === 401, `got ${status}`);
    check("guest A untouched", (await dogsOf(guestA.token)).length === 1);
  }

  console.log("\nCase 4b — guest JWT with a broken signature");
  {
    const { status } = await merge({
      callerToken: userP.token,
      guestToken: forgedJwt(guestA.id),
    });
    check("rejected 401", status === 401, `got ${status}`);
    check("guest A untouched", (await dogsOf(guestA.token)).length === 1);
  }

  console.log("\nCase 4c — expired guest JWT");
  {
    const { status } = await merge({
      callerToken: userP.token,
      guestToken: expiredJwt(guestA.id),
    });
    check("rejected 401", status === 401, `got ${status}`);
    check("guest A untouched", (await dogsOf(guestA.token)).length === 1);
  }

  console.log("\nCase 6 — forged guest id in the body, no guest JWT");
  {
    // This is the Phase 0 exploit in endpoint form.
    const { status } = await merge({
      callerToken: userP.token,
      body: { anonymousSessionId: guestA.id },
    });
    check("rejected 401", status === 401, `got ${status}`);
    const pDogs = await dogsOf(userP.token);
    check("account P stole nothing", pDogs.length === 0, `saw ${pDogs.length}`);
    check(
      "guest A still owns its dog",
      (await dogsOf(guestA.token)).length === 1,
    );
  }

  console.log(
    "\nCase 5 — guest JWT for session A with a body naming session B",
  );
  {
    const { status, payload } = await merge({
      callerToken: userP.token,
      guestToken: guestA.token,
      body: { anonymousSessionId: guestB.id },
    });
    // Stronger than TESTING.md's original expectation: the spec's rule 3 says a body/token mismatch must be
    // rejected outright, so neither session moves.
    check("rejected 403", status === 403, `got ${status}`);
    check(
      "refused as a session mismatch",
      payload?.error === "GUEST_TOKEN_SESSION_MISMATCH",
      JSON.stringify(payload),
    );
    check(
      "guest B untouched",
      (await dogsOf(guestB.token)).some((d) => d.id === dogB.id),
    );
    check(
      "guest A untouched",
      (await dogsOf(guestA.token)).some((d) => d.id === dogA.id),
    );
    check("account P gained nothing", (await dogsOf(userP.token)).length === 0);
  }

  console.log("\nCase 1 — valid caller JWT + matching guest JWT");
  {
    const { status } = await merge({
      callerToken: userP.token,
      guestToken: guestA.token,
    });
    check("allowed 200", status === 200, `got ${status}`);

    const pDogs = await dogsOf(userP.token);
    check(
      "guest A's dog now belongs to P",
      pDogs.some((d) => d.id === dogA.id),
    );
    check("P owns exactly one dog", pDogs.length === 1, `saw ${pDogs.length}`);

    const aDogs = await dogsOf(guestA.token);
    check("guest A no longer owns it", !aDogs.some((d) => d.id === dogA.id));
  }

  console.log("\nCase 7 — replay of the same merge");
  {
    const { status, payload } = await merge({
      callerToken: userP.token,
      guestToken: guestA.token,
    });
    check("still 200", status === 200, `got ${status}`);
    check("reported as already merged", payload?.alreadyMerged === true);

    const pDogs = await dogsOf(userP.token);
    check(
      "no duplicate dog created",
      pDogs.length === 1,
      `saw ${pDogs.length}`,
    );
  }

  console.log(
    "\nCase 5b — the merge source comes from the token, proven positively",
  );
  {
    // Account Q merges guest B using only B's token. If the source were ever taken from anywhere else, this would
    // move the wrong session.
    const { status } = await merge({
      callerToken: userQ.token,
      guestToken: guestB.token,
    });
    check("allowed 200", status === 200, `got ${status}`);
    const qDogs = await dogsOf(userQ.token);
    check(
      "Q received exactly guest B's dog",
      qDogs.length === 1 && qDogs[0].id === dogB.id,
    );

    const pDogs = await dogsOf(userP.token);
    check(
      "account P was unaffected",
      pDogs.length === 1 && pDogs[0].id === dogA.id,
    );
  }

  console.log(
    "\nRule 4 — a permanent account cannot be used as a merge source",
  );
  {
    const { status } = await merge({
      callerToken: userP.token,
      guestToken: userQ.token,
    });
    check("rejected 403", status === 403, `got ${status}`);
  }

  console.log("\nRule 4 — an anonymous caller cannot be a merge target");
  {
    const guestC = await createGuest();
    const guestD = await createGuest();
    const { status } = await merge({
      callerToken: guestC.token,
      guestToken: guestD.token,
    });
    check("rejected 403", status === 403, `got ${status}`);
  }

  // -------------------------------------------------------------------------------------------------------------
  console.log("\nEnd to end — train as a guest, then create an account");
  {
    // The realistic path: someone uses the app, trains, and only later decides to sign up. Their training must
    // survive that decision intact, and must not be duplicated by it.
    const guest = await createGuest();
    const account = await createAccount();
    const lessonId = await firstLessonId();
    check("seeded lesson content is available", Boolean(lessonId));

    const dog = await createDog(guest.token, "Trained As Guest", guest.id);
    const sessionId = crypto.randomUUID();
    const eventIds = [crypto.randomUUID(), crypto.randomUUID()];

    await syncSession(guest.token, {
      sessionId,
      dogId: dog.id,
      lessonId,
      eventIds,
    });

    check(
      "guest owns their training session",
      (await sessionsOf(guest.token)).length === 1,
    );
    check(
      "guest owns their session events",
      (await eventsOf(guest.token)).length === 2,
    );

    const { status } = await merge({
      callerToken: account.token,
      guestToken: guest.token,
    });
    check("merge allowed", status === 200, `got ${status}`);

    // The dog is re-parented, and sessions/events are owned *through* the dog — so they follow automatically.
    const accountDogs = await dogsOf(account.token);
    check(
      "account now owns the dog",
      accountDogs.some((d) => d.id === dog.id),
    );

    const accountSessions = await sessionsOf(account.token);
    check(
      "training history followed the dog",
      accountSessions.length === 1 && accountSessions[0].id === sessionId,
      JSON.stringify(accountSessions),
    );
    check(
      "session events followed too",
      (await eventsOf(account.token)).length === 2,
    );

    check(
      "guest can no longer see the dog",
      (await dogsOf(guest.token)).length === 0,
    );
    check(
      "guest can no longer see the sessions",
      (await sessionsOf(guest.token)).length === 0,
    );

    // Re-running the whole flush after the merge must change nothing: every write is keyed by an id the client
    // generated before the account existed.
    await syncSession(account.token, {
      sessionId,
      dogId: dog.id,
      lessonId,
      eventIds,
    });
    check(
      "replayed sync created no duplicate session",
      (await sessionsOf(account.token)).length === 1,
    );
    check(
      "replayed sync created no duplicate events",
      (await eventsOf(account.token)).length === 2,
    );

    const replay = await merge({
      callerToken: account.token,
      guestToken: guest.token,
    });
    check("merge replay is still a no-op", replay.status === 200);
    check(
      "still exactly one dog after replay",
      (await dogsOf(account.token)).length === 1,
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Test run failed:", error.message);
  process.exit(1);
});
