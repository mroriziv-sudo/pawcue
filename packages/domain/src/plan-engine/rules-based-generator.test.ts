import { describe, it, expect } from "vitest";
import {
  PLANNING_LIMITS,
  PLAN_ENGINE_VERSION,
  RulesBasedTrainingPlanGenerator,
} from "./rules-based-generator";
import type { PlanningCatalogue } from "./content-graph";
import type { TrainingPlanGeneratorInput } from "./training-plan-generator";
import type { Skill } from "../models/goals-skills";
import type { Lesson } from "../models/lesson";

/**
 * The planning rules, tested as product behaviour.
 *
 * These assert what the engine recommends and why — never its internal scores. A test that locked the priority
 * numbers would make the rules unchangeable rather than verified.
 *
 * The catalogue mirrors the real seeded content: lessons carry no prerequisites of their own, and the structure
 * lives on the skills (stay and come require sit; place requires down).
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
  place: ID(6),
} as const;

const LESSON = {
  nameGame: ID(10),
  sit: ID(11),
  down: ID(12),
  stay: ID(13),
  come: ID(14),
  place: ID(15),
} as const;

function makeSkill(
  id: string,
  slug: string,
  prerequisites: string[] = [],
): Skill {
  return {
    id,
    slug,
    titleKey: `skill.${slug}.title`,
    prerequisiteSkillIds: prerequisites,
    difficulty: 1,
    ...base,
  } as Skill;
}

function makeLesson(
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

function catalogue(): PlanningCatalogue {
  return {
    skills: [
      makeSkill(SKILL.name, "name_response"),
      makeSkill(SKILL.sit, "sit"),
      makeSkill(SKILL.down, "down"),
      makeSkill(SKILL.stay, "stay", [SKILL.sit]),
      makeSkill(SKILL.come, "come", [SKILL.sit]),
      makeSkill(SKILL.place, "place", [SKILL.down]),
    ],
    lessons: [
      makeLesson(LESSON.nameGame, "name_game", SKILL.name, 3, 1),
      makeLesson(LESSON.sit, "sit", SKILL.sit, 3, 1),
      makeLesson(LESSON.down, "down", SKILL.down, 4, 2),
      makeLesson(LESSON.stay, "stay", SKILL.stay, 4, 2),
      makeLesson(LESSON.come, "come", SKILL.come, 5, 2),
      makeLesson(LESSON.place, "place", SKILL.place, 5, 3),
    ],
  };
}

function input(
  overrides: Partial<TrainingPlanGeneratorInput> = {},
): TrainingPlanGeneratorInput {
  return {
    dogId: ID(500),
    ageBucket: "puppy_4_6_months",
    primaryGoalId: ID(600),
    secondaryGoalIds: [],
    knownSkillIds: [],
    dailyMinutes: 10,
    recentSessionSummaries: [],
    startDate: "2026-09-11",
    lengthDays: 1,
    ...overrides,
  };
}

function plan(
  overrides: Partial<TrainingPlanGeneratorInput> = {},
  content: PlanningCatalogue = catalogue(),
) {
  return new RulesBasedTrainingPlanGenerator(content).generateWithDiagnostics(
    input(overrides),
  );
}

/** Lesson ids chosen on a given day, in session order. */
function day(result: ReturnType<typeof plan>, index = 0) {
  return result.generated.days.find((d) => d.day.dayIndex === index);
}
function lessonIds(result: ReturnType<typeof plan>, index = 0) {
  return day(result, index)?.activities.map((a) => a.lessonId) ?? [];
}
function reasons(result: ReturnType<typeof plan>, index = 0) {
  return day(result, index)?.activities.map((a) => a.selectionReason) ?? [];
}

