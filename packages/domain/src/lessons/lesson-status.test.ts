import { describe, it, expect } from "vitest";
import {
  canStartLesson,
  deriveLessonStatuses,
  summariseTraining,
  type LessonHistoryEntry,
} from "./lesson-status";
import type { PlanningCatalogue } from "../plan-engine/content-graph";
import type { Skill } from "../models/goals-skills";
import type { Lesson } from "../models/lesson";

/**
 * Lesson state, derived from history.
 *
 * These assert the product rules a user can see — what is locked, what is finished, what was left half-done —
 * never how the derivation is implemented. Everything is computed from records that exist; there is no stored
 * progress field to drift.
 */

const TS = "2026-09-11T10:00:00.000Z";
const base = { createdAt: TS, updatedAt: TS };
const ID = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

const SKILL = { name: ID(1), sit: ID(2), stay: ID(3) };
const LESSON = { nameGame: ID(10), sit: ID(11), stay: ID(12) };

const CATALOGUE: PlanningCatalogue = {
  skills: [
    {
      id: SKILL.name,
      slug: "name_response",
      titleKey: "",
      prerequisiteSkillIds: [],
      difficulty: 1,
      ...base,
    },
    {
      id: SKILL.sit,
      slug: "sit",
      titleKey: "",
      prerequisiteSkillIds: [],
      difficulty: 1,
      ...base,
    },
    {
      id: SKILL.stay,
      slug: "stay",
      titleKey: "",
      prerequisiteSkillIds: [SKILL.sit],
      difficulty: 2,
      ...base,
    },
  ] as Skill[],
  lessons: [
    lesson(LESSON.nameGame, "name_game", SKILL.name, 3),
    lesson(LESSON.sit, "sit", SKILL.sit, 3),
    lesson(LESSON.stay, "stay", SKILL.stay, 4),
  ],
};

function lesson(
  id: string,
  slug: string,
  skillId: string,
  minutes: number,
): Lesson {
  return {
    id,
    slug,
    skillId,
    titleKey: `lesson.${slug}.title`,
    goalKey: `lesson.${slug}.goal`,
    estimatedMinutes: minutes,
    equipment: [],
    difficulty: 1,
    prerequisiteSkillIds: [],
    isAlwaysFree: true,
    contentVersionId: ID(900),
    ...base,
  };
}

function entry(
  lessonId: string,
  status: "completed" | "abandoned",
  endedAt: string,
): LessonHistoryEntry {
  return { lessonId, status, endedAt };
}

function statusOf(
  history: LessonHistoryEntry[],
  known: string[],
  lessonId: string,
) {
  return deriveLessonStatuses(CATALOGUE, history, known).find(
    (d) => d.lesson.id === lessonId,
  );
}

describe("lesson state", () => {
  it("is not started when nothing has happened", () => {
    expect(statusOf([], [], LESSON.nameGame)?.status).toBe("not_started");
  });

  it("is locked when a prerequisite is missing", () => {
    expect(statusOf([], [], LESSON.stay)?.status).toBe("locked");
  });

  it("names the missing prerequisite, so the UI can explain the lock", () => {
    expect(statusOf([], [], LESSON.stay)?.missingPrerequisiteSkillIds).toEqual([
      SKILL.sit,
    ]);
  });

  it("unlocks once the prerequisite skill is known", () => {
    expect(statusOf([], [SKILL.sit], LESSON.stay)?.status).toBe("not_started");
  });

  it("is unfinished after an abandoned attempt", () => {
    const history = [entry(LESSON.sit, "abandoned", TS)];
    expect(statusOf(history, [], LESSON.sit)?.status).toBe("unfinished");
  });

  it("is completed after a completion", () => {
    const history = [entry(LESSON.sit, "completed", TS)];
    expect(statusOf(history, [], LESSON.sit)?.status).toBe("completed");
  });

  it("stays completed even if a later attempt was abandoned", () => {
    // A lesson you have finished stays finished; starting it again and stopping does not undo that.
    const history = [
      entry(LESSON.sit, "completed", "2026-09-01T10:00:00.000Z"),
      entry(LESSON.sit, "abandoned", "2026-09-10T10:00:00.000Z"),
    ];
    expect(statusOf(history, [], LESSON.sit)?.status).toBe("completed");
  });

  it("counts repeat completions", () => {
    const history = [
      entry(LESSON.sit, "completed", "2026-09-01T10:00:00.000Z"),
      entry(LESSON.sit, "completed", "2026-09-05T10:00:00.000Z"),
    ];
    expect(statusOf(history, [], LESSON.sit)?.completions).toBe(2);
  });

  it("never shows a trained lesson as locked", () => {
    // Content can be re-authored underneath a user; their own history outranks the graph.
    const history = [entry(LESSON.stay, "completed", TS)];
    expect(statusOf(history, [], LESSON.stay)?.status).toBe("completed");
  });

  it("ignores malformed history rather than mis-reading it", () => {
    const history = [
      {
        lessonId: LESSON.sit,
        status: "completed" as const,
        endedAt: "not-a-date",
      },
    ];
    expect(statusOf(history, [], LESSON.sit)?.status).toBe("not_started");
  });

  it("reports the most recent activity of any kind", () => {
    const history = [
      entry(LESSON.sit, "completed", "2026-09-01T10:00:00.000Z"),
      entry(LESSON.sit, "abandoned", "2026-09-08T10:00:00.000Z"),
    ];
    expect(statusOf(history, [], LESSON.sit)?.lastTrainedAt).toBe(
      "2026-09-08T10:00:00.000Z",
    );
  });
});

describe("starting a lesson", () => {
  it("is refused only when locked", () => {
    const locked = statusOf([], [], LESSON.stay)!;
    const ready = statusOf([], [], LESSON.sit)!;
    expect(canStartLesson(locked)).toBe(false);
    expect(canStartLesson(ready)).toBe(true);
  });
});

describe("training totals", () => {
  it("counts sessions, distinct lessons and estimated minutes", () => {
    const history = [
      entry(LESSON.sit, "completed", "2026-09-01T10:00:00.000Z"),
      entry(LESSON.sit, "completed", "2026-09-05T10:00:00.000Z"),
      entry(LESSON.nameGame, "completed", "2026-09-06T10:00:00.000Z"),
    ];

    expect(summariseTraining(CATALOGUE, history)).toMatchObject({
      sessionsCompleted: 3,
      lessonsCompleted: 2,
      // 3 + 3 + 3 from each lesson's authored length — an estimate, and labelled as one in the UI.
      estimatedMinutesTrained: 9,
      lastTrainedAt: "2026-09-06T10:00:00.000Z",
    });
  });

  it("does not count an abandoned attempt as a completed session", () => {
    const history = [entry(LESSON.sit, "abandoned", TS)];
    expect(summariseTraining(CATALOGUE, history)).toMatchObject({
      sessionsCompleted: 0,
      unfinishedLessons: 1,
    });
  });

  it("stops counting a lesson as unfinished once it is completed", () => {
    const history = [
      entry(LESSON.sit, "abandoned", "2026-09-01T10:00:00.000Z"),
      entry(LESSON.sit, "completed", "2026-09-05T10:00:00.000Z"),
    ];
    expect(summariseTraining(CATALOGUE, history).unfinishedLessons).toBe(0);
  });

  it("returns honest zeroes with no history", () => {
    expect(summariseTraining(CATALOGUE, [])).toEqual({
      sessionsCompleted: 0,
      lessonsCompleted: 0,
      unfinishedLessons: 0,
      estimatedMinutesTrained: 0,
      lastTrainedAt: null,
    });
  });
});
