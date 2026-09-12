import type { Lesson } from "../models/lesson";
import type { Skill } from "../models/goals-skills";

/**
 * Validation of the lesson/skill prerequisite graph.
 *
 * The planner's most important guarantee is that it never recommends a lesson the dog is not ready for. That
 * guarantee is only as good as the graph it reads, and a structurally broken graph fails in ways that are hard to
 * see from a plan: a cycle silently makes a whole branch permanently ineligible, and a dangling prerequisite makes
 * a lesson unreachable forever. Both look like "the engine just never suggests that lesson".
 *
 * So the graph is validated explicitly and loudly, rather than discovered through a support ticket.
 *
 * ## Where prerequisites actually live
 *
 * `lessons.prerequisite_skill_ids` exists, but **every seeded lesson has an empty one**. The real structure is on
 * `skills.prerequisite_skill_ids` (stay and come require sit; place requires down). A lesson's *effective*
 * prerequisites are therefore the union of its own and those of the skill it teaches — reading only the lesson's
 * column would make prerequisite handling a no-op against the content that actually exists.
 */

export interface PlanningCatalogue {
  lessons: Lesson[];
  skills: Skill[];
}

export type ContentGraphProblem =
  | { kind: "unknown_skill"; lessonId: string; skillId: string }
  | { kind: "unknown_prerequisite"; skillId: string; prerequisiteId: string }
  | {
      kind: "unknown_lesson_prerequisite";
      lessonId: string;
      prerequisiteId: string;
    }
  | { kind: "self_dependency"; skillId: string }
  | { kind: "cycle"; skillIds: string[] };

export interface ContentGraphReport {
  valid: boolean;
  problems: ContentGraphProblem[];
}

/**
 * The prerequisites a dog must already have before a lesson is appropriate.
 *
 * Union of the lesson's own prerequisites and those of the skill it teaches. The taught skill itself is **not** a
 * prerequisite of its own lesson — that would make every lesson permanently ineligible.
 */
export function effectivePrerequisiteSkillIds(
  lesson: Lesson,
  skills: Skill[],
): string[] {
  const taught = skills.find((skill) => skill.id === lesson.skillId);
  const combined = new Set<string>(lesson.prerequisiteSkillIds);
  for (const id of taught?.prerequisiteSkillIds ?? []) combined.add(id);
  combined.delete(lesson.skillId);
  // Sorted so downstream ordering and diagnostics are stable run to run.
  return [...combined].sort();
}

/**
 * Checks the graph for the structural faults that would silently distort planning.
 *
 * Returns a report rather than throwing, so a caller can decide: tests and development fail loudly, while a
 * production generator degrades to planning over the valid subset rather than showing the user nothing.
 */
export function validateContentGraph(
  catalogue: PlanningCatalogue,
): ContentGraphReport {
  const problems: ContentGraphProblem[] = [];
  const skillIds = new Set(catalogue.skills.map((skill) => skill.id));

  for (const skill of catalogue.skills) {
    for (const prerequisiteId of skill.prerequisiteSkillIds) {
      if (prerequisiteId === skill.id) {
        problems.push({ kind: "self_dependency", skillId: skill.id });
        continue;
      }
      if (!skillIds.has(prerequisiteId)) {
        problems.push({
          kind: "unknown_prerequisite",
          skillId: skill.id,
          prerequisiteId,
        });
      }
    }
  }

  for (const lesson of catalogue.lessons) {
    if (!skillIds.has(lesson.skillId)) {
      problems.push({
        kind: "unknown_skill",
        lessonId: lesson.id,
        skillId: lesson.skillId,
      });
    }
    for (const prerequisiteId of lesson.prerequisiteSkillIds) {
      if (!skillIds.has(prerequisiteId)) {
        problems.push({
          kind: "unknown_lesson_prerequisite",
          lessonId: lesson.id,
          prerequisiteId,
        });
      }
    }
  }

  for (const cycle of findCycles(catalogue.skills)) {
    problems.push({ kind: "cycle", skillIds: cycle });
  }

  return { valid: problems.length === 0, problems };
}

/**
 * Depth-first cycle detection over the skill graph.
 *
 * Skills are iterated in id order and each reported cycle is rotated to start at its smallest id, so the same
 * broken graph always reports the same cycle — a diagnostic that changed between runs would be worth very little.
 */
function findCycles(skills: Skill[]): string[][] {
  const bySkill = new Map(skills.map((skill) => [skill.id, skill]));
  const state = new Map<string, "visiting" | "done">();
  const cycles: string[][] = [];
  const seen = new Set<string>();

  const walk = (id: string, path: string[]): void => {
    const current = state.get(id);
    if (current === "done") return;

    if (current === "visiting") {
      const start = path.indexOf(id);
      if (start >= 0) {
        const cycle = path.slice(start);
        const smallest = cycle.indexOf([...cycle].sort()[0] ?? cycle[0]!);
        const rotated = [...cycle.slice(smallest), ...cycle.slice(0, smallest)];
        const key = rotated.join(">");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(rotated);
        }
      }
      return;
    }

    state.set(id, "visiting");
    for (const next of [
      ...(bySkill.get(id)?.prerequisiteSkillIds ?? []),
    ].sort()) {
      if (next === id) continue; // reported separately as a self-dependency
      if (bySkill.has(next)) walk(next, [...path, id]);
    }
    state.set(id, "done");
  };

  for (const skill of [...skills].sort((a, b) => a.id.localeCompare(b.id))) {
    walk(skill.id, []);
  }

  return cycles;
}

/**
 * Every skill a dog effectively has, including those implied by the ones it knows.
 *
 * Knowing `place` implies `down`: a dog cannot have learned the former without the latter, and a history that
 * records only the most advanced skill should not make its foundations look missing.
 */
export function closeOverPrerequisites(
  knownSkillIds: string[],
  skills: Skill[],
): Set<string> {
  const bySkill = new Map(skills.map((skill) => [skill.id, skill]));
  const closed = new Set<string>();

  const visit = (id: string): void => {
    if (closed.has(id)) return;
    closed.add(id);
    for (const prerequisiteId of bySkill.get(id)?.prerequisiteSkillIds ?? []) {
      // Guarded by `closed`, so a cyclic graph terminates here instead of recursing forever.
      visit(prerequisiteId);
    }
  };

  for (const id of knownSkillIds) visit(id);
  return closed;
}
