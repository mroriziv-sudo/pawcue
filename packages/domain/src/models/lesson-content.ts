import { z } from "zod";
import {
  lessonSchema,
  lessonStepSchema,
  lessonTroubleshootingSchema,
} from "./lesson";

/**
 * A lesson with everything needed to run it.
 *
 * `lessons`, `lesson_steps` and `lesson_troubleshooting` are three tables, but nothing can render or train a lesson
 * from any one of them alone. This is the aggregate the session engine and the lesson renderer consume, so neither
 * has to know how the content was assembled — or that it came from three queries.
 *
 * Additive only: it composes the existing Phase 0 schemas rather than restating them, so a change to a lesson field
 * flows through here automatically instead of drifting.
 */
export const lessonContentSchema = z.object({
  lesson: lessonSchema,
  /** Ordered by `stepOrder`. `orderedSteps()` in the session engine is the only thing that should assume this. */
  steps: z.array(lessonStepSchema),
  troubleshooting: z.array(lessonTroubleshootingSchema),
});
export type LessonContent = z.infer<typeof lessonContentSchema>;

/** Steps in training order. Content arrives from a database, so ordering is asserted rather than assumed. */
export function orderedSteps(content: LessonContent) {
  return [...content.steps].sort((a, b) => a.stepOrder - b.stepOrder);
}

/** Troubleshooting options in authored order. */
export function orderedTroubleshooting(content: LessonContent) {
  return [...content.troubleshooting].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Safety categories that must route the user to a human professional rather than to more training guidance
 * (brief §10, §34). Kept with the content aggregate because it is a property of the content, not of the UI that
 * happens to render it.
 */
export function requiresProfessionalEscalation(
  option: Pick<z.infer<typeof lessonTroubleshootingSchema>, "safetyCategory">,
): boolean {
  return option.safetyCategory !== "NORMAL";
}
