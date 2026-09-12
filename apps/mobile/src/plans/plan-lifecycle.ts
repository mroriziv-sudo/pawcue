import type { PlanningCatalogue } from "@pawcue/domain";
import type { StoredPlan } from "./plan-repository";

/**
 * When a persisted plan may be reused, and when it must be replaced.
 *
 * A pure decision, deliberately separated from any component. Regeneration driven by mount order or effect timing
 * is regeneration nobody can reason about: it produces a new plan row on a re-render, and a stale one on a
 * navigation, and there is no single place to read the rules. Here the rules are a list, and every one of them is
 * a test.
 *
 * The default is **reuse**. A plan is a commitment for the day, not a suggestion recomputed continuously — and
 * because the engine is deterministic, regenerating from unchanged inputs could only ever produce the same plan
 * while writing a new row and superseding the old one for nothing.
 */

export type RegenerationReason =
  /** Nothing persisted for this dog. */
  | "no_active_plan"
  /** The rules changed; a plan must always be read against the engine that produced it. */
  | "engine_version_changed"
  /** The plan has no day covering today — it was built for a day that has passed. */
  | "no_day_for_today"
  /** It references content that no longer exists. */
  | "lesson_unavailable"
  /** The time budget it was built for no longer matches the dog's. */
  | "daily_minutes_changed";

export interface PlanValidityInputs {
  plan: StoredPlan | null;
  catalogue: PlanningCatalogue;
  /** The engine version the app is running now. */
  engineVersion: string;
  /** ISO date, `YYYY-MM-DD`. */
  today: string;
  dailyMinutes: number;
}

/**
 * Returns why the plan must be replaced, or null to reuse it.
 *
 * Order matters only for which reason is reported; any one of them is sufficient.
 */
export function regenerationReason(
  inputs: PlanValidityInputs,
): RegenerationReason | null {
  const { plan, catalogue, engineVersion, today, dailyMinutes } = inputs;

  if (!plan || plan.status !== "active") return "no_active_plan";

  /**
   * An old plan is never re-attributed to a newer engine.
   *
   * The stored version says which rules produced it. When they change, the honest move is a new plan under the
   * new version — not silently presenting yesterday's reasoning as today's.
   */
  if (plan.engineVersion !== engineVersion) return "engine_version_changed";

  if (plan.dailyMinutes !== dailyMinutes) return "daily_minutes_changed";

  const dayForToday = plan.days.find((day) => day.date === today);
  // Also what stops a plan being shown forever: once its day has passed there is no day for today, and the next
  // visit rebuilds.
  if (!dayForToday) return "no_day_for_today";

  const availableLessonIds = new Set(
    catalogue.lessons.map((lesson) => lesson.id),
  );
  const referencesMissingContent = plan.days.some((day) =>
    day.activities.some(
      (activity) => !availableLessonIds.has(activity.lessonId),
    ),
  );
  // Content can be unpublished after a plan was built. Rebuilding is safer than rendering a gap, and the engine
  // will simply not pick the missing lesson again.
  if (referencesMissingContent) return "lesson_unavailable";

  return null;
}

export interface TodayActivityView {
  lessonId: string;
  lessonSlug: string;
  titleKey: string;
  goalKey: string;
  estimatedMinutes: number;
  selectionReason: string;
  sortOrder: number;
  /** True once a session for this lesson has been completed on the plan's own day. */
  done: boolean;
}

export interface TodayView {
  activities: TodayActivityView[];
  totalMinutes: number;
  remainingMinutes: number;
  allDone: boolean;
}

/**
 * Projects the persisted plan onto what Today renders.
 *
 * Completing an activity **ticks it off rather than rebuilding the plan**. The alternative — regenerating on every
 * completion — would write a plan row per lesson finished and make the day's list shift under the user as they
 * worked through it. A plan you can complete is a better object than a plan that keeps rewriting itself.
 *
 * Completion is judged against the plan's own date, so finishing the same lesson last week does not tick off
 * today's copy of it.
 */
export function buildTodayView(
  plan: StoredPlan,
  catalogue: PlanningCatalogue,
  completedToday: Array<{ lessonId: string; endedAt: string }>,
  today: string,
): TodayView {
  const day = plan.days.find((entry) => entry.date === today);
  if (!day) {
    return {
      activities: [],
      totalMinutes: 0,
      remainingMinutes: 0,
      allDone: false,
    };
  }

  const doneLessonIds = new Set(
    completedToday
      .filter((record) => record.endedAt.slice(0, 10) === today)
      .map((record) => record.lessonId),
  );

  const byLesson = new Map(
    catalogue.lessons.map((lesson) => [lesson.id, lesson]),
  );

  const activities = [...day.activities]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((activity) => {
      const lesson = byLesson.get(activity.lessonId);
      // Defensive: `regenerationReason` rebuilds a plan referencing missing content, so this should be
      // unreachable. Omitting is still better than rendering a row with no name.
      if (!lesson) return [];

      return [
        {
          lessonId: activity.lessonId,
          lessonSlug: lesson.slug,
          titleKey: lesson.titleKey,
          goalKey: lesson.goalKey,
          estimatedMinutes: activity.estimatedMinutes,
          selectionReason: activity.selectionReason,
          sortOrder: activity.sortOrder,
          done: doneLessonIds.has(activity.lessonId),
        },
      ];
    });

  const totalMinutes = activities.reduce(
    (sum, a) => sum + a.estimatedMinutes,
    0,
  );
  const remainingMinutes = activities
    .filter((a) => !a.done)
    .reduce((sum, a) => sum + a.estimatedMinutes, 0);

  return {
    activities,
    totalMinutes,
    remainingMinutes,
    allDone: activities.length > 0 && activities.every((a) => a.done),
  };
}
