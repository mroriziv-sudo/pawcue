import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import type { TrainingSessionState } from "@pawcue/domain";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TodayScreen from "../app/(tabs)/index";
import TrainScreen from "../app/(tabs)/train";
import LessonOverviewScreen from "../app/lesson/[slug]";
import { i18n } from "../src/i18n";
import { useDogStore } from "../src/state/dog-store";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { useOnboardingStore } from "../src/state/onboarding-store";
import { useSessionStore } from "../src/state/session-store";
import { useTrainingLogStore } from "../src/state/training-log-store";
import { useEntitlementStore } from "../src/state/entitlement-store";
import { resetCatalogueCache } from "../src/lessons/useCatalogue";
import {
  usePlanStore,
  resetPlanLifecycleGuards,
} from "../src/state/plan-store";
import {
  createFakePlanBackend,
  fakeFetchActive,
  fakePersist,
} from "./support/fake-plan-backend";

/**
 * Premium gating, through the real screens.
 *
 * These assert what a user can actually do: which lessons open, which lead to the paywall, and what is said about
 * the ones that do not open. The two locks are the point — a lesson can be behind a subscription, behind a
 * prerequisite, or behind both, and a user who is told the wrong one will do the wrong thing about it.
 *
 * Nothing here asserts on the entitlement store's shape. The entitlement is set the way the app sets it: the
 * server said so.
 */

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockNavigate = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: jest.fn(),
    back: mockBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
  usePathname: () => "/",
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require("react-native");
    return <Text testID="redirect">{href}</Text>;
  },
}));

let mockSearchParams: { slug?: string } = {};

const mockLoadCatalogue = jest.fn();
const mockPersist = jest.fn();
const mockFetchActive = jest.fn();
jest.mock("../src/plans/plan-repository", () => ({
  loadPlanningCatalogue: () => mockLoadCatalogue(),
  persistGeneratedPlan: (...args: unknown[]) => mockPersist(...args),
  fetchActivePlan: (...args: unknown[]) => mockFetchActive(...args),
}));

const mockLoadLessonContent = jest.fn();
jest.mock("../src/lessons/lesson-repository", () => ({
  loadLessonContent: (slug: string) => mockLoadLessonContent(slug),
}));

const mockFetchDog = jest.fn();
jest.mock("../src/dogs/dog-repository", () => ({
  createDog: jest.fn(),
  fetchDog: () => mockFetchDog(),
  listOwnDogs: jest.fn(),
  updateDog: jest.fn(),
}));

const TS = "2026-09-11T10:00:00.000Z";
const base = { createdAt: TS, updatedAt: TS };
const ID = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

const SKILL = { name: ID(1), sit: ID(2), stay: ID(3) };
const LESSON = { nameGame: ID(10), sit: ID(11), stay: ID(12), place: ID(13) };

function mkLesson(
  id: string,
  slug: string,
  skillId: string,
  keyBase: string,
  minutes: number,
  isAlwaysFree: boolean,
) {
  return {
    id,
    slug,
    skillId,
    titleKey: `${keyBase}.title`,
    goalKey: `${keyBase}.goal`,
    estimatedMinutes: minutes,
    equipment: [],
    difficulty: 1,
    prerequisiteSkillIds: [],
    isAlwaysFree,
    contentVersionId: ID(900),
    ...base,
  };
}

/**
 * Four lessons, chosen to make every combination reachable:
 *
 *   name_game — free, no prerequisite          → always startable
 *   sit       — free, no prerequisite          → always startable
 *   stay      — premium, prerequisite `sit`    → both locks at once
 *   place     — premium, no prerequisite       → the premium lock alone
 */
const CATALOGUE = {
  skills: [
    {
      id: SKILL.name,
      slug: "name_response",
      titleKey: "skill.nameResponse.title",
      prerequisiteSkillIds: [],
      difficulty: 1,
      ...base,
    },
    {
      id: SKILL.sit,
      slug: "sit",
      titleKey: "skill.sit.title",
      prerequisiteSkillIds: [],
      difficulty: 1,
      ...base,
    },
    {
      id: SKILL.stay,
      slug: "stay",
      titleKey: "skill.stay.title",
      prerequisiteSkillIds: [SKILL.sit],
      difficulty: 2,
      ...base,
    },
  ],
  lessons: [
    mkLesson(
      LESSON.nameGame,
      "name_game",
      SKILL.name,
      "lesson.nameGame",
      3,
      true,
    ),
    mkLesson(LESSON.sit, "sit", SKILL.sit, "lesson.sit", 3, true),
    mkLesson(LESSON.stay, "stay", SKILL.stay, "lesson.stay", 4, false),
    mkLesson(LESSON.place, "place", SKILL.name, "lesson.place", 5, false),
  ],
};

