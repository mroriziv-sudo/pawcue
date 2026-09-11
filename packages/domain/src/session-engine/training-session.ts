import { z } from "zod";
import { uuidSchema, utcTimestampSchema } from "../models/shared";
import { orderedSteps, type LessonContent } from "../models/lesson-content";
import type { LessonStep } from "../models/lesson";
import {
  sessionEventTypeSchema,
  trainingSessionStatusSchema,
  type SessionEventType,
} from "../models/session";

/**
 * The training session engine.
 *
 * All session logic lives here, as pure functions over a plain state object, for three reasons:
 *
 *  - **It is the part with invariants.** "You cannot complete a step that is not the current one" is a rule about
 *    training, not about React. Rules enforced inside components get re-implemented slightly differently in the
 *    next component.
 *  - **It must be testable without a renderer.** Every transition below is exercised directly in
 *    `training-session.test.ts`; none of that needs a device, a screen, or a mocked navigator.
 *  - **It must survive being written down and read back.** Persistence is just serialising this object, and
 *    `restoreSession` is the one place that decides whether a stored session is still trustworthy.
 *
 * Time and identity are injected rather than imported, so tests are deterministic and the same engine can be
 * driven by a replayed event log later.
 */

/**
 * Bumped whenever the shape or meaning of persisted state changes. A stored session from an older engine is
 * discarded rather than migrated — a half-understood session is worse than starting the lesson again, and the
 * cost to the user is a few taps.
 */
export const SESSION_ENGINE_VERSION = 1;

export interface EngineContext {
  /** UTC ISO-8601 with offset, matching `utcTimestampSchema`. */
  now: () => string;
  newId: () => string;
}

/**
 * A session event before the server has seen it.
 *
 * `sessionEventSchema` describes the stored row, which carries server-managed `createdAt`/`updatedAt` the client
 * cannot know. The `id` is client-generated on purpose: it is the idempotency key that makes offline replay safe
 * (ARCHITECTURE.md §8), so it is minted here, at the moment the thing actually happened.
 */
export const pendingSessionEventSchema = z.object({
  id: uuidSchema,
  type: sessionEventTypeSchema,
  lessonStepId: uuidSchema.nullable(),
  troubleshootingOptionId: uuidSchema.nullable(),
  occurredAt: utcTimestampSchema,
});
export type PendingSessionEvent = z.infer<typeof pendingSessionEventSchema>;

export const trainingSessionStateSchema = z.object({
  engineVersion: z.number().int(),
  sessionId: uuidSchema,
  lessonId: uuidSchema,
  lessonSlug: z.string().min(1),
  /**
   * Null until the user has a dog.
   *
   * `training_sessions.dog_id` is NOT NULL, so a session cannot be written to the server without one. Phase 3 is
   * reachable as a guest with no dog profile, so the session is local-only until onboarding supplies a dog — see
   * `toTrainingSessionRow`, which is the single place that boundary is enforced.
   */
  dogId: uuidSchema.nullable(),
  status: trainingSessionStatusSchema,
  startedAt: utcTimestampSchema,
  completedAt: utcTimestampSchema.nullable(),
  currentStepId: uuidSchema,
  completedStepIds: z.array(uuidSchema),
  repetitionsByStep: z.record(uuidSchema, z.number().int().min(0)),
  clicksByStep: z.record(uuidSchema, z.number().int().min(0)),
  troubleshootingViewedIds: z.array(uuidSchema),
  events: z.array(pendingSessionEventSchema),
});
export type TrainingSessionState = z.infer<typeof trainingSessionStateSchema>;

export type TransitionFailure =
  | "session_not_in_progress"
  | "not_current_step"
  | "unknown_step"
  | "step_requirements_unmet"
  | "repetitions_not_applicable"
  | "repetition_target_reached"
  | "no_repetitions_logged"
  | "unknown_troubleshooting_option";

/**
 * Transitions return the state either way.
 *
 * A rejected transition yields the *unchanged* state rather than null or an exception, which makes the property
 * that matters easy to assert: a rejected action must leave progress exactly as it was.
 */
export type TransitionResult =
  | { ok: true; state: TrainingSessionState }
  | { ok: false; failure: TransitionFailure; state: TrainingSessionState };

function ok(state: TrainingSessionState): TransitionResult {
  return { ok: true, state };
}

function fail(
  state: TrainingSessionState,
  failure: TransitionFailure,
): TransitionResult {
  return { ok: false, failure, state };
}

