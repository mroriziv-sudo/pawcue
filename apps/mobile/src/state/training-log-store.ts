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

/**
 * One finished attempt at a lesson — completed **or** abandoned.
 *
 * Both outcomes are recorded because both are real training history. `trainingSessionStatusSchema`,
 * `session_events.session_abandoned` and `training_sessions.status` have described abandonment since Phase 0;
 * until now nothing wrote it, which is why the planner's highest-priority rule could never fire from real data.
 */
export const trainingSessionRecordSchema = z.object({
  sessionId: z.string(),
  lessonId: z.string(),
  lessonSlug: z.string(),
  startedAt: z.string(),
  /**
   * When the attempt ended, however it ended.
   *
   * Matches the Phase 0 planner input, whose `recentSessionSummaries` pairs a single timestamp with a
   * `wasAbandoned` flag rather than carrying two mutually exclusive fields.
   */
  endedAt: z.string(),
  /** Completed sessions behave exactly as before; `abandoned` is the new case. */
  status: z.enum(["completed", "abandoned"]),
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
export type TrainingSessionRecord = z.infer<typeof trainingSessionRecordSchema>;

/**
 * Reads a stored record written before abandonment existed.
 *
 * Those rows carry `completedAt` and no `status`. They are, by construction, completed sessions — so they are
 * read forward rather than discarded. A user with training history from an earlier build must not lose it to a
 * schema change.
 */
const storedRecordSchema = z.union([
  trainingSessionRecordSchema,
  z
    .object({
      sessionId: z.string(),
      lessonId: z.string(),
      lessonSlug: z.string(),
      startedAt: z.string(),
      completedAt: z.string(),
      stepsCompleted: z.number().int().min(0),
      repetitionsLogged: z.number().int().min(0),
      clickerPresses: z.number().int().min(0),
      troubleshootingViewed: z.number().int().min(0),
      syncedToServer: z.boolean(),
      events: z.array(pendingSessionEventSchema).optional(),
    })
    .transform((legacy) => ({
      ...legacy,
      endedAt: legacy.completedAt,
      status: "completed" as const,
    })),
]);

const storedLogSchema = z.array(storedRecordSchema);

/**
 * Summarises a finished session. Counts come from the event log, not from UI state.
 *
 * An abandoned session ends at its `session_abandoned` event — the append-only log is the only honest record of
 * when the attempt actually stopped, since nothing sets `completedAt` on a session that was never completed.
 */
export function summariseSession(
  session: TrainingSessionState,
): TrainingSessionRecord | null {
  if (session.status === "in_progress") return null;

  const abandonedAt = session.events.find(
    (event) => event.type === "session_abandoned",
  )?.occurredAt;
  const endedAt =
    session.status === "completed"
      ? session.completedAt
      : (abandonedAt ?? null);

  // Without an end time the record would be unorderable against the rest of the history, which is worse than
  // not recording it.
  if (!endedAt) return null;

  return {
    sessionId: session.sessionId,
    lessonId: session.lessonId,
    lessonSlug: session.lessonSlug,
    startedAt: session.startedAt,
    endedAt,
    status: session.status,
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
  /** Every finished attempt, completed and abandoned alike. */
  completed: TrainingSessionRecord[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  record: (session: TrainingSessionState) => Promise<void>;
  /** Sessions not yet written to the server. The queue the sync drains. */
  pendingSync: () => TrainingSessionRecord[];
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

    /**
     * At most one unfinished attempt per lesson, and only the latest.
     *
     * Someone can start and drop the same lesson repeatedly; keeping every attempt would grow the log without
     * telling the planner anything it does not already know from the most recent one. Completed records are never
     * touched — they are history, and an older completion still counts.
     */
    const kept =
      summary.status === "abandoned"
        ? get().completed.filter(
            (item) =>
              !(
                item.status === "abandoned" &&
                item.lessonId === summary.lessonId
              ),
          )
        : get().completed;

    const completed = [...kept, summary];
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
    get().completed.filter(
      (item) => item.lessonSlug === lessonSlug && item.status === "completed",
    ).length,

  clear: async () => {
    set({ completed: [] });
    await appStorage.removeItem(STORAGE_KEYS.completedSessions);
  },
}));
