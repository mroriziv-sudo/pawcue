import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  RulesBasedTrainingPlanGenerator,
  type PlanningCatalogue,
} from "@pawcue/domain";
import { useSessionStore } from "../src/state/session-store";
import { useTrainingLogStore } from "../src/state/training-log-store";
import { buildPlanInput } from "../src/plans/plan-inputs";
import { STORAGE_KEYS } from "../src/lib/storage";
import { makeLessonFixture, LESSON_IDS } from "./support/lesson-fixture";

/**
 * The whole path from real app data to `continue_unfinished`.
 *
 * The gap this closes: `continue_unfinished` is the planner's highest-priority rule, and nothing in the product
 * ever produced an abandoned session. `abandonSession` existed on the engine and on the store, the database had
 * allowed the status since Phase 0 — but no code path called it, and the local log rejected anything that was not
 * completed. The rule was fully implemented, fully tested in the domain, and unreachable in practice.
 *
 * These drive the real stores end to end rather than hand-building history, because a fixture would have passed
 * against the broken build too.
 */

const CONTENT = makeLessonFixture();

/** A second lesson, so opening "another lesson" is a real scenario rather than a contrivance. */
const OTHER_LESSON = {
  ...makeLessonFixture(),
  lesson: {
    ...makeLessonFixture().lesson,
    id: "00000000-0000-4000-a000-0000000000f1",
    slug: "sit",
    skillId: "00000000-0000-4000-a000-0000000000f2",
  },
  steps: makeLessonFixture().steps.map((step) => ({
    ...step,
    id: `${step.id.slice(0, -1)}f`,
    lessonId: "00000000-0000-4000-a000-0000000000f1",
  })),
  troubleshooting: [],
};

const CATALOGUE: PlanningCatalogue = {
  skills: [
    {
      id: CONTENT.lesson.skillId,
      slug: "name_response",
      titleKey: "",
      prerequisiteSkillIds: [],
      difficulty: 1,
      createdAt: "2026-09-11T10:00:00.000Z",
      updatedAt: "2026-09-11T10:00:00.000Z",
    },
    {
      id: OTHER_LESSON.lesson.skillId,
      slug: "sit",
      titleKey: "",
      prerequisiteSkillIds: [],
      difficulty: 1,
      createdAt: "2026-09-11T10:00:00.000Z",
      updatedAt: "2026-09-11T10:00:00.000Z",
    },
  ] as PlanningCatalogue["skills"],
  lessons: [CONTENT.lesson, OTHER_LESSON.lesson],
};

const DOG = {
  id: "00000000-0000-4000-a000-0000000000d1",
  owner: {
    kind: "user" as const,
    userId: "00000000-0000-4000-a000-0000000000d2",
  },
  name: "Libi",
  birthdate: "2024-03-15",
  breed: null,
  sex: "female" as const,
  photoUrl: null,
  dailyTrainingMinutes: 20 as const,
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
};

/** Starts the Name Game and makes real progress, exactly as the training screen does. */
function trainPartway() {
  const store = useSessionStore.getState();
  store.begin(CONTENT);
  store.completeStep(CONTENT, LESSON_IDS.step1);
  store.click(CONTENT);
}

/**
 * "Today" is the real clock, because the session store stamps sessions with the real clock.
 *
 * This used to be a fixed date, which passed on the day it was written and failed the day after: a session
 * started "now" was then in the planner's future, and the planner rightly refuses unfinished work from the
 * future. The planner's own date arithmetic is covered with fixed dates in `packages/domain`; here the point is
 * the store → planner hand-off, so both sides must share one clock.
 */
