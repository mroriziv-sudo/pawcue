import { describe, it, expect } from "vitest";
import type { LessonContent } from "../models/lesson-content";
import {
  SESSION_ENGINE_VERSION,
  abandonSession,
  clicksFor,
  completeCurrentStep,
  currentStep,
  isStepSatisfied,
  logRepetition,
  openTroubleshooting,
  recordClickerPress,
  repetitionsFor,
  resolveTroubleshooting,
  restoreSession,
  sessionProgress,
  startSession,
  toTrainingSessionRow,
  undoRepetition,
  type EngineContext,
  type TrainingSessionState,
} from "./training-session";

/**
 * Session engine invariants.
 *
 * These assert observable training behaviour — what a user can and cannot do, and what survives an interruption —
 * rather than the engine's internals. Where a test does reach for a field, it is one that has a product meaning
 * (progress, repetitions logged, session status).
 */

const ID = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const TS = "2026-09-11T10:00:00.000Z";

/** Deterministic clock and id source, so assertions never depend on wall time or randomness. */
function testContext(): EngineContext {
  let counter = 900;
  return {
    now: () => TS,
    newId: () => ID((counter += 1)),
  };
}

const base = { createdAt: TS, updatedAt: TS };

/**
 * A four-step lesson shaped like the seeded Name Game: an instruction step, a clicker step, another instruction,
 * and a repetition step. That combination is what makes the requirement rules observable.
 */
function makeContent(): LessonContent {
  return {
    lesson: {
      id: ID(1),
      slug: "name_game",
      skillId: ID(2),
      titleKey: "lesson.nameGame.title",
      goalKey: "lesson.nameGame.goal",
      estimatedMinutes: 3,
      equipment: ["treats", "clicker"],
      difficulty: 1,
      prerequisiteSkillIds: [],
      isAlwaysFree: true,
      contentVersionId: ID(3),
      ...base,
    },
    steps: [
      {
        id: ID(10),
        lessonId: ID(1),
        stepOrder: 0,
        instructionKey: "lesson.nameGame.step1",
        requiresClickerPress: false,
        repetitionTarget: null,
        illustrationAssetKey: null,
        ...base,
      },
      {
        id: ID(11),
        lessonId: ID(1),
        stepOrder: 1,
        instructionKey: "lesson.nameGame.step2",
        requiresClickerPress: true,
        repetitionTarget: null,
        illustrationAssetKey: null,
        ...base,
      },
      {
        id: ID(12),
        lessonId: ID(1),
        stepOrder: 2,
        instructionKey: "lesson.nameGame.step3",
        requiresClickerPress: false,
        repetitionTarget: null,
        illustrationAssetKey: null,
        ...base,
      },
      {
        id: ID(13),
        lessonId: ID(1),
        stepOrder: 3,
        instructionKey: "lesson.nameGame.step4",
        requiresClickerPress: false,
        repetitionTarget: 5,
        illustrationAssetKey: null,
        ...base,
      },
    ],
    troubleshooting: [
      {
        id: ID(20),
        lessonId: ID(1),
        slug: "dog_distracted",
        promptKey: "troubleshoot.dogDistracted.prompt",
        guidanceKey: "troubleshoot.dogDistracted.guidance",
        safetyCategory: "NORMAL",
        sortOrder: 1,
        ...base,
      },
    ],
  };
}

/** Drives a session to the start of `targetIndex`, satisfying each step's requirements on the way. */
function advanceTo(
  state: TrainingSessionState,
  content: LessonContent,
  ctx: EngineContext,
  targetIndex: number,
): TrainingSessionState {
  let current = state;
  for (let i = 0; i < targetIndex; i += 1) {
    const step = currentStep(current, content);
    if (!step) throw new Error("ran out of steps");
    if (step.requiresClickerPress) {
      const clicked = recordClickerPress(current, content, ctx);
      if (clicked.ok) current = clicked.state;
    }
    if (step.repetitionTarget !== null) {
      for (let r = 0; r < step.repetitionTarget; r += 1) {
        const logged = logRepetition(current, content, ctx);
        if (logged.ok) current = logged.state;
      }
    }
    const advanced = completeCurrentStep(current, content, step.id, ctx);
    if (!advanced.ok) throw new Error(`could not advance: ${advanced.failure}`);
    current = advanced.state;
  }
  return current;
}

