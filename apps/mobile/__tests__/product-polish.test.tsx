import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TrainingSessionState } from "@pawcue/domain";
import TodayScreen from "../app/(tabs)/index";
import TrainScreen from "../app/(tabs)/train";
import ProgressScreen from "../app/(tabs)/progress";
import DogScreen from "../app/(tabs)/dog";
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
 * The Phase 8 polish, as behaviour rather than appearance.
 *
 * Nothing here asserts a colour, a spacing value or a snapshot — those change whenever the design does, and a test
 * that breaks on every visual tweak stops being read. What is worth protecting is the product decisions the polish
 * encoded: which state gets its own section, what the primary action does when the obvious thing is unavailable,
 * and the facts the screens are allowed to state.
 */

const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  usePathname: () => "/",
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require("react-native");
    return <Text testID="redirect">{href}</Text>;
  },
}));

const mockLoadCatalogue = jest.fn();
const mockPersist = jest.fn();
const mockFetchActive = jest.fn();
jest.mock("../src/plans/plan-repository", () => ({
  loadPlanningCatalogue: () => mockLoadCatalogue(),
  persistGeneratedPlan: (...args: unknown[]) => mockPersist(...args),
  fetchActivePlan: (...args: unknown[]) => mockFetchActive(...args),
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

const SKILL = { name: ID(1), sit: ID(2) };
const LESSON = { nameGame: ID(10), sit: ID(11) };

function mkLesson(id: string, slug: string, skillId: string, keyBase: string) {
  return {
    id,
    slug,
    skillId,
    titleKey: `${keyBase}.title`,
    goalKey: `${keyBase}.goal`,
    estimatedMinutes: 3,
    equipment: [],
    difficulty: 1,
    prerequisiteSkillIds: [],
    isAlwaysFree: true,
    contentVersionId: ID(900),
    ...base,
  };
}

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
  ],
  lessons: [
    mkLesson(LESSON.nameGame, "name_game", SKILL.name, "lesson.nameGame"),
    mkLesson(LESSON.sit, "sit", SKILL.sit, "lesson.sit"),
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

function record(
  lessonId: string,
  status: "completed" | "abandoned",
  endedAt: string,
) {
  return {
    sessionId: `${lessonId}-${status}-${endedAt}`,
    lessonId,
    lessonSlug: "name_game",
    startedAt: endedAt,
    endedAt,
    status,
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

function inProgressSession(): TrainingSessionState {
  return {
    engineVersion: 1,
    sessionId: ID(600),
    lessonId: LESSON.sit,
    lessonSlug: "sit",
    dogId: DOG.id,
    status: "in_progress",
    startedAt: TS,
    completedAt: null,
    currentStepId: ID(700),
    completedStepIds: [],
    repetitionsByStep: {},
    clicksByStep: {},
    troubleshootingViewedIds: [],
    events: [],
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetCatalogueCache();
  mockLoadCatalogue.mockResolvedValue(CATALOGUE);
  mockFetchDog.mockResolvedValue(DOG);

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
  await i18n.changeLanguage("en-US");
});

describe("Today — unfinished work comes back", () => {
  it("offers to resume a lesson that was left in progress", async () => {
    useSessionStore.setState({
      session: inProgressSession(),
      lastFailure: null,
    });
    await renderScreen(<TodayScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("today-resume")).toBeTruthy(),
    );
  });

  it("resumes the lesson it was actually left in", async () => {
    useSessionStore.setState({
      session: inProgressSession(),
      lastFailure: null,
    });
    await renderScreen(<TodayScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("today-resume")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("today-resume"));

    expect(mockPush).toHaveBeenCalledWith("/session/sit");
  });

  it("says nothing about resuming when there is nothing in progress", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByTestId("today-plan")).toBeTruthy());

    // A prompt to continue something the user never started is a nag, not a reminder.
    expect(screen.queryByTestId("today-resume")).toBeNull();
  });

  it("does not resurrect a session that was already completed", async () => {
    useSessionStore.setState({
      session: { ...inProgressSession(), status: "completed" },
      lastFailure: null,
    });
    await renderScreen(<TodayScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("today-screen")).toBeTruthy(),
    );
    expect(screen.queryByTestId("today-resume")).toBeNull();
  });
});

