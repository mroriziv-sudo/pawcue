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
  })
  .extend(timestampedSchema.shape);
export type PlanActivity = z.infer<typeof planActivitySchema>;