function planNow(today = new Date()) {
  const input = buildPlanInput({
    dog: DOG,
    completed: useTrainingLogStore.getState().completed,
    catalogue: CATALOGUE,
    activeSession: useSessionStore.getState().session,
    today,
    lengthDays: 1,
  });

  const result = new RulesBasedTrainingPlanGenerator(
    CATALOGUE,
  ).generateWithDiagnostics(input);
  return result.generated.days[0]?.activities ?? [];
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useSessionStore.setState({ session: null, lastFailure: null });
  useTrainingLogStore.setState({ completed: [], hydrated: true });
});

describe("a paused lesson", () => {
  it("is offered as work to continue", async () => {
    trainPartway();

    const activities = planNow();

    expect(activities[0]?.lessonId).toBe(CONTENT.lesson.id);
    expect(activities[0]?.selectionReason).toBe("continue_unfinished");
  });

  it("is not offered when the user only opened the lesson and did nothing", () => {
    // Opening a screen is not unfinished work, and nagging about it would be wrong.
    useSessionStore.getState().begin(CONTENT);

    expect(
      planNow().every((a) => a.selectionReason !== "continue_unfinished"),
    ).toBe(true);
  });
});

describe("a lesson displaced by another", () => {
  it("is recorded as abandoned in the persisted history", async () => {
    trainPartway();
    await Promise.resolve();

    // The user opens a different lesson: the first session cannot be resumed into it.
    await useSessionStore.getState().resumeOrBegin(OTHER_LESSON);

    const log = useTrainingLogStore.getState().completed;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      lessonId: CONTENT.lesson.id,
      status: "abandoned",
    });
    expect(log[0]?.endedAt).toBeTruthy();
  });

  it("is then selected as continue_unfinished on the next plan", async () => {
    trainPartway();
    await Promise.resolve();
    await useSessionStore.getState().resumeOrBegin(OTHER_LESSON);

    // The active session is now the other lesson; the abandoned one comes from persisted history alone.
    const activities = planNow();

    const unfinished = activities.find(
      (a) => a.selectionReason === "continue_unfinished",
    );
    expect(unfinished?.lessonId).toBe(CONTENT.lesson.id);
  });

  it("records only the latest attempt when the same lesson is dropped twice", async () => {
    trainPartway();
    await Promise.resolve();
    await useSessionStore.getState().resumeOrBegin(OTHER_LESSON);

    trainPartway();
    await Promise.resolve();
    await useSessionStore.getState().resumeOrBegin(OTHER_LESSON);

    // Keeping every attempt would grow the log without telling the planner anything new.
    const abandoned = useTrainingLogStore
      .getState()
      .completed.filter((r) => r.status === "abandoned");
    expect(abandoned).toHaveLength(1);
  });

  it("does not archive a session that was already completed", async () => {
    const store = useSessionStore.getState();
    store.begin(CONTENT);
    store.completeStep(CONTENT, LESSON_IDS.step1);
    store.click(CONTENT);
    store.completeStep(CONTENT, LESSON_IDS.step2Clicker);
    store.completeStep(CONTENT, LESSON_IDS.step3);
    for (let i = 0; i < 5; i += 1) store.addRepetition(CONTENT);
    store.completeStep(CONTENT, LESSON_IDS.step4Reps);
    await Promise.resolve();

    await useSessionStore.getState().resumeOrBegin(OTHER_LESSON);

    // It has a record already, and it is not unfinished.
    expect(
      useTrainingLogStore
        .getState()
        .completed.filter((r) => r.status === "abandoned"),
    ).toHaveLength(0);
  });
});

