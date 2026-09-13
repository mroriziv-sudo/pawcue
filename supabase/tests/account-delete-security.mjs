#!/usr/bin/env node
/**
 * Security tests for `POST /v1/account/delete` against the **deployed** edge function.
 *
 * Deletion is the one operation more dangerous than the merge: it is irreversible, and it runs under the service
 * role. The handler's only defence is that the identity it deletes comes from the verified JWT and from nowhere
 * else. These cases prove that — every rejection is followed by reading the would-be victim's data back through
 * RLS as that victim, because a `401` that still deleted the account would pass a status-only test.
 *
 * Run with `pnpm test:delete` (requires .env.local; no service-role key is used or needed here). Creates its own
 * throwaway identities on the linked (staging) project and deletes the ones it can.
 */

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY",
  );
  process.exit(1);
}

const FUNCTION_URL = `${URL}/functions/v1/account-delete`;
const MERGE_URL = `${URL}/functions/v1/auth-merge-guest`;

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
  const email = `phase95-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
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

/** Whether Supabase Auth still recognises the token's subject — the identity's existence, checked directly. */
async function identityExists(token) {
  const response = await fetch(`${URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  return response.ok;
}

async function deleteAccount({ token, body, raw, method = "POST" }) {
  const headers = { apikey: ANON, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(FUNCTION_URL, {
    method,
    headers,
    body: method === "POST" ? (raw ?? JSON.stringify(body ?? {})) : undefined,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* some rejections have no body */
  }
  return { status: response.status, payload };
}

async function merge({ callerToken, guestToken }) {
  const response = await fetch(MERGE_URL, {
    method: "POST",
    headers: {
      apikey: ANON,
      "Content-Type": "application/json",
      Authorization: `Bearer ${callerToken}`,
      "X-Guest-Authorization": `Bearer ${guestToken}`,
    },
    body: "{}",
  });
  return response.status;
}

function encode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

/** A structurally valid JWT with a broken signature — tests verification, not merely parsing. */
function forgedJwt(subject, expOffset = 3600) {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const claims = encode({
    sub: subject,
    role: "authenticated",
    is_anonymous: false,
    exp: Math.floor(Date.now() / 1000) + expOffset,
  });
  return `${header}.${claims}.not-a-real-signature`;
}

async function main() {
  console.log("Setting up real identities and data…");

  const victim = await createAccount();
  const attacker = await createAccount();
  const victimDog = await createDog(victim.token, "Victim Dog", victim.id);
  const attackerDog = await createDog(
    attacker.token,
    "Attacker Dog",
    attacker.id,
  );
  console.log(`  victim ${victim.id} owns ${victimDog.id}`);
  console.log(`  attacker ${attacker.id} owns ${attackerDog.id}\n`);

  const victimIntact = async (label) => {
    check(`${label}: victim still exists`, await identityExists(victim.token));
    check(
      `${label}: victim still owns their dog`,
      (await dogsOf(victim.token)).some((d) => d.id === victimDog.id),
    );
  };

  // -------------------------------------------------------------------------------------------------------------
  console.log("Wrong method");
  {
    const { status } = await deleteAccount({
      token: attacker.token,
      method: "GET",
    });
    check("rejected 405", status === 405, `got ${status}`);
  }

  console.log("\nNo token");
  {
    const { status } = await deleteAccount({ body: { confirm: "delete" } });
    check("rejected 401", status === 401, `got ${status}`);
    await victimIntact("no token");
  }

  console.log("\nForged token naming the victim");
  {
    const { status } = await deleteAccount({
      token: forgedJwt(victim.id),
      body: { confirm: "delete" },
    });
    check("rejected 401", status === 401, `got ${status}`);
    await victimIntact("forged token");
  }

  console.log("\nExpired token naming the victim");
  {
    const { status } = await deleteAccount({
      token: forgedJwt(victim.id, -3600),
      body: { confirm: "delete" },
    });
    check("rejected 401", status === 401, `got ${status}`);
    await victimIntact("expired token");
  }

  console.log("\nAuthenticated attacker names the victim in the body");
  {
    // The Phase 0 exploit in deletion form. The handler must refuse, and must not delete the attacker either.
    for (const key of ["userId", "user_id", "id"]) {
      const { status, payload } = await deleteAccount({
        token: attacker.token,
        body: { confirm: "delete", [key]: victim.id },
      });
      check(`body.${key} rejected 400`, status === 400, `got ${status}`);
      check(
        `body.${key} refused as an identity claim`,
        payload?.error === "BODY_IDENTITY_REJECTED",
        JSON.stringify(payload),
      );
    }
    await victimIntact("body identity");
    check(
      "attacker was not deleted either",
      await identityExists(attacker.token),
    );
    check(
      "attacker still owns their own dog",
      (await dogsOf(attacker.token)).some((d) => d.id === attackerDog.id),
    );
  }

  console.log("\nAuthenticated caller without explicit confirmation");
  {
    const empty = await deleteAccount({ token: attacker.token, body: {} });
    check(
      "empty body rejected 400",
      empty.status === 400,
      `got ${empty.status}`,
    );
    check(
      "reported as confirmation required",
      empty.payload?.error === "CONFIRMATION_REQUIRED",
    );

    const wrong = await deleteAccount({
      token: attacker.token,
      body: { confirm: true },
    });
    check(
      "confirm:true (not the literal) rejected 400",
      wrong.status === 400,
      `got ${wrong.status}`,
    );

    const malformed = await deleteAccount({
      token: attacker.token,
      raw: "{not json",
    });
    check(
      "malformed body rejected 400",
      malformed.status === 400,
      `got ${malformed.status}`,
    );

    check("caller still exists", await identityExists(attacker.token));
    check(
      "caller still owns their dog",
      (await dogsOf(attacker.token)).length === 1,
    );
  }

  console.log("\nA user deletes their own account");
  {
    const { status, payload } = await deleteAccount({
      token: attacker.token,
      body: { confirm: "delete" },
    });
    check("allowed 200", status === 200, `got ${status}`);
    check("reported deleted", payload?.deleted === true);
    check(
      "the identity no longer exists",
      !(await identityExists(attacker.token)),
    );
    check(
      "their token can no longer read anything",
      (await dogsOf(attacker.token)).length === 0,
    );
    await victimIntact("self-deletion");
  }

  console.log("\nReplay with the deleted identity's token");
  {
    const { status } = await deleteAccount({
      token: attacker.token,
      body: { confirm: "delete" },
    });
    check(
      "rejected 401 — the identity is gone, which is the deletion having happened",
      status === 401,
      `got ${status}`,
    );
    await victimIntact("replay");
  }

  console.log("\nA guest deletes their data");
  {
    const guest = await createGuest();
    const dog = await createDog(guest.token, "Guest Dog", guest.id);
    check("guest owns a dog", (await dogsOf(guest.token))[0]?.id === dog.id);

    const { status } = await deleteAccount({
      token: guest.token,
      body: { confirm: "delete" },
    });
    check(
      "allowed 200 for an anonymous identity",
      status === 200,
      `got ${status}`,
    );
    check("guest identity gone", !(await identityExists(guest.token)));

    // A brand-new guest is a different identity and sees none of it.
    const next = await createGuest();
    check(
      "a fresh guest sees nothing",
      (await dogsOf(next.token)).length === 0,
    );
    await deleteAccount({ token: next.token, body: { confirm: "delete" } });
  }

  console.log("\nDeleting an account removes the guest data merged into it");
  {
    const guest = await createGuest();
    const account = await createAccount();
    const dog = await createDog(guest.token, "Merged Dog", guest.id);
    const mergeStatus = await merge({
      callerToken: account.token,
      guestToken: guest.token,
    });
    check("merge succeeded", mergeStatus === 200, `got ${mergeStatus}`);
    check(
      "account owns the merged dog",
      (await dogsOf(account.token)).some((d) => d.id === dog.id),
    );

    const { status } = await deleteAccount({
      token: account.token,
      body: { confirm: "delete" },
    });
    check("account deleted", status === 200, `got ${status}`);
    check("account identity gone", !(await identityExists(account.token)));
    // The merged guest identity still exists (it was never deleted, only emptied) and still sees nothing.
    check(
      "the old guest identity did not regain the dog",
      (await dogsOf(guest.token)).length === 0,
    );
    await deleteAccount({ token: guest.token, body: { confirm: "delete" } });
  }

  // Clean up the victim too: the point of the test was to prove it survived, and it did.
  await deleteAccount({ token: victim.token, body: { confirm: "delete" } });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Test run failed:", error.message);
  process.exit(1);
});
