# Testing

## The per-task loop (brief §35 — mandatory, not aspirational)

Every implementation task, no matter how small, goes through: understand requirement → smallest correct change →
formatter → lint → typecheck → unit tests → integration tests → UI tests → fix all failures → re-run → check
English → check Hebrew → check RTL → check accessibility → check loading/error/empty states → check offline
behavior if relevant → document the change. **Do not move on while tests are red.** This isn't a release-time gate
only — it's the loop for a single PR-sized change.

## Suites (brief §36)

- **Plan engine** (`packages/domain` unit tests): age rules, goal rules, prerequisites, time limits, repetition,
  completed-lesson exclusion, invalid input handling, and — critically — **determinism**: the same input + engine
  version always produces byte-identical output, checked via a snapshot test, not just "looks reasonable."
- **Auth**: guest, Apple, Google, logout, merge, duplicate-merge-is-idempotent, expired token, account deletion —
  run against a local Supabase instance, not mocked at the HTTP layer, so RLS is actually exercised.
- **Database**: implemented in [`supabase/tests/rls_security.sql`](supabase/tests/rls_security.sql) — 93 checks
  covering anonymous/public catalog access, own-data access, cross-user denial (read/update/delete/ownership
  forgery), unauthorized writes to server-authoritative tables (`entitlements`, `subscriptions`,
  `purchase_events`), the `merge_guest_session` privilege-escalation regression, guest-merge correctness and
  idempotency, constraints, the `auth.users` → `profiles` trigger, `updated_at` triggers, and account-deletion
  behavior (personal data hard-deleted; billing/audit rows retained with `user_id` nulled).

  These run against a **real Supabase project, never production**:

  ```
  pnpm db:reset      # replay every migration from zero + seed — proves reproducibility
  pnpm db:test       # the 93-check suite (guarded: refuses unless staging is the linked project)
  pnpm db:advisors   # Supabase's own security/performance linter — must be clean
  pnpm db:verify     # all three in order
  pnpm db:types      # regenerate packages/domain/src/generated/database.types.ts
  ```

  The suite drops to the actual `anon` / `authenticated` roles via `set local role` plus `request.jwt.claims`.
  This matters: the migration role bypasses RLS, so assertions made without dropping privileges prove nothing.

  `pnpm db:types` output is committed and guarded by `schema-conformance.test.ts`, which parses it and fails if a
  domain model and the real schema drift apart in either direction.

### `auth-merge-guest` security cases

Required before **Phase 7** can be called done. These cover
`POST /v1/auth/merge-guest`, whose spec is [supabase/functions/README.md](supabase/functions/README.md). They exist
because the database deliberately cannot defend this operation: `merge_guest_session` is `SECURITY DEFINER`,
service-role-only, and its UUID arguments prove nothing. This endpoint is the entire authorization boundary, and a
regression here is another account takeover (see SECURITY.md for the Phase 0 incident).

Every case must assert on **observable data effects**, not just the status code — after a rejection, the victim's
`dogs`/`subscriptions`/`entitlements` rows must be provably unchanged.

| #   | Case                                                     | Expected                                                                                                                            |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Authenticated caller JWT **+** valid matching guest JWT  | **Allowed.** Guest data re-parented to the caller; `anonymous_sessions.merged_at` set                                               |
| 2   | Missing caller JWT (guest JWT present)                   | **Rejected `401`.** No data moves                                                                                                   |
| 3   | Missing guest JWT (caller JWT present)                   | **Rejected `401`.** No data moves — an authenticated user must not be able to claim a guest they can't prove                        |
| 4   | Invalid or expired guest JWT (bad signature, `exp` past) | **Rejected `401`.** Both variants tested separately; no data moves                                                                  |
| 5   | Guest JWT belonging to a **different** anonymous session | **Rejected.** Merge source comes from the verified token, so this can only ever merge that token's own session — never the victim's |
| 6   | Forged guest ID in the request body with no matching JWT | **Rejected `401`.** This is the Phase 0 exploit in endpoint form; body IDs are never authoritative                                  |
| 7   | Replay — the same valid merge submitted twice            | **Safe and idempotent.** Second call is a no-op: no duplicate dogs/sessions, `merged_at` unchanged, still `200`                     |

