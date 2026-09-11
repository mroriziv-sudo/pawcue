import { create } from "zustand";
import { z } from "zod";
import type { TrainingSessionState } from "@pawcue/domain";
import { appStorage, STORAGE_KEYS } from "../lib/storage";

/**
 * The local record of completed training.
 *
 * ## Why this is not a Progress store
 *
 * `Progress` and `Streak` are, by their own contract, **server-computed** — "always derived from `session_events`
 * server-side, never trusted from a client write", precisely so a client bug or an offline replay cannot corrupt
 * a displayed streak. Computing a streak here would mean inventing a second, less trustworthy source of the same
 * numbers, and showing a user a streak the server has never agreed to is exactly the fake gamification the brief
 * rules out.
 *
 * So this stores what actually happened locally — which lesson was completed, when, and the event log it produced
 * — and nothing derived. It is the input the server recalculation will consume once a dog profile exists, and the
 * read surface a future course/progress screen can build on. Until then, `pendingSync` is honest about the fact
 * that none of it has reached the server.
 */

export const completedSessionSchema = z.object({
  sessionId: z.string(),
  lessonId: z.string(),
  lessonSlug: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  stepsCompleted: z.number().int().min(0),
  repetitionsLogged: z.number().int().min(0),
  clickerPresses: z.number().int().min(0),
  troubleshootingViewed: z.number().int().min(0),
  /**
   * False until the session has been written to `training_sessions`/`session_events`. Always false in Phase 3:
   * those rows require a `dog_id`, which a guest does not have yet.
   */
  syncedToServer: z.boolean(),
});
export type CompletedSessionRecord = z.infer<typeof completedSessionSchema>;

const storedLogSchema = z.array(completedSessionSchema);

/** Summarises a finished session into the record above. Counts come from the event log, not from UI state. */
export function summariseSession(
  session: TrainingSessionState,
): CompletedSessionRecord | null {
  if (session.status !== "completed" || !session.completedAt) return null;

  return {
    sessionId: session.sessionId,
    lessonId: session.lessonId,
    lessonSlug: session.lessonSlug,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    stepsCompleted: session.completedStepIds.length,
    repetitionsLogged: session.events.filter(
      (event) => event.type === "repetition_logged",
    ).length,
    clickerPresses: session.events.filter(
      (event) => event.type === "clicker_pressed",
    ).length,
    troubleshootingViewed: session.troubleshootingViewedIds.length,
    syncedToServer: false,
  };
}

interface TrainingLogState {
  completed: CompletedSessionRecord[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  record: (session: TrainingSessionState) => Promise<void>;
  /** Completed sessions not yet written to the server. The queue a future flush will drain. */
  pendingSync: () => CompletedSessionRecord[];
  completionsFor: (lessonSlug: string) => number;
  clear: () => Promise<void>;
}

export const useTrainingLogStore = create<TrainingLogState>((set, get) => ({
  completed: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await appStorage.getItem(STORAGE_KEYS.completedSessions);
      const parsed = raw ? storedLogSchema.safeParse(JSON.parse(raw)) : null;
      // A malformed log is dropped rather than partially recovered: it is a record of history, and a half-read
      // history is worse than an empty one.
      set({ completed: parsed?.success ? parsed.data : [], hydrated: true });
    } catch {
      set({ completed: [], hydrated: true });
    }
  },

  record: async (session) => {
    const summary = summariseSession(session);
    if (!summary) return;

    // Idempotent by session id, so a re-render or a repeated completion cannot log the same session twice.
    if (get().completed.some((item) => item.sessionId === summary.sessionId)) {
      return;
    }

    const completed = [...get().completed, summary];
    set({ completed });
    try {
      await appStorage.setItem(
        STORAGE_KEYS.completedSessions,
        JSON.stringify(completed),
      );
    } catch {
      /* The in-memory record still stands; losing the write costs history, never the session just finished. */
    }
  },

  pendingSync: () => get().completed.filter((item) => !item.syncedToServer),

  completionsFor: (lessonSlug) =>
    get().completed.filter((item) => item.lessonSlug === lessonSlug).length,

  clear: async () => {
    set({ completed: [] });
    await appStorage.removeItem(STORAGE_KEYS.completedSessions);
  },
}));
