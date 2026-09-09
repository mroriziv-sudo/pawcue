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
- **Database**: implemented in [`supabase/tests/rls_security.sql`](supabase/tests/rls_security.sql) — 49 checks
  covering anonymous/public catalog access, own-data access, cross-user denial (read/update/delete/ownership
  forgery), unauthorized writes to server-authoritative tables (`entitlements`, `subscriptions`,
  `purchase_events`), the `merge_guest_session` privilege-escalation regression, guest-merge correctness and
  idempotency, constraints, the `auth.users` → `profiles` trigger, `updated_at` triggers, and account-deletion
  behavior (personal data hard-deleted; billing/audit rows retained with `user_id` nulled).

  These run against a **real Supabase project, never production**:

  ```
  pnpm db:reset      # replay every migration from zero + seed — proves reproducibility
  pnpm db:test       # the 49-check suite
  pnpm db:advisors   # Supabase's own security/performance linter — must be clean
  pnpm db:verify     # all three in order
  pnpm db:types      # regenerate packages/domain/src/generated/database.types.ts
  ```

  The suite drops to the actual `anon` / `authenticated` roles via `set local role` plus `request.jwt.claims`.
  This matters: the migration role bypasses RLS, so assertions made without dropping privileges prove nothing.

  `pnpm db:types` output is committed and guarded by `schema-conformance.test.ts`, which parses it and fails if a
  domain model and the real schema drift apart in either direction.

- **Billing**: free user, trial, monthly, annual, expiration, cancellation, grace period, restore, refund, and
  **webhook replay idempotency** (the same store notification delivered twice must not double-apply).
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
