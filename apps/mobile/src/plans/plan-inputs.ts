import type {
  AgeBucket,
  Dog,
  DailyMinutes,
  PlanningCatalogue,
  TrainingPlanGeneratorInput,
} from "@pawcue/domain";
import type { CompletedSessionRecord } from "../state/training-log-store";

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
  completed: CompletedSessionRecord[],
  catalogue: PlanningCatalogue,
): string[] {
  const byLesson = new Map(
    catalogue.lessons.map((lesson) => [lesson.id, lesson]),
  );
  const skills = new Set<string>();

  for (const record of completed) {
    const lesson = byLesson.get(record.lessonId);
    if (lesson) skills.add(lesson.skillId);
  }

  // Sorted so the generated input — and therefore the plan — is stable run to run.
  return [...skills].sort();
}

export interface BuildPlanInputArgs {
  dog: Dog;
  completed: CompletedSessionRecord[];
  catalogue: PlanningCatalogue;
  /** Injected so a plan built "today" is reproducible in a test. */
  today: Date;
  lengthDays?: number;
}

export function buildPlanInput({
  dog,
  completed,
  catalogue,
  today,
  lengthDays = 7,
}: BuildPlanInputArgs): TrainingPlanGeneratorInput {
  return {
    dogId: dog.id,
    ageBucket: ageBucketFor(dog, today),
    primaryGoalId: GOAL_UNAVAILABLE,
    secondaryGoalIds: [],
    knownSkillIds: knownSkillIdsFromHistory(completed, catalogue),
    dailyMinutes: dog.dailyTrainingMinutes ?? DEFAULT_DAILY_MINUTES,
    recentSessionSummaries: completed.map((record) => ({
      lessonId: record.lessonId,
      completedAt: record.completedAt,
      // The local log records completed sessions only; abandonment is not yet persisted, so no session can be
      // reported as unfinished. `continue_unfinished` is therefore unreachable from real data today.
      wasAbandoned: false,
    })),
    startDate: today.toISOString().slice(0, 10),
    lengthDays,
  };
}