describe("Today — the subtitle states one fact", () => {
  it("leads with the dog's daily commitment before anything is trained", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByTestId("today-plan")).toBeTruthy());

    expect(screen.getByTestId("today-daily-goal")).toHaveTextContent(/20/);
    expect(screen.queryByTestId("today-done-count")).toBeNull();
  });

  it("switches to what was done once something has been", async () => {
    useTrainingLogStore.setState({
      completed: [
        record(LESSON.nameGame, "completed", `${today()}T09:00:00.000Z`),
      ],
      hydrated: true,
    });
    await renderScreen(<TodayScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("today-screen")).toBeTruthy(),
    );

    expect(screen.getByTestId("today-done-count")).toBeTruthy();
    // Two subtitle lines would be two competing summaries of the same day.
    expect(screen.queryByTestId("today-daily-goal")).toBeNull();
  });

  it("states the plan's length once, under the coach line", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByTestId("today-plan")).toBeTruthy());

    // It used to appear as a subtitle under the heading *and* on the only card beneath it.
    expect(screen.getAllByTestId("today-total-time")).toHaveLength(1);
  });
});

describe("Today — the clicker is a control, not a caption", () => {
  it("is reachable and goes to the clicker", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("today-clicker")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("today-clicker"));

    expect(mockPush).toHaveBeenCalledWith("/clicker");
  });
});

describe("Train — unfinished work is its own state", () => {
  it("separates a lesson left unfinished from one never started", async () => {
    useTrainingLogStore.setState({
      completed: [record(LESSON.sit, "abandoned", "2026-09-10T10:00:00.000Z")],
      hydrated: true,
    });

    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("train-section-unfinished")).toBeTruthy(),
    );

    expect(screen.getByTestId("lesson-status-sit")).toHaveTextContent(
      /Unfinished/,
    );
    // The other lesson is untouched, so it belongs in "Ready to train".
    expect(screen.getByTestId("train-section-ready")).toBeTruthy();
  });

  it("shows no unfinished section when nothing was abandoned", async () => {
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("train-section-ready")).toBeTruthy(),
    );

    expect(screen.queryByTestId("train-section-unfinished")).toBeNull();
  });

  it("counts each section on its heading", async () => {
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("train-section-ready")).toBeTruthy(),
    );

    expect(
      screen.getByTestId("train-section-ready-trailing"),
    ).toHaveTextContent(/2/);
  });
});

describe("Progress — history reads as days, not rows", () => {
  it("groups several sessions from the same day under one heading", async () => {
    const day = "2026-09-10";
    useTrainingLogStore.setState({
      completed: [
        record(LESSON.nameGame, "completed", `${day}T09:00:00.000Z`),
        record(LESSON.nameGame, "completed", `${day}T10:00:00.000Z`),
        record(LESSON.nameGame, "completed", `${day}T11:00:00.000Z`),
      ],
      hydrated: true,
    });

    await renderScreen(<ProgressScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("progress-summary")).toBeTruthy(),
    );

    // One heading for the day, carrying the count — not three interchangeable rows.
    expect(screen.getByTestId(`progress-day-${day}`)).toBeTruthy();
    expect(
      screen.getByTestId(`progress-day-${day}-trailing`),
    ).toHaveTextContent(/3/);
  });

  it("keeps separate days separate", async () => {
    useTrainingLogStore.setState({
      completed: [
        record(LESSON.nameGame, "completed", "2026-09-10T09:00:00.000Z"),
        record(LESSON.sit, "completed", "2026-09-09T09:00:00.000Z"),
      ],
      hydrated: true,
    });

    await renderScreen(<ProgressScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("progress-summary")).toBeTruthy(),
    );

    expect(screen.getByTestId("progress-day-2026-09-10")).toBeTruthy();
    expect(screen.getByTestId("progress-day-2026-09-09")).toBeTruthy();
  });

  it("still reports honest totals and no streak", async () => {
    useTrainingLogStore.setState({
      completed: [
        record(LESSON.nameGame, "completed", "2026-09-10T09:00:00.000Z"),
      ],
      hydrated: true,
    });

    await renderScreen(<ProgressScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("progress-sessions")).toBeTruthy(),
    );

    expect(screen.getByTestId("progress-minutes")).toHaveTextContent(/3/);
    expect(screen.queryByText(/streak/i)).toBeNull();
  });
});

