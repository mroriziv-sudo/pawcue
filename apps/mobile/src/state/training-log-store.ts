import { create } from "zustand";
import { z } from "zod";
import {
  pendingSessionEventSchema,
  type TrainingSessionState,
} from "@pawcue/domain";
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
   * False until the session has been written to `training_sessions`/`session_events` and the server confirmed it.
   * Never optimistic: it is set only after a successful write.
   */
  syncedToServer: z.boolean(),
  /**
   * The append-only event log, kept until the server confirms it.
   *
   * This is the payload the sync writes, so it must survive an app restart between training and syncing. It is
   * dropped only once `syncedToServer` is true — local data must never disappear before the data it mirrors is
   * confirmed persisted. Optional so records written before this field existed still parse.
   */
  events: z.array(pendingSessionEventSchema).optional(),
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
    events: session.events,
  };
}

interface TrainingLogState {
  completed: CompletedSessionRecord[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  record: (session: TrainingSessionState) => Promise<void>;
  /** Completed sessions not yet written to the server. The queue the sync drains. */
  pendingSync: () => CompletedSessionRecord[];
  completionsFor: (lessonSlug: string) => number;
  /** Marks sessions confirmed by the server and releases the event payloads they no longer need. */
  markSynced: (sessionIds: string[]) => Promise<void>;
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

  markSynced: async (sessionIds) => {
    const ids = new Set(sessionIds);
    const completed = get().completed.map((item) =>
      ids.has(item.sessionId)
        ? // The events have been persisted server-side, so the local copy is no longer the only one. The summary
          // stays as history; only the payload is released.
          { ...item, syncedToServer: true, events: undefined }
        : item,
    );
    set({ completed });
    try {
      await appStorage.setItem(
        STORAGE_KEYS.completedSessions,
        JSON.stringify(completed),
      );
    } catch {
      /* A failed write means the session syncs again next time, which is safe: the write is idempotent. */
    }
  },

  completionsFor: (lessonSlug) =>
    get().completed.filter((item) => item.lessonSlug === lessonSlug).length,

  clear: async () => {
    set({ completed: [] });
    await appStorage.removeItem(STORAGE_KEYS.completedSessions);
  },
}));