const DOG = {
  id: ID(500),
  owner: { kind: "user" as const, userId: ID(501) },
  name: "Libi",
  birthdate: "2024-03-15",
  breed: "Border Collie",
  sex: "female" as const,
  photoUrl: null,
  dailyTrainingMinutes: 20 as const,
  ...base,
};

function record(lessonId: string, endedAt: string) {
  return {
    sessionId: `${lessonId}-${endedAt}`,
    lessonId,
    lessonSlug: "sit",
    startedAt: endedAt,
    endedAt,
    status: "completed" as const,
    stepsCompleted: 4,
    repetitionsLogged: 5,
    clickerPresses: 1,
    troubleshootingViewed: 0,
    syncedToServer: true,
  };
}

const planBackend = createFakePlanBackend();

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderScreen(
  node: React.ReactNode,
  direction: "ltr" | "rtl" = "ltr",
) {
  return await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction={direction}>{node}</ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>,
  );
}

/** Premium, the only way it can happen: the server said so and the view was resolved from that. */
function serverGrantsPremium(): void {
  useEntitlementStore.setState({
    view: {
      status: "premium",
      isPremiumActive: true,
      source: "active",
      expiresAt: "2026-10-12T00:00:00.000Z",
      verifiedAt: TS,
      fromCache: false,
    },
  });
}

function serverSaysFree(): void {
  useEntitlementStore.setState({
    view: {
      status: "free",
      isPremiumActive: false,
      source: null,
      expiresAt: null,
      verifiedAt: TS,
      fromCache: false,
    },
  });
}

function lessonContentFor(slug: string) {
  const lesson = CATALOGUE.lessons.find((l) => l.slug === slug);
  return {
    content: {
      lesson,
      steps: [
        {
          id: ID(700),
          lessonId: lesson?.id,
          stepOrder: 0,
          instructionKey: "lesson.sit.step1",
          requiresClickerPress: false,
          repetitionTarget: null,
          illustrationAssetKey: null,
          ...base,
        },
      ],
      troubleshooting: [],
    },
    source: "network" as const,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetCatalogueCache();
  mockSearchParams = {};
  mockLoadCatalogue.mockResolvedValue(CATALOGUE);
  mockFetchDog.mockResolvedValue(DOG);
  mockLoadLessonContent.mockImplementation((slug: string) =>
    Promise.resolve(lessonContentFor(slug)),
  );

  planBackend.reset();
  resetPlanLifecycleGuards();
  usePlanStore.getState().clear();
  mockPersist.mockImplementation((generated, version) => {
    fakePersist(planBackend, generated, version);
    return Promise.resolve({
      planId: "plan",
      engineVersionId: "v",
      dayCount: 1,
      activityCount: 1,
    });
  });
  mockFetchActive.mockImplementation((dogId: string) =>
    Promise.resolve(fakeFetchActive(planBackend, dogId)),
  );

  useBootstrapStore.setState({ status: "ready" });
  useDogStore.setState({
    dog: DOG,
    dogId: DOG.id,
    hydrated: true,
    error: null,
  });
  useOnboardingStore.setState({
    draft: {},
    stepIndex: 0,
    skipped: false,
    hydrated: true,
  });
  useSessionStore.setState({ session: null, lastFailure: null });
  useTrainingLogStore.setState({ completed: [], hydrated: true });
  serverSaysFree();
  await i18n.changeLanguage("en-US");
});

describe("Train — free content", () => {
  it("starts a free lesson for a user with no subscription", async () => {
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-sit")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("lesson-card-sit"));

    expect(mockPush).toHaveBeenCalledWith("/lesson/sit");
  });
});

