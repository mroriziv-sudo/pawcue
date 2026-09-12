import {
  ageBucketFor,
  buildPlanInput,
  knownSkillIdsFromHistory,
} from "../src/plans/plan-inputs";
import type { Dog, PlanningCatalogue } from "@pawcue/domain";
import type { CompletedSessionRecord } from "../src/state/training-log-store";

/**
 * Building the planner's input from what the app actually knows.
 *
 * The point of these is honesty as much as correctness: several fields of `TrainingPlanGeneratorInput` have no
 * source in the product today, and the builder must derive what it can from real data and be explicit about the
 * rest rather than supplying something plausible.
 */

const TS = "2026-09-11T10:00:00.000Z";
const base = { createdAt: TS, updatedAt: TS };
const ID = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

const TODAY = new Date("2026-09-11T00:00:00Z");

const CATALOGUE: PlanningCatalogue = {
  skills: [
    {
      id: ID(1),
      slug: "name_response",
      titleKey: "",
      prerequisiteSkillIds: [],
      difficulty: 1,
      ...base,
    },
    {
      id: ID(2),
      slug: "sit",
      titleKey: "",
      prerequisiteSkillIds: [],
      difficulty: 1,
      ...base,
    },
  ] as PlanningCatalogue["skills"],
  lessons: [
    {
      id: ID(10),
      slug: "name_game",
      skillId: ID(1),
      titleKey: "",
      goalKey: "",
      estimatedMinutes: 3,
      equipment: [],
      difficulty: 1,
      prerequisiteSkillIds: [],
      isAlwaysFree: true,
      contentVersionId: ID(900),
      ...base,
    },
    {
      id: ID(11),
      slug: "sit",
      skillId: ID(2),
      titleKey: "",
      goalKey: "",
      estimatedMinutes: 3,
      equipment: [],
      difficulty: 1,
      prerequisiteSkillIds: [],
      isAlwaysFree: true,
      contentVersionId: ID(900),
      ...base,
    },
  ],
};

function dog(overrides: Partial<Dog> = {}): Dog {
  return {
    id: ID(500),
    owner: { kind: "user", userId: ID(501) },
    name: "Libi",
    birthdate: "2024-03-15",
    breed: null,
    sex: "female",
    photoUrl: null,
    dailyTrainingMinutes: 20,
    ...base,
    ...overrides,
  };
}

function completion(
  lessonId: string,
  completedAt: string,
): CompletedSessionRecord {
  return {
    sessionId: `${lessonId}-session`,
    lessonId,
    lessonSlug: "name_game",
    startedAt: completedAt,
    completedAt,
    stepsCompleted: 4,
    repetitionsLogged: 5,
    clickerPresses: 1,
    troubleshootingViewed: 0,
    syncedToServer: true,
  };
}

describe("age bucket", () => {
  it.each([
    ["a young puppy", "2026-07-15", "puppy_8_16_weeks"],
    ["a four-month puppy", "2026-05-01", "puppy_4_6_months"],
    ["an adolescent", "2025-06-01", "adolescent_6_18_months"],
    ["an adult", "2020-01-01", "adult_18_months_plus"],
  ])("derives %s from the birthdate", (_label, birthdate, expected) => {
    expect(ageBucketFor({ birthdate }, TODAY)).toBe(expected);
  });

  it("falls back to the least assuming bucket without a birthdate", () => {
    // Birthdate is optional in onboarding, so this is a normal state rather than an error.
    expect(ageBucketFor({ birthdate: null }, TODAY)).toBe(
      "adolescent_6_18_months",
    );
  });

  it("falls back rather than throwing on a malformed birthdate", () => {
    expect(ageBucketFor({ birthdate: "not-a-date" }, TODAY)).toBe(
      "adolescent_6_18_months",
    );
  });
});

describe("known skills", () => {
  it("derives them from completed lessons", () => {
    // `dog_skills` exists but nothing writes it; a finished lesson genuinely did teach its skill.
    const known = knownSkillIdsFromHistory([completion(ID(10), TS)], CATALOGUE);
    expect(known).toEqual([ID(1)]);
  });

  it("ignores a completion for a lesson that is no longer in the catalogue", () => {
    expect(
      knownSkillIdsFromHistory([completion(ID(999), TS)], CATALOGUE),
    ).toEqual([]);
  });

  it("does not double-count repeated completions of the same lesson", () => {
    const known = knownSkillIdsFromHistory(
      [completion(ID(10), TS), completion(ID(10), TS)],
      CATALOGUE,
    );
    expect(known).toEqual([ID(1)]);
  });

  it("returns skills in a stable order", () => {
    const forward = knownSkillIdsFromHistory(
      [completion(ID(11), TS), completion(ID(10), TS)],
      CATALOGUE,
    );
    const reversed = knownSkillIdsFromHistory(
      [completion(ID(10), TS), completion(ID(11), TS)],
      CATALOGUE,
    );
    // The input must not vary with history order, or the plan would not be reproducible.
    expect(forward).toEqual(reversed);
  });
});

describe("building the input", () => {
  it("uses the dog's chosen daily minutes", () => {
    const input = buildPlanInput({
      dog: dog(),
      completed: [],
      catalogue: CATALOGUE,
      today: TODAY,
    });
    expect(input.dailyMinutes).toBe(20);
  });

  it("falls back to a sensible default when no training time was chosen", () => {
    const input = buildPlanInput({
      dog: dog({ dailyTrainingMinutes: null }),
      completed: [],
      catalogue: CATALOGUE,
      today: TODAY,
    });
    expect(input.dailyMinutes).toBe(10);
  });

  it("carries completed sessions through as history", () => {
    const input = buildPlanInput({
      dog: dog(),
      completed: [completion(ID(10), "2026-09-10T10:00:00.000Z")],
      catalogue: CATALOGUE,
      today: TODAY,
    });

    expect(input.recentSessionSummaries).toEqual([
      {
        lessonId: ID(10),
        completedAt: "2026-09-10T10:00:00.000Z",
        wasAbandoned: false,
      },
    ]);
  });

  it("reports no abandoned sessions, because abandonment is not persisted yet", () => {
    // Stated as a fact rather than guessed at: the local log records completions only.
    const input = buildPlanInput({
      dog: dog(),
      completed: [completion(ID(10), TS)],
      catalogue: CATALOGUE,
      today: TODAY,
    });
    expect(input.recentSessionSummaries.every((s) => !s.wasAbandoned)).toBe(
      true,
    );
  });

  it("produces the same input for the same state", () => {
    const args = {
      dog: dog(),
      completed: [completion(ID(10), TS), completion(ID(11), TS)],
      catalogue: CATALOGUE,
      today: TODAY,
    };
    expect(buildPlanInput(args)).toEqual(buildPlanInput(args));
  });

  it("starts the plan today", () => {
    const input = buildPlanInput({
      dog: dog(),
      completed: [],
      catalogue: CATALOGUE,
      today: TODAY,
    });
    expect(input.startDate).toBe("2026-09-11");
  });
});