describe("determinism", () => {
  it("produces an identical plan for identical input", () => {
    const a = plan({ lengthDays: 5 });
    const b = plan({ lengthDays: 5 });
    expect(a.generated).toEqual(b.generated);
  });

  it("is unaffected by the order lessons arrive in", () => {
    // Catalogue order is a database ordering; depending on it would make plans quietly unstable.
    const forward = catalogue();
    const reversed = catalogue();
    reversed.lessons.reverse();
    reversed.skills.reverse();

    expect(plan({ lengthDays: 3 }, forward).generated).toEqual(
      plan({ lengthDays: 3 }, reversed).generated,
    );
  });

  it("records the engine version on the plan", () => {
    expect(plan().generated.plan.planEngineVersionId).toBe(PLAN_ENGINE_VERSION);
    expect(plan().diagnostics.engineVersion).toBe(PLAN_ENGINE_VERSION);
  });
});

describe("a brand-new dog", () => {
  it("only recommends lessons whose prerequisites it already meets", () => {
    const result = plan();
    // stay/come need sit; place needs down. None are reachable on day one.
    expect(lessonIds(result)).not.toContain(LESSON.stay);
    expect(lessonIds(result)).not.toContain(LESSON.come);
    expect(lessonIds(result)).not.toContain(LESSON.place);
  });

  it("introduces at most one new skill", () => {
    const result = plan({ dailyMinutes: 20 });
    const newOnes = reasons(result).filter(
      (r) => r === "new_skill" || r === "prerequisite_unlocked",
    );
    expect(newOnes).toHaveLength(PLANNING_LIMITS.maxNewSkillsPerDay);
  });

  it("starts with the easiest foundational lesson", () => {
    // With nothing known, difficulty then duration then slug decide — the gentlest start available.
    expect(lessonIds(plan())[0]).toBe(LESSON.nameGame);
  });

  it("marks everything as new", () => {
    expect(reasons(plan())).toEqual(["new_skill"]);
  });
});

describe("prerequisites", () => {
  it("never recommends a lesson whose prerequisites are unmet", () => {
    const result = plan({ lengthDays: 6, dailyMinutes: 20 });

    const taught = new Set<string>();
    for (const d of result.generated.days) {
      for (const activity of d.activities) {
        const lesson = catalogue().lessons.find(
          (l) => l.id === activity.lessonId,
        )!;
        const skill = catalogue().skills.find((s) => s.id === lesson.skillId)!;
        for (const prerequisite of skill.prerequisiteSkillIds) {
          expect(taught.has(prerequisite)).toBe(true);
        }
        taught.add(lesson.skillId);
      }
    }
  });

  it("unlocks a lesson once the prerequisite skill is known", () => {
    const result = plan({ knownSkillIds: [SKILL.sit], dailyMinutes: 20 });
    expect(lessonIds(result)).toContain(LESSON.stay);
  });

  it("labels a newly reachable lesson as prerequisite_unlocked, not merely new", () => {
    // The distinction is the point: "this just became possible" is a different recommendation from "here is
    // something else you have not done".
    const result = plan({ knownSkillIds: [SKILL.sit] });
    expect(reasons(result)).toContain("prerequisite_unlocked");
  });

  it("prefers a newly unlocked lesson over unrelated new material", () => {
    const result = plan({ knownSkillIds: [SKILL.sit] });
    expect(lessonIds(result)[0]).toBe(LESSON.stay);
  });

  it("treats an implied prerequisite as satisfied", () => {
    // Knowing `place` means `down` was learned, even if history only records the advanced skill.
    const result = plan({ knownSkillIds: [SKILL.place], dailyMinutes: 20 });

    // It may still lose its slot to the daily limits — what must never happen is being ruled out as not ready.
    const ruledUnready = result.diagnostics.exclusions.filter(
      (e) => e.lessonId === LESSON.down && e.reason === "prerequisites_unmet",
    );
    expect(ruledUnready).toEqual([]);
  });
});

