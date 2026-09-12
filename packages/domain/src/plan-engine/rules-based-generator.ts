import type { Lesson } from "../models/lesson";
import type { PlanSelectionReason } from "../models/plan";
import {
  closeOverPrerequisites,
  effectivePrerequisiteSkillIds,
  validateContentGraph,
  type ContentGraphProblem,
  type PlanningCatalogue,
} from "./content-graph";
import type {
  GeneratedPlan,
  TrainingPlanGenerator,
  TrainingPlanGeneratorInput,
} from "./training-plan-generator";

/**
 * The rules-based training plan generator.
 *
 * Deterministic by construction: no randomness, no clock reads, no network. The same dog state, history,
 * catalogue and engine version always produce the same plan — which is what makes a recommendation arguable
 * rather than mysterious, and what lets an old plan be reproduced after the rules change.
 *
 * AI stays possible behind `TrainingPlanGenerator`, but it is not this.
 */

/**
 * Engine version.
 *
 * Bumped whenever the *output for a given input could change* — new rule, changed constant, changed ordering.
 * Not bumped for refactors that cannot move a plan. Every generated plan records the version that produced it, so
 * an old plan is always read against the rules that actually made it; history is never re-attributed to a newer
 * engine.
 */
export const PLAN_ENGINE_VERSION = "1.0.0";

/** Product limits. All from brief §9; named so a plan can be argued with rather than reverse-engineered. */
export const PLANNING_LIMITS = {
  /** Brief §9: 1–3 exercises a day. More than three is a chore, not a session. */
  maxActivitiesPerDay: 3,
  /**
   * At most one brand-new skill introduced per day.
   *
   * Stacking new skills is how a dog ends up half-learning several things. Continuation and review are not
   * capped this way — they are consolidation, not new load.
   */
  maxNewSkillsPerDay: 1,
  /** A lesson finished within this many days is not offered again; it is too soon to be useful practice. */
  minDaysBeforeRepeat: 2,
  /** Past this, a completed lesson becomes worth practising again. */
  reviewDueAfterDays: 3,
  /** An abandoned lesson older than this is treated as forgotten rather than "in progress". */
  unfinishedStaleAfterDays: 14,
} as const;

export interface PlanSelectionDiagnostic {
  lessonId: string;
  lessonSlug: string;
  reason: PlanSelectionReason;
  estimatedMinutes: number;
  dayIndex: number;
  sortOrder: number;
  /** Prerequisite skills this lesson required, if any — the relationship that made it eligible. */
  satisfiedPrerequisiteSkillIds: string[];
}

export type ExclusionReason =
  | "prerequisites_unmet"
  | "completed_too_recently"
  | "no_time_remaining"
  | "daily_activity_limit"
  | "new_skill_limit";

export interface PlanDiagnostics {
  engineVersion: string;
  /** Structural faults found in the catalogue. Planning continues over the valid subset. */
  contentGraphProblems: ContentGraphProblem[];
  selections: PlanSelectionDiagnostic[];
  /** Why each lesson was not chosen, per day. The other half of explainability. */
  exclusions: Array<{
    dayIndex: number;
    lessonId: string;
    reason: ExclusionReason;
  }>;
  /** Days that produced nothing, and why — an empty day is a real outcome, not a silent gap. */
  emptyDays: Array<{ dayIndex: number; reason: "no_eligible_lesson" }>;
}

export interface GeneratedPlanWithDiagnostics {
  generated: GeneratedPlan;
  diagnostics: PlanDiagnostics;
}

interface Candidate {
  lesson: Lesson;
  reason: PlanSelectionReason;
  prerequisites: string[];
  /** Lower sorts first. Composed only of integers so ordering is exact, never float-fuzzy. */
  priority: number;
}

