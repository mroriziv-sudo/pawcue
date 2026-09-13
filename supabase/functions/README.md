# Edge Functions

`auth-merge-guest`, `purchases-verify`, `revenuecat-webhook` and `account-delete` are implemented. The two billing
functions refuse to grant anything until the RevenueCat secrets exist on the project (see below). Their shared
logic lives in `_shared/`; the pure mapping there is Vitest-tested (`pnpm test`), and the deployed endpoints are
exercised by `pnpm test:merge`, `pnpm test:billing`, `pnpm test:delete` and `pnpm test:smoke`.

Each function lives in its own directory with an `index.ts`; `supabase functions deploy` picks up directories, so a
Markdown spec like this one is never deployed. That is deliberate for the spec below: a stub `index.ts` for an
auth-critical endpoint could be deployed accidentally and would then be a live, unauthenticated endpoint.

---

## `auth-merge-guest` → `POST /v1/auth/merge-guest` — SECURITY CRITICAL

> **Implemented.** The rules below are normative and the seven test cases in
> [TESTING.md](../../TESTING.md#auth-merge-guest-security-cases) run against the deployed function (`pnpm
test:merge`). Related: [AUTH.md](../../AUTH.md), [DATABASE.md](../../DATABASE.md),
> [SECURITY.md](../../SECURITY.md).

### Why this endpoint carries the whole authorization burden

`merge_guest_session(p_anonymous_user_id, p_target_user_id)` re-parents one account's dogs, subscriptions and
entitlements onto another. It is `SECURITY DEFINER`, so it bypasses RLS by design, and its `EXECUTE` grant is
revoked from `public`/`anon`/`authenticated` — only the service role can call it.

That means **the database cannot protect this operation**. Its two UUID arguments are just strings; they prove
nothing about who is entitled to the merge. This endpoint is the only thing standing between a request and another
user's data.

This is not hypothetical. During Phase 0 validation the function was reachable directly at
`/rest/v1/rpc/merge_guest_session` by unauthenticated callers, and a test victim's dog was successfully stolen by a
test attacker. See SECURITY.md for the full write-up.

### Non-negotiable rules

1. **The caller's authenticated JWT is required.** No caller JWT → `401`. The merge target is derived from _that
   verified token's_ `sub` claim.
2. **The guest's anonymous-session JWT is required, and must be verified independently.** The client holds it on
   device; possession of it is the actual proof that this caller owns the guest data. No guest JWT → `401`.
3. **A user/guest ID in the request body is never sufficient, and never authoritative.** Both the source and the
   target must come from verified token claims. If the body carries an `anonymousSessionId`, it may only be
   cross-checked against the guest JWT's `sub` and must be rejected on mismatch — it must never be the thing the
   merge acts on.
4. **The guest token must actually be an anonymous identity** (`is_anonymous` claim true / the profile row's
   `is_anonymous`), and the target must not be. A permanent account is not a merge source.
5. **The service role key never leaves the server.** It is used only to invoke the RPC after both tokens verify.
6. **Idempotent and replay-safe.** A repeated call after a successful merge is a no-op (`merged_at` on
   `anonymous_sessions`), so a client retry after a dropped response cannot double-merge or duplicate rows.
7. **Existing-account conflict is not silently resolved.** If the target account already owns data, return `409`
   `GUEST_MERGE_CONFLICT` with both summaries and let the user choose — see
   [docs/architecture/state-flow.md](../../docs/architecture/state-flow.md).
8. **Rate limited**, and failures must not leak whether a given guest/user ID exists.

### Shape

```
POST /v1/auth/merge-guest
Authorization: Bearer <caller's authenticated JWT>     ← required, verified, supplies the merge TARGET
X-Guest-Authorization: Bearer <anonymous session JWT>  ← required, verified, supplies the merge SOURCE

200  merged (or already-merged no-op)
401  missing/invalid caller JWT, or missing/invalid/expired guest JWT
403  guest token is not an anonymous identity, or target is not a permanent account
409  GUEST_MERGE_CONFLICT — target account already has data
```

Carrying the guest token in its own header rather than the body keeps rule 3 structural: there is no ID in the body
for the handler to be tempted to trust.

---

## `purchases-verify` → `POST /v1/purchases/verify` — SECURITY CRITICAL

The only path by which a user becomes premium. `entitlements` and `subscriptions` have no client write policy, and
`recompute_entitlement` is revoked from `public`/`anon`/`authenticated`, so this handler under the service role is
the entire boundary between a claim and the row that decides access.

### Non-negotiable rules

1. **Identity comes from the verified caller JWT.** There is no user id in the body and no path where one could
   reach a write — the same structural rule as `auth-merge-guest`.
2. **The client never states its entitlement.** A body field such as `isPremium`, a status, an expiry or a price is
   not read. The body carries a `storeTransactionId`: a question, not an answer.
3. **The store is the authority.** The handler fetches the caller's subscriber from RevenueCat's REST API with the
   secret key and writes what it answers — including the product, so a client cannot buy the cheap one and claim
   the expensive one. A named transaction the subscriber does not hold is refused (`409`). The provider's answer
   is mapped and validated in `_shared/revenuecat-mapping.ts` before any write.
4. **Idempotent.** Keyed on `store_transaction_id` (unique, upserted) and `store_event_id` (unique). A retry, a
   duplicate callback and a replayed webhook converge on the same rows and the same `200`.
5. **Entitlement is derived, never assembled here.** `recompute_entitlement(user_id)` reads `subscriptions` and
   decides. The response reads the resulting row back rather than reporting what was intended.
6. **Rate limited**, with uniform failure text.

### Shape

```
POST /v1/purchases/verify
Authorization: Bearer <caller's JWT>     ← required, verified, supplies the OWNER
{ "storeTransactionId": "..." }          ← the transaction to verify; never an entitlement claim

200  { verified, isPremiumActive, source, expiresAt }  — read back from `entitlements`
400  malformed body / missing transaction id
401  missing or invalid caller JWT
429  rate limited
501  PROVIDER_NOT_CONFIGURED — no provider credential in this deployment; nothing verified, nothing granted
502  PROVIDER_UNAVAILABLE { providerStatus, providerDetail? } — RevenueCat answered with an error, or the request
     could not be made at all (providerStatus 0). providerDetail names the coarse cause: `invalid_secret_format`
     (the secret's value is not a valid header value — a pasted newline or quote), `network`, or `unknown`.
     Nothing is written. Every RevenueCat call is wrapped so this is a JSON answer, never a runtime 500.
```

### External configuration still required

`REVENUECAT_SECRET_API_KEY` (a server secret — never an `EXPO_PUBLIC_` name), set with `supabase secrets set`.
Until it exists the endpoint answers `501` and writes nothing. It is deliberately **not** stubbed to return a
plausible subscription: that would make the write path look exercised when it has never run.

---

## `revenuecat-webhook` → `POST /revenuecat-webhook` — SECURITY CRITICAL

RevenueCat's server-to-server notifications: renewals, expirations, refunds, billing issues, cancellations,
transfers. This is what keeps `entitlements` true while the app is closed.

### Non-negotiable rules

1. **Authenticated by shared secret.** The `Authorization` header must equal `REVENUECAT_WEBHOOK_AUTH`
   (constant-time compare). Unconfigured → `501`, everything refused.
2. **The event is a trigger, not a source of truth.** The handler re-fetches every affected subscriber from
   RevenueCat and re-derives state through the same mapping `purchases-verify` uses. Event fields never become
   subscription state.
3. **Idempotent on the event id.** `purchase_events.store_event_id = rc-event:<id>` is claimed first; a duplicate
   delivery returns `200` without touching subscriptions. A processing failure releases the claim and answers
   `5xx` so RevenueCat retries.
4. **Only this app's identities are written.** RevenueCat anonymous ids in `transferred_from` are skipped.
5. **`TRANSFER` re-parents by transaction id** — the new owner's reconcile moves the row, the old owner's
   reconcile recomputes them without it.

### Shape

```
POST /revenuecat-webhook
Authorization: <REVENUECAT_WEBHOOK_AUTH>          ← exactly the value configured in the RevenueCat dashboard
{ "event": { "id", "type", "app_user_id", ... } } ← RevenueCat's standard webhook body

200  { received, outcomes }  or  { received, duplicate: true }  or  { received, ignored: "<type>" }
400  malformed body / no event id
401  wrong secret
501  PROVIDER_NOT_CONFIGURED — no secret on the project; nothing accepted
502  a subscriber could not be re-fetched; claim released, RevenueCat will retry
```

### External configuration still required

`REVENUECAT_WEBHOOK_AUTH` and `REVENUECAT_SECRET_API_KEY` via `supabase secrets set`, and the webhook URL
(`<project>/functions/v1/revenuecat-webhook`) with that Authorization value entered in the RevenueCat dashboard.

---

## `account-delete` → `POST /v1/account/delete` — SECURITY CRITICAL, IRREVERSIBLE

Deletes the calling identity and, through the schema's cascades, everything it owns. Apple requires an in-app
path for any app with account creation; Google requires it plus a web route. This is the server half of both.

### Non-negotiable rules

1. **The identity deleted is the verified caller JWT's subject, and nothing else.** There is no user id in the
   body and no code path where one could reach the delete.
2. **A body that names an identity is refused (`400 BODY_IDENTITY_REJECTED`).** `userId`, `user_id`, `id`,
   `sub`, `email` — presence alone, whatever the value. Silently ignoring it would hide a client bug or an attack.
3. **Intent is explicit.** The body must be `{ "confirm": "delete" }`, else `400 CONFIRMATION_REQUIRED`. Not
   authentication — the server's half of "no accidental one-tap deletion".
4. **Guests are deleted like accounts.** An anonymous identity owns data too.
5. **RevenueCat first, then the account.** `DELETE /v1/subscribers/{id}` (404 = already gone = success), then
   `auth.admin.deleteUser`. A provider outage is `502` with the account untouched, so a retry is safe; the reverse
   order would strand a customer record nobody can address.
6. **`200` only after the profile is confirmed absent.** The schema does the rest: personal-data tables cascade;
   `subscriptions` / `purchase_events` keep their rows with `user_id` nulled (DATABASE.md, DATA_MAP.md).
7. **Idempotent by construction.** After success the subject no longer exists, so a replay is `401`; the client
   treats "Supabase no longer knows my token's user" as the deletion having happened.
8. Rate limited (5/min per identity), uniform failure text.

### Shape

```
POST /v1/account/delete
Authorization: Bearer <caller's JWT>   ← required, verified, the ONLY identity input
{ "confirm": "delete" }                ← required literal; any identity field → 400

200  { deleted: true }
400  INVALID_BODY | CONFIRMATION_REQUIRED | BODY_IDENTITY_REJECTED
401  missing or invalid caller JWT (including a JWT for an identity already deleted)
429  rate limited
500  DELETION_FAILED — the auth delete failed or the profile is still present; nothing pretended
502  PROVIDER_UNAVAILABLE { providerStatus, providerDetail? } — RevenueCat could not be reached or refused; the
     account is untouched. Same detail vocabulary as purchases-verify.
```

`pnpm test:delete` runs 44 checks against the deployed function: every refusal is followed by reading the
would-be victim's data back through RLS as that victim.