describe("recent history", () => {
  it("does not offer a lesson finished yesterday", () => {
    const result = plan({
      recentSessionSummaries: [
        {
          lessonId: LESSON.nameGame,
          completedAt: "2026-09-10T10:00:00.000Z",
          wasAbandoned: false,
        },
      ],
    });

    expect(lessonIds(result)).not.toContain(LESSON.nameGame);
    expect(result.diagnostics.exclusions).toContainEqual({
      dayIndex: 0,
      lessonId: LESSON.nameGame,
      reason: "completed_too_recently",
    });
  });

  it("offers it again as review once enough time has passed", () => {
    const result = plan({
      knownSkillIds: [SKILL.name],
      recentSessionSummaries: [
        {
          lessonId: LESSON.nameGame,
          completedAt: "2026-09-01T10:00:00.000Z",
          wasAbandoned: false,
        },
      ],
      dailyMinutes: 20,
    });

    expect(lessonIds(result)).toContain(LESSON.nameGame);
    const activity = day(result)?.activities.find(
      (a) => a.lessonId === LESSON.nameGame,
    );
    expect(activity?.selectionReason).toBe("spaced_review");
    // The frozen boolean stays consistent with the new reason rather than drifting from it.
    expect(activity?.isReview).toBe(true);
  });

  it("reviews the longest-neglected skill first", () => {
    const result = plan({
      knownSkillIds: [SKILL.name, SKILL.sit],
      recentSessionSummaries: [
        {
          lessonId: LESSON.sit,
          completedAt: "2026-09-05T10:00:00.000Z",
          wasAbandoned: false,
        },
        {
          lessonId: LESSON.nameGame,
          completedAt: "2026-08-20T10:00:00.000Z",
          wasAbandoned: false,
        },
      ],
      dailyMinutes: 20,
    });

    const reviews = day(result)?.activities.filter((a) => a.isReview) ?? [];
    expect(reviews[0]?.lessonId).toBe(LESSON.nameGame);
  });

  it("keeps working from duplicated history", () => {
    // Offline replay legitimately produces repeats; the reduction keeps the latest.
    const entry = {
      lessonId: LESSON.nameGame,
      completedAt: "2026-09-10T10:00:00.000Z",
      wasAbandoned: false,
    };
    const result = plan({ recentSessionSummaries: [entry, entry, entry] });

    expect(lessonIds(result)).not.toContain(LESSON.nameGame);
  });

  it("ignores malformed history entries rather than mis-reading them", () => {
    // An unparseable date compared with `<` silently answers false, which would turn "completed yesterday" into
    // "never completed" — worse than ignoring the row.
    const result = plan({
      recentSessionSummaries: [
        {
          lessonId: LESSON.nameGame,
          completedAt: "not-a-date",
          wasAbandoned: false,
        },
        {
          lessonId: "",
          completedAt: "2026-09-10T10:00:00.000Z",
          wasAbandoned: false,
        },
      ] as TrainingPlanGeneratorInput["recentSessionSummaries"],
    });

    expect(lessonIds(result)).toContain(LESSON.nameGame);
  });
});

describe("unfinished work", () => {
  it("continues a recently abandoned lesson before starting anything new", () => {
    const result = plan({
      recentSessionSummaries: [
        {
          lessonId: LESSON.sit,
          completedAt: "2026-09-10T10:00:00.000Z",
          wasAbandoned: true,
        },
      ],
    });

    expect(lessonIds(result)[0]).toBe(LESSON.sit);
    expect(reasons(result)[0]).toBe("continue_unfinished");
  });

  it("does not treat a long-abandoned attempt as still in progress", () => {
    const result = plan({
      recentSessionSummaries: [
        {
          lessonId: LESSON.sit,
          completedAt: "2026-01-01T10:00:00.000Z",
          wasAbandoned: true,
        },
      ],
    });

    expect(reasons(result)).not.toContain("continue_unfinished");
  });

  it("does not resurrect a lesson that was abandoned and later completed", () => {
    const result = plan({
      recentSessionSummaries: [
        {
          lessonId: LESSON.sit,
          completedAt: "2026-09-05T10:00:00.000Z",
          wasAbandoned: true,
        },
        {
          lessonId: LESSON.sit,
          completedAt: "2026-09-10T10:00:00.000Z",
          wasAbandoned: false,
        },
      ],
    });

    expect(reasons(result)).not.toContain("continue_unfinished");
    expect(lessonIds(result)).not.toContain(LESSON.sit);
  });
});

