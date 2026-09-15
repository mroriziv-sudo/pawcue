import AsyncStorage from "@react-native-async-storage/async-storage";
import { SESSION_ENGINE_VERSION } from "@pawcue/domain";
import { useSessionStore } from "../src/state/session-store";
import { useTrainingLogStore } from "../src/state/training-log-store";
import { STORAGE_KEYS } from "../src/lib/storage";
import { makeLessonFixture, LESSON_IDS } from "./support/lesson-fixture";

/**
 * Session persistence and resume.
 *
 * The engine's own rules are covered in `@pawcue/domain`. What is tested here is the part the engine cannot see:
 * that a session is actually written down, that it comes back intact, and that anything untrustworthy on disk is
 * discarded rather than resumed into.
 */

const content = makeLessonFixture();

async function readPersisted(): Promise<unknown> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.activeSession);
  return raw ? JSON.parse(raw) : null;
}

/** Drives a fresh session to the repetition step, satisfying the clicker step on the way. */
async function toRepetitionStep() {
  const store = useSessionStore.getState();
  store.begin(content);
  store.completeStep(content, LESSON_IDS.step1);
  store.click(content);
  store.completeStep(content, LESSON_IDS.step2Clicker);
  store.completeStep(content, LESSON_IDS.step3);
  // Persistence writes are fire-and-forget; let them land before asserting on storage.
  await Promise.resolve();
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useSessionStore.setState({ session: null, lastFailure: null });
  useTrainingLogStore.setState({ completed: [], hydrated: false });
});