describe("Train — premium content while free", () => {
  it("does not open a premium lesson", async () => {
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-place")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("lesson-card-place"));

    expect(mockPush).not.toHaveBeenCalledWith("/lesson/place");
  });

  it("leads to the paywall instead — the thing that resolves the lock", async () => {
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-place")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("lesson-card-place"));

    expect(mockPush).toHaveBeenCalledWith("/paywall");
  });

  it("says it is premium once, on the meta line, in its own section", async () => {
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("train-section-premium")).toBeTruthy(),
    );

    expect(screen.getByTestId("lesson-status-place")).toHaveTextContent(
      /Premium/,
    );
    // Phase 10 acceptance, finding 8: the "Part of PawCue Premium." line said it a second time on every row.
    expect(screen.queryByTestId("lesson-premium-place")).toBeNull();
    const row = screen.getByTestId("lesson-card-place");
    expect(
      (row.props.accessibilityLabel as string).match(/Premium/g),
    ).toHaveLength(1);
  });

  it("keeps the chevron on a premium-only row, because it routes to the paywall", async () => {
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-place")).toBeTruthy(),
    );

    expect(
      screen.getByTestId("lesson-card-place").props.accessibilityRole,
    ).toBe("button");
    // A row locked by a prerequisite as well goes nowhere, and says so by having no button role.
    expect(
      screen.getByTestId("lesson-card-stay").props.accessibilityRole,
    ).toBeUndefined();
  });
});

describe("Train — premium content while entitled", () => {
  it("starts", async () => {
    serverGrantsPremium();
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-place")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("lesson-card-place"));

    expect(mockPush).toHaveBeenCalledWith("/lesson/place");
  });

  it("leaves no premium section behind", async () => {
    serverGrantsPremium();
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-place")).toBeTruthy(),
    );

    expect(screen.queryByTestId("train-section-premium")).toBeNull();
    expect(screen.getByTestId("lesson-status-place")).not.toHaveTextContent(
      /Premium/,
    );
  });
});

describe("the prerequisite lock is a separate thing", () => {
  it("stays locked for an entitled user who has not trained the prerequisite", async () => {
    serverGrantsPremium();
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-stay")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("lesson-card-stay"));

    // Buying a subscription does not teach the dog to sit.
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("lesson-locked-stay")).toBeTruthy();
  });

  it("states both locks when both apply, rather than only the one with a price", async () => {
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-stay")).toBeTruthy(),
    );

    // The premium lock on the meta line (finding 8: once), the prerequisite lock on its own line beneath.
    expect(screen.getByTestId("lesson-status-stay")).toHaveTextContent(
      /Premium/,
    );
    expect(screen.getByTestId("lesson-locked-stay")).toBeTruthy();
  });

  it("does not offer the paywall as a way out of a prerequisite lock", async () => {
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-stay")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("lesson-card-stay"));

    // A doubly-locked lesson goes nowhere: paying would not make it startable.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("opens once the prerequisite is trained and the user is entitled", async () => {
    serverGrantsPremium();
    useTrainingLogStore.setState({
      completed: [record(LESSON.sit, "2026-09-10T10:00:00.000Z")],
      hydrated: true,
    });

    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-stay")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("lesson-card-stay"));

    expect(mockPush).toHaveBeenCalledWith("/lesson/stay");
  });
});

describe("the lesson overview gates before training starts", () => {
  it("offers no start control for a premium lesson while free", async () => {
    mockSearchParams = { slug: "place" };
    await renderScreen(<LessonOverviewScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("lesson-premium-locked")).toBeTruthy(),
    );
    expect(screen.queryByTestId("start-training")).toBeNull();
  });

  it("still shows what the lesson is, rather than hiding it behind the paywall", async () => {
    mockSearchParams = { slug: "place" };
    await renderScreen(<LessonOverviewScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("lesson-premium-locked")).toBeTruthy(),
    );
    expect(screen.getByTestId("lesson-goal")).toBeTruthy();
    expect(screen.getByTestId("lesson-duration")).toBeTruthy();
  });

  it("offers the upgrade path", async () => {
    mockSearchParams = { slug: "place" };
    await renderScreen(<LessonOverviewScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("lesson-premium-cta")).toBeTruthy(),
    );
    await fireEvent.press(screen.getByTestId("lesson-premium-cta"));

    expect(mockPush).toHaveBeenCalledWith("/paywall");
  });

  it("starts a free lesson normally", async () => {
    mockSearchParams = { slug: "sit" };
    await renderScreen(<LessonOverviewScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("start-training")).toBeTruthy(),
    );
    await fireEvent.press(screen.getByTestId("start-training"));

    expect(mockPush).toHaveBeenCalledWith("/session/sit");
  });

  it("starts a premium lesson once entitled", async () => {
    serverGrantsPremium();
    mockSearchParams = { slug: "place" };
    await renderScreen(<LessonOverviewScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("start-training")).toBeTruthy(),
    );
    expect(screen.queryByTestId("lesson-premium-locked")).toBeNull();
  });

  it("gates a lesson reached by deep link, not only one reached from a list", async () => {
    // Nothing linked here; the slug arrived from the URL. The screen is the defence.
    mockSearchParams = { slug: "place" };
    await renderScreen(<LessonOverviewScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("lesson-premium-locked")).toBeTruthy(),
    );
  });
});

