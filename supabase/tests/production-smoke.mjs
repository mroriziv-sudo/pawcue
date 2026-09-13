#!/usr/bin/env node
/**
 * Smoke test for a Supabase environment the app will actually talk to — including production.
 *
 * Unlike `rls_security.sql` (which resets and needs a throwaway project) and the merge/billing suites (which
 * leave test identities behind), everything this creates it deletes through the app's own `account-delete`
 * endpoint, and everything else is a read. It is safe to run against production, and it exercises the paths
 * the app depends on, in the order the app uses them:
 *
 *   migrations applied · public catalogue readable · server-authoritative tables and RPCs unreachable
 *   guest creation · dog creation · session sync · plan persistence · merge endpoint refusals
 *   billing endpoints fail closed · account deletion (which is also the cleanup)
 *
 * What it does not do: the positive merge path (needs a permanent account; production has no password sign-up),
 * and a real purchase (needs the store). Both are covered on staging and pending external validation respectively.
 *
 * Run with `pnpm test:smoke:production` (reads .env.production.local) or against staging with
 * `node --env-file=.env.local supabase/tests/production-smoke.mjs`.
 */

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !ANON) {
  console.error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY",
  );
  process.exit(1);
}

/** What `supabase/seed.sql` inserts. A mismatch means the environment's content is not the repository's. */
const EXPECTED_CATALOGUE = {
  training_goals: 9,
  skills: 8,
  lessons: 13,
  lesson_steps: 40,
  lesson_troubleshooting: 10,
  plan_engine_versions: 1,
  content_versions: 2,
};
const ALWAYS_FREE_LESSONS = [
  "name_game",
  "sit",
  "biting_foundation",
  "potty_foundation",
];

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

function headers(token, extra = {}) {
  return {
    apikey: ANON,
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function rest(path, { token, method = "GET", body, prefer } = {}) {
  const response = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: headers(token, prefer ? { Prefer: prefer } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* empty */
  }
  return { status: response.status, ok: response.ok, payload };
}

async function fn(name, { token, body, extraHeaders } = {}) {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: "POST",
    headers: headers(token, extraHeaders),
    body: JSON.stringify(body ?? {}),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* empty */
  }
  return { status: response.status, payload };
}

async function createGuest() {
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: headers(),
    body: "{}",
  });
  const body = await response.json();
  if (!body.access_token)
    throw new Error(`anonymous sign-in failed: ${JSON.stringify(body)}`);
  return {
    id: body.user.id,
    token: body.access_token,
    isAnonymous: body.user.is_anonymous,
  };
}

/**
 * Exact row count via PostgREST's Content-Range. One retry: right after a config push restarts the platform's
 * services, a single request can come back without the header (seen once on production, 2026-09-13).
 */
async function count(table, attempt = 1) {
  const response = await fetch(`${URL}/rest/v1/${table}?select=id`, {
    headers: {
      apikey: ANON,
      Prefer: "count=exact",
      "Range-Unit": "items",
      Range: "0-0",
    },
  });
  const range = response.headers.get("content-range") ?? "";
  const total = Number(range.split("/")[1]);
  if (Number.isFinite(total)) return total;
  if (attempt < 2) {
    await new Promise((r) => setTimeout(r, 1500));
    return count(table, attempt + 1);
  }
  console.log(
    `    (count of ${table}: HTTP ${response.status}, content-range "${range}")`,
  );
  return -1;
}

