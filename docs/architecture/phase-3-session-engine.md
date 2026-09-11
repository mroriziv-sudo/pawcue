# Phase 3 — lessons and the training session engine

## What owns what

```
packages/domain/session-engine/training-session.ts   session rules, invariants, persistence validation
packages/domain/models/lesson-content.ts             the lesson + steps + troubleshooting aggregate
apps/mobile/src/lessons/lesson-repository.ts         content fetch, validation, offline cache
apps/mobile/src/state/session-store.ts               where state lives, when it is written down
apps/mobile/src/state/training-log-store.ts          local record of completed sessions
apps/mobile/app/lesson/[slug].tsx                    lesson overview
apps/mobile/app/train/[slug].tsx                     the lesson renderer
```

The engine is pure and framework-free. Screens dispatch to it and render its state; they contain no session rules.
That split is the reason "you cannot complete a step that is not the current one" is asserted once, in one place,
rather than re-implemented per screen.

## State transitions

```
                    startSession
                         │
                         ▼
                  ┌─────────────┐   recordClickerPress ─┐
                  │ in_progress │   logRepetition       │  (do not change step)
                  └──────┬──────┘   undoRepetition      │
                         │          openTroubleshooting ┘
      completeCurrentStep│          resolveTroubleshooting
                         │
        ┌────────────────┴────────────────┐
        │ more steps remain               │ final step, requirements met
        ▼                                 ▼
   next step (in_progress)          ┌───────────┐
                                    │ completed │
   abandonSession ──────────────▶   ├───────────┤
                                    │ abandoned │
                                    └───────────┘
```

Invariants, each covered by a test:

- A step can only be completed when it **is** the current step; a stale or unknown id is refused.
- A step whose data declares `requiresClickerPress` needs at least one press **on that step** before it completes.
- A step with a `repetitionTarget` needs that many repetitions; repetitions cannot exceed the target or drop below
  zero.
- Progress is derived from completed steps and clamped to 0–1, so it can never exceed its own bound.
- Completing the final step completes the session; a completed or abandoned session accepts no further actions.
- A rejected transition returns the state **unchanged** — which is what makes "troubleshooting cannot destroy
  progress" a property rather than a hope.

## Persistence

Three tiers, deliberately separate:

| Tier                | What                                                          | Where                                  |
| ------------------- | ------------------------------------------------------------- | -------------------------------------- |
| **Local transient** | Which troubleshooting sheet is open, content loading state    | React state in the screen              |
| **Persisted local** | The whole `TrainingSessionState`, written on every transition | AsyncStorage, one key                  |
| **Server-backed**   | `training_sessions` + `session_events` rows                   | **Not written in Phase 3** — see below |

`restoreSession` is the only door back in, and it refuses anything it cannot vouch for: malformed JSON, a
different engine version, a different lesson, a step id the content no longer has, repetition counts that exceed
the current target, or a session that is already finished. Each rejection is a case where resuming would show a
session that does not match the lesson on screen, so the session is dropped and the lesson restarts cleanly.

### Why nothing reaches the server yet

`training_sessions.dog_id` is `NOT NULL`, and Phase 3 is reachable by a guest who has no dog profile — onboarding
is not built. Writing server rows is therefore impossible without inventing a dog, which would be worse than
waiting. The engine already produces the append-only, client-id'd `session_events` those rows need
(ARCHITECTURE.md §8), `toTrainingSessionRow()` is the single place the boundary is enforced, and completed
sessions are queued locally with `syncedToServer: false`. The flush is additive once a dog exists.

`Progress` and `Streak` are deliberately **not** computed locally. Their own contract says they are derived
server-side from `session_events` precisely so a client bug cannot corrupt a streak — and showing a user a streak
the server has never agreed to is the fake gamification the brief rules out.

## Lesson data flow

```
Supabase (lessons, lesson_steps, lesson_troubleshooting)
        │  validated with lessonContentSchema
        ▼
LessonContent aggregate ──▶ AsyncStorage cache (offline)
        │
        ▼
useLessonContent(slug) ──▶ renderer
```

Content stays database rows, never files in the bundle (ARCHITECTURE.md §7). The repository writes every
successful fetch to a local cache and falls back to it when the network cannot answer, so a lesson opened once is
trainable offline. The overview screen says when it is showing a cached copy rather than hiding it.

**The renderer contains no lesson-specific branches.** The clicker appears because a step declares
`requiresClickerPress`; the rep counter appears because a step declares a `repetitionTarget`; troubleshooting
appears because the lesson has options. A different lesson renders differently with no code change.

## Clicker integration boundary

The Phase 2 clicker is reused exactly as-is — same `useClicker` hook, same voice-pool engine, same preloaded
pool, same settings, same C-Crisp default. No audio code was modified in Phase 3, and all clicker regression
coverage remains green.

The boundary is: **the training screen calls `click()` for sound and `recordClick()` for bookkeeping, and those
are separate concerns.** A clicker press appends a `clicker_pressed` event; it does **not** increment the
repetition counter. A click marks the instant the dog did the right thing; a repetition is the trainer's
judgement that the attempt counted. Collapsing them would inflate progress every time the clicker was used to
test a sound.

## Deliberately deferred

- Server sync of sessions and events (needs a dog profile).
- `Progress`/`Streak` surfaces, course dashboards, plan integration — Phase 4.
- Lesson media: `illustrationAssetKey` is carried through the model and the renderer reserves a slot, but no
  lesson has artwork yet, so nothing is fetched or bundled.
- Full curriculum authoring. The seeded content exercises the engine; writing every lesson is content work.