describe("Dog — navigation is not a profile field", () => {
  it("groups the ways out under their own heading", async () => {
    await renderScreen(<DogScreen />);
    await waitFor(() => expect(screen.getByTestId("dog-name")).toBeTruthy());

    expect(screen.getByTestId("dog-edit")).toBeTruthy();
    expect(screen.getByTestId("dog-account")).toBeTruthy();
    expect(screen.getByTestId("dog-settings")).toBeTruthy();
  });

  it("puts the daily commitment on the training heading rather than in the card", async () => {
    await renderScreen(<DogScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("dog-training-summary")).toBeTruthy(),
    );

    expect(screen.getByTestId("dog-daily-goal-trailing")).toHaveTextContent(
      /20/,
    );
  });
});

describe("read-only cards are announced as one thing", () => {
  it("gives a labelled Progress row a single accessible name", async () => {
    const entry = record(
      LESSON.nameGame,
      "completed",
      "2026-09-10T09:00:00.000Z",
    );
    useTrainingLogStore.setState({ completed: [entry], hydrated: true });

    await renderScreen(<ProgressScreen />);
    await waitFor(() =>
      expect(
        screen.getByTestId(`progress-entry-${entry.sessionId}`),
      ).toBeTruthy(),
    );

    /*
      `Card` used to drop `accessibilityLabel` entirely on its non-pressable branch, so every read-only card in the
      app described itself to nobody and was read child by child instead.
    */
    const card = screen.getByTestId(`progress-entry-${entry.sessionId}`);
    expect(card.props.accessible).toBe(true);
    expect(card.props.accessibilityLabel).toMatch(/Completed/);
  });
});

