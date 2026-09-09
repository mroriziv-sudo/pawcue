import type { AgeBucket, DailyMinutes, Uuid } from "../models/shared";
import type { TrainingPlan, PlanDay, PlanActivity } from "../models/plan";

export interface TrainingPlanGeneratorInput {
  dogId: Uuid;
  ageBucket: AgeBucket;
  primaryGoalId: Uuid;
  secondaryGoalIds: Uuid[];
  knownSkillIds: Uuid[];
  dailyMinutes: DailyMinutes;
  /** Recently completed/abandoned lesson history — lets the engine avoid repeating too soon or overloading (brief §9). */
  recentSessionSummaries: Array<{
    lessonId: Uuid;
    completedAt: string;
    wasAbandoned: boolean;
  }>;
  startDate: string;
  lengthDays: number;
}

export interface GeneratedPlan {
  plan: Omit<TrainingPlan, "id" | "createdAt" | "updatedAt">;
  days: Array<{
    day: Omit<PlanDay, "id" | "planId" | "createdAt" | "updatedAt">;
    activities: Array<
      Omit<PlanActivity, "id" | "planDayId" | "createdAt" | "updatedAt">
    >;
  }>;
}

/**
 * v1 is NOT LLM-backed (brief §9) — implementations must be deterministic and reproducible: the same input plus the
 * same `plan_engine_version` must always produce the same output. See `RulesBasedTrainingPlanGenerator` (Phase 5)
 * for the concrete rules (1–3 exercises/day, respect prerequisites, don't exceed dailyMinutes, limited new-skill
 * introduction, spaced review, no consecutive overload).
 */
export interface TrainingPlanGenerator {
  readonly engineVersion: string;
  generate(input: TrainingPlanGeneratorInput): GeneratedPlan;
}
