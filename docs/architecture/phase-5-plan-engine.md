# Phase 5 — the training plan engine

## What owns what

```
packages/domain/plan-engine/training-plan-generator.ts   the frozen Phase 0 interface
packages/domain/plan-engine/rules-based-generator.ts     the engine — all planning rules live here
packages/domain/plan-engine/content-graph.ts             prerequisite resolution and graph validation
apps/mobile/src/plans/plan-inputs.ts                     builds the input from what the app actually knows
apps/mobile/src/plans/plan-repository.ts                 catalogue reads and plan persistence, through RLS
apps/mobile/app/dev-plan.tsx                             developer-only inspector, __DEV__ gated
```

The engine is pure: no randomness, no clock reads, no network, no I/O. Same dog state, history, catalogue and
engine version in, same plan out. That is what makes a recommendation arguable rather than mysterious, and what
lets an old plan be reproduced after the rules change. AI remains possible behind `TrainingPlanGenerator`; it is
not this.

## Where prerequisites actually live

`lessons.prerequisite_skill_ids` exists but **every seeded lesson has an empty one**. The real structure is on
`skills.prerequisite_skill_ids` — stay and come require sit, place requires down.

So a lesson's **effective prerequisites** are the union of its own and those of the skill it teaches. Reading only
the lesson column, which is the obvious implementation, would have made prerequisite handling a silent no-op
against the content that actually exists.

Known skills are also closed over their prerequisites: knowing `place` implies `down`, so a history recording only
the most advanced skill does not make its foundations look missing.

## The rules, in priority order

| Priority | Reason                  | When                                                         |
| -------- | ----------------------- | ------------------------------------------------------------ |
| 1        | `continue_unfinished`   | Abandoned within 14 days and not completed since             |
| 2        | `prerequisite_unlocked` | Never trained, has prerequisites, and they are now satisfied |
| 3        | `spaced_review`         | Completed ≥ 3 days ago; longest-neglected first              |
| 4        | `new_skill`             | Never trained, no prerequisites                              |

Excluded outright: prerequisites unmet; completed within 2 days; completed 2–3 days ago (not stale enough to
practise, too fresh to repeat); already placed earlier in this plan.

Constraints applied while filling a day:

- **≤ 3 activities** (brief §9). More than three is a chore, not a session.
- **≤ 1 new skill per day.** Continuation and review are consolidation and are not capped this way; stacking new
  skills is how a dog half-learns several things at once.
- **Never exceeds `dailyMinutes`.** A plan that overruns the time someone said they had is one they abandon.

**Session order is not selection order.** Unfinished work first, while attention is freshest and because it is the
most time-sensitive; new learning next, still early; review last, so the session ends on something the dog can
already do. Ending on success is a positive-reinforcement principle, not a scheduling detail.

### Tie-breaking

Priority, then difficulty, then estimated minutes, then slug, then id. The id tie-break is what guarantees the
same plan on every run — without it two equally-ranked lessons come out in catalogue order, which is a database
ordering and not something to depend on. A test asserts the plan is unchanged when the catalogue arrives reversed.

### Multi-day plans assume completion

Each planned day is treated as completed when planning the next, which is what lets day 3 depend on day 1. This is
a planning assumption, not a claim about the dog. Real adaptation comes from regenerating against real history,
which overrides any projection that did not happen.

## Explainability

Every activity records a machine-readable `selection_reason`, and the generator also returns diagnostics:
per-day **exclusions** with their reason, empty days, content-graph problems, and the prerequisite that made each
selection eligible. When a recommendation looks wrong, the answer is in the exclusions as often as the selections.

`generate()` returns only the plan, leaving the frozen interface untouched; `generateWithDiagnostics()` is the
real entry point for anything that needs to explain itself.

## Versioning

`PLAN_ENGINE_VERSION` is bumped whenever **the output for a given input could change** — a new rule, a changed
constant, a changed ordering. Not bumped for refactors that cannot move a plan.