function appendEvent(
  state: TrainingSessionState,
  ctx: EngineContext,
  type: SessionEventType,
  refs: {
    lessonStepId?: string | null;
    troubleshootingOptionId?: string | null;
  } = {},
): PendingSessionEvent[] {
  return [
    ...state.events,
    {
      id: ctx.newId(),
      type,
      lessonStepId: refs.lessonStepId ?? null,
      troubleshootingOptionId: refs.troubleshootingOptionId ?? null,
      occurredAt: ctx.now(),
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// Reading a session
// ---------------------------------------------------------------------------------------------------------------

export function currentStep(
  state: TrainingSessionState,
  content: LessonContent,
): LessonStep | null {
  return (
    orderedSteps(content).find((step) => step.id === state.currentStepId) ??
    null
  );
}

export function stepIndex(
  state: TrainingSessionState,
  content: LessonContent,
): number {
  return orderedSteps(content).findIndex(
    (step) => step.id === state.currentStepId,
  );
}

export interface StepRequirements {
  /** The step expects the clicker to be used at least once before it can be completed. */
  needsClickerPress: boolean;
  /** Number of successful repetitions required, or null when the step is not repetition-based. */
  repetitionTarget: number | null;
}

export function stepRequirements(step: LessonStep): StepRequirements {
  return {
    needsClickerPress: step.requiresClickerPress,
    repetitionTarget: step.repetitionTarget,
  };
}

/**
 * Whether the current step's requirements have been met.
 *
 * Steps without requirements are satisfied immediately — most instructional steps are read-and-continue, and
 * demanding an interaction from them would be busywork.
 */
export function isStepSatisfied(
  state: TrainingSessionState,
  step: LessonStep,
): boolean {
  const { needsClickerPress, repetitionTarget } = stepRequirements(step);
  if (needsClickerPress && (state.clicksByStep[step.id] ?? 0) < 1) return false;
  if (
    repetitionTarget !== null &&
    (state.repetitionsByStep[step.id] ?? 0) < repetitionTarget
  ) {
    return false;
  }
  return true;
}

export interface SessionProgress {
  stepNumber: number;
  totalSteps: number;
  completedSteps: number;
  /** 0–1, clamped. Driven by completed steps, so it never runs ahead of what the user has actually done. */
  ratio: number;
}

export function sessionProgress(
  state: TrainingSessionState,
  content: LessonContent,
): SessionProgress {
  const steps = orderedSteps(content);
  const total = steps.length;
  const completed = Math.min(state.completedStepIds.length, total);
  const index = stepIndex(state, content);
  return {
    stepNumber: index >= 0 ? index + 1 : total,
    totalSteps: total,
    completedSteps: completed,
    ratio: total === 0 ? 0 : Math.min(1, Math.max(0, completed / total)),
  };
}

export function repetitionsFor(
  state: TrainingSessionState,
  step: LessonStep,
): number {
  return state.repetitionsByStep[step.id] ?? 0;
}

export function clicksFor(
  state: TrainingSessionState,
  step: LessonStep,
): number {
  return state.clicksByStep[step.id] ?? 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------------------------------------------

export function startSession(
  content: LessonContent,
  ctx: EngineContext,
  options: { dogId?: string | null } = {},
): TrainingSessionState {
  const steps = orderedSteps(content);
  const first = steps[0];
  if (!first) {
    throw new Error(
      `Lesson ${content.lesson.slug} has no steps and cannot be trained.`,
    );
  }

  return {
    engineVersion: SESSION_ENGINE_VERSION,
    sessionId: ctx.newId(),
    lessonId: content.lesson.id,
    lessonSlug: content.lesson.slug,
    dogId: options.dogId ?? null,
    status: "in_progress",
    startedAt: ctx.now(),
    completedAt: null,
    currentStepId: first.id,
    completedStepIds: [],
    repetitionsByStep: {},
    clicksByStep: {},
    troubleshootingViewedIds: [],
    events: [],
  };
}

/**
 * Records a clicker press against the current step.
 *
 * Deliberately separate from `logRepetition`. A click marks the instant the dog did the right thing; a repetition
 * is the trainer's judgement that the attempt counted. Collapsing the two would inflate progress every time the
 * clicker was used to test a sound or mark something that did not end in a success.
 */
export function recordClickerPress(
  state: TrainingSessionState,
  content: LessonContent,
  ctx: EngineContext,
): TransitionResult {
  if (state.status !== "in_progress") {
    return fail(state, "session_not_in_progress");
  }
  const step = currentStep(state, content);
  if (!step) return fail(state, "unknown_step");

  return ok({
    ...state,
    clicksByStep: {
      ...state.clicksByStep,
      [step.id]: (state.clicksByStep[step.id] ?? 0) + 1,
    },
    events: appendEvent(state, ctx, "clicker_pressed", {
      lessonStepId: step.id,
    }),
  });
}

export function logRepetition(
  state: TrainingSessionState,
  content: LessonContent,
  ctx: EngineContext,
): TransitionResult {
  if (state.status !== "in_progress") {
    return fail(state, "session_not_in_progress");
  }
  const step = currentStep(state, content);
  if (!step) return fail(state, "unknown_step");

  const target = step.repetitionTarget;
  if (target === null) return fail(state, "repetitions_not_applicable");

  const current = state.repetitionsByStep[step.id] ?? 0;
  // Progress cannot exceed its own bound: a step needing five successes cannot report six.
  if (current >= target) return fail(state, "repetition_target_reached");

  return ok({
    ...state,
    repetitionsByStep: { ...state.repetitionsByStep, [step.id]: current + 1 },
    events: appendEvent(state, ctx, "repetition_logged", {
      lessonStepId: step.id,
    }),
  });
}

/**
 * Takes back the last repetition.
 *
 * Present because the counter is operated one-handed while managing a dog, so mis-taps are expected. No event is
 * appended: the log records what happened during training, and a correction to the count is not a training event.
 */
export function undoRepetition(
  state: TrainingSessionState,
  content: LessonContent,
): TransitionResult {
  if (state.status !== "in_progress") {
    return fail(state, "session_not_in_progress");
  }
  const step = currentStep(state, content);
  if (!step) return fail(state, "unknown_step");
  if (step.repetitionTarget === null) {
    return fail(state, "repetitions_not_applicable");
  }

  const current = state.repetitionsByStep[step.id] ?? 0;
  if (current <= 0) return fail(state, "no_repetitions_logged");

  return ok({
    ...state,
    repetitionsByStep: { ...state.repetitionsByStep, [step.id]: current - 1 },
  });
}

/**
 * Completes `stepId` and moves on, completing the session if that was the final step.
 *
 * The step id is an argument rather than implied so the engine can reject a stale one. A screen that was
 * backgrounded mid-session can easily dispatch against the step the user was looking at a minute ago; silently
 * treating that as "advance whatever is current now" would skip a step the user never saw.
 */
export function completeCurrentStep(
  state: TrainingSessionState,
  content: LessonContent,
  stepId: string,
  ctx: EngineContext,
): TransitionResult {
  if (state.status !== "in_progress") {
    return fail(state, "session_not_in_progress");
  }

  const steps = orderedSteps(content);
  const index = steps.findIndex((step) => step.id === stepId);
  if (index < 0) return fail(state, "unknown_step");
  if (stepId !== state.currentStepId) return fail(state, "not_current_step");

  const step = steps[index];
  if (!step) return fail(state, "unknown_step");
  if (!isStepSatisfied(state, step)) {
    return fail(state, "step_requirements_unmet");
  }

  // Completion is a set, not a tally: re-completing a step must not inflate progress.
  const completedStepIds = state.completedStepIds.includes(step.id)
    ? state.completedStepIds
    : [...state.completedStepIds, step.id];

  const next = steps[index + 1];
  const advanced: TrainingSessionState = {
    ...state,
    completedStepIds,
    events: appendEvent(state, ctx, "step_advanced", { lessonStepId: step.id }),
  };

  if (!next) {
    return ok({
      ...advanced,
      status: "completed",
      completedAt: ctx.now(),
      events: appendEvent(advanced, ctx, "session_completed", {
        lessonStepId: step.id,
      }),
    });
  }

  return ok({ ...advanced, currentStepId: next.id });
}

/**
 * Opening troubleshooting is recorded but changes nothing about where the user is.
 *
 * That is the point of the feature: someone whose dog is not responding is mid-step and needs help without losing
 * the four repetitions they already logged.
 */
export function openTroubleshooting(
  state: TrainingSessionState,
  content: LessonContent,
  optionId: string,
  ctx: EngineContext,
): TransitionResult {
  if (state.status !== "in_progress") {
    return fail(state, "session_not_in_progress");
  }
  const option = content.troubleshooting.find((item) => item.id === optionId);
  if (!option) return fail(state, "unknown_troubleshooting_option");

  return ok({
    ...state,
    troubleshootingViewedIds: state.troubleshootingViewedIds.includes(optionId)
      ? state.troubleshootingViewedIds
      : [...state.troubleshootingViewedIds, optionId],
    events: appendEvent(state, ctx, "troubleshooting_opened", {
      lessonStepId: state.currentStepId,
      troubleshootingOptionId: optionId,
    }),
  });
}

export function resolveTroubleshooting(
  state: TrainingSessionState,
  content: LessonContent,
  optionId: string,
  ctx: EngineContext,
): TransitionResult {
  if (state.status !== "in_progress") {
    return fail(state, "session_not_in_progress");
  }
  const option = content.troubleshooting.find((item) => item.id === optionId);
  if (!option) return fail(state, "unknown_troubleshooting_option");

  return ok({
    ...state,
    events: appendEvent(state, ctx, "troubleshooting_resolved", {
      lessonStepId: state.currentStepId,
      troubleshootingOptionId: optionId,
    }),
  });
}

/** Marks a session abandoned. Terminal: an abandoned session is restarted, never resumed. */
export function abandonSession(
  state: TrainingSessionState,
  ctx: EngineContext,
): TransitionResult {
  if (state.status !== "in_progress") {
    return fail(state, "session_not_in_progress");
  }
  return ok({
    ...state,
    status: "abandoned",
    events: appendEvent(state, ctx, "session_abandoned", {
      lessonStepId: state.currentStepId,
    }),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------------------------------------------

export type RestoreRejection =
  | "malformed"
  | "engine_version_mismatch"
  | "different_lesson"
  | "unknown_current_step"
  | "unknown_completed_step"
  | "repetitions_out_of_bounds"
  | "not_resumable";

export type RestoreResult =
  | { ok: true; state: TrainingSessionState }
  | { ok: false; rejection: RestoreRejection };

/**
 * Rebuilds a session from persisted JSON, refusing anything it cannot vouch for.
 *
 * Persisted state is not trusted input. It may have been written by an older build, may refer to lesson content
 * that has since been re-authored, or may simply be corrupt. Every rejection below is a case where resuming would
 * show the user a session that does not match the lesson in front of them, so the session is dropped and the
 * lesson starts cleanly. Losing a few taps of progress is a much smaller harm than resuming into nonsense.
 */
export function restoreSession(
  persisted: unknown,
  content: LessonContent,
): RestoreResult {
  const parsed = trainingSessionStateSchema.safeParse(persisted);
  if (!parsed.success) return { ok: false, rejection: "malformed" };

  const state = parsed.data;

  if (state.engineVersion !== SESSION_ENGINE_VERSION) {
    return { ok: false, rejection: "engine_version_mismatch" };
  }
  if (state.lessonId !== content.lesson.id) {
    return { ok: false, rejection: "different_lesson" };
  }
  if (state.status !== "in_progress") {
    // Completed and abandoned sessions are history, not something to drop the user back into.
    return { ok: false, rejection: "not_resumable" };
  }

  const steps = orderedSteps(content);
  const stepIds = new Set(steps.map((step) => step.id));

  if (!stepIds.has(state.currentStepId)) {
    return { ok: false, rejection: "unknown_current_step" };
  }
  if (state.completedStepIds.some((id) => !stepIds.has(id))) {
    return { ok: false, rejection: "unknown_completed_step" };
  }

  for (const step of steps) {
    const logged = state.repetitionsByStep[step.id] ?? 0;
    const target = step.repetitionTarget;
    // A count above the target, or any count at all on a step that takes none, means the stored session and the
    // current content disagree about what this step is.
    if (target === null ? logged > 0 : logged > target) {
      return { ok: false, rejection: "repetitions_out_of_bounds" };
    }
  }

  return { ok: true, state };
}

/**
 * Projects the local session onto the `training_sessions` row shape.
 *
 * The single place the local/server boundary is enforced: without a dog there is no valid row, because
 * `training_sessions.dog_id` is NOT NULL. Returning null rather than inventing an id keeps a guest session
 * honestly local instead of half-synced.
 */
export function toTrainingSessionRow(state: TrainingSessionState): {
  id: string;
  dogId: string;
  lessonId: string;
  planActivityId: null;
  status: TrainingSessionState["status"];
  startedAt: string;
  completedAt: string | null;
} | null {
  if (!state.dogId) return null;
  return {
    id: state.sessionId,
    dogId: state.dogId,
    lessonId: state.lessonId,
    planActivityId: null,
    status: state.status,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
  };
}
