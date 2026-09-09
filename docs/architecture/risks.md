# Implementation risks

Ranked roughly by (likelihood × cost if it goes wrong). Owner phase noted so each risk has a checkpoint.

## High

1. **Billing correctness (Phase 8).** Subscription state has many edge cases (trial, grace period, billing retry,
   refund, revoked, restore, cross-platform restore). A client-trusted `isPremium` boolean is explicitly forbidden by
   the brief; entitlement must be server-resolved and kept in sync via App Store Server Notifications v2 / Google
   Play RTDN. Mitigation: `entitlements` is a derived table, never written directly by the client; webhook handlers
   are idempotent (keyed by store transaction/notification ID) and covered by a replay test (§36).
2. **Guest→account merge duplicating or losing data.** Two real risks: (a) double-merge creating duplicate dogs/plans
   on client retry, (b) merging into an account that already has data and silently clobbering it. Mitigated by the
   idempotent `merge_guest_session` function and the explicit `409 GUEST_MERGE_CONFLICT` path — see state-flow.md.
   Needs a dedicated integration test matrix (§36 AUTH).
3. **RLS mistakes exposing cross-user data.** Any missing/incorrect policy is a privacy incident, not just a bug.
   Mitigated by: RLS enabled from migration 0001 (never "add later"), pgTAP cross-user-access-denied tests required
   before Phase 4 is considered done, and a policy per table documented in DATABASE.md so a missing policy is visible
   by inspection.
4. **Store policy drift between "today" and ship date.** App Store / Play Store requirements (Sign in with Apple
   triggers, privacy manifest enforcement, target SDK deadlines, Play Billing Library minimum version) change on
   their own schedule. Mitigated by treating RELEASE_CHECKLIST.md as a living doc re-verified against official docs
   immediately before each submission (Phase 12), not something written once in Phase 0 and trusted forever.

## Medium

5. **Plan engine producing an unsafe or overwhelming plan** (too many new skills at once, exceeding the user's
   selected daily minutes, ignoring prerequisites). Mitigated by the engine being a pure deterministic function with
   an exhaustive unit test matrix (age × goal × known-skills × time-budget combinations, §36 PLAN ENGINE) rather than
   hand-verified per case.
6. **Clicker audio latency regressions**, especially on lower-end Android where audio-session cold-start can add
   noticeable delay. Mitigated by preloading at boot and a perf budget test (press-to-sound latency) in the clicker
   test suite (§36 CLICKER); if `expo-audio` proves to have unacceptable trigger latency on a target device tier, the
   fallback is a native-module click player — a decision to revisit with real device measurements in Phase 2, not
   assumed away now.
7. **RTL bugs shipping silently.** RTL defects are easy to miss because most engineering happens in an LTR locale.
   Mitigated by treating Hebrew/RTL as a required check in the per-task testing loop (§35, steps 12–13), not a
   Phase-10-only pass, and by banning `left`/`right` style props at the lint level in `packages/ui`.
8. **Troubleshooting content quality/liability.** Bad advice for a dangerous behavior (aggression, injury) is a real
   safety concern, not just a UX one. Mitigated by the `NORMAL` / `PROFESSIONAL_TRAINER_RECOMMENDED` /
   `VET_RECOMMENDED` / `URGENT_SAFETY` safety categories being a required field on every troubleshooting option (not
   optional), and seed content review against §34 before Phase 3 content is considered launch-ready.
9. **Offline mutation queue conflicts.** Mitigated by making session events append-only/idempotent by client UUID
   (see ARCHITECTURE.md §8) so there is no real "conflict" to resolve for the common path; only plan
   regeneration-while-offline needs an explicit "stale plan" banner rather than silent overwrite.

## Lower (tracked, not blocking early phases)

10. **i18n string drift** (new UI strings landing without a Hebrew translation). Mitigated by a CI check that fails
    if any key exists in `en-US` but not `he-IL` (Phase 10), and a documented fallback-to-English behavior for the
    "translation-ready but not reviewed" locales so nothing ships a raw machine translation to end users (§25).
11. **Third-party SDK privacy/compliance drift** (a crash/analytics vendor changing its data collection or privacy
    manifest requirements after we integrate). Mitigated by keeping crash/analytics behind `AnalyticsProvider`/an
    observability interface (ARCHITECTURE.md §4) so a vendor swap doesn't ripple through the app, and by re-checking
    privacy manifest requirements at each store submission, not just at integration time.
12. **Scope creep against the "5 core screens, not 100 lessons" principle.** The seed content set (§41) is
    deliberately ~13 lessons; expanding the library is a content operations question for later, not something the
    architecture should implicitly encourage by over-generalizing the content pipeline in v1.
