import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTrainingLogStore } from "../src/state/training-log-store";
import { STORAGE_KEYS } from "../src/lib/storage";

/**
 * Server sync of locally completed training.
 *
 * This closes the boundary Phase 3 left open. What matters is not that a happy path works but that **nothing is
 * ever lost or duplicated**: the local copy is the only copy until the server confirms it, and every write must
 * survive being replayed after a crash, a dropped response, or an offline stretch.
 *
 * The Supabase client is faked at the module boundary so upserts, failures and partial failures can be driven
 * deliberately. The assertions are about what was written and what survived locally — not about how.
 */

interface UpsertCall {
  table: string;
  rows: Record<string, unknown>[];
  options: { onConflict?: string; ignoreDuplicates?: boolean } | undefined;
}

const mockCalls: UpsertCall[] = [];
/** Tables set here reject, so partial failure can be exercised at a chosen point. */
const mockFailing = new Set<string>();

jest.mock("../src/lib/supabase", () => ({
  requireSupabase: () => ({
    from: (table: string) => ({
      upsert: (
        rows: Record<string, unknown> | Record<string, unknown>[],
        options?: { onConflict?: string; ignoreDuplicates?: boolean },
      ) => {
        const list = Array.isArray(rows) ? rows : [rows];
        mockCalls.push({ table, rows: list, options });
        if (mockFailing.has(table)) {
          return Promise.resolve({
            error: { message: `${table} unavailable` },
          });
        }
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

import { syncPendingSessions } from "../src/sync/session-sync";

const DOG = "00000000-0000-4000-a000-0000000000d1";

function completedRecord(index: number) {
  const id = `00000000-0000-4000-a000-${String(index).padStart(12, "0")}`;
  return {
    sessionId: id,
    lessonId: "00000000-0000-4000-a000-000000000001",
    lessonSlug: "name_game",
    startedAt: "2026-09-11T10:00:00.000Z",
    endedAt: "2026-09-11T10:03:00.000Z",
    status: "completed" as const,
    stepsCompleted: 4,
    repetitionsLogged: 5,
    clickerPresses: 1,
    troubleshootingViewed: 0,
    syncedToServer: false,
    events: [
      {
        id: `${id.slice(0, -1)}a`,
        type: "step_advanced" as const,
        lessonStepId: null,
        troubleshootingOptionId: null,
        occurredAt: "2026-09-11T10:01:00.000Z",
      },
      {
        id: `${id.slice(0, -1)}b`,
        type: "session_completed" as const,
        lessonStepId: null,
        troubleshootingOptionId: null,
        occurredAt: "2026-09-11T10:03:00.000Z",
      },
    ],
  };
}

function rowsFor(table: string) {
  return mockCalls
    .filter((call) => call.table === table)
    .flatMap((c) => c.rows);
}

beforeEach(async () => {
  mockCalls.length = 0;
  mockFailing.clear();
  await AsyncStorage.clear();
  useTrainingLogStore.setState({ completed: [], hydrated: true });
});

describe("with nothing to do", () => {
  it("does not write when there is no dog yet", async () => {
    useTrainingLogStore.setState({ completed: [completedRecord(1)] });

    // This is the Phase 3 state: training exists, but training_sessions.dog_id is NOT NULL.
    expect(await syncPendingSessions(null)).toEqual({ status: "no_dog" });
    expect(mockCalls).toHaveLength(0);
  });

  it("does not write when the queue is empty", async () => {
    expect(await syncPendingSessions(DOG)).toEqual({
      status: "nothing_to_sync",
    });
    expect(mockCalls).toHaveLength(0);
  });
});

describe("flushing a queued session", () => {
  it("writes the session and its events, then marks it synced", async () => {
    useTrainingLogStore.setState({ completed: [completedRecord(1)] });

    const outcome = await syncPendingSessions(DOG);

    expect(outcome).toEqual({ status: "synced", sessions: 1, events: 2 });
    expect(rowsFor("training_sessions")[0]).toMatchObject({
      id: completedRecord(1).sessionId,
      dog_id: DOG,
      status: "completed",
    });
    expect(rowsFor("session_events")).toHaveLength(2);

    const record = useTrainingLogStore.getState().completed[0];
    expect(record?.syncedToServer).toBe(true);
    // The events are released only now that the server holds them.
    expect(record?.events).toBeUndefined();
  });

  it("writes the session before its events, because of the foreign key", async () => {
    useTrainingLogStore.setState({ completed: [completedRecord(1)] });
    await syncPendingSessions(DOG);

    expect(mockCalls.map((call) => call.table)).toEqual([
      "training_sessions",
      "session_events",
    ]);
  });

  it("keys every write on the client-generated id", async () => {
    useTrainingLogStore.setState({ completed: [completedRecord(1)] });
    await syncPendingSessions(DOG);

    // The idempotency key the whole offline design rests on (ARCHITECTURE.md §8).
    for (const call of mockCalls) {
      expect(call.options?.onConflict).toBe("id");
    }
    expect(
      mockCalls.find((c) => c.table === "session_events")?.options
        ?.ignoreDuplicates,
    ).toBe(true);
  });
});

describe("retrying", () => {
  it("is a no-op once a session is already synced", async () => {
    useTrainingLogStore.setState({ completed: [completedRecord(1)] });
    await syncPendingSessions(DOG);
    mockCalls.length = 0;

    const second = await syncPendingSessions(DOG);

    expect(second).toEqual({ status: "nothing_to_sync" });
    expect(mockCalls).toHaveLength(0);
  });

  it("never writes the same event twice across repeated runs", async () => {
    useTrainingLogStore.setState({ completed: [completedRecord(1)] });
    await syncPendingSessions(DOG);
    await syncPendingSessions(DOG);
    await syncPendingSessions(DOG);

    const eventIds = rowsFor("session_events").map((row) => row.id);
    expect(eventIds).toHaveLength(2);
    expect(new Set(eventIds).size).toBe(2);
  });

  it("does not run two flushes at once", async () => {
    useTrainingLogStore.setState({ completed: [completedRecord(1)] });

    // A foreground event and a manual retry can easily coincide; both must not write.
    const [a, b] = await Promise.all([
      syncPendingSessions(DOG),
      syncPendingSessions(DOG),
    ]);

    expect(a).toEqual(b);
    expect(rowsFor("training_sessions")).toHaveLength(1);
  });
});

describe("partial failure", () => {
  it("keeps a session queued when its events could not be written", async () => {
    useTrainingLogStore.setState({ completed: [completedRecord(1)] });
    mockFailing.add("session_events");

    const outcome = await syncPendingSessions(DOG);

    expect(outcome).toMatchObject({ status: "partial", failed: 1 });
    const record = useTrainingLogStore.getState().completed[0];
    // Not marked synced, and crucially the events are still here — local data must not disappear before the
    // server confirms it holds them.
    expect(record?.syncedToServer).toBe(false);
    expect(record?.events).toHaveLength(2);
  });

  it("recovers completely on the next run once the failure clears", async () => {
    useTrainingLogStore.setState({ completed: [completedRecord(1)] });
    mockFailing.add("session_events");
    await syncPendingSessions(DOG);

    mockFailing.clear();
    const outcome = await syncPendingSessions(DOG);

    expect(outcome).toEqual({ status: "synced", sessions: 1, events: 2 });
    expect(useTrainingLogStore.getState().completed[0]?.syncedToServer).toBe(
      true,
    );
  });

  it("loses nothing when the whole queue fails and then recovers", async () => {
    useTrainingLogStore.setState({
      completed: [completedRecord(1), completedRecord(2)],
    });

    mockFailing.add("training_sessions");
    const first = await syncPendingSessions(DOG);
    expect(first).toMatchObject({ status: "partial", sessions: 0, failed: 2 });
    // Both are still queued, with their payloads intact.
    expect(useTrainingLogStore.getState().pendingSync()).toHaveLength(2);

    mockFailing.clear();
    const second = await syncPendingSessions(DOG);
    expect(second).toMatchObject({ status: "synced", sessions: 2 });
    expect(useTrainingLogStore.getState().pendingSync()).toHaveLength(0);
  });
});

describe("surviving a process restart", () => {
  it("still holds the events after the app is relaunched mid-queue", async () => {
    const record = completedRecord(1);
    await AsyncStorage.setItem(
      STORAGE_KEYS.completedSessions,
      JSON.stringify([record]),
    );

    // Simulates a cold start: in-memory state is gone, only storage remains.
    useTrainingLogStore.setState({ completed: [], hydrated: false });
    await useTrainingLogStore.getState().hydrate();

    const pending = useTrainingLogStore.getState().pendingSync();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.events).toHaveLength(2);

    const outcome = await syncPendingSessions(DOG);
    expect(outcome).toEqual({ status: "synced", sessions: 1, events: 2 });
  });

  it("does not resend a session that was confirmed before the restart", async () => {
    const record = {
      ...completedRecord(1),
      syncedToServer: true,
      events: undefined,
    };
    await AsyncStorage.setItem(
      STORAGE_KEYS.completedSessions,
      JSON.stringify([record]),
    );
    useTrainingLogStore.setState({ completed: [], hydrated: false });
    await useTrainingLogStore.getState().hydrate();

    expect(await syncPendingSessions(DOG)).toEqual({
      status: "nothing_to_sync",
    });
    expect(mockCalls).toHaveLength(0);
  });

  it("reads a record written before abandonment and events existed", async () => {
    // Older builds stored `completedAt`, no `status`, and no events. Such a record is a completed session by
    // construction and must be read forward, not dropped — a user's training history cannot be lost to a schema
    // change.
    const legacy = { ...completedRecord(1) } as Record<string, unknown>;
    delete legacy.events;
    delete legacy.endedAt;
    delete legacy.status;
    legacy.completedAt = "2026-09-11T10:03:00.000Z";
    await AsyncStorage.setItem(
      STORAGE_KEYS.completedSessions,
      JSON.stringify([legacy]),
    );
    useTrainingLogStore.setState({ completed: [], hydrated: false });
    await useTrainingLogStore.getState().hydrate();

    const outcome = await syncPendingSessions(DOG);
    expect(outcome).toEqual({ status: "synced", sessions: 1, events: 0 });
    expect(rowsFor("training_sessions")[0]).toMatchObject({
      status: "completed",
      completed_at: "2026-09-11T10:03:00.000Z",
    });
  });

  it("writes an abandoned attempt as abandoned, with no completion time", async () => {
    useTrainingLogStore.setState({
      completed: [
        {
          ...completedRecord(1),
          status: "abandoned" as const,
          endedAt: "2026-09-11T10:02:00.000Z",
        },
      ],
    });

    await syncPendingSessions(DOG);

    // `training_sessions.status` has allowed 'abandoned' since Phase 0; writing it as completed would make the
    // row claim something that did not happen.
    expect(rowsFor("training_sessions")[0]).toMatchObject({
      status: "abandoned",
      completed_at: null,
    });
  });
});