describe("starting a session", () => {
  it("begins in progress on the first step", () => {
    const content = makeContent();
    const state = startSession(content, testContext());

    expect(state.status).toBe("in_progress");
    expect(state.currentStepId).toBe(ID(10));
    expect(state.completedStepIds).toEqual([]);
    expect(sessionProgress(state, content)).toMatchObject({
      stepNumber: 1,
      totalSteps: 4,
      completedSteps: 0,
      ratio: 0,
    });
  });

  it("starts on the lowest step order regardless of the order rows arrive in", () => {
    const content = makeContent();
    content.steps.reverse();

    const state = startSession(content, testContext());
    expect(state.currentStepId).toBe(ID(10));
  });

  it("refuses a lesson with no steps rather than creating an unusable session", () => {
    const content = makeContent();
    content.steps = [];

    expect(() => startSession(content, testContext())).toThrow(/no steps/);
  });

  it("is local-only until a dog exists", () => {
    const content = makeContent();
    const guest = startSession(content, testContext());
    expect(guest.dogId).toBeNull();
    expect(toTrainingSessionRow(guest)).toBeNull();

    const owned = startSession(content, testContext(), { dogId: ID(50) });
    expect(toTrainingSessionRow(owned)).toMatchObject({
      dogId: ID(50),
      lessonId: ID(1),
      status: "in_progress",
    });
  });
});

describe("advancing steps", () => {
  it("moves to the next step when the current one has no requirements", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = startSession(content, ctx);

    const result = completeCurrentStep(state, content, ID(10), ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.currentStepId).toBe(ID(11));
    expect(result.state.completedStepIds).toEqual([ID(10)]);
    expect(sessionProgress(result.state, content).ratio).toBeCloseTo(0.25);
  });

  it("rejects completing a step that is not the current one", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = startSession(content, ctx);

    const result = completeCurrentStep(state, content, ID(12), ctx);

    expect(result).toMatchObject({ ok: false, failure: "not_current_step" });
    expect(result.state).toEqual(state);
  });

  it("rejects an unknown step id", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = startSession(content, ctx);

    const result = completeCurrentStep(state, content, ID(999), ctx);
    expect(result).toMatchObject({ ok: false, failure: "unknown_step" });
  });

  it("does not double-count a step completed twice", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = startSession(content, ctx);

    const first = completeCurrentStep(state, content, ID(10), ctx);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // The stale id is no longer current, so the second attempt is refused and progress is untouched.
    const again = completeCurrentStep(first.state, content, ID(10), ctx);
    expect(again.ok).toBe(false);
    expect(again.state.completedStepIds).toEqual([ID(10)]);
  });
});

describe("clicker-gated steps", () => {
  it("will not advance until the clicker has been used", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = advanceTo(startSession(content, ctx), content, ctx, 1);

    expect(isStepSatisfied(state, content.steps[1]!)).toBe(false);
    const blocked = completeCurrentStep(state, content, ID(11), ctx);
    expect(blocked).toMatchObject({
      ok: false,
      failure: "step_requirements_unmet",
    });

    const clicked = recordClickerPress(state, content, ctx);
    expect(clicked.ok).toBe(true);
    if (!clicked.ok) return;

    expect(clicksFor(clicked.state, content.steps[1]!)).toBe(1);
    expect(completeCurrentStep(clicked.state, content, ID(11), ctx).ok).toBe(
      true,
    );
  });

  it("records a clicker press as an event without counting it as a repetition", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = advanceTo(startSession(content, ctx), content, ctx, 3);

    const clicked = recordClickerPress(state, content, ctx);
    expect(clicked.ok).toBe(true);
    if (!clicked.ok) return;

    // The distinction that matters: a click marks a moment, a repetition is a judgement that it counted.
    expect(repetitionsFor(clicked.state, content.steps[3]!)).toBe(0);
    // Scoped to this step: getting here passes through the clicker-gated step 2, which logs a press of its own.
    const pressesHere = clicked.state.events.filter(
      (e) => e.type === "clicker_pressed" && e.lessonStepId === ID(13),
    );
    expect(pressesHere).toHaveLength(1);
    expect(
      clicked.state.events.filter(
        (e) => e.type === "repetition_logged" && e.lessonStepId === ID(13),
      ),
    ).toHaveLength(0);
  });
});