describe("a later completion supersedes the abandonment", () => {
  it("stops the lesson being treated as unfinished", async () => {
    trainPartway();
    await Promise.resolve();
    await useSessionStore.getState().resumeOrBegin(OTHER_LESSON);
    expect(
      planNow().some((a) => a.selectionReason === "continue_unfinished"),
    ).toBe(true);

    // The user comes back and finishes it the next day.
    useSessionStore.setState({ session: null });
    await AsyncStorage.removeItem(STORAGE_KEYS.activeSession);
    const store = useSessionStore.getState();
    store.begin(CONTENT);
    store.completeStep(CONTENT, LESSON_IDS.step1);
    store.click(CONTENT);
    store.completeStep(CONTENT, LESSON_IDS.step2Clicker);
    store.completeStep(CONTENT, LESSON_IDS.step3);
    for (let i = 0; i < 5; i += 1) store.addRepetition(CONTENT);
    store.completeStep(CONTENT, LESSON_IDS.step4Reps);
    await useTrainingLogStore
      .getState()
      .record(useSessionStore.getState().session!);
    useSessionStore.setState({ session: null });

    const activities = planNow(new Date(Date.now() + 86_400_000));

    expect(
      activities.every((a) => a.selectionReason !== "continue_unfinished"),
    ).toBe(true);
    expect(activities.every((a) => a.lessonId !== CONTENT.lesson.id)).toBe(
      true,
    );
  });

  it("keeps both records, because both happened", async () => {
    trainPartway();
    await Promise.resolve();
    await useSessionStore.getState().resumeOrBegin(OTHER_LESSON);

    useSessionStore.setState({ session: null });
    const store = useSessionStore.getState();
    store.begin(CONTENT);
    store.completeStep(CONTENT, LESSON_IDS.step1);
    store.click(CONTENT);
    store.completeStep(CONTENT, LESSON_IDS.step2Clicker);
    store.completeStep(CONTENT, LESSON_IDS.step3);
    for (let i = 0; i < 5; i += 1) store.addRepetition(CONTENT);
    store.completeStep(CONTENT, LESSON_IDS.step4Reps);
    await useTrainingLogStore
      .getState()
      .record(useSessionStore.getState().session!);

    const forLesson = useTrainingLogStore
      .getState()
      .completed.filter((r) => r.lessonId === CONTENT.lesson.id);
    expect(forLesson.map((r) => r.status).sort()).toEqual([
      "abandoned",
      "completed",
    ]);
  });
});

describe("surviving a relaunch", () => {
  it("keeps the abandoned record and does not duplicate it", async () => {
    trainPartway();
    await Promise.resolve();
    await useSessionStore.getState().resumeOrBegin(OTHER_LESSON);
    await Promise.resolve();

    // Simulates a cold start: in-memory state is gone, only storage remains.
    useTrainingLogStore.setState({ completed: [], hydrated: false });
    await useTrainingLogStore.getState().hydrate();

    const log = useTrainingLogStore.getState().completed;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ status: "abandoned" });
  });

  it("still plans continue_unfinished after the relaunch", async () => {
    trainPartway();
    await Promise.resolve();
    await useSessionStore.getState().resumeOrBegin(OTHER_LESSON);
    await Promise.resolve();

    useTrainingLogStore.setState({ completed: [], hydrated: false });
    await useTrainingLogStore.getState().hydrate();
    useSessionStore.setState({ session: null });

    const activities = planNow();
    expect(activities[0]?.selectionReason).toBe("continue_unfinished");
  });

  it("reads a record written before abandonment existed as a completion", async () => {
    // A user upgrading from an earlier build must not lose their training history to the schema change.
    await AsyncStorage.setItem(
      STORAGE_KEYS.completedSessions,
      JSON.stringify([
        {
          sessionId: "legacy-1",
          lessonId: CONTENT.lesson.id,
          lessonSlug: "name_game",
          startedAt: "2026-09-01T10:00:00.000Z",
          completedAt: "2026-09-01T10:05:00.000Z",
          stepsCompleted: 4,
          repetitionsLogged: 5,
          clickerPresses: 1,
          troubleshootingViewed: 0,
          syncedToServer: true,
        },
      ]),
    );

    useTrainingLogStore.setState({ completed: [], hydrated: false });
    await useTrainingLogStore.getState().hydrate();

    const log = useTrainingLogStore.getState().completed;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      status: "completed",
      endedAt: "2026-09-01T10:05:00.000Z",
    });
  });
});
