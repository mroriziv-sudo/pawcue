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
  /**
   * Whether the account screen offers "Continue with Google". Off until Google OAuth client ids exist and the
   * provider is implemented: a visible button that can only say "not available" is a non-functional control, and
   * App Review rejects those (Guideline 2.1). Sign in with Apple stays required by 4.8 the moment this is on.
   */
  googleSignInEnabled: z.boolean().default(false),
});
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = featureFlagsSchema.parse({});
