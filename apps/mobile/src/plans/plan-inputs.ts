import type {
  AgeBucket,
  Dog,
  DailyMinutes,
  PlanningCatalogue,
  TrainingPlanGeneratorInput,
} from "@pawcue/domain";
import type { TrainingSessionState } from "@pawcue/domain";
import type { TrainingSessionRecord } from "../state/training-log-store";

/**
 * Builds the planner's input from what PawCue actually knows about a dog.
 *
 * The interesting part of this file is what it **cannot** supply. `TrainingPlanGeneratorInput` was designed in
 * Phase 0 against the full product; several of its fields have no source in the app as it stands today, and this
 * is the single place that is recorded rather than quietly papered over with a plausible-looking value.
 *
 * Unavailable today:
 *
 *  - **Goals.** `primaryGoalId` and `secondaryGoalIds` require `dog_goals` rows, and onboarding does not collect
 *    goals. Worse, there is no lesson→goal relation anywhere in the schema, so even with goals recorded the
 *    engine could not rank a lesson by them. Goal-aware planning needs a content change, not just a question.
 *  - **`dog_skills`.** The table exists but nothing writes it. Known skills are therefore derived from completed
 *    sessions, which is a true statement about what the dog has been taught rather than an invented one.
 *
 * Abandoned sessions are no longer in this list: they are persisted, and `continue_unfinished` is reachable from
 * real data.
 *  - **Age appropriateness.** `ageBucket` is derived honestly from the birthdate, but no lesson carries an age
 *    or developmental field, so the engine has nothing to match it against and deliberately ignores it. Inventing
 *    a rule here would be inventing veterinary advice.
 */

/** A placeholder goal id, used only because the field is non-optional. The engine does not read it. */
const GOAL_UNAVAILABLE = "00000000-0000-4000-a000-000000000000";

const DEFAULT_DAILY_MINUTES: DailyMinutes = 10;

/**
 * Age bucket from the birthdate.
 *
 * A real derivation from a real field — the boundaries are the ones the Phase 0 enum already names, not new
 * developmental claims. Falls back to the adolescent bucket when no birthdate was given, which is the least
 * assuming of the four.
 */
export function ageBucketFor(
  dog: Pick<Dog, "birthdate">,
  today: Date,
): AgeBucket {
  if (!dog.birthdate) return "adolescent_6_18_months";

  const born = Date.parse(`${dog.birthdate}T00:00:00Z`);
  if (Number.isNaN(born)) return "adolescent_6_18_months";

  const weeks = (today.getTime() - born) / (7 * 86_400_000);
  if (weeks < 16) return "puppy_8_16_weeks";
  if (weeks < 26) return "puppy_4_6_months";
  if (weeks < 78) return "adolescent_6_18_months";
  return "adult_18_months_plus";
}

/**
 * The skills a dog has been taught, derived from completed training.
 *
 * `dog_skills` is the field this should read, and nothing writes it yet. Completed sessions are the honest
 * substitute: a finished lesson genuinely did teach its skill. Abandoned sessions are excluded — starting a
 * lesson is not learning it.
 */
export function knownSkillIdsFromHistory(
  completed: TrainingSessionRecord[],
  catalogue: PlanningCatalogue,
): string[] {
  const byLesson = new Map(
    catalogue.lessons.map((lesson) => [lesson.id, lesson]),
  );
  const skills = new Set<string>();

  for (const record of completed) {
    // Only a completed lesson taught its skill. An abandoned attempt is training history, not a skill learned,
    // and treating it as one would unlock prerequisites the dog has not actually met.
    if (record.status !== "completed") continue;
    const lesson = byLesson.get(record.lessonId);
    if (lesson) skills.add(lesson.skillId);
  }

  // Sorted so the generated input — and therefore the plan — is stable run to run.
  return [...skills].sort();
}

export interface BuildPlanInputArgs {
  dog: Dog;
  completed: TrainingSessionRecord[];
  catalogue: PlanningCatalogue;
  /**
   * The session the user is part-way through, if any.
   *
   * Included as unfinished work in its own right. A paused session is the most common way a lesson is left
   * incomplete, and waiting for it to be displaced by another lesson before the planner noticed would leave the
   * commonest case invisible. It is reported without being marked abandoned — it has not been abandoned, it is
   * simply not finished.
   */
  activeSession?: TrainingSessionState | null;
  /** Injected so a plan built "today" is reproducible in a test. */
  today: Date;
  lengthDays?: number;
}

export function buildPlanInput({
  dog,
  completed,
  catalogue,
  activeSession = null,
  today,
  lengthDays = 7,
}: BuildPlanInputArgs): TrainingPlanGeneratorInput {
  const history = completed.map((record) => ({
    lessonId: record.lessonId,
    // The Phase 0 input pairs one end-time with a flag rather than two mutually exclusive fields.
    completedAt: record.endedAt,
    wasAbandoned: record.status === "abandoned",
  }));

  /**
   * An in-progress session is anchored to when it started.
   *
   * It has no end time — it has not ended. `startedAt` is the honest anchor, and recency is all the planner reads
   * from it. Skipped when the same session has already been logged, so a session that was displaced and then
   * re-opened cannot appear twice.
   */
  if (
    activeSession &&
    activeSession.status === "in_progress" &&
    activeSession.events.length > 0 &&
    !completed.some((record) => record.sessionId === activeSession.sessionId)
  ) {
    history.push({
      lessonId: activeSession.lessonId,
      completedAt: activeSession.startedAt,
      wasAbandoned: true,
    });
  }

  return {
    dogId: dog.id,
    ageBucket: ageBucketFor(dog, today),
    primaryGoalId: GOAL_UNAVAILABLE,
    secondaryGoalIds: [],
    knownSkillIds: knownSkillIdsFromHistory(completed, catalogue),
    dailyMinutes: dog.dailyTrainingMinutes ?? DEFAULT_DAILY_MINUTES,
    recentSessionSummaries: history,
    startDate: today.toISOString().slice(0, 10),
    lengthDays,
  };
}