/** Whole days between two ISO dates. Date-only maths: plans are daily, and time of day is noise here. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.NaN;
  return Math.round((to - from) / 86_400_000);
}

function addDays(isoDate: string, days: number): string {
  const base = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

export class RulesBasedTrainingPlanGenerator implements TrainingPlanGenerator {
  readonly engineVersion = PLAN_ENGINE_VERSION;

  /**
   * The catalogue is supplied at construction rather than per call.
   *
   * It is also the definition of *available* content: a lesson that has been unpublished simply is not here, so
   * it can never be newly recommended. An older plan may still reference it by id, which is why plans store
   * references rather than copies.
   */
  constructor(private readonly catalogue: PlanningCatalogue) {}

  generate(input: TrainingPlanGeneratorInput): GeneratedPlan {
    return this.generateWithDiagnostics(input).generated;
  }

  /**
   * The real entry point. `generate` returns only the plan so the frozen `TrainingPlanGenerator` interface is
   * untouched, while callers that need to explain a recommendation can ask for the reasoning too.
   */
  generateWithDiagnostics(
    input: TrainingPlanGeneratorInput,
  ): GeneratedPlanWithDiagnostics {
    const report = validateContentGraph(this.catalogue);

    const diagnostics: PlanDiagnostics = {
      engineVersion: this.engineVersion,
      contentGraphProblems: report.problems,
      selections: [],
      exclusions: [],
      emptyDays: [],
    };

    /**
     * Plan over the valid subset rather than refusing outright.
     *
     * A cycle or a dangling reference is a content bug, and it should be loud — `validateContentGraph` makes it
     * so in tests. But at runtime, showing a user nothing because one unrelated branch is malformed is the worse
     * failure. Skills caught in a cycle are dropped, and the lessons that teach them go with them.
     */
    const cyclic = new Set(
      report.problems.flatMap((p) => (p.kind === "cycle" ? p.skillIds : [])),
    );
    const skillIds = new Set(this.catalogue.skills.map((s) => s.id));
    const usableLessons = this.catalogue.lessons.filter(
      (lesson) => skillIds.has(lesson.skillId) && !cyclic.has(lesson.skillId),
    );

    const history = this.readHistory(input);

    // Skills the dog has, closed over prerequisites. Projected forward as the plan proceeds: each planned day is
    // assumed completed, which is what lets a later day depend on an earlier one. Real history overrides this on
    // the next regeneration, which is where adaptation actually comes from.
    const known = closeOverPrerequisites(
      input.knownSkillIds,
      this.catalogue.skills,
    );
    const plannedLessonIds = new Set<string>();

    const days: GeneratedPlan["days"] = [];

    for (let dayIndex = 0; dayIndex < input.lengthDays; dayIndex += 1) {
      const date = addDays(input.startDate, dayIndex);
      const chosen = this.planOneDay({
        dayIndex,
        date,
        input,
        usableLessons,
        known,
        history,
        plannedLessonIds,
        diagnostics,
      });

      if (chosen.length === 0) {
        // `plan_days.total_minutes` must be >= 1, so a day with nothing to do cannot be stored — and inventing an
        // activity to fill it would be worse than a shorter plan. The gap is recorded instead.
        diagnostics.emptyDays.push({ dayIndex, reason: "no_eligible_lesson" });
        continue;
      }

      days.push({
        day: {
          dayIndex,
          date,
          totalMinutes: chosen.reduce(
            (sum, c) => sum + c.lesson.estimatedMinutes,
            0,
          ),
        },
        activities: chosen.map((candidate, sortOrder) => ({
          lessonId: candidate.lesson.id,
          sortOrder,
          estimatedMinutes: candidate.lesson.estimatedMinutes,
          isReview: candidate.reason === "spaced_review",
          selectionReason: candidate.reason,
        })),
      });

      for (const candidate of chosen) {
        plannedLessonIds.add(candidate.lesson.id);
        // Forward projection: the skill this lesson teaches counts as known for later days.
        known.add(candidate.lesson.skillId);
        diagnostics.selections.push({
          lessonId: candidate.lesson.id,
          lessonSlug: candidate.lesson.slug,
          reason: candidate.reason,
          estimatedMinutes: candidate.lesson.estimatedMinutes,
          dayIndex,
          sortOrder: chosen.indexOf(candidate),
          satisfiedPrerequisiteSkillIds: candidate.prerequisites,
        });
      }
    }

    return {
      generated: {
        plan: {
          dogId: input.dogId,
          // Resolved to a row id by the persistence layer; the engine knows its version, not the table.
          planEngineVersionId: PLAN_ENGINE_VERSION,
          status: "active",
          dailyMinutes: input.dailyMinutes,
          startDate: input.startDate,
          lengthDays: input.lengthDays,
        },
        days,
      },
      diagnostics,
    };
  }

  /**
   * Reduces the session history into the few facts the rules need.
   *
   * Malformed entries are dropped rather than allowed to poison the reduction: an unparseable date compared with
   * `<` silently answers false, which would quietly turn "completed yesterday" into "never completed".
   */
  private readHistory(input: TrainingPlanGeneratorInput) {
    const lastCompleted = new Map<string, string>();
    const lastAbandoned = new Map<string, string>();

    for (const entry of input.recentSessionSummaries) {
      if (!entry?.lessonId || typeof entry.completedAt !== "string") continue;
      if (Number.isNaN(Date.parse(entry.completedAt))) continue;

      const target = entry.wasAbandoned ? lastAbandoned : lastCompleted;
      const existing = target.get(entry.lessonId);
      // Duplicated history is normal (offline replay); keeping the latest makes it idempotent.
      if (!existing || entry.completedAt > existing) {
        target.set(entry.lessonId, entry.completedAt);
      }
    }

    return { lastCompleted, lastAbandoned };
  }

  private planOneDay(context: {
    dayIndex: number;
    date: string;
    input: TrainingPlanGeneratorInput;
    usableLessons: Lesson[];
    known: Set<string>;
    history: {
      lastCompleted: Map<string, string>;
      lastAbandoned: Map<string, string>;
    };
    plannedLessonIds: Set<string>;
    diagnostics: PlanDiagnostics;
  }): Candidate[] {
    const {
      dayIndex,
      date,
      input,
      usableLessons,
      known,
      history,
      plannedLessonIds,
      diagnostics,
    } = context;

    const candidates: Candidate[] = [];

    for (const lesson of usableLessons) {
      // A lesson already placed earlier in this plan is not offered twice.
      if (plannedLessonIds.has(lesson.id)) continue;

      const prerequisites = effectivePrerequisiteSkillIds(
        lesson,
        this.catalogue.skills,
      );
      const unmet = prerequisites.filter((id) => !known.has(id));
      if (unmet.length > 0) {
        diagnostics.exclusions.push({
          dayIndex,
          lessonId: lesson.id,
          reason: "prerequisites_unmet",
        });
        continue;
      }

      const completedAt = history.lastCompleted.get(lesson.id);
      const abandonedAt = history.lastAbandoned.get(lesson.id);

      const classified = this.classify({
        lesson,
        date,
        completedAt,
        abandonedAt,
        prerequisites,
        known,
        dayIndex,
      });

      if (!classified) {
        diagnostics.exclusions.push({
          dayIndex,
          lessonId: lesson.id,
          reason: "completed_too_recently",
        });
        continue;
      }

      candidates.push(classified);
    }

    /**
     * Deterministic ordering.
     *
     * Priority first, then the stable content properties, then id. The id tie-break is what guarantees the same
     * plan every run: without it two equally-ranked lessons would come out in catalogue order, which is a
     * database ordering and not something to depend on.
     */
    candidates.sort(
      (a, b) =>
        a.priority - b.priority ||
        a.lesson.difficulty - b.lesson.difficulty ||
        a.lesson.estimatedMinutes - b.lesson.estimatedMinutes ||
        a.lesson.slug.localeCompare(b.lesson.slug) ||
        a.lesson.id.localeCompare(b.lesson.id),
    );

    return this.fitToDay(candidates, input, dayIndex, diagnostics);
  }

  /**
   * Decides what kind of work a lesson would be today, or that it is not appropriate today at all.
   *
   * Priorities are integers with deliberate gaps, so a later rule can be inserted between two without renumbering
   * every branch.
   */
  private classify(args: {
    lesson: Lesson;
    date: string;
    completedAt: string | undefined;
    abandonedAt: string | undefined;
    prerequisites: string[];
    known: Set<string>;
    dayIndex: number;
  }): Candidate | null {
    const { lesson, date, completedAt, abandonedAt, prerequisites } = args;

    const daysSinceCompleted = completedAt
      ? daysBetween(completedAt, date)
      : null;
    const daysSinceAbandoned = abandonedAt
      ? daysBetween(abandonedAt, date)
      : null;

    // --- Unfinished work outranks everything. Someone who stopped halfway through a lesson has invested in it,
    //     and finishing beats starting something unrelated. Stale attempts are not treated as in progress.
    const unfinished =
      daysSinceAbandoned !== null &&
      daysSinceAbandoned >= 0 &&
      daysSinceAbandoned <= PLANNING_LIMITS.unfinishedStaleAfterDays &&
      (daysSinceCompleted === null || abandonedAt! > completedAt!);

    if (unfinished) {
      return {
        lesson,
        reason: "continue_unfinished",
        prerequisites,
        priority: 100,
      };
    }

    if (daysSinceCompleted !== null) {
      if (daysSinceCompleted < PLANNING_LIMITS.minDaysBeforeRepeat) {
        // Too soon to be practice; offering it again would read as the engine having nothing to say.
        return null;
      }
      if (daysSinceCompleted >= PLANNING_LIMITS.reviewDueAfterDays) {
        // Older reviews first: the longest-neglected skill is the one most worth revisiting.
        return {
          lesson,
          reason: "spaced_review",
          prerequisites,
          priority: 300 - Math.min(daysSinceCompleted, 99),
        };
      }
      // Between the two thresholds: not stale enough to practise, not fresh enough to repeat.
      return null;
    }

    // --- Never trained. A lesson with prerequisites that are now satisfied is a specific, more interesting
    //     recommendation than generic new material, so it is distinguished and ranked above it.
    const reason: PlanSelectionReason =
      prerequisites.length > 0 ? "prerequisite_unlocked" : "new_skill";

    return {
      lesson,
      reason,
      prerequisites,
      priority: reason === "prerequisite_unlocked" ? 200 : 400,
    };
  }

  /**
   * Fills the day within its limits.
   *
   * Greedy over the ordered candidates, which is correct here because the ordering already encodes the product's
   * priorities — a knapsack solution that fit more minutes by dropping the most important lesson would be a worse
   * plan, not a better one. Anything that cannot fit is recorded rather than dropped silently.
   */
  private fitToDay(
    candidates: Candidate[],
    input: TrainingPlanGeneratorInput,
    dayIndex: number,
    diagnostics: PlanDiagnostics,
  ): Candidate[] {
    const chosen: Candidate[] = [];
    let minutes = 0;
    let newSkills = 0;

    for (const candidate of candidates) {
      if (chosen.length >= PLANNING_LIMITS.maxActivitiesPerDay) {
        diagnostics.exclusions.push({
          dayIndex,
          lessonId: candidate.lesson.id,
          reason: "daily_activity_limit",
        });
        continue;
      }

      const isNew =
        candidate.reason === "new_skill" ||
        candidate.reason === "prerequisite_unlocked";
      if (isNew && newSkills >= PLANNING_LIMITS.maxNewSkillsPerDay) {
        diagnostics.exclusions.push({
          dayIndex,
          lessonId: candidate.lesson.id,
          reason: "new_skill_limit",
        });
        continue;
      }

      if (minutes + candidate.lesson.estimatedMinutes > input.dailyMinutes) {
        // Never exceeded. A plan that overruns the time someone said they had is not a plan they will follow.
        diagnostics.exclusions.push({
          dayIndex,
          lessonId: candidate.lesson.id,
          reason: "no_time_remaining",
        });
        continue;
      }

      chosen.push(candidate);
      minutes += candidate.lesson.estimatedMinutes;
      if (isNew) newSkills += 1;
    }

    /**
     * Session order, which is not the same as selection order.
     *
     * Unfinished work first, while attention is freshest and because it is the most time-sensitive. New learning
     * next, still early. Review last, so the session ends on something the dog can already do — ending on
     * success is a positive-reinforcement principle, not a scheduling detail.
     */
    const sessionRank: Record<PlanSelectionReason, number> = {
      continue_unfinished: 0,
      prerequisite_unlocked: 1,
      new_skill: 1,
      spaced_review: 2,
    };

    return [...chosen].sort(
      (a, b) =>
        sessionRank[a.reason] - sessionRank[b.reason] ||
        chosen.indexOf(a) - chosen.indexOf(b),
    );
  }
}
