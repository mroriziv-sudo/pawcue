import { PLAN_ENGINE_VERSION, type PlanningCatalogue } from "@pawcue/domain";
import {
  buildTodayView,
  regenerationReason,
} from "../src/plans/plan-lifecycle";
import type { StoredPlan } from "../src/plans/plan-repository";

const mockPersist = jest.fn();
const mockFetchActive = jest.fn();
jest.mock("../src/plans/plan-repository", () => ({
  persistGeneratedPlan: (...args: unknown[]) => mockPersist(...args),
  fetchActivePlan: (...args: unknown[]) => mockFetchActive(...args),
  loadPlanningCatalogue: jest.fn(),
}));

import {
  usePlanStore,
  resetPlanLifecycleGuards,
} from "../src/state/plan-store";
import { useTrainingLogStore } from "../src/state/training-log-store";
import {
  activePlansFor,
  createFakePlanBackend,
  fakeFetchActive,
  fakePersist,
} from "./support/fake-plan-backend";

/**
 * The daily plan's lifecycle.
 *
 * Today consumes the Phase 5 persisted plan rather than regenerating from live history on every visit. What
 * matters is that a plan is created **once**, reused until a rule says otherwise, and never duplicated — so these
 * assert how many plans exist and how many writes happened, not what the plan contains.
 *
 * The fake backend enforces `training_plans_one_active_per_dog`, so a duplicate-generation bug fails here rather
 * than surviving until it hits Postgres.
 */

const TS = "2026-09-11T10:00:00.000Z";
const base = { createdAt: TS, updatedAt: TS };
const ID = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const TODAY = "2026-09-12";

const SKILL = { name: ID(1), sit: ID(2) };
const LESSON = { nameGame: ID(10), sit: ID(11) };

const CATALOGUE: PlanningCatalogue = {
  skills: [
    {
      id: SKILL.name,
      slug: "name_response",
      titleKey: "",
      prerequisiteSkillIds: [],
      difficulty: 1,
      ...base,
    },
    {
      id: SKILL.sit,
      slug: "sit",
      titleKey: "",
      prerequisiteSkillIds: [],
      difficulty: 1,
      ...base,
    },
  ] as PlanningCatalogue["skills"],
  lessons: [
    mkLesson(LESSON.nameGame, "name_game", SKILL.name),
    mkLesson(LESSON.sit, "sit", SKILL.sit),
  ],
};

function mkLesson(id: string, slug: string, skillId: string) {
  return {
    id,
    slug,
    skillId,
    titleKey: `lesson.${slug}.title`,
    goalKey: `lesson.${slug}.goal`,
    estimatedMinutes: 3,
    equipment: [],
    difficulty: 1,
    prerequisiteSkillIds: [],
    isAlwaysFree: true,
    contentVersionId: ID(900),
    ...base,
  };
}

const DOG = {
  id: ID(500),
  owner: { kind: "user" as const, userId: ID(501) },
  name: "Libi",
  birthdate: "2024-03-15",
  breed: null,
  sex: "female" as const,
  photoUrl: null,
  dailyTrainingMinutes: 20 as const,
  ...base,
};

const backend = createFakePlanBackend();

function storedPlan(overrides: Partial<StoredPlan> = {}): StoredPlan {
  return {
    id: "plan-1",
    dogId: DOG.id,
    engineVersion: PLAN_ENGINE_VERSION,
    status: "active",
    dailyMinutes: 20,
    startDate: TODAY,
    lengthDays: 1,
    days: [
      {
        dayIndex: 0,
        date: TODAY,
        totalMinutes: 3,
        activities: [
          {
            lessonId: LESSON.nameGame,
            sortOrder: 0,
            estimatedMinutes: 3,
            isReview: false,
            selectionReason: "new_skill",
          },
        ],
      },
    ],
    ...overrides,
  };
}

