import { describe, it, expect } from "vitest";
import {
  closeOverPrerequisites,
  effectivePrerequisiteSkillIds,
  validateContentGraph,
  type PlanningCatalogue,
} from "./content-graph";
import type { Skill } from "../models/goals-skills";
import type { Lesson } from "../models/lesson";

/**
 * The prerequisite graph is what the planner's safety guarantee rests on. A cycle makes a whole branch
 * permanently ineligible and a dangling reference makes a lesson unreachable — both of which look, from the
 * outside, exactly like "the engine just never suggests that lesson".
 */

const TS = "2026-09-11T10:00:00.000Z";
const base = { createdAt: TS, updatedAt: TS };
const ID = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

function skill(n: number, prerequisites: number[] = [], difficulty = 1): Skill {
  return {
    id: ID(n),
    slug: "sit",
    titleKey: `skill.${n}.title`,
    prerequisiteSkillIds: prerequisites.map(ID),
    difficulty,
    ...base,
  };
}

function lesson(
  n: number,
  skillId: number,
  ownPrerequisites: number[] = [],
): Lesson {
  return {
    id: ID(n),
    slug: `lesson-${n}`,
    skillId: ID(skillId),
    titleKey: `lesson.${n}.title`,
    goalKey: `lesson.${n}.goal`,
    estimatedMinutes: 3,
    equipment: [],
    difficulty: 1,
    prerequisiteSkillIds: ownPrerequisites.map(ID),
    isAlwaysFree: true,
    contentVersionId: ID(900),
    ...base,
  };
}

describe("effective prerequisites", () => {
  it("takes them from the skill the lesson teaches, not only the lesson row", () => {
    // Every seeded lesson has an empty prerequisite column; the real structure lives on the skill. Reading only
    // the lesson would make prerequisite handling a no-op against the content that actually exists.
    const catalogue: PlanningCatalogue = {
      skills: [skill(1), skill(2, [1])],
      lessons: [lesson(10, 2)],
    };

    expect(
      effectivePrerequisiteSkillIds(catalogue.lessons[0]!, catalogue.skills),
    ).toEqual([ID(1)]);
  });

  it("merges the lesson's own prerequisites with the skill's", () => {
    const skills = [skill(1), skill(2), skill(3, [1])];
    expect(effectivePrerequisiteSkillIds(lesson(10, 3, [2]), skills)).toEqual([
      ID(1),
      ID(2),
    ]);
  });

  it("never makes a lesson require the skill it teaches", () => {
    // Otherwise every lesson is permanently ineligible — you can never learn the thing you must already know.
    const skills = [skill(1, [1])];
    expect(effectivePrerequisiteSkillIds(lesson(10, 1), skills)).toEqual([]);
  });

  it("is stable in ordering", () => {
    const skills = [skill(1), skill(2), skill(3, [2, 1])];
    expect(effectivePrerequisiteSkillIds(lesson(10, 3), skills)).toEqual([
      ID(1),
      ID(2),
    ]);
  });
});

describe("graph validation", () => {
  it("accepts a well-formed graph", () => {
    const report = validateContentGraph({
      skills: [skill(1), skill(2, [1])],
      lessons: [lesson(10, 1), lesson(11, 2)],
    });
    expect(report).toEqual({ valid: true, problems: [] });
  });

  it("reports a skill that requires itself", () => {
    const report = validateContentGraph({
      skills: [skill(1, [1])],
      lessons: [],
    });
    expect(report.valid).toBe(false);
    expect(report.problems).toContainEqual({
      kind: "self_dependency",
      skillId: ID(1),
    });
  });

  it("reports a prerequisite that does not exist", () => {
    const report = validateContentGraph({
      skills: [skill(1, [99])],
      lessons: [],
    });
    expect(report.problems).toContainEqual({
      kind: "unknown_prerequisite",
      skillId: ID(1),
      prerequisiteId: ID(99),
    });
  });

  it("reports a lesson teaching a skill that does not exist", () => {
    const report = validateContentGraph({
      skills: [skill(1)],
      lessons: [lesson(10, 77)],
    });
    expect(report.problems).toContainEqual({
      kind: "unknown_skill",
      lessonId: ID(10),
      skillId: ID(77),
    });
  });

  it("reports a lesson prerequisite that does not exist", () => {
    const report = validateContentGraph({
      skills: [skill(1)],
      lessons: [lesson(10, 1, [88])],
    });
    expect(report.problems).toContainEqual({
      kind: "unknown_lesson_prerequisite",
      lessonId: ID(10),
      prerequisiteId: ID(88),
    });
  });

  it("detects a two-skill cycle", () => {
    const report = validateContentGraph({
      skills: [skill(1, [2]), skill(2, [1])],
      lessons: [],
    });
    expect(report.valid).toBe(false);
    const cycle = report.problems.find((p) => p.kind === "cycle");
    expect(cycle).toBeDefined();
    expect(cycle?.kind === "cycle" && cycle.skillIds.sort()).toEqual([
      ID(1),
      ID(2),
    ]);
  });

  it("detects a longer cycle", () => {
    const report = validateContentGraph({
      skills: [skill(1, [2]), skill(2, [3]), skill(3, [1])],
      lessons: [],
    });
    expect(report.problems.some((p) => p.kind === "cycle")).toBe(true);
  });

  it("reports the same cycle identically across runs", () => {
    // A diagnostic that changes between runs is worth very little when chasing a content bug.
    const build = () => ({
      skills: [skill(3, [1]), skill(1, [2]), skill(2, [3])],
      lessons: [],
    });
    expect(validateContentGraph(build())).toEqual(
      validateContentGraph(build()),
    );
  });

  it("does not mistake a diamond for a cycle", () => {
    // Two paths to the same ancestor is normal content shape, not a fault.
    const report = validateContentGraph({
      skills: [skill(1), skill(2, [1]), skill(3, [1]), skill(4, [2, 3])],
      lessons: [],
    });
    expect(report.valid).toBe(true);
  });
});

describe("closing over prerequisites", () => {
  it("implies the foundations of a known skill", () => {
    // Knowing `place` means `down` was learned; a history that records only the most advanced skill must not make
    // its foundations look missing.
    const skills = [skill(1), skill(2, [1]), skill(3, [2])];
    expect([...closeOverPrerequisites([ID(3)], skills)].sort()).toEqual([
      ID(1),
      ID(2),
      ID(3),
    ]);
  });

  it("returns nothing for a dog that knows nothing", () => {
    expect(closeOverPrerequisites([], [skill(1)]).size).toBe(0);
  });

  it("terminates on a cyclic graph instead of recursing forever", () => {
    const skills = [skill(1, [2]), skill(2, [1])];
    expect([...closeOverPrerequisites([ID(1)], skills)].sort()).toEqual([
      ID(1),
      ID(2),
    ]);
  });

  it("ignores a known skill that is not in the catalogue", () => {
    expect([...closeOverPrerequisites([ID(42)], [skill(1)])]).toEqual([ID(42)]);
  });
});
