import { z } from "zod";
import { timestampedSchema, uuidSchema, safetyCategorySchema } from "./shared";

export const equipmentSchema = z.enum([
  "treats",
  "clicker",
  "leash",
  "crate",
  "mat_or_bed",
  "none",
]);

/**
 * A lesson is structured content (brief §6, §41) — never prose baked into a screen component. `estimatedMinutes`
 * drives the plan engine's time-budget rule (brief §9); `skillId` is what completing this lesson progresses.
 */
export const lessonSchema = z
  .object({
    id: uuidSchema,
    slug: z.string(),
    skillId: uuidSchema,
    titleKey: z.string(),
    goalKey: z.string(),
    estimatedMinutes: z.number().int().min(1).max(15),
    equipment: z.array(equipmentSchema),
    difficulty: z.number().int().min(1).max(5),
    prerequisiteSkillIds: z.array(uuidSchema),
    /** Free tier includes this lesson without a plan/paywall (brief §9 free-tier list: Name Game + foundationals). */
    isAlwaysFree: z.boolean(),
    contentVersionId: uuidSchema,
  })
  .extend(timestampedSchema.shape);
export type Lesson = z.infer<typeof lessonSchema>;

/** Ordered step within a lesson (brief §6 structure items 4–7: demonstration, step-by-step, clicker, reps). */
export const lessonStepSchema = z
  .object({
    id: uuidSchema,
    lessonId: uuidSchema,
    stepOrder: z.number().int().min(0),
    instructionKey: z.string(),
    /** When set, this step expects a clicker press to advance (brief §6 item 6 "integrated clicker"). */
    requiresClickerPress: z.boolean(),
    /** When set, the UI shows a rep counter for this step (brief §6 item 7). */
    repetitionTarget: z.number().int().min(1).nullable(),
    illustrationAssetKey: z.string().nullable(),
  })
  .extend(timestampedSchema.shape);
export type LessonStep = z.infer<typeof lessonStepSchema>;

/**
 * "Not working?" structured data (brief §7 — the core differentiator, must be data not hardcoded text).
 * `safetyCategory` is required on every row, not optional, so an escalation case can never ship without one
 * (brief §10, §34).
 *
 * The brief's six options (walks away / jumps for treat / distracted / doesn't understand / gets frustrated /
 * already knows this) are the common, reusable slugs — not an exhaustive list. Some lessons need a scenario-specific
 * slug (e.g. Biting Foundation's `biting_causes_injury` safety escalation, see supabase/seed.sql), so `slug` is a
 * content-authored string, not a closed enum. `COMMON_TROUBLESHOOTING_SLUGS` documents the reusable set so content
 * authors reach for it before inventing a new one.
 */
export const COMMON_TROUBLESHOOTING_SLUGS = [
  "dog_walks_away",
  "dog_jumps_for_treat",
  "dog_distracted",
  "dog_doesnt_understand",
  "dog_gets_frustrated",
  "dog_already_knows_this",
] as const;
export type CommonTroubleshootingSlug =
  (typeof COMMON_TROUBLESHOOTING_SLUGS)[number];

export const troubleshootingSlugSchema = z.string().min(1);
export type TroubleshootingSlug = z.infer<typeof troubleshootingSlugSchema>;

export const lessonTroubleshootingSchema = z
  .object({
    id: uuidSchema,
    lessonId: uuidSchema,
    slug: troubleshootingSlugSchema,
    promptKey: z.string(),
    /** Short, actionable guidance key (brief §7: "avoid long essays"). */
    guidanceKey: z.string(),
    safetyCategory: safetyCategorySchema,
    sortOrder: z.number().int(),
  })
  .extend(timestampedSchema.shape);
export type LessonTroubleshootingOption = z.infer<
  typeof lessonTroubleshootingSchema
>;