describe("Hebrew", () => {
  it("renders the resume prompt in the active language", async () => {
    await i18n.changeLanguage("he-IL");
    useSessionStore.setState({
      session: inProgressSession(),
      lastFailure: null,
    });

    await renderScreen(<TodayScreen />, "rtl");
    await waitFor(() =>
      expect(screen.getByTestId("today-resume")).toBeTruthy(),
    );

    expect(screen.getByTestId("today-resume").props.accessibilityLabel).toMatch(
      /המשיכו/,
    );
  });

  it("groups Progress by day in Hebrew", async () => {
    await i18n.changeLanguage("he-IL");
    useTrainingLogStore.setState({
      completed: [
        record(LESSON.nameGame, "completed", "2026-09-10T09:00:00.000Z"),
      ],
      hydrated: true,
    });

    await renderScreen(<ProgressScreen />, "rtl");
    await waitFor(() =>
      expect(screen.getByTestId("progress-day-2026-09-10")).toBeTruthy(),
    );
  });
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("when the dog's row cannot be read", () => {
  /*
    Found on the simulator, not in a test: with the dog id cached and the server unreachable, Today showed a
    spinner indefinitely and Dog showed a profile with every field "Not set". Neither said what had happened.
  */
  it("Today stops waiting and says so, instead of spinning", async () => {
    useDogStore.setState({
      dog: null,
      dogId: DOG.id,
      hydrated: true,
      error: "offline",
    });
    await renderScreen(<TodayScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("today-dog-unavailable")).toBeTruthy(),
    );
    expect(screen.queryByTestId("today-loading")).toBeNull();
  });

  it("Today also stops waiting when no session could be established", async () => {
    useBootstrapStore.setState({
      status: "ready",
      sessionStatus: "unavailable",
    });
    useDogStore.setState({
      dog: null,
      dogId: DOG.id,
      hydrated: true,
      error: null,
    });
    await renderScreen(<TodayScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("today-dog-unavailable")).toBeTruthy(),
    );
  });

  it("Today keeps waiting while a read is still plausibly in flight", async () => {
    useBootstrapStore.setState({ status: "ready", sessionStatus: "anonymous" });
    useDogStore.setState({
      dog: null,
      dogId: DOG.id,
      hydrated: true,
      error: null,
    });
    await renderScreen(<TodayScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("today-loading")).toBeTruthy(),
    );
    expect(screen.queryByTestId("today-dog-unavailable")).toBeNull();
  });

  it("Dog says the profile could not be loaded rather than 'Not set'", async () => {
    mockFetchDog.mockRejectedValue(new Error("offline"));
    useDogStore.setState({
      dog: null,
      dogId: DOG.id,
      hydrated: true,
      error: null,
    });
    await renderScreen(<DogScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("dog-unavailable")).toBeTruthy(),
    );
    expect(screen.queryByTestId("dog-breed")).toBeNull();
  });

  it("offers a retry that re-reads the dog", async () => {
    mockFetchDog.mockRejectedValueOnce(new Error("offline"));
    useDogStore.setState({
      dog: null,
      dogId: DOG.id,
      hydrated: true,
      error: null,
    });
    await renderScreen(<DogScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("dog-unavailable")).toBeTruthy(),
    );

    mockFetchDog.mockResolvedValue(DOG);
    await fireEvent.press(screen.getByTestId("dog-unavailable-cta"));

    await waitFor(() => expect(screen.getByTestId("dog-name")).toBeTruthy());
  });
});

describe("unfinished work survives a relaunch", () => {
  /*
    Found on the simulator: with an in-progress session persisted, a kill and relaunch brought Today back without
    the resume card. The session was only ever read by the training screen, so until one mounted the store was
    empty — exactly when the reminder mattered most.
  */
  it("Today shows the resume card from the persisted session after a cold start", async () => {
    await AsyncStorage.setItem(
      "pawcue.session.active",
      JSON.stringify(inProgressSession()),
    );
    useSessionStore.setState({
      session: null,
      lastFailure: null,
      hydrated: false,
    });

    await useSessionStore.getState().hydrate();
    await renderScreen(<TodayScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("today-resume")).toBeTruthy(),
    );
  });

  it("does not resurrect a persisted session that already finished", async () => {
    await AsyncStorage.setItem(
      "pawcue.session.active",
      JSON.stringify({ ...inProgressSession(), status: "completed" }),
    );
    useSessionStore.setState({
      session: null,
      lastFailure: null,
      hydrated: false,
    });

    await useSessionStore.getState().hydrate();
    await renderScreen(<TodayScreen />);

    await waitFor(() => expect(screen.getByTestId("today-plan")).toBeTruthy());
    expect(screen.queryByTestId("today-resume")).toBeNull();
    expect(useSessionStore.getState().hydrated).toBe(true);
  });

  it("treats unreadable persisted state as no session", async () => {
    await AsyncStorage.setItem("pawcue.session.active", "{not json");
    useSessionStore.setState({
      session: null,
      lastFailure: null,
      hydrated: false,
    });

    await useSessionStore.getState().hydrate();

    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().hydrated).toBe(true);
  });
});

