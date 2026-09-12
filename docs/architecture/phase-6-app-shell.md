# Phase 6 — the main app experience

## What owns what

```
app/(tabs)/_layout.tsx          the four destinations and the PawCue tab bar
app/(tabs)/index.tsx            Today — consumes the Phase 5 plan engine
app/(tabs)/train.tsx            Train — the lesson catalogue
app/(tabs)/progress.tsx         Progress — honest training history
app/(tabs)/dog.tsx              Dog — this dog's training, and the routes out
src/lessons/useCatalogue.ts     catalogue loading and the shared derivations
packages/domain/lessons/lesson-status.ts   lesson state and training totals, as pure functions
```

Nothing here holds state of its own. Every screen reads the stores and derivations Phases 3–5 already built, so
there is no second source of truth for progress, plans, lessons, the dog or the session.

## Navigation

`Tabs` from `expo-router` with a custom `tabBar`. The navigator keeps each destination mounted, so switching does
not remount or lose scroll position, while the bar itself is ours — which is what lets it mirror, scale with
Dynamic Type and announce selection properly.

No new dependency: expo-router 57 ships its own navigator.

**Four destinations, and only four.** Settings is reachable from Dog rather than becoming a fifth — it is
somewhere you go occasionally, not one of the things the app is for. The **clicker keeps its own route**, linked
from Today: it is the product's wedge and must stay one tap away, but it is a tool rather than a place, and a tab
would say the opposite.

Selection is never colour alone: the selected tab is bolded, tinted, and carries `accessibilityState.selected`.

## Today

Consumes `RulesBasedTrainingPlanGenerator` directly. The plan is memoised on the things it actually depends on —
catalogue, dog, history, active session, and the _date string_ — so a re-render inside the same day is not a new
input and the plan does not rebuild on every frame.

**Engine vocabulary never reaches the screen.** `spaced_review` renders as "Worth practising again"; a test
asserts no raw reason string appears in the output. A reason is only worth showing if it tells the user something
they can act on.

States handled explicitly: loading, a plan, an empty plan, no dog yet, and a catalogue that could not be loaded.
A plan activity whose lesson is missing from the catalogue is omitted rather than rendered blank — a plan can
outlive the content it references. Raw Supabase errors are never shown; a test asserts the error text does not
leak.

"N sessions done today" counts real records whose `endedAt` falls on today's date. Nothing is faked.

## Train

Phase 0 defines no courses or categories, so Phase 6 does not invent them. The structure the data honestly
supports is by state — ready to train, already learned, coming up — which is also the useful order, because the
first section is the only one most people need.

A locked lesson has **no press handler at any level**: the decision is made by the parent via `canStartLesson`,
so neither the card nor the component wrapping it carries navigation. It also has no button role, so assistive
technology is told the same thing the visual treatment says, and the lock is explained in text rather than by
opacity alone.

## Lesson state

`deriveLessonStatuses` resolves every lesson in one pass from history that already exists. Four discrete states:
`locked`, `not_started`, `unfinished`, `completed`.

Deliberately **not a percentage**. A session records which steps were completed, but a lesson someone stopped
halfway through is not meaningfully "40% learned", and a number would imply precision that is not there.

Completion outranks a later abandonment — a lesson you have finished stays finished. And a lesson the dog has
genuinely trained is never shown as locked, because content can be re-authored underneath a user and their own
history outranks the graph.

## Progress

An honest history surface, not an analytics dashboard. Sessions completed, distinct lessons learned, estimated
minutes, unfinished count, and the recent entries with completed/unfinished distinguished in text.

**There is no streak.** `Streak` is server-derived by its own contract precisely so a client cannot invent one,
and nothing populates it yet. A test asserts the word never appears. Minutes are labelled estimated because they
come from each lesson's authored length, not from measuring anyone's actual training, which nothing records.

## Dog

The training summary leads, because that is what a user opens this screen to see about their dog. Profile fields
and the routes out — edit, account, settings — sit underneath.

Scope is exactly what Phase 4 collects. No weight, vet records, or photos: none are represented in any contract,
and a photo alone would mean a camera or library permission the brief rules out.

## Dev-only surfaces

The plan inspector, the clicker A/B/C selector and the diagnostics block are all inside the same `__DEV__` gate in
Settings, and `dev-only-ui.test.tsx` renders Settings with `__DEV__` forced false and asserts each is absent. The
tooling is kept rather than deleted — it is useful for QA — but it cannot reach a release build.

## Deferred to Phase 7+

- Plan **persistence**. Today generates from live history on each visit, which is correct and cheap; the Phase 5
  persistence path (`persistGeneratedPlan`, `fetchActivePlan`) exists and is unused by the UI. Storing the plan
  matters once a plan needs to be stable across devices or referenced by `plan_activity_id` on a session.
- Offline lesson browsing. Today and Train need the catalogue, which is cached per-lesson (Phase 3) but not as a
  whole; a cold start with no network shows an honest unavailable state rather than a stale list.
- Apple/Google sign-in, conflict resolution, and everything else Phase 4 recorded as external configuration.