describe("starting and persisting", () => {
  it("writes the session to storage as soon as it starts", async () => {
    useSessionStore.getState().begin(content);
    await Promise.resolve();

    const persisted = await readPersisted();
    expect(persisted).toMatchObject({
      lessonSlug: "name_game",
      status: "in_progress",
      currentStepId: LESSON_IDS.step1,
      engineVersion: SESSION_ENGINE_VERSION,
    });
  });

  it("persists progress after each transition", async () => {
    await toRepetitionStep();

    expect(await readPersisted()).toMatchObject({
      currentStepId: LESSON_IDS.step4Reps,
      completedStepIds: [
        LESSON_IDS.step1,
        LESSON_IDS.step2Clicker,
        LESSON_IDS.step3,
      ],
    });
  });

  it("generates session event ids that pass strict UUID validation", async () => {
    // The ids are idempotency keys for offline replay, and the domain schema validates them strictly, so a weak
    // generator would only surface when a session was restored.
    useSessionStore.getState().begin(content);
    useSessionStore.getState().completeStep(content, LESSON_IDS.step1);

    const session = useSessionStore.getState().session;
    expect(session?.events.length).toBeGreaterThan(0);
    for (const event of session?.events ?? []) {
      expect(event.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });
});

describe("resuming", () => {
  it("comes back to the same step after the store is torn down", async () => {
    await toRepetitionStep();
    useSessionStore.getState().addRepetition(content);
    await Promise.resolve();

    // Simulates a process restart: in-memory state is gone, only storage remains.
    useSessionStore.setState({ session: null, lastFailure: null });
    await useSessionStore.getState().resumeOrBegin(content);

    const resumed = useSessionStore.getState().session;
    expect(resumed?.currentStepId).toBe(LESSON_IDS.step4Reps);
    expect(resumed?.completedStepIds).toHaveLength(3);
    expect(resumed?.repetitionsByStep[LESSON_IDS.step4Reps]).toBe(1);
  });

  it("starts a fresh session when nothing is stored", async () => {
    await useSessionStore.getState().resumeOrBegin(content);

    expect(useSessionStore.getState().session).toMatchObject({
      currentStepId: LESSON_IDS.step1,
      completedStepIds: [],
    });
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["a JSON value that is not a session", '"hello"'],
    ["an object missing required fields", '{"sessionId":"x"}'],
  ])(
    "starts fresh and clears storage when persisted state is %s",
    async (_label, stored) => {
      await AsyncStorage.setItem(STORAGE_KEYS.activeSession, stored);

      await useSessionStore.getState().resumeOrBegin(content);

      const session = useSessionStore.getState().session;
      expect(session?.currentStepId).toBe(LESSON_IDS.step1);
      expect(session?.status).toBe("in_progress");
    },
  );

  it("does not resume a session belonging to a different lesson", async () => {
    await toRepetitionStep();
    const stored = (await readPersisted()) as Record<string, unknown>;
    await AsyncStorage.setItem(
      STORAGE_KEYS.activeSession,
      JSON.stringify({
        ...stored,
        lessonId: "00000000-0000-4000-a000-000000000999",
      }),
    );
    useSessionStore.setState({ session: null });

    await useSessionStore.getState().resumeOrBegin(content);

    // Fresh, not resumed into a lesson the stored progress does not describe.
    expect(useSessionStore.getState().session?.currentStepId).toBe(
      LESSON_IDS.step1,
    );
  });

  it("does not resume a session written by an older engine", async () => {
    await toRepetitionStep();
    const stored = (await readPersisted()) as Record<string, unknown>;
    await AsyncStorage.setItem(
      STORAGE_KEYS.activeSession,
      JSON.stringify({ ...stored, engineVersion: SESSION_ENGINE_VERSION - 1 }),
    );
    useSessionStore.setState({ session: null });

    await useSessionStore.getState().resumeOrBegin(content);

    expect(useSessionStore.getState().session?.completedStepIds).toEqual([]);
  });

  it("does not resume a completed session", async () => {
    const store = useSessionStore.getState();
    store.begin(content);
    store.completeStep(content, LESSON_IDS.step1);
    store.click(content);
    store.completeStep(content, LESSON_IDS.step2Clicker);
    store.completeStep(content, LESSON_IDS.step3);
    // Step 4 declares the click as well as the count: each repetition contains it.
    store.click(content);
    for (let i = 0; i < 5; i += 1) store.addRepetition(content);
    store.completeStep(content, LESSON_IDS.step4Reps);
    await Promise.resolve();
    expect(useSessionStore.getState().session?.status).toBe("completed");

    useSessionStore.setState({ session: null });
    await useSessionStore.getState().resumeOrBegin(content);

    expect(useSessionStore.getState().session?.status).toBe("in_progress");
    expect(useSessionStore.getState().session?.completedStepIds).toEqual([]);
  });
});

describe("rejected transitions", () => {
  it("leaves stored progress untouched when a transition is refused", async () => {
    await toRepetitionStep();
    const before = await readPersisted();

    // The repetition step is not satisfied yet, so advancing must be refused.
    useSessionStore.getState().completeStep(content, LESSON_IDS.step4Reps);
    await Promise.resolve();

    expect(useSessionStore.getState().lastFailure).toBe(
      "step_requirements_unmet",
    );
    expect(await readPersisted()).toEqual(before);
  });

  it("refuses to complete a step that is not current", async () => {
    useSessionStore.getState().begin(content);

    useSessionStore.getState().completeStep(content, LESSON_IDS.step3);

    expect(useSessionStore.getState().lastFailure).toBe("not_current_step");
    expect(useSessionStore.getState().session?.currentStepId).toBe(
      LESSON_IDS.step1,
    );
  });
});

describe("troubleshooting", () => {
  it("does not disturb progress", async () => {
    await toRepetitionStep();
    useSessionStore.getState().addRepetition(content);
    useSessionStore.getState().addRepetition(content);

    useSessionStore
      .getState()
      .viewTroubleshooting(content, LESSON_IDS.troubleDistracted);
    useSessionStore
      .getState()
      .closeTroubleshooting(content, LESSON_IDS.troubleDistracted);
    await Promise.resolve();

    const session = useSessionStore.getState().session;
    expect(session?.currentStepId).toBe(LESSON_IDS.step4Reps);
    expect(session?.repetitionsByStep[LESSON_IDS.step4Reps]).toBe(2);
    expect(session?.completedStepIds).toHaveLength(3);
  });
});

describe("the completion log", () => {
  it("records a completed session once, and marks it unsynced", async () => {
    const store = useSessionStore.getState();
    store.begin(content);
    store.completeStep(content, LESSON_IDS.step1);
    store.click(content);
    store.completeStep(content, LESSON_IDS.step2Clicker);
    store.completeStep(content, LESSON_IDS.step3);
    // Step 4 declares the click as well as the count: each repetition contains it.
    store.click(content);
    for (let i = 0; i < 5; i += 1) store.addRepetition(content);
    store.completeStep(content, LESSON_IDS.step4Reps);

    const completed = useSessionStore.getState().session;
    expect(completed?.status).toBe("completed");

    await useTrainingLogStore.getState().record(completed!);
    await useTrainingLogStore.getState().record(completed!);

    const log = useTrainingLogStore.getState().completed;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      lessonSlug: "name_game",
      stepsCompleted: 4,
      repetitionsLogged: 5,
      // One click on step 2 and one on step 4, counted apart from the five reps.
      clickerPresses: 2,
      // Phase 3 keeps completions local: training_sessions.dog_id is NOT NULL and a guest has no dog.
      syncedToServer: false,
    });
    expect(useTrainingLogStore.getState().pendingSync()).toHaveLength(1);
  });

  it("ignores a session that has not been completed", async () => {
    useSessionStore.getState().begin(content);
    await useTrainingLogStore
      .getState()
      .record(useSessionStore.getState().session!);

    expect(useTrainingLogStore.getState().completed).toHaveLength(0);
  });

  it("drops a malformed persisted log rather than partially recovering it", async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.completedSessions, '[{"bad":1}]');

    await useTrainingLogStore.getState().hydrate();

    expect(useTrainingLogStore.getState().completed).toEqual([]);
    expect(useTrainingLogStore.getState().hydrated).toBe(true);
  });
});
