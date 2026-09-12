import type { Lesson } from "../models/lesson";
import {
  closeOverPrerequisites,
  effectivePrerequisiteSkillIds,
  type PlanningCatalogue,
} from "../plan-engine/content-graph";

/**
 * What state a lesson is in for a given dog.
 *
 * Derived, never stored. Every input is history that already exists — completed sessions, unfinished attempts,
 * and the prerequisite graph — so there is no fifth source of truth to keep in step, and no progress field that
 * can drift from what the user actually did.
 *
 * The states are deliberately **discrete**. A percentage would need a notion of partial completion the data does
 * not support: a session records which steps were completed, but a lesson the user stopped halfway through is not
 * meaningfully "40% learned", and showing a number implies a precision that is not there.
 */

export type LessonStatus =
  /** Prerequisites are not satisfied. Cannot be started. */
  | "locked"
  /** Eligible, never attempted. */
  | "not_started"
  /** Attempted and left unfinished, with no later completion. */
  | "unfinished"
  /** Completed at least once. */
  | "completed";

export interface LessonHistoryEntry {
  lessonId: string;
  status: "completed" | "abandoned";
  endedAt: string;
}

export interface LessonStatusDetail {
  lesson: Lesson;
  status: LessonStatus;
  /** How many times it has been finished. Zero for every state but `completed`. */
  completions: number;
  /** Prerequisite skills still missing. Empty unless `locked`. */
  missingPrerequisiteSkillIds: string[];
  /** Most recent activity of any kind, or null if never attempted. */
  lastTrainedAt: string | null;
}

/**
 * Resolves every lesson's state in one pass.
 *
 * Done for the whole catalogue at once because both screens that need it need all of them, and because the
 * prerequisite closure is worth computing a single time rather than per card.
 */
export function deriveLessonStatuses(
  catalogue: PlanningCatalogue,
  history: LessonHistoryEntry[],
  knownSkillIds: string[],
): LessonStatusDetail[] {
  const known = closeOverPrerequisites(knownSkillIds, catalogue.skills);

  const completions = new Map<string, number>();
  const lastCompleted = new Map<string, string>();
  const lastAbandoned = new Map<string, string>();
  const lastAny = new Map<string, string>();

  for (const entry of history) {
    if (!entry?.lessonId || typeof entry.endedAt !== "string") continue;
    if (Number.isNaN(Date.parse(entry.endedAt))) continue;

    const previousAny = lastAny.get(entry.lessonId);
    if (!previousAny || entry.endedAt > previousAny) {
      lastAny.set(entry.lessonId, entry.endedAt);
    }

    if (entry.status === "completed") {
      completions.set(
        entry.lessonId,
        (completions.get(entry.lessonId) ?? 0) + 1,
      );
      const previous = lastCompleted.get(entry.lessonId);
      if (!previous || entry.endedAt > previous) {
        lastCompleted.set(entry.lessonId, entry.endedAt);
      }
    } else {
      const previous = lastAbandoned.get(entry.lessonId);
      if (!previous || entry.endedAt > previous) {
        lastAbandoned.set(entry.lessonId, entry.endedAt);
      }
    }
  }

  return catalogue.lessons.map((lesson) => {
    const prerequisites = effectivePrerequisiteSkillIds(
      lesson,
      catalogue.skills,
    );
    const missing = prerequisites.filter((id) => !known.has(id));

    const completed = lastCompleted.get(lesson.id);
    const abandoned = lastAbandoned.get(lesson.id);

    /**
     * Completion outranks a later abandonment for the *status*: a lesson you have finished stays finished, even
     * if you started it again and stopped. Only an abandonment with no completion at all reads as unfinished.
     */
    let status: LessonStatus;
    if (completed) {
      status = "completed";
    } else if (abandoned) {
      status = "unfinished";
    } else if (missing.length > 0) {
      // Checked after history, so a lesson the dog has genuinely trained is never shown as locked — the
      // prerequisite graph can be re-authored underneath a user, and their own history outranks it.
      status = "locked";
    } else {
      status = "not_started";
    }

    return {
      lesson,
      status,
      completions: completions.get(lesson.id) ?? 0,
      missingPrerequisiteSkillIds: status === "locked" ? missing : [],
      lastTrainedAt: lastAny.get(lesson.id) ?? null,
    };
  });
}

/** True when the lesson can be started right now. The one check a "start" control should make. */
export function canStartLesson(detail: LessonStatusDetail): boolean {
  return detail.status !== "locked";
}

export interface TrainingSummary {
  sessionsCompleted: number;
  lessonsCompleted: number;
  unfinishedLessons: number;
  /** Sum of the estimated minutes of every completed session. An estimate, and labelled as one in the UI. */
  estimatedMinutesTrained: number;
  lastTrainedAt: string | null;
}

/**
 * Honest totals for the Progress surface.
 *
 * Everything here is counted from records that exist. There is deliberately no streak: `Streak` is server-derived
 * by its own contract precisely so a client cannot invent one, and nothing populates it yet.
 *
 * Minutes are explicitly *estimated* — they come from each lesson's authored `estimatedMinutes`, not from
 * measuring how long the user actually trained, which nothing records.
 */
export function summariseTraining(
  catalogue: PlanningCatalogue,
  history: LessonHistoryEntry[],
): TrainingSummary {
  const byLesson = new Map(
    catalogue.lessons.map((lesson) => [lesson.id, lesson]),
  );

  let sessionsCompleted = 0;
  let estimatedMinutesTrained = 0;
  let lastTrainedAt: string | null = null;
  const completedLessons = new Set<string>();
  const abandonedLessons = new Set<string>();

  for (const entry of history) {
    if (!entry?.lessonId || typeof entry.endedAt !== "string") continue;
    if (Number.isNaN(Date.parse(entry.endedAt))) continue;

    if (!lastTrainedAt || entry.endedAt > lastTrainedAt)
      lastTrainedAt = entry.endedAt;

    if (entry.status === "completed") {
      sessionsCompleted += 1;
      completedLessons.add(entry.lessonId);
      estimatedMinutesTrained +=
        byLesson.get(entry.lessonId)?.estimatedMinutes ?? 0;
    } else {
      abandonedLessons.add(entry.lessonId);
    }
  }

  for (const id of completedLessons) abandonedLessons.delete(id);

  return {
    sessionsCompleted,
    lessonsCompleted: completedLessons.size,
    unfinishedLessons: abandonedLessons.size,
    estimatedMinutesTrained,
    lastTrainedAt,
  };
}