describe("repetitions", () => {
  it("counts up to the target and refuses to exceed it", () => {
    const content = makeContent();
    const ctx = testContext();
    let state = advanceTo(startSession(content, ctx), content, ctx, 3);

    for (let i = 0; i < 5; i += 1) {
      const result = logRepetition(state, content, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }

    expect(repetitionsFor(state, content.steps[3]!)).toBe(5);
    expect(logRepetition(state, content, ctx)).toMatchObject({
      ok: false,
      failure: "repetition_target_reached",
    });
    expect(repetitionsFor(state, content.steps[3]!)).toBe(5);
  });

  it("is not applicable on a step without a target", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = startSession(content, ctx);

    expect(logRepetition(state, content, ctx)).toMatchObject({
      ok: false,
      failure: "repetitions_not_applicable",
    });
  });

  it("can be taken back, but not below zero", () => {
    const content = makeContent();
    const ctx = testContext();
    let state = advanceTo(startSession(content, ctx), content, ctx, 3);

    const logged = logRepetition(state, content, ctx);
    if (logged.ok) state = logged.state;
    const undone = undoRepetition(state, content);
    expect(undone.ok).toBe(true);
    if (undone.ok) state = undone.state;

    expect(repetitionsFor(state, content.steps[3]!)).toBe(0);
    expect(undoRepetition(state, content)).toMatchObject({
      ok: false,
      failure: "no_repetitions_logged",
    });
  });

  it("blocks completion until the target is reached", () => {
    const content = makeContent();
    const ctx = testContext();
    let state = advanceTo(startSession(content, ctx), content, ctx, 3);

    for (let i = 0; i < 4; i += 1) {
      const result = logRepetition(state, content, ctx);
      if (result.ok) state = result.state;
    }

    expect(completeCurrentStep(state, content, ID(13), ctx)).toMatchObject({
      ok: false,
      failure: "step_requirements_unmet",
    });

    const last = logRepetition(state, content, ctx);
    if (last.ok) state = last.state;
    expect(completeCurrentStep(state, content, ID(13), ctx).ok).toBe(true);
  });
});

describe("completion", () => {
  it("completes the session when the final step is finished", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = advanceTo(startSession(content, ctx), content, ctx, 4);

    expect(state.status).toBe("completed");
    expect(state.completedAt).toBe(TS);
    expect(state.completedStepIds).toHaveLength(4);
    expect(sessionProgress(state, content).ratio).toBe(1);
    expect(
      state.events.filter((e) => e.type === "session_completed"),
    ).toHaveLength(1);
  });

  it("accepts no further actions once completed", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = advanceTo(startSession(content, ctx), content, ctx, 4);

    expect(recordClickerPress(state, content, ctx)).toMatchObject({
      ok: false,
      failure: "session_not_in_progress",
    });
    expect(logRepetition(state, content, ctx)).toMatchObject({ ok: false });
    expect(abandonSession(state, ctx)).toMatchObject({ ok: false });
  });

  it("never reports progress above 1", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = advanceTo(startSession(content, ctx), content, ctx, 4);

    const inflated: TrainingSessionState = {
      ...state,
      completedStepIds: [...state.completedStepIds, ID(10), ID(11)],
    };
    expect(sessionProgress(inflated, content).ratio).toBe(1);
  });
});

describe("abandonment", () => {
  it("marks the session abandoned and logs it", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = advanceTo(startSession(content, ctx), content, ctx, 2);

    const result = abandonSession(state, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.status).toBe("abandoned");
    expect(
      result.state.events.filter((e) => e.type === "session_abandoned"),
    ).toHaveLength(1);
  });
});

describe("troubleshooting", () => {
  it("does not disturb step progress or repetitions", () => {
    const content = makeContent();
    const ctx = testContext();
    let state = advanceTo(startSession(content, ctx), content, ctx, 3);
    const logged = logRepetition(state, content, ctx);
    if (logged.ok) state = logged.state;

    const opened = openTroubleshooting(state, content, ID(20), ctx);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const resolved = resolveTroubleshooting(opened.state, content, ID(20), ctx);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    expect(resolved.state.currentStepId).toBe(state.currentStepId);
    expect(resolved.state.completedStepIds).toEqual(state.completedStepIds);
    expect(repetitionsFor(resolved.state, content.steps[3]!)).toBe(1);
    expect(resolved.state.status).toBe("in_progress");
  });

  it("records which options were viewed, without duplicates", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = startSession(content, ctx);

    const once = openTroubleshooting(state, content, ID(20), ctx);
    if (!once.ok) return;
    const twice = openTroubleshooting(once.state, content, ID(20), ctx);
    if (!twice.ok) return;

    expect(twice.state.troubleshootingViewedIds).toEqual([ID(20)]);
    // Both openings are still logged: how often help was needed is the signal, not how many distinct options.
    expect(
      twice.state.events.filter((e) => e.type === "troubleshooting_opened"),
    ).toHaveLength(2);
  });

  it("rejects an option that does not belong to the lesson", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = startSession(content, ctx);

    expect(openTroubleshooting(state, content, ID(998), ctx)).toMatchObject({
      ok: false,
      failure: "unknown_troubleshooting_option",
    });
  });
});