describe("the time budget", () => {
  it("never exceeds the available minutes", () => {
    for (const dailyMinutes of [5, 10, 15, 20] as const) {
      const result = plan({
        dailyMinutes,
        knownSkillIds: [SKILL.sit, SKILL.down],
      });
      for (const d of result.generated.days) {
        expect(d.day.totalMinutes).toBeLessThanOrEqual(dailyMinutes);
      }
    }
  });

  it("produces a single short exercise when time is very tight", () => {
    const result = plan({ dailyMinutes: 5 });
    expect(day(result)?.activities).toHaveLength(1);
    expect(day(result)?.day.totalMinutes).toBeLessThanOrEqual(5);
  });

  it("fills a longer session with more than one exercise", () => {
    const result = plan({
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

    expect(day(result)?.activities.length ?? 0).toBeGreaterThan(1);
  });

  it("never schedules more than the daily activity limit", () => {
    const result = plan({
      dailyMinutes: 20,
      knownSkillIds: [SKILL.name, SKILL.sit, SKILL.down],
      recentSessionSummaries: [
        {
          lessonId: LESSON.nameGame,
          completedAt: "2026-09-01T10:00:00.000Z",
          wasAbandoned: false,
        },
        {
          lessonId: LESSON.sit,
          completedAt: "2026-09-01T10:00:00.000Z",
          wasAbandoned: false,
        },
        {
          lessonId: LESSON.down,
          completedAt: "2026-09-01T10:00:00.000Z",
          wasAbandoned: false,
        },
        {
          lessonId: LESSON.stay,
          completedAt: "2026-09-01T10:00:00.000Z",
          wasAbandoned: false,
        },
      ],
    });

    expect(day(result)?.activities.length ?? 0).toBeLessThanOrEqual(
      PLANNING_LIMITS.maxActivitiesPerDay,
    );
  });

  it("records what it could not fit", () => {
    const result = plan({ dailyMinutes: 5, knownSkillIds: [SKILL.sit] });
    const skipped = result.diagnostics.exclusions.filter(
      (e) => e.reason === "no_time_remaining" || e.reason === "new_skill_limit",
    );
    expect(skipped.length).toBeGreaterThan(0);
  });
});

describe("session ordering", () => {
  it("puts unfinished work first and review last", () => {
    // Unfinished is most time-sensitive; ending on something the dog can already do ends the session on success.
    const result = plan({
      dailyMinutes: 20,
      knownSkillIds: [SKILL.name, SKILL.sit],
      recentSessionSummaries: [
        {
          lessonId: LESSON.down,
          completedAt: "2026-09-10T10:00:00.000Z",
          wasAbandoned: true,
        },
        {
          lessonId: LESSON.nameGame,
          completedAt: "2026-09-01T10:00:00.000Z",
          wasAbandoned: false,
        },
      ],
    });

    const order = reasons(result);
    expect(order[0]).toBe("continue_unfinished");
    expect(order[order.length - 1]).toBe("spaced_review");
  });

  it("numbers activities from zero without gaps", () => {
    const result = plan({
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
          completedAt: "2026-09-01T10:00:00.000Z",
          wasAbandoned: false,
        },
      ],
    });

    const orders = day(result)?.activities.map((a) => a.sortOrder) ?? [];
    expect(orders).toEqual(orders.map((_, i) => i));
  });
});