/**
 * The Today redesign, as behaviour.
 *
 * Today is a coach line, one button and a trail. The coach line names the dog and the lesson; the button names
 * the lesson and is the only way to start it from this screen; a finished activity changes state on the trail
 * rather than fading; loading is one busy element that holds the page's shape. None of this asserts a colour or
 * a radius.
 */
describe("Today — the coach line and the trail", () => {
  it("answers 'what now' with a sentence and one button that names the lesson", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByTestId("today-plan")).toBeTruthy());

    const coach = screen.getByTestId("today-greeting");
    expect(coach).toHaveTextContent(/Libi/);
    expect(coach.props.accessibilityRole).toBe("header");

    // One primary action, and it says what it starts.
    const start = screen.getByTestId("today-start");
    expect(start.props.accessibilityLabel).toMatch(/^Start /);
    expect(screen.queryByTestId("today-resume")).toBeNull();

    // The plan's length is stated exactly once.
    expect(screen.getAllByTestId("today-total-time")).toHaveLength(1);
  });

  it("puts every activity on the trail with its state in words, never only in a mark", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByTestId("today-plan")).toBeTruthy());

    const rows = screen.getAllByTestId(/^today-activity-(?!state-)/);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.props.accessibilityRole).toBe("button");
      expect(row.props.accessibilityLabel).toMatch(/minute/);
    }
  });

  it("ticks an activity off with a state change, never by dimming it", async () => {
    // A lesson finished days ago is due for review, which gives the day two activities: a new skill and the
    // review. (One new skill a day is the planner's own cap, so two *new* lessons would never make a pair.)
    const daysAgo = (n: number) =>
      new Date(Date.now() - n * 86_400_000).toISOString();
    const review = record(LESSON.nameGame, "completed", daysAgo(5));
    useTrainingLogStore.setState({ completed: [review], hydrated: true });

    await renderScreen(<TodayScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("today-activity-name_game")).toBeTruthy(),
    );
    expect(screen.getByTestId("today-activity-sit")).toBeTruthy();

    // The plan exists; now a session for one of its activities finishes. The plan is not rebuilt (that is the
    // lifecycle rule) — the activity is ticked off in place.
    await act(async () => {
      useTrainingLogStore.setState({
        completed: [
          review,
          record(LESSON.nameGame, "completed", `${today()}T09:00:00.000Z`),
        ],
        hydrated: true,
      });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        screen.getByTestId("today-activity-state-name_game"),
      ).toHaveTextContent(/Done/),
    );

    const row = screen.getByTestId("today-activity-name_game");
    // The state is in the accessible name, and the row is at full opacity: it changed state, not visibility.
    expect(row.props.accessibilityLabel).toMatch(/Done today/);
    expect(StyleSheet.flatten(row.props.style).opacity ?? 1).toBe(1);

    // And the button has moved on to the next thing.
    expect(screen.getByTestId("today-start").props.accessibilityLabel).toMatch(
      /Sit/,
    );
  });

  it("holds the page's shape while the plan loads, as one busy element", async () => {
    mockLoadCatalogue.mockReturnValue(new Promise(() => undefined));
    await renderScreen(<TodayScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("today-loading")).toBeTruthy(),
    );
    expect(
      screen.getByTestId("today-loading").props.accessibilityState,
    ).toEqual({ busy: true });
    expect(screen.queryByTestId("today-start")).toBeNull();
    expect(screen.queryByTestId("today-plan")).toBeNull();
  });

  it("renders the coach line and the trail in Hebrew", async () => {
    await i18n.changeLanguage("he-IL");
    await renderScreen(<TodayScreen />, "rtl");

    await waitFor(() => expect(screen.getByTestId("today-plan")).toBeTruthy());
    expect(screen.getByTestId("today-greeting")).toHaveTextContent(/Libi/);
    expect(screen.getByTestId("today-greeting")).toHaveTextContent(/[֐-׿]/);
    expect(screen.getByTestId("today-start").props.accessibilityLabel).toMatch(
      /[֐-׿]/,
    );
  });
});
