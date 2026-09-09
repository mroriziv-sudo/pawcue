import { z } from "zod";

/**
 * Centralized feature flags (coding rule §46). All default to their v1-safe value; nothing here should ever be
 * flipped by a bare env-var typo, so the schema validates the parsed config, not just the raw env access.
 */
export const featureFlagsSchema = z.object({
  /** brief §10: AI-generated training advice is never on by default. */
  aiTrainingCoachEnabled: z.boolean().default(false),
  /** brief §16 future readiness — off until an AI plan-adjustment provider actually exists. */
  aiPlanAdjustmentEnabled: z.boolean().default(false),
});
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = featureFlagsSchema.parse({});