describe("adaptation across days", () => {
  it("does not repeat the same lesson within one plan", () => {
    const result = plan({ lengthDays: 6, dailyMinutes: 20 });
    const all = result.generated.days.flatMap((d) =>
      d.activities.map((a) => a.lessonId),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("unlocks dependent lessons on later days", () => {
    // Day one teaches sit; stay becomes reachable only because of it.
    const result = plan({ lengthDays: 4, dailyMinutes: 10 });
    const all = result.generated.days.flatMap((d) =>
      d.activities.map((a) => a.lessonId),
    );
    expect(all).toContain(LESSON.sit);
    expect(all.indexOf(LESSON.stay)).toBeGreaterThan(all.indexOf(LESSON.sit));
  });

  it("changes the next plan when history changes", () => {
    const before = plan();
    const after = plan({
      knownSkillIds: [SKILL.name],
      recentSessionSummaries: [
        {
          lessonId: LESSON.nameGame,
          completedAt: "2026-09-10T10:00:00.000Z",
          wasAbandoned: false,
        },
      ],
    });

    expect(lessonIds(before)).not.toEqual(lessonIds(after));
  });
});

describe("edge cases", () => {
  it("returns an empty plan when there are no lessons at all", () => {
    const result = plan({}, { skills: catalogue().skills, lessons: [] });
    expect(result.generated.days).toEqual([]);
    expect(result.diagnostics.emptyDays[0]).toMatchObject({
      reason: "no_eligible_lesson",
    });
  });

  it("returns an empty plan rather than inventing work when everything is completed", () => {
    const completedYesterday = catalogue().lessons.map((lesson) => ({
      lessonId: lesson.id,
      completedAt: "2026-09-10T10:00:00.000Z",
      wasAbandoned: false,
    }));

    const result = plan({
      knownSkillIds: Object.values(SKILL),
      recentSessionSummaries: completedYesterday,
    });

    expect(result.generated.days).toEqual([]);
  });

  it("omits a day it cannot fill rather than storing an empty one", () => {
    // plan_days.total_minutes must be >= 1, so a zero-activity day cannot exist as a row.
    const result = plan({}, { skills: catalogue().skills, lessons: [] });
    expect(result.generated.days.every((d) => d.day.totalMinutes >= 1)).toBe(
      true,
    );
  });

  it("plans nothing when no lesson fits an impossible budget", () => {
    const tiny: PlanningCatalogue = {
      skills: catalogue().skills,
      lessons: [makeLesson(LESSON.nameGame, "name_game", SKILL.name, 15, 1)],
    };

    const result = plan({ dailyMinutes: 5 }, tiny);
    expect(result.generated.days).toEqual([]);
    expect(result.diagnostics.exclusions).toContainEqual({
      dayIndex: 0,
      lessonId: LESSON.nameGame,
      reason: "no_time_remaining",
    });
  });

  it("copes with a dog whose optional metadata is missing", () => {
    const result = plan({
      knownSkillIds: [],
      secondaryGoalIds: [],
      recentSessionSummaries: [],
    });
    expect(day(result)?.activities.length).toBeGreaterThan(0);
  });

  it("never recommends unpublished content", () => {
    // The catalogue is the definition of available: an unpublished lesson is simply absent from it.
    const withoutSit: PlanningCatalogue = {
      skills: catalogue().skills,
      lessons: catalogue().lessons.filter((l) => l.id !== LESSON.sit),
    };

    const result = plan({ lengthDays: 6, dailyMinutes: 20 }, withoutSit);
    const all = result.generated.days.flatMap((d) =>
      d.activities.map((a) => a.lessonId),
    );
    expect(all).not.toContain(LESSON.sit);
  });

  it("plans over the healthy subset when part of the graph is cyclic", () => {
    const broken: PlanningCatalogue = {
      skills: [
        ...catalogue().skills,
        makeSkill(ID(90), "loop_a", [ID(91)]),
        makeSkill(ID(91), "loop_b", [ID(90)]),
      ],
      lessons: [
        ...catalogue().lessons,
        makeLesson(ID(80), "loop_lesson", ID(90), 3, 1),
      ],
    };

    const result = plan({ lengthDays: 2 }, broken);

    // Loud in diagnostics, but a broken branch does not deprive the user of the rest of the catalogue.
    expect(
      result.diagnostics.contentGraphProblems.some((p) => p.kind === "cycle"),
    ).toBe(true);
    const all = result.generated.days.flatMap((d) =>
      d.activities.map((a) => a.lessonId),
    );
    expect(all).not.toContain(ID(80));
    expect(all.length).toBeGreaterThan(0);
  });

  it("skips a lesson whose skill does not exist", () => {
    const orphaned: PlanningCatalogue = {
      skills: catalogue().skills,
      lessons: [
        ...catalogue().lessons,
        makeLesson(ID(81), "orphan", ID(999), 3, 1),
      ],
    };

    const result = plan({ lengthDays: 2 }, orphaned);
    const all = result.generated.days.flatMap((d) =>
      d.activities.map((a) => a.lessonId),
    );
    expect(all).not.toContain(ID(81));
  });
});