Each plan row stores `plan_engine_version_id`, and it is read back from the plan rather than assumed to be
current. History is never re-attributed to a newer engine. `plan_engine_versions` is public-read with **no client
insert policy**: a version is a released fact about the engine, not something a device may mint, so an unregistered
version fails loudly and the fix is a migration.

## Persistence

Phase 0 already defined `training_plans`, `plan_days`, `plan_activities` and `plan_engine_versions` with their
ownership policies, so Phase 5 adds no tables — only one additive column, `plan_activities.selection_reason`,
because `is_review` is a boolean and cannot distinguish "only just became eligible" from "brand new" from "you
left this unfinished". That distinction cannot be re-derived later: it depends on the history as it was at
generation time.

Plans store **references, not copies**. An activity records a `lesson_id`, never a snapshot of the lesson's
content — a copy would let an edited lesson silently disagree with every plan that mentioned it.

`training_plans_one_active_per_dog` (a partial unique index from Phase 0) means a dog has exactly one active plan.
Regeneration therefore supersedes rather than accumulates; old plans are kept, not deleted, because they record
what was recommended at the time under the engine that recommended it.

All writes go through the caller's own session. No service-role path, and no client-side ownership check to get
wrong — RLS decides. Covered by eight new checks in the database security suite, including cross-user read,
cross-user create, cross-user supersede, and rejection of an unknown `selection_reason`.

## Signals that do not exist yet

Recorded rather than fabricated. Each would change the plan if it existed:

- **Goals.** Onboarding collects none, and — more fundamentally — there is **no lesson→goal relation anywhere in
  the schema**. `goal_id` exists only on `dog_goals`. Goal-aware ranking needs a content change, not just a
  question in onboarding. There is deliberately no `goal_priority` selection reason.
- **Age appropriateness.** `ageBucket` is derived honestly from the birthdate, but no lesson carries an age or
  developmental field, so the engine has nothing to match it against and ignores it. Inventing a rule here would
  be inventing veterinary advice.
- **`dog_skills`.** The table exists and nothing writes it. Known skills are derived from completed sessions,
  which is a true statement about what the dog has been taught.
- **Repetition counts and attempts.** Recorded per session, but the engine does not read them: there is no
  content field expressing what a "good enough" rep count means for a lesson.

## Unfinished work (Phase 5 follow-up)

`continue_unfinished` is the highest-priority rule, and for the length of Phase 5 it could not fire from real
data. The contracts had described abandonment since Phase 0 — `trainingSessionStatusSchema`, the
`session_abandoned` event, the `training_sessions.status` check — and the engine's `abandonSession` was
implemented and tested. **Nothing ever called it**, and the local log rejected anything that was not completed.

Two real paths now produce it:

- **A displaced session.** When a stored in-progress session cannot be resumed into the lesson now being opened,
  the user has moved on: it is abandoned through the engine and written to the log. Guarded twice — a session
  that already completed is left alone, and one with no events is dropped, because opening a lesson screen and
  leaving is not unfinished work.
- **A paused session.** The active in-progress session is reported to the planner as unfinished in its own right,
  without being marked abandoned — it has not been abandoned, it is simply not finished. Waiting for it to be
  displaced would leave the commonest case invisible.

The log holds both outcomes in one model (`TrainingSessionRecord`, with `status` and `endedAt`); there is no
second history. At most one abandoned record is kept per lesson, the latest. Completed records are never touched,
and a later completion supersedes an earlier abandonment through the rule the engine already had. Records written
by earlier builds carry `completedAt` and no `status`; they are read forward as completions rather than discarded.

Abandoned attempts sync like any other: `training_sessions.status` has allowed `abandoned` since Phase 0, and
`completed_at` is written null, because the attempt has an end time but was never completed.

## Deliberately deferred to Phase 6+

Any user-facing surface. There is no Today screen, no plan UI, and no user-facing explanation of why a lesson was
chosen — the reasons are engine vocabulary and would need mapping to real copy first. The only surface added here
is a `__DEV__`-gated inspector, asserted absent from a release render.
