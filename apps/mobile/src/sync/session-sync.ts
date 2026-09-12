import { requireSupabase } from "../lib/supabase";
import {
  useTrainingLogStore,
  type TrainingSessionRecord,
} from "../state/training-log-store";

/**
 * Flushes locally completed training sessions to the server.
 *
 * This closes the boundary Phase 3 left open on purpose: `training_sessions.dog_id` is NOT NULL, so nothing could
 * be written until onboarding produced a real dog. Everything needed was already being kept — the append-only
 * event log with client-generated ids that ARCHITECTURE.md §8 specifies — so this is a flush, not a redesign.
 *
 * ## Why it is safe to retry
 *
 * Both writes are **upserts keyed by ids the client generated at the moment the thing happened**:
 *
 *  - `training_sessions.id` is the session id minted by the engine at `startSession`.
 *  - `session_events.id` is minted per event and is the idempotency key the offline design is built on.
 *
 * So a retry after a dropped response, a crash mid-flush, or a double-invocation re-writes the same rows rather
 * than creating new ones. `ignoreDuplicates` makes a replayed event a no-op instead of an error, which is what
 * lets a partially-completed flush simply be run again.
 *
 * ## Ordering
 *
 * The session row is written before its events, because `session_events.session_id` is a foreign key. A failure
 * between the two leaves a session with some or none of its events and the record still marked unsynced — the
 * next run repairs it. That is the intended shape of partial failure: never lost, only incomplete for a while.
 *
 * Local data is released only after the server confirms: `markSynced` runs after both writes succeed.
 */

export type SyncOutcome =
  | { status: "synced"; sessions: number; events: number }
  | { status: "nothing_to_sync" }
  | { status: "no_dog" }
  | { status: "unavailable" }
  | { status: "partial"; sessions: number; events: number; failed: number };

/** Guards against two flushes overlapping — a foreground event and a manual retry can easily coincide. */
let inFlight: Promise<SyncOutcome> | null = null;

async function flushOne(
  record: TrainingSessionRecord,
  dogId: string,
): Promise<number> {
  const client = requireSupabase();

  const { error: sessionError } = await client.from("training_sessions").upsert(
    {
      id: record.sessionId,
      dog_id: dogId,
      lesson_id: record.lessonId,
      plan_activity_id: null,
      // The real outcome. `training_sessions.status` has allowed 'abandoned' since Phase 0, so an abandoned
      // attempt is stored as what it was rather than mislabelled as a completion.
      status: record.status,
      started_at: record.startedAt,
      // Null for an abandoned attempt: it has an end time, but it was never completed, and writing one would make
      // the row claim something that did not happen.
      completed_at: record.status === "completed" ? record.endedAt : null,
    },
    { onConflict: "id" },
  );
  if (sessionError) throw new Error(sessionError.message);

  const events = record.events ?? [];
  if (events.length === 0) return 0;

  const { error: eventsError } = await client.from("session_events").upsert(
    events.map((event) => ({
      id: event.id,
      session_id: record.sessionId,
      type: event.type,
      lesson_step_id: event.lessonStepId,
      troubleshooting_option_id: event.troubleshootingOptionId,
      occurred_at: event.occurredAt,
    })),
    // A replayed event is a no-op, not a conflict — this is what makes a retry after partial failure safe.
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (eventsError) throw new Error(eventsError.message);

  return events.length;
}

/**
 * Writes every pending session for `dogId`.
 *
 * Sessions are flushed one at a time and marked individually, so one failure does not discard the ones that
 * already succeeded.
 */
export async function syncPendingSessions(
  dogId: string | null,
): Promise<SyncOutcome> {
  if (inFlight) return inFlight;

  const run = async (): Promise<SyncOutcome> => {
    if (!dogId) return { status: "no_dog" };

    const log = useTrainingLogStore.getState();
    if (!log.hydrated) await log.hydrate();

    const pending = useTrainingLogStore.getState().pendingSync();
    if (pending.length === 0) return { status: "nothing_to_sync" };

    const syncedIds: string[] = [];
    let events = 0;
    let failed = 0;

    for (const record of pending) {
      try {
        events += await flushOne(record, dogId);
        syncedIds.push(record.sessionId);
      } catch {
        // Offline, a transient server error, or an RLS rejection. The record stays pending and is retried; it is
        // never dropped, because the local copy is the only copy until the server confirms.
        failed += 1;
      }
    }

    if (syncedIds.length > 0) {
      await useTrainingLogStore.getState().markSynced(syncedIds);
    }

    if (failed > 0) {
      return { status: "partial", sessions: syncedIds.length, events, failed };
    }
    return { status: "synced", sessions: syncedIds.length, events };
  };

  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** True when there is anything waiting. Cheap enough to call from a render. */
export function hasPendingSync(): boolean {
  return useTrainingLogStore.getState().pendingSync().length > 0;
}
