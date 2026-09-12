import { useEffect, useState } from "react";
import {
  deriveLessonStatuses,
  summariseTraining,
  type LessonHistoryEntry,
  type LessonStatusDetail,
  type PlanningCatalogue,
  type TrainingSummary,
} from "@pawcue/domain";
import { loadPlanningCatalogue } from "../plans/plan-repository";
import { useTrainingLogStore } from "../state/training-log-store";

/**
 * The lesson catalogue, loaded once for the life of the app.
 *
 * Three of the four primary destinations need it, and switching between them must not re-fetch: the catalogue
 * changes when content is published, not when a user taps a tab. The cache is a module-level promise rather than
 * per-hook state so that several screens mounting at once share a single request instead of racing.
 */

let cached: PlanningCatalogue | null = null;
let inFlight: Promise<PlanningCatalogue> | null = null;

async function getCatalogue(): Promise<PlanningCatalogue> {
  if (cached) return cached;
  inFlight ??= loadPlanningCatalogue()
    .then((catalogue) => {
      cached = catalogue;
      return catalogue;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Test seam, and the hook for a future content-version refresh. */
export function resetCatalogueCache(): void {
  cached = null;
  inFlight = null;
}

export interface CatalogueQuery {
  catalogue: PlanningCatalogue | null;
  loading: boolean;
  error: Error | null;
}

export function useCatalogue(): CatalogueQuery {
  const [state, setState] = useState<CatalogueQuery>(() => ({
    // A cache hit renders with content on the first frame rather than flashing a spinner.
    catalogue: cached,
    loading: cached === null,
    error: null,
  }));

  useEffect(() => {
    if (cached) return;
    let active = true;

    getCatalogue()
      .then((catalogue) => {
        if (active) setState({ catalogue, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          catalogue: null,
          loading: false,
          error: error instanceof Error ? error : new Error("Unknown error"),
        });
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}

/**
 * The training history in the shape the domain derivations expect.
 *
 * One translation from the store's record type to the domain's, done here so no screen has to know both.
 */
export function useTrainingHistory(): LessonHistoryEntry[] {
  const completed = useTrainingLogStore((s) => s.completed);
  return completed.map((record) => ({
    lessonId: record.lessonId,
    status: record.status,
    endedAt: record.endedAt,
  }));
}

/** Skills the dog has, derived from what it has actually completed. */
export function knownSkillsFrom(
  catalogue: PlanningCatalogue | null,
  history: LessonHistoryEntry[],
): string[] {
  if (!catalogue) return [];
  const byLesson = new Map(
    catalogue.lessons.map((lesson) => [lesson.id, lesson]),
  );
  const skills = new Set<string>();
  for (const entry of history) {
    if (entry.status !== "completed") continue;
    const lesson = byLesson.get(entry.lessonId);
    if (lesson) skills.add(lesson.skillId);
  }
  return [...skills].sort();
}

export interface LessonStatusQuery {
  statuses: LessonStatusDetail[];
  summary: TrainingSummary | null;
  catalogue: PlanningCatalogue | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Every lesson's state, plus the honest training totals.
 *
 * Both come from the same derivation over the same history, so Train and Progress can never disagree about
 * whether a lesson was completed.
 */
export function useLessonStatuses(): LessonStatusQuery {
  const { catalogue, loading, error } = useCatalogue();
  const history = useTrainingHistory();

  if (!catalogue) {
    return { statuses: [], summary: null, catalogue: null, loading, error };
  }

  return {
    statuses: deriveLessonStatuses(
      catalogue,
      history,
      knownSkillsFrom(catalogue, history),
    ),
    summary: summariseTraining(catalogue, history),
    catalogue,
    loading,
    error,
  };
}