describe("restoring a persisted session", () => {
  function inProgress(): TrainingSessionState {
    const content = makeContent();
    const ctx = testContext();
    return advanceTo(startSession(content, ctx), content, ctx, 2);
  }

  it("resumes an in-progress session exactly where it was", () => {
    const content = makeContent();
    const saved = inProgress();

    const restored = restoreSession(JSON.parse(JSON.stringify(saved)), content);

    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.state.currentStepId).toBe(saved.currentStepId);
    expect(restored.state.completedStepIds).toEqual(saved.completedStepIds);
    expect(sessionProgress(restored.state, content).completedSteps).toBe(2);
  });

  it.each([
    ["null", null],
    ["a string", "not a session"],
    ["an empty object", {}],
    ["a partial object", { sessionId: ID(1), status: "in_progress" }],
  ])("rejects malformed persisted state: %s", (_label, payload) => {
    expect(restoreSession(payload, makeContent())).toMatchObject({
      ok: false,
      rejection: "malformed",
    });
  });

  it("rejects state written by a different engine version", () => {
    const content = makeContent();
    const saved = {
      ...inProgress(),
      engineVersion: SESSION_ENGINE_VERSION + 1,
    };

    expect(restoreSession(saved, content)).toMatchObject({
      ok: false,
      rejection: "engine_version_mismatch",
    });
  });

  it("rejects a session belonging to a different lesson", () => {
    const content = makeContent();
    const saved = { ...inProgress(), lessonId: ID(777) };

    expect(restoreSession(saved, content)).toMatchObject({
      ok: false,
      rejection: "different_lesson",
    });
  });

  it("rejects a session whose current step no longer exists in the content", () => {
    const content = makeContent();
    const saved = inProgress();
    // Simulates the lesson being re-authored between sessions.
    content.steps = content.steps.filter(
      (step) => step.id !== saved.currentStepId,
    );

    expect(restoreSession(saved, content)).toMatchObject({
      ok: false,
      rejection: "unknown_current_step",
    });
  });

  it("rejects a session referencing a completed step that no longer exists", () => {
    const content = makeContent();
    const saved = { ...inProgress(), completedStepIds: [ID(10), ID(997)] };

    expect(restoreSession(saved, content)).toMatchObject({
      ok: false,
      rejection: "unknown_completed_step",
    });
  });

  it("rejects repetition counts that exceed the current target", () => {
    const content = makeContent();
    const saved = {
      ...inProgress(),
      repetitionsByStep: { [ID(13)]: 99 },
    };

    expect(restoreSession(saved, content)).toMatchObject({
      ok: false,
      rejection: "repetitions_out_of_bounds",
    });
  });

  it("rejects repetitions recorded against a step that takes none", () => {
    const content = makeContent();
    const saved = { ...inProgress(), repetitionsByStep: { [ID(10)]: 2 } };

    expect(restoreSession(saved, content)).toMatchObject({
      ok: false,
      rejection: "repetitions_out_of_bounds",
    });
  });

  it.each([
    ["completed", "completed"],
    ["abandoned", "abandoned"],
  ])("does not resume a %s session", (_label, status) => {
    const content = makeContent();
    const saved = { ...inProgress(), status };

    expect(restoreSession(saved, content)).toMatchObject({
      ok: false,
      rejection: "not_resumable",
    });
  });

  it("survives a full serialise/restore round trip without corrupting progress", () => {
    const content = makeContent();
    const ctx = testContext();
    let state = advanceTo(startSession(content, ctx), content, ctx, 3);
    const logged = logRepetition(state, content, ctx);
    if (logged.ok) state = logged.state;

    const restored = restoreSession(JSON.parse(JSON.stringify(state)), content);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    // And the restored session can still be driven to completion.
    let resumed = restored.state;
    for (let i = 0; i < 4; i += 1) {
      const rep = logRepetition(resumed, content, ctx);
      if (rep.ok) resumed = rep.state;
    }
    const done = completeCurrentStep(resumed, content, ID(13), ctx);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.state.status).toBe("completed");
  });
});

describe("the event log", () => {
  it("is append-only with unique client-generated ids", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = advanceTo(startSession(content, ctx), content, ctx, 4);

    const ids = state.events.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(state.events.length).toBeGreaterThan(0);
  });

  it("orders events in the sequence they happened", () => {
    const content = makeContent();
    const ctx = testContext();
    const state = advanceTo(startSession(content, ctx), content, ctx, 2);

    const types = state.events.map((event) => event.type);
    expect(types).toEqual([
      "step_advanced",
      "clicker_pressed",
      "step_advanced",
    ]);
  });
});
