import { describe, it, expect } from "vitest";
import {
  canStartLessonWithEntitlement,
  isPremiumLesson,
  lessonGate,
} from "./access";
import type { LessonStatusDetail } from "../lessons/lesson-status";
import type { Lesson } from "../models/lesson";

/**
 * The free/premium boundary, and the rule that it never swallows the prerequisite one.
 *
 * A lesson can be unavailable for two unrelated reasons, with two unrelated remedies. Every test here is about
 * keeping them legible: a dog that has not learned Sit yet must never be shown a paywall, and a subscription must
 * never appear to teach a dog anything.
 */

const TS = "2026-09-12T10:00:00.000Z";

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: "00000000-0000-4000-a000-000000000001",
    slug: "sit",
    skillId: "00000000-0000-4000-a000-0000000000a1",
    titleKey: "lesson.sit.title",
    goalKey: "lesson.sit.goal",
    estimatedMinutes: 3,
    equipment: ["treats"],
    difficulty: 1,
    prerequisiteSkillIds: [],
    isAlwaysFree: true,
    contentVersionId: "00000000-0000-4000-a000-0000000000c1",
    createdAt: TS,
    updatedAt: TS,
    ...over,
  };
}

function detail(over: Partial<LessonStatusDetail> = {}): LessonStatusDetail {
  return {
    lesson: lesson(),
    status: "not_started",
    completions: 0,
    missingPrerequisiteSkillIds: [],
    lastTrainedAt: null,
    ...over,
  };
}

const ENTITLED = { isPremiumActive: true };
const NOT_ENTITLED = { isPremiumActive: false };

describe("free content", () => {
  it("starts for a user with no subscription", () => {
    const gate = lessonGate(detail(), NOT_ENTITLED);
    expect(gate).toEqual({
      prerequisiteLocked: false,
      premiumLocked: false,
      canStart: true,
    });
  });
});

describe("premium content", () => {
  const premiumLesson = detail({ lesson: lesson({ isAlwaysFree: false }) });

  it("does not start while the user is free", () => {
    const gate = lessonGate(premiumLesson, NOT_ENTITLED);
    expect(gate.premiumLocked).toBe(true);
    expect(gate.canStart).toBe(false);
  });

  it("starts once the user is entitled", () => {
    const gate = lessonGate(premiumLesson, ENTITLED);
    expect(gate.premiumLocked).toBe(false);
    expect(gate.canStart).toBe(true);
  });

  it("is identified without reference to any user", () => {
    expect(isPremiumLesson(lesson({ isAlwaysFree: false }))).toBe(true);
    expect(isPremiumLesson(lesson({ isAlwaysFree: true }))).toBe(false);
  });
});

describe("the two locks stay separate", () => {
  it("reports a prerequisite lock on free content without involving billing", () => {
    const gate = lessonGate(
      detail({ status: "locked", missingPrerequisiteSkillIds: ["skill-1"] }),
      NOT_ENTITLED,
    );
    expect(gate.prerequisiteLocked).toBe(true);
    expect(gate.premiumLocked).toBe(false);
    expect(gate.canStart).toBe(false);
  });

  it("keeps the prerequisite lock in place for an entitled user", () => {
    // Buying a subscription does not teach the dog the prerequisite skill.
    const gate = lessonGate(
      detail({ status: "locked", missingPrerequisiteSkillIds: ["skill-1"] }),
      ENTITLED,
    );
    expect(gate.prerequisiteLocked).toBe(true);
    expect(gate.canStart).toBe(false);
  });

  it("reports both locks when both apply", () => {
    const gate = lessonGate(
      detail({
        lesson: lesson({ isAlwaysFree: false }),
        status: "locked",
        missingPrerequisiteSkillIds: ["skill-1"],
      }),
      NOT_ENTITLED,
    );
    expect(gate).toEqual({
      prerequisiteLocked: true,
      premiumLocked: true,
      canStart: false,
    });
  });

  it("clears only the premium lock when a doubly-locked lesson is purchased", () => {
    const gate = lessonGate(
      detail({
        lesson: lesson({ isAlwaysFree: false }),
        status: "locked",
        missingPrerequisiteSkillIds: ["skill-1"],
      }),
      ENTITLED,
    );
    expect(gate.premiumLocked).toBe(false);
    expect(gate.prerequisiteLocked).toBe(true);
    expect(gate.canStart).toBe(false);
  });
});

describe("history still outranks the prerequisite graph", () => {
  it("keeps a completed premium lesson startable for an entitled user", () => {
    const gate = lessonGate(
      detail({
        lesson: lesson({ isAlwaysFree: false }),
        status: "completed",
        completions: 2,
      }),
      ENTITLED,
    );
    expect(gate.canStart).toBe(true);
  });

  it("re-locks a completed premium lesson when the subscription ends", () => {
    // Access to the content ends; the record that it was completed is untouched, and is asserted elsewhere.
    const gate = lessonGate(
      detail({
        lesson: lesson({ isAlwaysFree: false }),
        status: "completed",
        completions: 2,
      }),
      NOT_ENTITLED,
    );
    expect(gate.premiumLocked).toBe(true);
    expect(gate.prerequisiteLocked).toBe(false);
  });
});

describe("canStartLessonWithEntitlement", () => {
  it("is the single check a start control makes", () => {
    expect(canStartLessonWithEntitlement(detail(), NOT_ENTITLED)).toBe(true);
    expect(
      canStartLessonWithEntitlement(
        detail({ lesson: lesson({ isAlwaysFree: false }) }),
        NOT_ENTITLED,
      ),
    ).toBe(false);
  });
});