async function main() {
  console.log(`Target: ${URL}\n`);
  const created = [];

  console.log("Public catalogue (anon, read-only)");
  for (const [table, expected] of Object.entries(EXPECTED_CATALOGUE)) {
    const n = await count(table);
    check(`${table}: ${expected} rows`, n === expected, `saw ${n}`);
  }
  {
    const { payload } = await rest(
      "lessons?select=slug,is_always_free&order=slug",
    );
    const free = (payload ?? [])
      .filter((l) => l.is_always_free)
      .map((l) => l.slug)
      .sort();
    check(
      "always-free lessons are exactly the four the product promises",
      JSON.stringify(free) === JSON.stringify([...ALWAYS_FREE_LESSONS].sort()),
      JSON.stringify(free),
    );
    const steps = await rest(
      "lesson_steps?select=instruction_key&instruction_key=like.*.step*&limit=1",
    );
    check(
      "lesson steps carry i18n keys, not scaffold keys",
      (steps.payload ?? []).every((s) => /^lesson\./.test(s.instruction_key)),
    );
  }

  console.log(
    "\nServer-authoritative surfaces are unreachable with the anon key",
  );
  {
    for (const table of [
      "dogs",
      "entitlements",
      "subscriptions",
      "purchase_events",
      "training_sessions",
    ]) {
      const { status, payload } = await rest(`${table}?select=id&limit=1`);
      check(
        `${table}: anon reads nothing`,
        status === 200 && Array.isArray(payload) && payload.length === 0,
        `status ${status}`,
      );
    }
    for (const rpc of ["merge_guest_session", "recompute_entitlement"]) {
      const { status } = await rest(`rpc/${rpc}`, { method: "POST", body: {} });
      check(
        `rpc/${rpc}: refused for anon`,
        status === 401 || status === 403 || status === 404,
        `status ${status}`,
      );
    }
  }

  console.log("\nGuest identity");
  const guest = await createGuest();
  created.push(guest);
  check("anonymous sign-in issues a session", Boolean(guest.token));
  check("the identity is anonymous", guest.isAnonymous === true);
  {
    const { payload } = await rest("profiles?select=id,is_anonymous", {
      token: guest.token,
    });
    check(
      "profile row auto-created by the trigger",
      payload?.[0]?.id === guest.id && payload[0].is_anonymous === true,
      JSON.stringify(payload),
    );
  }

  /**
   * Pre-flight: can this environment's billing/deletion functions reach RevenueCat?
   *
   * `purchases-verify` answers 501 with no secret (fine: nothing is granted), 200/409 with a working one, and 502
   * when the secret exists but the request cannot be made — a malformed value, or an outage. In that state
   * `account-delete` fails the same way, so every identity this suite creates would be left behind. Stop here,
   * with only this one empty guest to remove by hand, and say what to fix.
   */
  {
    const probe = await fn("purchases-verify", {
      token: guest.token,
      body: {},
    });
    if (probe.status === 502) {
      console.log(
        `\n  ✗ billing provider unreachable from this environment: ${JSON.stringify(probe.payload)}`,
      );
      console.log(
        probe.payload?.providerDetail === "invalid_secret_format"
          ? "    REVENUECAT_SECRET_API_KEY is not a valid HTTP header value (newline, quote or non-ASCII character in the pasted value). Re-set it with `supabase secrets set` and re-run."
          : "    RevenueCat could not be reached. Retry later; if it persists, check the secret and RevenueCat status.",
      );
      console.log(
        `    Aborting before creating data. One empty anonymous identity (${guest.id}) remains and cannot delete itself until this is fixed.`,
      );
      process.exit(1);
    }
  }

  console.log("\nDog creation");
  const dogRes = await rest("dogs", {
    token: guest.token,
    method: "POST",
    prefer: "return=representation",
    body: {
      name: "Smoke Test Dog",
      sex: "unspecified",
      owner_user_id: guest.id,
      daily_training_minutes: 10,
    },
  });
  const dog = dogRes.payload?.[0];
  check(
    "guest can create their dog",
    Boolean(dog?.id),
    JSON.stringify(dogRes.payload),
  );
  {
    const forged = await rest("dogs", {
      token: guest.token,
      method: "POST",
      body: {
        name: "Not Mine",
        sex: "unspecified",
        owner_user_id: "00000000-0000-4000-a000-000000000000",
      },
    });
    check(
      "guest cannot create a dog owned by someone else",
      !forged.ok,
      `status ${forged.status}`,
    );
  }

  console.log("\nSession sync");
  const lesson = (await rest("lessons?select=id&slug=eq.name_game"))
    .payload?.[0];
  const sessionId = crypto.randomUUID();
  {
    const s = await rest("training_sessions", {
      token: guest.token,
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: {
        id: sessionId,
        dog_id: dog.id,
        lesson_id: lesson.id,
        status: "completed",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
    });
    check("completed session upserts", s.ok, `status ${s.status}`);
    const e = await rest("session_events", {
      token: guest.token,
      method: "POST",
      prefer: "resolution=ignore-duplicates",
      body: [
        {
          id: crypto.randomUUID(),
          session_id: sessionId,
          type: "session_completed",
          occurred_at: new Date().toISOString(),
        },
      ],
    });
    check("session events upsert", e.ok, `status ${e.status}`);
    const again = await rest("training_sessions", {
      token: guest.token,
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: {
        id: sessionId,
        dog_id: dog.id,
        lesson_id: lesson.id,
        status: "completed",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
    });
    check("replayed sync is accepted", again.ok);
    const list = await rest("training_sessions?select=id", {
      token: guest.token,
    });
    check(
      "exactly one session after replay",
      list.payload?.length === 1,
      `saw ${list.payload?.length}`,
    );
  }

  console.log("\nPlan persistence");
  {
    const engine = (
      await rest("plan_engine_versions?select=id&order=version.desc&limit=1")
    ).payload?.[0];
    check("plan engine version is readable", Boolean(engine?.id));
    const plan = await rest("training_plans", {
      token: guest.token,
      method: "POST",
      prefer: "return=representation",
      body: {
        dog_id: dog.id,
        plan_engine_version_id: engine.id,
        status: "active",
        daily_minutes: 10,
        start_date: new Date().toISOString().slice(0, 10),
        length_days: 7,
      },
    });
    const planId = plan.payload?.[0]?.id;
    check("plan row persists", Boolean(planId), JSON.stringify(plan.payload));
    const day = await rest("plan_days", {
      token: guest.token,
      method: "POST",
      prefer: "return=representation",
      body: {
        plan_id: planId,
        day_index: 0,
        date: new Date().toISOString().slice(0, 10),
        total_minutes: 3,
      },
    });
    const dayId = day.payload?.[0]?.id;
    check("plan day persists", Boolean(dayId), JSON.stringify(day.payload));
    const activity = await rest("plan_activities", {
      token: guest.token,
      method: "POST",
      body: [
        {
          plan_day_id: dayId,
          lesson_id: lesson.id,
          sort_order: 0,
          estimated_minutes: 3,
          is_review: false,
          selection_reason: "new_skill",
        },
      ],
    });
    check(
      "plan activity persists",
      activity.ok,
      `status ${activity.status} ${JSON.stringify(activity.payload)}`,
    );
    const readBack = await rest(
      "training_plans?select=id,status,plan_days(id,plan_activities(id))",
      { token: guest.token },
    );
    check(
      "plan reads back through RLS with its days and activities",
      readBack.payload?.[0]?.plan_days?.[0]?.plan_activities?.length === 1,
      JSON.stringify(readBack.payload),
    );
  }

  console.log("\nA second guest sees none of it");
  const other = await createGuest();
  created.push(other);
  {
    const dogs = await rest("dogs?select=id", { token: other.token });
    check("other guest sees no dogs", dogs.payload?.length === 0);
    const sessions = await rest("training_sessions?select=id", {
      token: other.token,
    });
    check("other guest sees no sessions", sessions.payload?.length === 0);
    const steal = await rest(`dogs?id=eq.${dog.id}`, {
      token: other.token,
      method: "PATCH",
      body: { name: "Stolen" },
      prefer: "return=representation",
    });
    check(
      "other guest cannot rename the dog",
      (steal.payload?.length ?? 0) === 0,
      JSON.stringify(steal.payload),
    );
  }

  console.log("\nEdge functions are deployed and refuse what they must");
  {
    const merge = await fn("auth-merge-guest", {
      token: guest.token,
      extraHeaders: { "X-Guest-Authorization": `Bearer ${other.token}` },
    });
    check(
      "merge: anonymous caller cannot be a target (403)",
      merge.status === 403,
      `status ${merge.status}`,
    );
    const mergeNoToken = await fn("auth-merge-guest");
    check(
      "merge: no tokens → 401",
      mergeNoToken.status === 401,
      `status ${mergeNoToken.status}`,
    );

    const verify = await fn("purchases-verify", {
      token: guest.token,
      body: { isPremium: true, storeTransactionId: "fake" },
    });
    check(
      "verify: answers 501 (not configured) or 409/200 — never grants on a body claim",
      [501, 409, 200].includes(verify.status),
      `status ${verify.status}`,
    );
    const ent = await rest("entitlements?select=is_premium_active", {
      token: guest.token,
    });
    check(
      "verify: guest is not premium afterwards",
      !(ent.payload ?? []).some((e) => e.is_premium_active),
      JSON.stringify(ent.payload),
    );
    const verifyAnon = await fn("purchases-verify", { body: {} });
    check(
      "verify: no token → 401",
      verifyAnon.status === 401,
      `status ${verifyAnon.status}`,
    );

    const hook = await fn("revenuecat-webhook", {
      body: {
        event: { id: "smoke", type: "INITIAL_PURCHASE", app_user_id: guest.id },
      },
    });
    check(
      "webhook: unauthenticated delivery refused (401 or 501)",
      hook.status === 401 || hook.status === 501,
      `status ${hook.status}`,
    );

    const del = await fn("account-delete", {
      token: guest.token,
      body: { confirm: "delete", userId: other.id },
    });
    check(
      "delete: body naming another user refused (400)",
      del.status === 400,
      `status ${del.status}`,
    );
  }

  console.log("\nAccount deletion (also the cleanup)");
  for (const identity of created) {
    const { status } = await fn("account-delete", {
      token: identity.token,
      body: { confirm: "delete" },
    });
    check(
      `deleted ${identity.id.slice(0, 8)}…`,
      status === 200,
      `status ${status}`,
    );
    const gone = await fetch(`${URL}/auth/v1/user`, {
      headers: headers(identity.token),
    });
    check("identity no longer exists", !gone.ok);
  }
  {
    const n = await count("dogs");
    check("anon still sees no dogs after cleanup", n === 0, `saw ${n}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Smoke test failed:", error.message);
  process.exit(1);
});
