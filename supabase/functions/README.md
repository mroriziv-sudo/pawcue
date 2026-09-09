# Edge Functions

Implementations land in **Phase 4** (core API) and **Phase 7** (auth/merge). This directory intentionally contains
no function code yet.

Each function lives in its own directory with an `index.ts`; `supabase functions deploy` picks up directories, so a
Markdown spec like this one is never deployed. That is deliberate for the spec below: a stub `index.ts` for an
auth-critical endpoint could be deployed accidentally and would then be a live, unauthenticated endpoint.

---

## `auth-merge-guest` → `POST /v1/auth/merge-guest` (Phase 7) — SECURITY CRITICAL

> **Implementation TODO (Phase 7).** Do not implement this endpoint without satisfying every rule below, and do not
> mark Phase 7 complete until the seven test cases in [TESTING.md](../../TESTING.md#auth-merge-guest-security-cases)
> pass. Related: [AUTH.md](../../AUTH.md), [DATABASE.md](../../DATABASE.md), [SECURITY.md](../../SECURITY.md).

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