function validity(
  overrides: Parameters<typeof regenerationReason>[0]["plan"] extends never
    ? never
    : Partial<Parameters<typeof regenerationReason>[0]> = {},
) {
  return regenerationReason({
    plan: storedPlan(),
    catalogue: CATALOGUE,
    engineVersion: PLAN_ENGINE_VERSION,
    today: TODAY,
    dailyMinutes: 20,
    ...overrides,
  });
}

async function visitToday() {
  await usePlanStore.getState().ensurePlanForToday({
    dog: DOG,
    catalogue: CATALOGUE,
    activeSession: null,
    today: TODAY,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  backend.reset();
  resetPlanLifecycleGuards();
  usePlanStore.getState().clear();
  useTrainingLogStore.setState({ completed: [], hydrated: true });

  mockPersist.mockImplementation((generated, version) => {
    fakePersist(backend, generated, version);
    return Promise.resolve({
      planId: "p",
      engineVersionId: "v",
      dayCount: 1,
      activityCount: 1,
    });
  });
  mockFetchActive.mockImplementation((dogId: string) =>
    Promise.resolve(fakeFetchActive(backend, dogId)),
  );
});

describe("when a plan may be reused", () => {
  it("reuses a valid plan for today", () => {
    expect(validity()).toBeNull();
  });

  it("regenerates when nothing is stored", () => {
    expect(validity({ plan: null })).toBe("no_active_plan");
  });

  it("regenerates when the stored plan is no longer active", () => {
    expect(validity({ plan: storedPlan({ status: "superseded" }) })).toBe(
      "no_active_plan",
    );
  });

  it("regenerates when the engine rules changed", () => {
    // A plan is always read against the engine that produced it; presenting old reasoning as current would be a
    // quiet lie about why a lesson was chosen.
    expect(validity({ plan: storedPlan({ engineVersion: "0.9.0" }) })).toBe(
      "engine_version_changed",
    );
  });

  it("regenerates when the day has passed", () => {
    // Also what stops a plan being shown forever.
    expect(validity({ today: "2026-09-13" })).toBe("no_day_for_today");
  });

  it("regenerates when the dog's training time changed", () => {
    expect(validity({ dailyMinutes: 5 })).toBe("daily_minutes_changed");
  });

  it("regenerates when it references content that no longer exists", () => {
    const withoutNameGame: PlanningCatalogue = {
      skills: CATALOGUE.skills,
      lessons: CATALOGUE.lessons.filter((l) => l.id !== LESSON.nameGame),
    };
    expect(validity({ catalogue: withoutNameGame })).toBe("lesson_unavailable");
  });
});

describe("visiting Today", () => {
  it("generates and persists exactly one plan on the first visit", async () => {
    await visitToday();

    expect(backend.persistCalls).toBe(1);
    expect(activePlansFor(backend, DOG.id)).toHaveLength(1);
    expect(usePlanStore.getState().status).toBe("ready");
  });

  it("writes nothing on repeat visits", async () => {
    await visitToday();
    const writesAfterFirst = backend.persistCalls;

    await visitToday();
    await visitToday();

    expect(backend.persistCalls).toBe(writesAfterFirst);
    expect(activePlansFor(backend, DOG.id)).toHaveLength(1);
  });

  it("does not generate twice when two visits race", async () => {
    // Two screens mounting together, or an effect re-firing. The loser would still have superseded the winner.
    await Promise.all([visitToday(), visitToday(), visitToday()]);

    expect(backend.persistCalls).toBe(1);
    expect(activePlansFor(backend, DOG.id)).toHaveLength(1);
  });

  it("restores the same plan after a relaunch", async () => {
    await visitToday();
    const planId = usePlanStore.getState().plan?.id;

    // Simulates a cold start: in-memory state gone, the row remains.
    usePlanStore.getState().clear();
    resetPlanLifecycleGuards();
    await visitToday();

    expect(usePlanStore.getState().plan?.id).toBe(planId);
    expect(backend.persistCalls).toBe(1);
  });

  it("preserves the engine version that produced the plan", async () => {
    await visitToday();
    expect(usePlanStore.getState().plan?.engineVersion).toBe(
      PLAN_ENGINE_VERSION,
    );
  });

  it("replaces rather than accumulates when a rule forces regeneration", async () => {
    await visitToday();

    // A new day: the stored plan has no day for it.
    usePlanStore.getState().clear();
    resetPlanLifecycleGuards();
    await usePlanStore.getState().ensurePlanForToday({
      dog: DOG,
      catalogue: CATALOGUE,
      activeSession: null,
      today: "2026-09-13",
    });

    expect(backend.persistCalls).toBe(2);
    // The old one is superseded, never left active alongside the new one.
    expect(activePlansFor(backend, DOG.id)).toHaveLength(1);
    expect(backend.rows.filter((r) => r.status === "superseded")).toHaveLength(
      1,
    );
  });

  it("reports unavailable rather than inventing an unpersisted plan", async () => {
    backend.failPersist = true;

    await visitToday();

    // An in-memory-only plan would be a second model: invisible elsewhere and gone on relaunch.
    expect(usePlanStore.getState().plan).toBeNull();
    expect(usePlanStore.getState().status).toBe("unavailable");
  });
});

describe("what Today renders from the stored plan", () => {
  const plan = storedPlan({
    days: [
      {
        dayIndex: 0,
        date: TODAY,
        totalMinutes: 6,
        activities: [
          {
            lessonId: LESSON.nameGame,
            sortOrder: 0,
            estimatedMinutes: 3,
            isReview: false,
            selectionReason: "new_skill",
          },
          {
            lessonId: LESSON.sit,
            sortOrder: 1,
            estimatedMinutes: 3,
            isReview: false,
            selectionReason: "new_skill",
          },
        ],
      },
    ],
  });

  it("shows the day's activities in order", () => {
    const view = buildTodayView(plan, CATALOGUE, [], TODAY);
    expect(view.activities.map((a) => a.lessonSlug)).toEqual([
      "name_game",
      "sit",
    ]);
    expect(view.remainingMinutes).toBe(6);
  });

  it("ticks off an activity completed today without rebuilding the plan", () => {
    const view = buildTodayView(
      plan,
      CATALOGUE,
      [{ lessonId: LESSON.nameGame, endedAt: `${TODAY}T09:00:00.000Z` }],
      TODAY,
    );

    expect(view.activities[0]?.done).toBe(true);
    expect(view.activities[1]?.done).toBe(false);
    // The plan still lists both — finishing one is progress through it, not a new plan.
    expect(view.activities).toHaveLength(2);
    expect(view.remainingMinutes).toBe(3);
    expect(view.allDone).toBe(false);
  });

  it("reports the day finished once every activity is done", () => {
    const view = buildTodayView(
      plan,
      CATALOGUE,
      [
        { lessonId: LESSON.nameGame, endedAt: `${TODAY}T09:00:00.000Z` },
        { lessonId: LESSON.sit, endedAt: `${TODAY}T09:30:00.000Z` },
      ],
      TODAY,
    );

    expect(view.allDone).toBe(true);
    expect(view.remainingMinutes).toBe(0);
  });

  it("does not tick off an activity completed on an earlier day", () => {
    // Finishing the same lesson last week is not today's copy of it.
    const view = buildTodayView(
      plan,
      CATALOGUE,
      [{ lessonId: LESSON.nameGame, endedAt: "2026-09-05T09:00:00.000Z" }],
      TODAY,
    );

    expect(view.activities[0]?.done).toBe(false);
  });

  it("omits an activity whose lesson has vanished rather than rendering a blank row", () => {
    const withoutSit: PlanningCatalogue = {
      skills: CATALOGUE.skills,
      lessons: CATALOGUE.lessons.filter((l) => l.id !== LESSON.sit),
    };

    const view = buildTodayView(plan, withoutSit, [], TODAY);
    expect(view.activities.map((a) => a.lessonSlug)).toEqual(["name_game"]);
  });

  it("shows nothing for a day the plan does not cover", () => {
    const view = buildTodayView(plan, CATALOGUE, [], "2026-09-13");
    expect(view.activities).toEqual([]);
  });
});
