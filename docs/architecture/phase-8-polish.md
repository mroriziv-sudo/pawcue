# Phase 8 — product polish and retention

Phase 8 changed how the app reads, not how it works. No store, no engine, no contract and no screen's purpose
moved. What follows is the set of decisions the polish encoded, and the two things it deliberately did not build.

## Shared scaffolding

Four components were extracted, each from duplication that had already drifted:

| Component       | Replaces                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| `ScreenScroll`  | Every screen re-deriving `insets.top + space[n]`, and arriving at different `n` |
| `Section`       | `<View style={{ gap: space[2] }}>` repeated as the grouping idiom               |
| `SectionHeader` | `<Text variant="h3">` plus an ad-hoc second line for a trailing fact            |
| `StatusPill`    | A bare `<Text tone="...">` per state, differing only in hue                     |

These are extractions, not a parallel system — every one of them renders the same design-system primitives the
screens were already using.

`EmptyState` **moved** from `app/(tabs)/index.tsx` to `src/components/`. Three route files were importing a
component out of a fourth route file, which made Today a de-facto component library and meant a change to the home
screen could break the Progress tab.

## What each screen gained

**Today** now states one fact in its subtitle rather than two, shows the remaining time once (it previously
appeared as a heading subtitle _and_ on the only card beneath it), gives the clicker a card with a real touch
target instead of a floating line of centred text, and surfaces an in-progress lesson above the plan.

**Train** gives unfinished work its own section. It used to sit inside "Ready to train", indistinguishable from a
lesson nobody had opened — which disagreed with the planner, where `continue_unfinished` is the highest-priority
rule. Each section heading carries its count, and completion is acknowledged in the catalogue (how many times)
rather than only on the completion screen.

**Progress** groups history by day. Four identical "The Name Game — yesterday" rows read as a rendering fault
rather than as four sessions; people train in bursts, so the day is the unit the history is actually shaped like.
The two totals that matter are sized as numbers instead of being four sentences of equal weight.

**Dog** separates the ways out — edit, account, settings — from the read-only profile fields, under their own
heading. This is the Phase 4 lesson applied again: a section heading governs everything until the next one, so
three navigation cards under "Profile" read as three more profile fields.

**Session** says "Pause", not "Exit". Leaving discards nothing — the session is persisted on every transition and
`resumeOrBegin` picks it up — so pause is the honest word, and the hint says the progress is saved. The control is
also a real 44pt target rather than a caption with hit slop.

**Paywall** names the free tier alongside what premium adds. A benefits list on its own invites the reading that
nothing works without paying, which is false here and would be a dark pattern left to stand.

## Completion

The completion screen now answers "what happens next" with the real next activity from the persisted plan — the
finished session is already in the training log by the time it renders, so `buildTodayView` ticks it off and the
first remaining activity is genuinely next. When there is none, it says the day's plan is finished.

It fires one success haptic on arrival. `hapticForEvent.lessonComplete` has existed since Phase 1 and nothing ever
called it; the design system described a vocabulary the app never spoke.

Still no points, badges, streaks or achievements. What happened, and what is next, is the reward.

## Retention — what was built and what was not

**Built:** the in-app return path. Today surfaces an in-progress session above the plan, and Train gives unfinished
lessons their own section. Both read real state — `session-store` holds exactly one in-progress session, and it is
the same one the training screen resumes — so neither is a nag about something the user never started.

**Deferred: local notification reminders.** Phase 0 defines the `NotificationProvider` interface and the
`reminders` / `notification_preferences` tables, but nothing in the app references either and `expo-notifications`
is not installed. Shipping reminders needs all of:

1. `expo-notifications` added, plus its config plugin — a native dependency and an EAS rebuild.
2. A **new OS permission**, which brief §18 allows only after explicit opt-in and never at launch.
3. A `NotificationProvider` implementation plus reconciliation between the OS scheduler and the `reminders` rows,
   including cancellation on account deletion (DATA_MAP.md already specifies this).
4. Permission-denied, permission-revoked and reschedule-on-reinstall handling.

That is an additive architecture, not a polish task. Building a reminder _preference_ that schedules nothing would
be the dead infrastructure this project has already had to correct once. It is deferred, with the requirements
above as the spec.

**Permission policy, unchanged and unbroken:** PawCue requests no notification permission, at launch or otherwise,
and `__tests__/app-config.test.ts` asserts the native permission surface is still empty.

## Found during simulator acceptance