describe("Today", () => {
  it("marks a premium activity rather than hiding it from the plan", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByTestId("today-plan")).toBeTruthy());

    const states = screen.queryAllByTestId(/^today-activity-state-/);
    expect(states.length).toBeGreaterThan(0);
  });

  it("never routes a locked activity into the lesson", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByTestId("today-plan")).toBeTruthy());

    for (const card of screen.queryAllByTestId(
      /^today-activity-(place|stay)$/,
    )) {
      await fireEvent.press(card);
    }

    expect(mockPush).not.toHaveBeenCalledWith("/lesson/place");
    expect(mockPush).not.toHaveBeenCalledWith("/lesson/stay");
  });

  /**
   * Phase 10 acceptance, finding 12 — the owner's product decision. Once the day's free lessons are done and
   * the engine's next pick is premium, the primary button says the day is done; the locked lesson stays on the
   * trail with its mark, and that row is the way to the paywall. "Unlock with Premium" never takes the primary
   * slot. Nothing asserted the old behaviour; this is the first test of the state.
   */
  it("says the day is done rather than putting the paywall in the primary slot", async () => {
    // Place, trained before the subscription lapsed, is due for review beside today's one new free skill — the
    // engine allows one new skill a day, so this is how a free lesson and a premium one share a plan.
    const daysAgo = (days: number) =>
      new Date(Date.now() - days * 86_400_000).toISOString();
    useTrainingLogStore.setState({
      completed: [{ ...record(LESSON.place, daysAgo(5)), lessonSlug: "place" }],
      hydrated: true,
    });
    // The plan is a commitment made in the morning: generate it first, then finish its free lesson with the
    // screen still up, as coming back from the session does.
    await renderScreen(<TodayScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("today-start").props.accessibilityLabel).toBe(
        "Start The Name Game",
      ),
    );
    expect(screen.getByTestId("today-activity-place")).toBeTruthy();

    await act(async () => {
      useTrainingLogStore.setState({
        completed: [
          { ...record(LESSON.place, daysAgo(5)), lessonSlug: "place" },
          { ...record(LESSON.nameGame, daysAgo(0)), lessonSlug: "name_game" },
        ],
        hydrated: true,
      });
    });
    await waitFor(() => expect(screen.getByTestId("today-done")).toBeTruthy());

    expect(screen.queryByTestId("today-start-premium")).toBeNull();
    expect(screen.queryByTestId("today-start")).toBeNull();
    expect(screen.getByTestId("today-done").props.accessibilityLabel).toBe(
      "Done for today",
    );
    await fireEvent.press(screen.getByTestId("today-done"));
    expect(mockPush).not.toHaveBeenCalledWith("/paywall");
    expect(mockNavigate).toHaveBeenCalledWith("/progress");

    // The locked row, its mark in the accessible name, is what leads to the paywall.
    const row = screen.getByTestId("today-activity-place");
    expect(row.props.accessibilityLabel).toMatch(/Premium lesson\./);
    await fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith("/paywall");
  });

  it("offers no primary at all when nothing was trained and only premium remains", async () => {
    // The free lessons finished yesterday — too soon to repeat — and Place due for review: a day of premium
    // picks alone. Not "done" — the coach line and the trail carry it, and nothing in the primary slot sells.
    const daysAgo = (days: number) =>
      new Date(Date.now() - days * 86_400_000).toISOString();
    useTrainingLogStore.setState({
      completed: [
        { ...record(LESSON.nameGame, daysAgo(1)), lessonSlug: "name_game" },
        record(LESSON.sit, daysAgo(1)),
        { ...record(LESSON.place, daysAgo(5)), lessonSlug: "place" },
      ],
      hydrated: true,
    });
    await renderScreen(<TodayScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("today-activity-place")).toBeTruthy(),
    );

    expect(
      screen.queryAllByTestId(/^today-activity-(name_game|sit)$/),
    ).toHaveLength(0);
    expect(screen.queryByTestId("today-start")).toBeNull();
    expect(screen.queryByTestId("today-start-premium")).toBeNull();
    expect(screen.queryByTestId("today-done")).toBeNull();
    expect(screen.getByTestId("today-greeting")).toHaveTextContent(
      /is part of Premium\./,
    );
  });
});

