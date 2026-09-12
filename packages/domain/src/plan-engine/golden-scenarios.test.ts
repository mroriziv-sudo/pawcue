import { describe, it, expect } from "vitest";
import { RulesBasedTrainingPlanGenerator } from "./rules-based-generator";
import type { PlanningCatalogue } from "./content-graph";
import type { TrainingPlanGeneratorInput } from "./training-plan-generator";
import type { Skill } from "../models/goals-skills";
import type { Lesson } from "../models/lesson";

/**
 * Golden planning scenarios.
 *
 * Named situations a person can reason about, each asserting the shape of the plan rather than its exact
 * contents. They exist so the product's behaviour can be argued with: if someone thinks a recommendation is
 * wrong, the disagreement should be about one of these scenarios, not about a scoring function.
 *
 * Deliberately not snapshots. A snapshot would lock today's lesson ids and fail for any content edit, which
 * teaches a reader nothing about whether the plan is *good*.
 *
 * The catalogue mirrors the real seeded content, including the fact that prerequisites live on skills rather
 * than on lessons.
 */

const TS = "2026-09-11T10:00:00.000Z";
const base = { createdAt: TS, updatedAt: TS };
const ID = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

const SKILL = {
  name: ID(1),
  sit: ID(2),
  down: ID(3),
  stay: ID(4),
  come: ID(5),
};
const LESSON = {
  nameGame: ID(10),
  sit: ID(11),
  down: ID(12),
  stay: ID(13),
  come: ID(14),
};

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
      id: SKILL.down,
      slug: "down",
      titleKey: "",
      prerequisiteSkillIds: [],
      difficulty: 2,
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
    {
      id: SKILL.come,
      slug: "come",
      titleKey: "",
      prerequisiteSkillIds: [SKILL.sit],
      difficulty: 2,
      ...base,
    },
  ] as Skill[],
  lessons: [
    lesson(LESSON.nameGame, "name_game", SKILL.name, 3, 1),
    lesson(LESSON.sit, "sit", SKILL.sit, 3, 1),
    lesson(LESSON.down, "down", SKILL.down, 4, 2),
    lesson(LESSON.stay, "stay", SKILL.stay, 4, 2),
    lesson(LESSON.come, "come", SKILL.come, 5, 2),
  ],
};

function lesson(
  id: string,
  slug: string,
  skillId: string,
  minutes: number,
  difficulty: number,
): Lesson {
  return {
    id,
    slug,
    skillId,
    titleKey: `lesson.${slug}.title`,
    goalKey: `lesson.${slug}.goal`,
    estimatedMinutes: minutes,
    equipment: [],
    difficulty,
    prerequisiteSkillIds: [],
    isAlwaysFree: true,
    contentVersionId: ID(900),
    ...base,
  };
}

function runScenario(overrides: Partial<TrainingPlanGeneratorInput>) {
  const generator = new RulesBasedTrainingPlanGenerator(CATALOGUE);
  const result = generator.generateWithDiagnostics({
    dogId: ID(500),
    ageBucket: "adolescent_6_18_months",
    primaryGoalId: ID(600),
    secondaryGoalIds: [],
    knownSkillIds: [],
    dailyMinutes: 10,
    recentSessionSummaries: [],
    startDate: "2026-09-11",
    lengthDays: 1,
    ...overrides,
  });

  const today = result.generated.days.find((d) => d.day.dayIndex === 0);
  return {
    activities: today?.activities ?? [],
    minutes: today?.day.totalMinutes ?? 0,
    diagnostics: result.diagnostics,
  };
}

describe("GOLDEN: brand-new dog, 10 minutes", () => {
  /**
   * Why this is correct: the dog knows nothing, so only lessons with no prerequisites are appropriate. The plan
   * should be gentle — one new skill, not a pile of them — and should start with the easiest foundational
   * material rather than whatever happens to sort first.
   */
  const scenario = runScenario({});

  it("recommends exactly one thing, and it is new", () => {
    expect(scenario.activities).toHaveLength(1);
    expect(scenario.activities[0]?.selectionReason).toBe("new_skill");
  });

  it("picks a lesson with no prerequisites", () => {
    const chosen = CATALOGUE.lessons.find(
      (l) => l.id === scenario.activities[0]?.lessonId,
    )!;
    const skill = CATALOGUE.skills.find((s) => s.id === chosen.skillId)!;
    expect(skill.prerequisiteSkillIds).toEqual([]);
  });

  it("stays inside the time budget", () => {
    expect(scenario.minutes).toBeLessThanOrEqual(10);
  });
});