Case 5 deserves a second assertion, and the implementation is **stricter than this table originally described**.
The table said to submit a valid guest JWT for session A with a body naming session B and assert that A merged.
The endpoint instead **rejects the request outright** (`403 GUEST_TOKEN_SESSION_MISMATCH`) and merges nothing,
because rule 3 of [supabase/functions/README.md](supabase/functions/README.md) is normative: a body id "must be
rejected on mismatch". The suite asserts both A and B are untouched.

"The source comes from the token" is then proven positively by a separate case: a different account merges guest
B using only B's token, and receives exactly B's dog while the first account is unaffected.

These run against the **deployed** function with real JWTs and real rows:

```
pnpm test:merge
```

### `account-delete` security cases (Phase 9.5)

`pnpm test:delete` — 44 checks against the deployed `account-delete` function. The identity deleted must be the
verified caller's and nobody else's: no token, forged token, expired token → `401`; an authenticated caller
naming a victim in the body (`userId`, `user_id`, `id`) → `400` with both accounts intact; missing or wrong
confirmation → `400`; a real self-deletion → `200`, the identity gone, the token useless, the victim untouched; a
replay → `401`; a guest deleting their own data; and an account that received merged guest data taking that data
with it. Every refusal is followed by reading the victim's dog back through RLS as the victim.

### Environment smoke test

`pnpm test:smoke` (staging) / `pnpm test:smoke:production` — 45 checks, **self-cleaning** (every identity it
creates is deleted through `account-delete`), so it is the one suite safe to run against production:
migrations, catalogue counts against `seed.sql`, anon isolation, guest creation, dog creation, session sync with
replay, plan persistence, cross-guest isolation, every Edge Function's refusals, and deletion.

- **Billing**: free user, trial, monthly, annual, expiration, cancellation, grace period, restore, refund, and
  **webhook replay idempotency** (the same store notification delivered twice must not double-apply).

  As built, everything that does not need store credentials is covered without them: the entitlement policy
  (including expiry beating an active flag, and the offline grace window), product reconciliation, the purchase and
  restore lifecycles, premium/prerequisite gating, data safety under entitlement loss, the guest→account
  transition, and the production guards on the development-only simulator. Server-side, the security suite asserts
  entitlement derivation from `subscriptions` and that `recompute_entitlement` is unreachable by any client role.

  What still requires **Apple sandbox / Play test track / a physical device**: a real purchase, a real restore, a
  real renewal, refund and revocation notification, and webhook replay against live store data. The verification
  endpoint's write path has never executed — it answers `501` without a provider credential, deliberately rather
  than returning a plausible subscription.

  For local iOS purchase testing without a sandbox account, `apps/mobile/PawCue.storekit` is a StoreKit
  configuration file (product IDs and test-only settings, no real prices or credentials). Select it under
  Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration to exercise purchase/restore flows
  offline in the simulator.

- **Localization**: English, Hebrew, RTL, long strings (Hebrew/German-style string expansion doesn't clip), ICU
  pluralization (see LOCALIZATION.md — Hebrew's four categories, not two), missing-translation fallback.
- **Clicker**: audio preload, press-to-sound latency budget, rapid repeated presses (no dropped/queued-and-delayed
  triggers), silent setting, haptics-off setting, background→foreground transition (audio session doesn't need
  re-priming on every resume).
- **E2E** (Maestro — see tech-stack-versions.md for the Maestro-vs-Detox call): fresh install → clicker → first
  lesson → plan → Day 1 → paywall → close → continue free experience; and, separately, guest → train → Apple/Google
  sign-in → progress preserved.

## Device QA matrix (brief §37)

Small/standard/large iPhone; small/standard/large Android. Check per device class: notch/dynamic-island safe areas,
keyboard behavior, RTL, text scaling (Dynamic Type / font scale), low connectivity, airplane mode, resume from
background.

## What "done" means for a phase

Per brief §44: at the end of each phase, summarize work, run the relevant suites above, list open issues, update
the affected docs, and get a clean build — before starting the next phase's work, not after it's already underway.