describe("an active session is never interrupted", () => {
  it("keeps the session state intact when entitlement drops to free mid-lesson", async () => {
    serverGrantsPremium();
    const session: TrainingSessionState = {
      engineVersion: 1,
      sessionId: ID(600),
      lessonId: LESSON.place,
      lessonSlug: "place",
      dogId: DOG.id,
      status: "in_progress",
      startedAt: TS,
      completedAt: null,
      currentStepId: ID(700),
      completedStepIds: [],
      repetitionsByStep: { [ID(700)]: 3 },
      clicksByStep: { [ID(700)]: 2 },
      troubleshootingViewedIds: [],
      events: [],
    };
    useSessionStore.setState({ session, lastFailure: null });

    // The subscription lapses while the user is training a premium lesson.
    serverSaysFree();

    // Nothing about the session changed: the gate is at entry, and the session screen never asks again.
    expect(useSessionStore.getState().session).toEqual(session);
    expect(useSessionStore.getState().session?.status).toBe("in_progress");
    expect(useSessionStore.getState().session?.repetitionsByStep).toEqual({
      [ID(700)]: 3,
    });
  });
});

describe("losing access never loses data", () => {
  it("keeps every completed session when entitlement drops", async () => {
    serverGrantsPremium();
    const history = [
      record(LESSON.sit, "2026-09-10T10:00:00.000Z"),
      record(LESSON.place, "2026-09-11T10:00:00.000Z"),
    ];
    useTrainingLogStore.setState({ completed: history, hydrated: true });

    serverSaysFree();

    expect(useTrainingLogStore.getState().completed).toEqual(history);
  });

  it("keeps the dog profile when entitlement drops", async () => {
    serverGrantsPremium();
    serverSaysFree();

    expect(useDogStore.getState().dog).toEqual(DOG);
    expect(useDogStore.getState().dogId).toBe(DOG.id);
  });

  it("still shows a premium lesson as completed after access ends", async () => {
    useTrainingLogStore.setState({
      completed: [record(LESSON.place, "2026-09-11T10:00:00.000Z")],
      hydrated: true,
    });

    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-place")).toBeTruthy(),
    );

    // The record of having trained it is not a thing a subscription owns.
    expect(useTrainingLogStore.getState().completed).toHaveLength(1);
  });
});

describe("Hebrew", () => {
  it("labels a premium lock in the active language", async () => {
    await i18n.changeLanguage("he-IL");
    await renderScreen(<TrainScreen />, "rtl");
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-place")).toBeTruthy(),
    );

    expect(screen.getByTestId("lesson-status-place")).toHaveTextContent(
      /פרימיום/,
    );
  });
});

describe("the lesson overview keeps the prerequisite lock separate from the premium one", () => {
  /*
    Found on the simulator: `stay` is premium *and* needs Sit. The overview only knew about the premium lock, so a
    user who subscribed from this screen came back to a "Start training" button for a lesson the dog was not
    ready for. Train already told them both; this screen now does too.
  */
  it("shows both locks to a free user, and no start control", async () => {
    mockSearchParams = { slug: "stay" };
    await renderScreen(<LessonOverviewScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("lesson-prerequisite-locked")).toBeTruthy(),
    );
    expect(screen.getByTestId("lesson-premium-locked")).toBeTruthy();
    expect(screen.queryByTestId("start-training")).toBeNull();
  });

  it("keeps the prerequisite lock after the premium one is paid away", async () => {
    serverGrantsPremium();
    mockSearchParams = { slug: "stay" };
    await renderScreen(<LessonOverviewScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("lesson-prerequisite-locked")).toBeTruthy(),
    );
    // Buying a subscription did not teach the dog to sit.
    expect(screen.queryByTestId("lesson-premium-locked")).toBeNull();
    expect(screen.queryByTestId("start-training")).toBeNull();
  });

  it("starts once both the prerequisite is trained and the user is entitled", async () => {
    serverGrantsPremium();
    useTrainingLogStore.setState({
      completed: [record(LESSON.sit, "2026-09-10T10:00:00.000Z")],
      hydrated: true,
    });
    mockSearchParams = { slug: "stay" };
    await renderScreen(<LessonOverviewScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("start-training")).toBeTruthy(),
    );
    expect(screen.queryByTestId("lesson-prerequisite-locked")).toBeNull();
    expect(screen.queryByTestId("lesson-premium-locked")).toBeNull();
  });

  it("never shows a prerequisite lock on a lesson that has none", async () => {
    mockSearchParams = { slug: "place" };
    await renderScreen(<LessonOverviewScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("lesson-premium-locked")).toBeTruthy(),
    );
    expect(screen.queryByTestId("lesson-prerequisite-locked")).toBeNull();
  });
});
