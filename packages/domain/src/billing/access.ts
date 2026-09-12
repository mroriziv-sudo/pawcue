import {
  canStartLesson,
  type LessonStatusDetail,
} from "../lessons/lesson-status";
import type { EntitlementView } from "./entitlement";

/**
 * The free/premium boundary.
 *
 * This is not a new product decision. `lessons.is_always_free` is a seeded, authored column — the brief's free-tier
 * list (Name Game plus the foundationals) — and ARCHITECTURE.md §5 names the full lesson catalogue as the thing
 * premium unlocks. Content decides what is free; this file only reads it.
 *
 * Nothing here asks the store, the provider, or a local flag. It takes the resolved entitlement view and a lesson,
 * and answers with the two locks separately.
 */

/**
 * Why a lesson cannot be started.
 *
 * The two locks are deliberately **not** merged into one enum. They have different causes, different remedies and
 * different copy: a prerequisite lock is earned away by training, a premium lock is bought away, and a lesson can
 * be under both at once. Collapsing them would mean showing a paywall to someone whose real obstacle is that their
 * dog has not learned Sit yet.
 */
export interface LessonGate {
  /** Prerequisite skills are missing. Entirely independent of billing. */
  prerequisiteLocked: boolean;
  /** Premium content, and this user is not entitled. Entirely independent of prerequisites. */
  premiumLocked: boolean;
  /** True only when neither lock applies. The one check a "start" control should make. */
  canStart: boolean;
}

export function lessonGate(
  detail: LessonStatusDetail,
  entitlement: Pick<EntitlementView, "isPremiumActive">,
): LessonGate {
  // Phase 6's rule, untouched: history outranks the prerequisite graph, and `canStartLesson` is still the only
  // place that is decided.
  const prerequisiteLocked = !canStartLesson(detail);
  const premiumLocked =
    !detail.lesson.isAlwaysFree && !entitlement.isPremiumActive;

  return {
    prerequisiteLocked,
    premiumLocked,
    canStart: !prerequisiteLocked && !premiumLocked,
  };
}

/**
 * Whether a lesson needs premium at all, independent of who is asking.
 *
 * Used where there is no status detail to hand — a plan activity, for instance, which references a lesson by id.
 */
export function isPremiumLesson(lesson: { isAlwaysFree: boolean }): boolean {
  return !lesson.isAlwaysFree;
}

/**
 * Whether a lesson is startable for this user right now.
 *
 * Named to read like the Phase 6 `canStartLesson` it extends, because the mistake it prevents is calling the older
 * one at a site that also needs to respect billing.
 */
export function canStartLessonWithEntitlement(
  detail: LessonStatusDetail,
  entitlement: Pick<EntitlementView, "isPremiumActive">,
): boolean {
  return lessonGate(detail, entitlement).canStart;
}
