import { z } from "zod";
import { timestampedSchema, uuidSchema, dailyMinutesSchema } from "./shared";

/**
 * Every generated plan records the engine version that produced it (brief §9) so a plan can be reproduced or
 * diffed after the engine's rules change — this is a data row, not just a string constant, so we can also record
 * a human-readable changelog per version.
 */
export const planEngineVersionSchema = z
  .object({
    id: uuidSchema,
    /** semver-ish, e.g. "1.0.0" — bumped whenever RulesBasedTrainingPlanGenerator's behavior changes. */
    version: z.string(),
    releasedAt: z.iso.datetime({ offset: true }),
    changelogKey: z.string().nullable(),
  })
  .extend(timestampedSchema.shape);
export type PlanEngineVersion = z.infer<typeof planEngineVersionSchema>;

export const trainingPlanStatusSchema = z.enum([
  "active",
  "superseded",
  "abandoned",
]);

export const trainingPlanSchema = z
  .object({
    id: uuidSchema,
    dogId: uuidSchema,
    planEngineVersionId: uuidSchema,
    status: trainingPlanStatusSchema,
    dailyMinutes: dailyMinutesSchema,
    startDate: z.iso.date(),
    /** Brief example is a 14-day plan; kept flexible rather than hardcoded to 14. */
    lengthDays: z.number().int().min(1).max(30),
  })
  .extend(timestampedSchema.shape);
export type TrainingPlan = z.infer<typeof trainingPlanSchema>;

export const planDaySchema = z
  .object({
    id: uuidSchema,
    planId: uuidSchema,
    dayIndex: z.number().int().min(0),
    date: z.iso.date(),
    totalMinutes: z.number().int().min(1),
  })
  .extend(timestampedSchema.shape);
export type PlanDay = z.infer<typeof planDaySchema>;

/**
 * Why the engine chose a given activity, in machine-readable form.
 *
 * Additive to the frozen Phase 0 contract, and justified: `isReview` is a boolean and cannot distinguish "this
 * only just became eligible" from "this is brand new" from "you left this unfinished". When a recommendation
 * looks wrong, that distinction is the whole of the answer, so it has to be recorded rather than re-derived.
 *
 * `isReview` is kept and stays consistent with this: it is true exactly when the reason is `spaced_review`.
 *
 * Two reasons a reader might expect are deliberately absent, because the content model cannot support them:
 * there is no lesson→goal relation anywhere in the schema (`goal_id` exists only on `dog_goals`), so a
 * `goal_priority` reason would be fabricated; and fitting the time budget is a constraint every selection passes,
 * not a reason one was preferred.
 */
export const planSelectionReasonSchema = z.enum([
  /** Started recently and left unfinished — finishing it beats starting something unrelated. */
  "continue_unfinished",
  /** Newly eligible because a prerequisite skill was satisfied recently. */
  "prerequisite_unlocked",
  /** Already completed, far enough back to be worth practising again. */
  "spaced_review",
  /** Not trained before, and its prerequisites are already satisfied. */
  "new_skill",
]);
export type PlanSelectionReason = z.infer<typeof planSelectionReasonSchema>;

/** One lesson-slot within a plan day (brief §9: 1–3 exercises/day). */
export const planActivitySchema = z
  .object({
    id: uuidSchema,
    planDayId: uuidSchema,
    lessonId: uuidSchema,
    sortOrder: z.number().int().min(0),
    estimatedMinutes: z.number().int().min(1),
    /** Distinguishes a new-skill introduction from spaced review of an already-learning skill (brief §9). */
    isReview: z.boolean(),
    /** Machine-readable justification. See `planSelectionReasonSchema`. */
    selectionReason: planSelectionReasonSchema,
  })
  .extend(timestampedSchema.shape);
export type PlanActivity = z.infer<typeof planActivitySchema>;
