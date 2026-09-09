import { z } from "zod";
import { timestampedSchema, uuidSchema } from "./shared";

/** Catalog row — matches brief §4 Screen 3 options. Public-readable content, seeded via migration (brief §41). */
export const trainingGoalSlugSchema = z.enum([
  "biting_nipping",
  "potty_training",
  "leash_pulling",
  "recall",
  "jumping",
  "basic_commands",
  "crate_training",
  "calm_behavior",
  "other",
]);
export type TrainingGoalSlug = z.infer<typeof trainingGoalSlugSchema>;

export const trainingGoalSchema = z
  .object({
    id: uuidSchema,
    slug: trainingGoalSlugSchema,
    /** i18n key into packages/i18n, never a literal display string stored in the DB. */
    titleKey: z.string(),
    descriptionKey: z.string(),
    sortOrder: z.number().int(),
  })
  .extend(timestampedSchema.shape);
export type TrainingGoal = z.infer<typeof trainingGoalSchema>;

export const dogGoalPrioritySchema = z.enum(["primary", "secondary"]);

/** A dog may have exactly one primary goal and up to two secondary goals (brief §4 Screen 3). */
export const dogGoalSchema = z
  .object({
    id: uuidSchema,
    dogId: uuidSchema,
    goalId: uuidSchema,
    priority: dogGoalPrioritySchema,
  })
  .extend(timestampedSchema.shape);
export type DogGoal = z.infer<typeof dogGoalSchema>;

/** Catalog row — matches brief §5 Screen 5 multi-select. `prerequisiteSkillIds` feeds the plan engine (brief §9). */
export const skillSlugSchema = z.enum([
  "name_response",
  "sit",
  "down",
  "stay",
  "come",
  "leave_it",
  "place",
  "loose_leash_basics",
]);
export type SkillSlug = z.infer<typeof skillSlugSchema>;

export const skillSchema = z
  .object({
    id: uuidSchema,
    slug: skillSlugSchema,
    titleKey: z.string(),
    prerequisiteSkillIds: z.array(uuidSchema),
    /** 1 = foundational, higher = more advanced; used by the plan engine to sequence introductions. */
    difficulty: z.number().int().min(1).max(5),
  })
  .extend(timestampedSchema.shape);
export type Skill = z.infer<typeof skillSchema>;

export const dogSkillStatusSchema = z.enum(["known", "learning", "mastered"]);

export const dogSkillSchema = z
  .object({
    id: uuidSchema,
    dogId: uuidSchema,
    skillId: uuidSchema,
    status: dogSkillStatusSchema,
  })
  .extend(timestampedSchema.shape);
export type DogSkill = z.infer<typeof dogSkillSchema>;