Three defects surfaced by walking the app rather than by reading it. Each has a regression test.

**Today spun forever when the dog's row could not be read.** With the dog id cached and the server unreachable,
nothing moved `planStatus` off `idle`, and `idle` reads as "still loading". Phase 6 fixed the same shape of bug
for a missing catalogue; this was its sibling. Today now shows "Can't reach your dog's profile right now" with a
retry, and Dog shows "Can't load the profile right now" instead of a profile whose every field reads "Not set" —
which told the user they never filled it in, a different fact from "we could not reach it". Two signals mean stop
waiting: the dog store recorded a failed read, or bootstrap could not establish a session at all.

**The lesson overview knew one lock, not two.** `stay` is premium _and_ needs Sit. Train withheld navigation for
the prerequisite, and until Phase 7 that was enough — the only way in was through Train. The paywall changed that:
a user who opened `stay`, subscribed, and came back landed on an overview with the premium lock gone and a "Start
training" button for a lesson the dog was not ready for. The overview now resolves `lessonGate` like Train does
and shows the two locks as separate cards, together when both apply, so subscribing is never presented as the way
past a prerequisite.

**The resume card did not survive a relaunch.** The in-progress session was persisted, but only `resumeOrBegin`
ever read it — so after a cold start the session store was empty until a training screen mounted, and Today had
nothing to show precisely when the reminder mattered most. `session-store` now has a `hydrate()` that bootstrap
awaits with the other local reads. Only an in-progress session is surfaced; a completed or abandoned one already
has its training-log record, and offering to "pick up" something finished would be a nag.

## Accessibility

A real defect was found and fixed in the design system: `Card` accepted `accessibilityLabel` and **silently
discarded it** on its non-pressable branch. Every read-only card in the app — most visibly the Progress history
rows — was writing a name nobody heard, and was read child by child instead of as one thing. `Card` now becomes an
accessibility element whenever it has a name to give, and only then.

Other changes:

- `StatusPill` gives each state a glyph and a frame, not only a hue — DESIGN_SYSTEM.md's "never by colour alone"
  made structural rather than remembered per screen.
- The session pause control and the paywall close control are sized to `minTouchTarget` rather than relying on hit
  slop over a caption.
- `Metric` on Progress hides the large numeral from assistive technology and exposes the pluralised sentence, so a
  screen reader hears "4 sessions completed" once rather than "4" followed by it.
- The Dog chevron is chosen by reading direction rather than mirrored by layout: a glyph is a character, and no
  amount of `flexDirection` turns `›` around.

## Development-only tooling

All four dev surfaces remain `__DEV__`-gated and asserted by tests that flip the flag:

| Tool                   | Guarded in                   | Asserted by                  |
| ---------------------- | ---------------------------- | ---------------------------- |
| Clicker sound selector | `app/settings.tsx`           | `dev-only-ui.test.tsx`       |
| Plan inspector         | `app/settings.tsx`           | `dev-only-ui.test.tsx`       |
| Diagnostics block      | `app/settings.tsx`           | `dev-only-ui.test.tsx`       |
| Entitlement simulator  | `src/billing/dev-billing.ts` | `billing-dev-guard.test.tsx` |

## Remaining gaps

- **Scaffold step instructions leak their keys.** The Phase 3 seed authors full steps for Name Game and Sit only;
  the other eleven lessons get a three-step scaffold whose instruction keys are `<slug>.step1..3` with no
  translation, so the training screen shows `potty_foundation.step2` as the instruction. This is a labelled
  content follow-up in `supabase/seed.sql`, and it is the largest thing standing between this build and a release.
  It was **not** papered over with generic copy — inventing training instructions is a content decision, and brief
  §10 restricts generated training advice — and it was not hidden behind a fallback string that would conceal
  missing content from QA. Content authoring, EN and HE, is required before submission.

- **Illustration.** `lesson_steps.illustrationAssetKey` exists and no lesson has artwork; the slot reserves layout
  and renders the key in development. DESIGN_SYSTEM.md's illustration style is unbuilt.
- **Completion motion.** The design system asks for a checkmark path draw; the mark is static because the vector
  library for it is not a dependency, and a scale-in would be decoration rather than comprehension.
- **Dark mode.** Deliberately not implemented (DESIGN_SYSTEM.md); the token layer is ready for one `darkTheme` map.
- **Streaks.** Server-derived by contract and still unpopulated, so still omitted rather than invented.
