import { z } from "zod";
import { safetyCategorySchema } from "../models/shared";

/**
 * Future-AI-readiness interface (brief §10). NOT enabled by default — the shipped v1 binding is
 * `NullTrainingCoachProvider`, which always returns `NOT_AVAILABLE`. Every real implementation's output must
 * validate against these Zod schemas before the app trusts it; a response that fails validation is treated as
 * `NOT_AVAILABLE`, never partially rendered.
 */

export const planAdjustmentSchema = z.object({
  safetyCategory: safetyCategorySchema,
  summaryKey: z.string().nullable(),
  /** Free-form text is only ever allowed here, behind an explicit safety category, never as raw unstructured output. */
  summaryText: z.string().max(400).nullable(),
  suggestedActivityChanges: z.array(
    z.object({
      lessonSlug: z.string(),
      action: z.enum(["add", "remove", "reduce_difficulty"]),
    }),
  ),
});
export type PlanAdjustment = z.infer<typeof planAdjustmentSchema>;

export const troubleshootingExplanationSchema = z.object({
  safetyCategory: safetyCategorySchema,
  explanationText: z.string().max(600),
});
export type TroubleshootingExplanation = z.infer<
  typeof troubleshootingExplanationSchema
>;

export const progressSummarySchema = z.object({
  safetyCategory: safetyCategorySchema,
  summaryText: z.string().max(400),
});
export type ProgressSummary = z.infer<typeof progressSummarySchema>;

export type CoachResult<T> =
  | { available: true; result: T }
  | { available: false; reason: "NOT_AVAILABLE" };

/**
 * Never invents veterinary diagnoses, medication advice, physical corrections, punishment techniques, or
 * guaranteed-outcome claims (brief §10) — this is a contract the *implementation* must uphold; the interface itself
 * only guarantees the output shape and the mandatory safety category.
 */
export interface TrainingCoachProvider {
  generatePlanAdjustment(input: {
    dogId: string;
    recentSessionIds: string[];
  }): Promise<CoachResult<PlanAdjustment>>;
  generateTroubleshootingExplanation(input: {
    lessonId: string;
    troubleshootingOptionId: string;
  }): Promise<CoachResult<TroubleshootingExplanation>>;
  summarizeProgress(input: {
    dogId: string;
  }): Promise<CoachResult<ProgressSummary>>;
}