describe("GOLDEN: returning learner with several basics done", () => {
  /**
   * Why this is correct: someone coming back after a week of work should get consolidation, not three unrelated
   * new skills. Their completed lessons are old enough to be worth practising, and at most one new skill may be
   * introduced alongside — so the plan mixes review with a single piece of new learning.
   */
  const scenario = runScenario({
    dailyMinutes: 20,
    knownSkillIds: [SKILL.name, SKILL.sit],
    recentSessionSummaries: [
      {
        lessonId: LESSON.nameGame,
        completedAt: "2026-09-01T10:00:00.000Z",
        wasAbandoned: false,
      },
      {
        lessonId: LESSON.sit,
        completedAt: "2026-09-02T10:00:00.000Z",
        wasAbandoned: false,
      },
    ],
  });

  it("mixes review with learning rather than stacking new skills", () => {
    const newSkills = scenario.activities.filter(
      (a) =>
        a.selectionReason === "new_skill" ||
        a.selectionReason === "prerequisite_unlocked",
    );
    const reviews = scenario.activities.filter((a) => a.isReview);

    expect(newSkills.length).toBeLessThanOrEqual(1);
    expect(reviews.length).toBeGreaterThan(0);
  });

  it("keeps the session to a sensible number of exercises", () => {
    expect(scenario.activities.length).toBeGreaterThanOrEqual(1);
    expect(scenario.activities.length).toBeLessThanOrEqual(3);
  });

  it("ends the session on something the dog already knows", () => {
    // Ending on success is a positive-reinforcement principle, not a scheduling detail.
    expect(scenario.activities[scenario.activities.length - 1]?.isReview).toBe(
      true,
    );
  });
});

describe("GOLDEN: skill completed yesterday", () => {
  /**
   * Why this is correct: repeating yesterday's lesson today reads as an engine with nothing to say. It should
   * drop out until enough time has passed to make practice useful, and the plan should move on.
   */
  const scenario = runScenario({
    knownSkillIds: [SKILL.name],
    recentSessionSummaries: [
      {
        lessonId: LESSON.nameGame,
        completedAt: "2026-09-10T10:00:00.000Z",
        wasAbandoned: false,
      },
    ],
  });

  it("does not recommend it again", () => {
    expect(scenario.activities.map((a) => a.lessonId)).not.toContain(
      LESSON.nameGame,
    );
  });

  it("says why, rather than silently omitting it", () => {
    expect(scenario.diagnostics.exclusions).toContainEqual({
      dayIndex: 0,
      lessonId: LESSON.nameGame,
      reason: "completed_too_recently",
    });
  });

  it("still offers something useful", () => {
    expect(scenario.activities.length).toBeGreaterThan(0);
  });
});

describe("GOLDEN: five-minute session", () => {
  /**
   * Why this is correct: five minutes is a real constraint, not a suggestion. A plan that overruns the time
   * someone said they had is a plan they abandon. One short, useful exercise is the right answer.
   */
  const scenario = runScenario({ dailyMinutes: 5 });

  it("fits inside five minutes", () => {
    expect(scenario.minutes).toBeLessThanOrEqual(5);
    expect(scenario.minutes).toBeGreaterThan(0);
  });

  it("recommends a single exercise", () => {
    expect(scenario.activities).toHaveLength(1);
  });
});

describe("GOLDEN: prerequisite just satisfied", () => {
  /**
   * Why this is correct: finishing `sit` makes `stay` and `come` reachable for the first time. That is the most
   * interesting thing that has changed for this dog, so it should surface immediately — no restart, no manual
   * migration — and be labelled as newly unlocked rather than as generic new material.
   */
  const scenario = runScenario({
    knownSkillIds: [SKILL.sit],
    recentSessionSummaries: [
      {
        lessonId: LESSON.sit,
        completedAt: "2026-09-10T10:00:00.000Z",
        wasAbandoned: false,
      },
    ],
  });

  it("recommends the newly unlocked lesson", () => {
    expect([LESSON.stay, LESSON.come]).toContain(
      scenario.activities[0]?.lessonId,
    );
  });

  it("labels it as unlocked by a prerequisite", () => {
    expect(scenario.activities[0]?.selectionReason).toBe(
      "prerequisite_unlocked",
    );
  });

  it("records which prerequisite made it eligible", () => {
    const selection = scenario.diagnostics.selections[0];
    expect(selection?.satisfiedPrerequisiteSkillIds).toEqual([SKILL.sit]);
  });
});

describe("GOLDEN: everything appropriate is already done", () => {
  /**
   * Why this is correct: with every lesson finished yesterday, there is genuinely nothing useful to recommend
   * today. Inventing something — repeating yesterday, or suggesting a lesson the dog is not ready for — would be
   * worse than an honest empty plan. The user will have material again once review becomes due.
   */
  const scenario = runScenario({
    knownSkillIds: Object.values(SKILL),
    recentSessionSummaries: CATALOGUE.lessons.map((l) => ({
      lessonId: l.id,
      completedAt: "2026-09-10T10:00:00.000Z",
      wasAbandoned: false,
    })),
  });

  it("recommends nothing rather than inventing work", () => {
    expect(scenario.activities).toHaveLength(0);
  });

  it("records the day as empty for a stated reason", () => {
    expect(scenario.diagnostics.emptyDays).toContainEqual({
      dayIndex: 0,
      reason: "no_eligible_lesson",
    });
  });
});

describe("GOLDEN: unfinished lesson from yesterday", () => {
  /**
   * Why this is correct: someone who stopped halfway through has already invested in that lesson. Finishing it
   * is more valuable than starting something unrelated, and it should come first in the session while attention
   * is freshest.
   */
  const scenario = runScenario({
    dailyMinutes: 20,
    recentSessionSummaries: [
      {
        lessonId: LESSON.sit,
        completedAt: "2026-09-10T10:00:00.000Z",
        wasAbandoned: true,
      },
    ],
  });

  it("puts the unfinished lesson first", () => {
    expect(scenario.activities[0]?.lessonId).toBe(LESSON.sit);
    expect(scenario.activities[0]?.selectionReason).toBe("continue_unfinished");
  });
});
