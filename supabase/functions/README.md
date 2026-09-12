# Edge Functions

`auth-merge-guest` is implemented; `purchases-verify` is implemented and refuses to grant anything until a store
provider credential exists (see below).

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
3. **The store is the authority.** `verifyWithProvider` asks the provider and its answer is what gets written —
   including the product, so a client cannot buy the cheap one and claim the expensive one. The provider's answer
   is itself validated against the product/status enums before any write.
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
502  the provider returned a product or status outside the schema's enums
```

### External configuration still required

`REVENUECAT_SECRET_API_KEY` (a server secret — never an `EXPO_PUBLIC_` name) plus the RevenueCat project, App Store
Connect and Play Console setup listed in `docs/architecture/phase-7-monetization.md`. Until that exists,
`verifyWithProvider` returns null and the endpoint answers `501`. It is deliberately **not** stubbed to return a
plausible subscription: that would make the write path look exercised when it has never run.
