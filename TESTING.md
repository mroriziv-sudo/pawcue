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
- **Database**: RLS (pgTAP — cross-user access must be denied, not just "usually filtered"), deletion cascades,
  migration replay from zero (`supabase db reset` in CI), constraint checks (e.g. one active plan per dog, one
  primary goal per dog).
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
