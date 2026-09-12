/**
 * Billing endpoint security, against the deployed functions.
 *
 * What is provable today, with no RevenueCat credentials on the project: that every path which could grant
 * premium **fails closed**. The verify endpoint authenticates the caller and then refuses (`501`) because it
 * cannot ask RevenueCat; the webhook refuses everything (`501`) because it has no shared secret to check. In
 * both cases the assertion that matters is on data: no `subscriptions` row and no `entitlements` row appears for
 * the caller, whatever the body claims.
 *
 * Once `REVENUECAT_SECRET_API_KEY` and `REVENUECAT_WEBHOOK_AUTH` are set, the `501`s become real lookups and this
 * file's expectations for those two cases change to `409 TRANSACTION_NOT_VERIFIED` (a made-up transaction) and
 * `401` (a wrong secret). Both are noted inline. Everything else here stays true either way.
 *
 * Run with `pnpm test:billing` (requires .env.local; no service-role key is used or needed here).
 */

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY",
  );
  process.exit(1);
}

const VERIFY_URL = `${URL}/functions/v1/purchases-verify`;
const WEBHOOK_URL = `${URL}/functions/v1/revenuecat-webhook`;

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

/** Rows visible to this user through RLS. The client can read its own billing rows, never write them. */
async function ownRows(token, table) {
  const response = await fetch(`${URL}/rest/v1/${table}?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  return response.ok ? await response.json() : [];
}

async function verify(token, body, { raw = false } = {}) {
  const headers = { apikey: ANON, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers,
    // `raw` sends the bytes as given; `JSON.stringify("{not json")` would be a perfectly valid JSON string.
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    /* empty body */
  }
  return { status: response.status, json };
}

async function webhook(authHeader, body) {
  const headers = { apikey: ANON, "Content-Type": "application/json" };
  if (authHeader !== null) headers.Authorization = authHeader;
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    /* empty body */
  }
  return { status: response.status, json };
}

async function main() {
  console.log("purchases-verify");
  const guest = await createGuest();

  {
    const r = await verify(null, { storeTransactionId: "tx-1" });
    check(
      "rejects a call with no caller token",
      r.status === 401,
      `got ${r.status}`,
    );
  }
  {
    const r = await verify("not-a-jwt", { storeTransactionId: "tx-1" });
    check(
      "rejects an invalid caller token",
      r.status === 401,
      `got ${r.status}`,
    );
  }
  {
    const r = await verify(guest.token, "{not json", { raw: true });
    check("rejects a malformed body", r.status === 400, `got ${r.status}`);
  }
  {
    const r = await verify(guest.token, { storeTransactionId: 42 });
    check(
      "rejects a non-string transaction id",
      r.status === 400,
      `got ${r.status}`,
    );
  }
  {
    // Without a provider secret the endpoint must refuse rather than guess. With one, this becomes 409.
    const r = await verify(guest.token, { storeTransactionId: "tx-made-up" });
    check(
      "fails closed for an authenticated caller when the provider is not configured (501) or refuses an unknown transaction (409)",
      r.status === 501 || r.status === 409,
      `got ${r.status} ${JSON.stringify(r.json)}`,
    );
    check(
      "names the reason in a machine-readable code",
      r.json?.error === "PROVIDER_NOT_CONFIGURED" ||
        r.json?.error === "TRANSACTION_NOT_VERIFIED",
      JSON.stringify(r.json),
    );
  }
  {
    // The Phase 0 exploit in billing form: a body that asserts entitlement. None of these fields are read.
    const r = await verify(guest.token, {
      isPremium: true,
      isPremiumActive: true,
      status: "active",
      productId: "premium_annual",
      entitlement: { isPremiumActive: true },
      user_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    });
    check(
      "ignores every entitlement claim in the body (no 200 with a grant)",
      r.status !== 200 || r.json?.isPremiumActive === false,
      `got ${r.status} ${JSON.stringify(r.json)}`,
    );
  }

  const subs = await ownRows(guest.token, "subscriptions");
  const ents = await ownRows(guest.token, "entitlements");
  check(
    "no subscription row was written for the caller",
    subs.length === 0,
    `${subs.length} rows`,
  );
  check(
    "no entitlement row was written for the caller",
    ents.length === 0,
    `${ents.length} rows`,
  );

  console.log("\nrevenuecat-webhook");
  const event = {
    event: {
      id: `test-${Date.now()}`,
      type: "INITIAL_PURCHASE",
      app_user_id: guest.id,
      store: "APP_STORE",
    },
  };
  {
    const r = await webhook(null, event);
    check(
      "refuses an event with no Authorization (401 or, unconfigured, 501)",
      r.status === 401 || r.status === 501,
      `got ${r.status}`,
    );
  }
  {
    const r = await webhook("definitely-not-the-secret", event);
    check(
      "refuses an event with the wrong secret (401 or, unconfigured, 501)",
      r.status === 401 || r.status === 501,
      `got ${r.status}`,
    );
  }
  {
    const r = await webhook("definitely-not-the-secret", {
      event: { ...event.event, type: "TEST" },
    });
    check(
      "does not process a TEST event without the secret either",
      r.status === 401 || r.status === 501,
      `got ${r.status}`,
    );
  }

  const subsAfter = await ownRows(guest.token, "subscriptions");
  const entsAfter = await ownRows(guest.token, "entitlements");
  check(
    "the webhook wrote no subscription row",
    subsAfter.length === 0,
    `${subsAfter.length} rows`,
  );
  check(
    "the webhook wrote no entitlement row",
    entsAfter.length === 0,
    `${entsAfter.length} rows`,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
