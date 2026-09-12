import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
 * The four primary destinations, driven through the real screens and the real stores.
 *
 * These assert what a user sees and can do — the plan on Today, a lesson's state on Train, honest totals on
 * Progress — rather than the shape of any store behind them. The plan itself comes from the Phase 5 engine, so a
 * Today test failing means either the screen or the rules changed, which is the coupling worth having.
 */

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: mockReplace,
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
  // Resolves the dog: returning undefined would make `refresh()` correctly conclude the row is gone and clear it.
  fetchDog: () => mockFetchDog(),
  listOwnDogs: jest.fn(),
  updateDog: jest.fn(),
}));

const TS = "2026-09-11T10:00:00.000Z";
const base = { createdAt: TS, updatedAt: TS };
const ID = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

const SKILL = { name: ID(1), sit: ID(2), stay: ID(3) };
const LESSON = { nameGame: ID(10), sit: ID(11), stay: ID(12) };

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
    mkLesson(LESSON.nameGame, "name_game", SKILL.name, "lesson.nameGame", 3),
    mkLesson(LESSON.sit, "sit", SKILL.sit, "lesson.sit", 3),
    mkLesson(LESSON.stay, "stay", SKILL.stay, "lesson.stay", 4),
  ],
};

function mkLesson(
  id: string,
  slug: string,
  skillId: string,
  keyBase: string,
  minutes: number,
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

const backend = createFakePlanBackend();

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

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetCatalogueCache();
  mockLoadCatalogue.mockResolvedValue(CATALOGUE);
  mockFetchDog.mockResolvedValue(DOG);

  // A fake that enforces the same one-active-plan rule the schema does.
  backend.reset();
  resetPlanLifecycleGuards();
  usePlanStore.getState().clear();
  mockPersist.mockImplementation((generated, version) => {
    fakePersist(backend, generated, version);
    return Promise.resolve({
      planId: "plan",
      engineVersionId: "v",
      dayCount: 1,
      activityCount: 1,
    });
  });
  mockFetchActive.mockImplementation((dogId: string) =>
    Promise.resolve(fakeFetchActive(backend, dogId)),
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
  await i18n.changeLanguage("en-US");
});

describe("Today", () => {
  it("shows a plan generated from the real engine", async () => {
    await renderScreen(<TodayScreen />);

    await waitFor(() => expect(screen.getByTestId("today-plan")).toBeTruthy());
    expect(screen.getByTestId("today-greeting")).toHaveTextContent(/Libi/);
    expect(screen.getByTestId("today-total-time")).toBeTruthy();
  });

  it("translates engine reasons into language a user can act on", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByTestId("today-plan")).toBeTruthy());

    const rendered = JSON.stringify(screen.toJSON());
    // Engine vocabulary must never reach the screen.
    expect(rendered).not.toMatch(
      /new_skill|spaced_review|continue_unfinished|prerequisite_unlocked/,
    );
    expect(rendered).toMatch(/Something new to learn/);
  });

  it("starts the first activity in the existing lesson flow", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByTestId("today-start")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("today-start"));

    // The Phase 3 flow, not a second one.
    expect(mockPush.mock.calls[0]?.[0]).toMatch(/^\/lesson\//);
  });

  it("reflects a completed session on return", async () => {
    const today = new Date().toISOString().slice(0, 10);
    useTrainingLogStore.setState({
      completed: [
        record(LESSON.nameGame, "completed", `${today}T09:00:00.000Z`),
      ],
    });

    await renderScreen(<TodayScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("today-done-count")).toBeTruthy(),
    );
    // And the lesson just finished is no longer offered.
    expect(screen.queryByTestId("today-activity-name_game")).toBeNull();
  });

  it("offers an honest empty state when nothing is eligible", async () => {
    const today = new Date().toISOString().slice(0, 10);
    useTrainingLogStore.setState({
      completed: CATALOGUE.lessons.map((l) =>
        record(l.id, "completed", `${today}T09:00:00.000Z`),
      ),
    });

    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByTestId("today-empty")).toBeTruthy());
  });

  it("asks for a dog before promising a plan", async () => {
    useDogStore.setState({ dog: null, dogId: null });
    useOnboardingStore.setState({ skipped: true });

    await renderScreen(<TodayScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("today-no-dog")).toBeTruthy(),
    );
  });

  it("explains itself rather than showing a raw error when the catalogue fails", async () => {
    mockLoadCatalogue.mockRejectedValue(
      new Error("supabase: network request failed"),
    );

    await renderScreen(<TodayScreen />);

    await waitFor(
      () => expect(screen.getByTestId("today-unavailable")).toBeTruthy(),
      { timeout: 3000 },
    );
    expect(JSON.stringify(screen.toJSON())).not.toMatch(
      /supabase|network request failed/i,
    );
  });

  it("sends a fresh user to onboarding without flashing the app", async () => {
    useDogStore.setState({ dog: null, dogId: null });
    useOnboardingStore.setState({ skipped: false, draft: {} });

    await renderScreen(<TodayScreen />);

    expect(screen.getByTestId("redirect")).toHaveTextContent("/onboarding");
    expect(screen.queryByTestId("today-plan")).toBeNull();
  });

  it("keeps the clicker one tap away without giving it a tab", async () => {
    await renderScreen(<TodayScreen />);
    await fireEvent.press(screen.getByTestId("today-clicker"));
    expect(mockPush).toHaveBeenCalledWith("/clicker");
  });
});

describe("Train", () => {
  it("lists the catalogue with each lesson's state", async () => {
    await renderScreen(<TrainScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-sit")).toBeTruthy(),
    );
    expect(screen.getByTestId("lesson-status-sit")).toHaveTextContent(
      /Not started/,
    );
  });

  it("marks a completed lesson and counts repeats", async () => {
    useTrainingLogStore.setState({
      completed: [
        record(LESSON.sit, "completed", "2026-09-01T10:00:00.000Z"),
        record(LESSON.sit, "completed", "2026-09-05T10:00:00.000Z"),
      ],
    });

    await renderScreen(<TrainScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("lesson-status-sit")).toHaveTextContent(
        /Completed/,
      ),
    );
    expect(screen.getByTestId("lesson-completions-sit")).toHaveTextContent(/2/);
  });

  it("marks an unfinished lesson", async () => {
    useTrainingLogStore.setState({
      completed: [record(LESSON.sit, "abandoned", "2026-09-05T10:00:00.000Z")],
    });

    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-status-sit")).toHaveTextContent(
        /Unfinished/,
      ),
    );
  });

  it("locks a lesson whose prerequisites are unmet, and says so in text", async () => {
    await renderScreen(<TrainScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("lesson-status-stay")).toHaveTextContent(
        /Locked/,
      ),
    );
    // Never colour alone: the lock is stated, and explained.
    expect(screen.getByTestId("lesson-locked-stay")).toBeTruthy();
  });

  it("does not let a locked lesson be started", async () => {
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-stay")).toBeTruthy(),
    );

    const card = screen.getByTestId("lesson-card-stay");
    // No button role either: assistive technology is told the same thing the visual treatment says.
    expect(card.props.accessibilityRole).toBeUndefined();

    await fireEvent.press(card);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("unlocks it once the prerequisite lesson is completed", async () => {
    useTrainingLogStore.setState({
      completed: [record(LESSON.sit, "completed", "2026-09-05T10:00:00.000Z")],
    });

    await renderScreen(<TrainScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("lesson-status-stay")).toHaveTextContent(
        /Not started/,
      ),
    );
    await fireEvent.press(screen.getByTestId("lesson-card-stay"));
    expect(mockPush).toHaveBeenCalledWith("/lesson/stay");
  });

  it("starts an eligible lesson in the existing flow", async () => {
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-sit")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("lesson-card-sit"));
    expect(mockPush).toHaveBeenCalledWith("/lesson/sit");
  });
});

describe("Progress", () => {
  it("shows an empty state before any training", async () => {
    await renderScreen(<ProgressScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("progress-empty")).toBeTruthy(),
    );
  });

  it("counts only what actually happened", async () => {
    useTrainingLogStore.setState({
      completed: [
        record(LESSON.nameGame, "completed", "2026-09-05T10:00:00.000Z"),
        record(LESSON.sit, "completed", "2026-09-06T10:00:00.000Z"),
        record(LESSON.stay, "abandoned", "2026-09-07T10:00:00.000Z"),
      ],
    });

    await renderScreen(<ProgressScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("progress-summary")).toBeTruthy(),
    );
    expect(screen.getByTestId("progress-sessions")).toHaveTextContent(/2/);
    expect(screen.getByTestId("progress-unfinished")).toHaveTextContent(/1/);
  });

  it("distinguishes completed from unfinished in the history", async () => {
    useTrainingLogStore.setState({
      completed: [
        record(LESSON.nameGame, "completed", "2026-09-05T10:00:00.000Z"),
        record(LESSON.sit, "abandoned", "2026-09-06T10:00:00.000Z"),
      ],
    });

    await renderScreen(<ProgressScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("progress-summary")).toBeTruthy(),
    );
    const rendered = JSON.stringify(screen.toJSON());
    expect(rendered).toMatch(/Completed/);
    expect(rendered).toMatch(/Left unfinished/);
  });

  it("invents no streak", async () => {
    useTrainingLogStore.setState({
      completed: [
        record(LESSON.nameGame, "completed", "2026-09-05T10:00:00.000Z"),
      ],
    });

    await renderScreen(<ProgressScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("progress-summary")).toBeTruthy(),
    );

    // Streak is server-derived by contract and nothing populates it; showing one would be fabrication.
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/streak|Streak|רצף/);
  });
});

describe("Dog", () => {
  it("shows the dog and its training summary", async () => {
    useTrainingLogStore.setState({
      completed: [
        record(LESSON.nameGame, "completed", "2026-09-05T10:00:00.000Z"),
      ],
    });

    await renderScreen(<DogScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("dog-name")).toHaveTextContent(/Libi/),
    );
    expect(screen.getByTestId("dog-sessions")).toHaveTextContent(/1/);
    expect(screen.getByTestId("dog-breed")).toHaveTextContent(/Border Collie/);
  });

  it("routes to editing the profile", async () => {
    await renderScreen(<DogScreen />);
    await fireEvent.press(screen.getByTestId("dog-edit"));
    expect(mockPush).toHaveBeenCalledWith("/dog-profile");
  });

  it("keeps settings reachable without making it a destination", async () => {
    await renderScreen(<DogScreen />);
    await fireEvent.press(screen.getByTestId("dog-settings"));
    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  it("offers profile creation when there is no dog", async () => {
    useDogStore.setState({ dog: null, dogId: null });
    await renderScreen(<DogScreen />);
    expect(screen.getByTestId("dog-empty")).toBeTruthy();
  });
});

describe("Hebrew and RTL", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("he-IL");
  });

  it("renders Today in Hebrew", async () => {
    await renderScreen(<TodayScreen />, "rtl");
    await waitFor(() =>
      expect(screen.getByTestId("today-greeting")).toHaveTextContent(/היום/),
    );
  });

  it("renders Train in Hebrew with RTL text direction", async () => {
    await renderScreen(<TrainScreen />, "rtl");
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-sit")).toBeTruthy(),
    );

    const status = screen.getByTestId("lesson-status-sit");
    const style = Array.isArray(status.props.style)
      ? Object.assign({}, ...status.props.style.flat())
      : status.props.style;
    expect(style.writingDirection).toBe("rtl");
  });

  it("renders Progress and Dog in Hebrew", async () => {
    useTrainingLogStore.setState({
      completed: [
        record(LESSON.nameGame, "completed", "2026-09-05T10:00:00.000Z"),
      ],
    });

    const progress = await renderScreen(<ProgressScreen />, "rtl");
    await waitFor(() =>
      expect(progress.getByTestId("progress-summary")).toBeTruthy(),
    );
    expect(JSON.stringify(progress.toJSON())).toMatch(/[֐-׿]/);
    await progress.unmount();

    const dogView = await renderScreen(<DogScreen />, "rtl");
    await waitFor(() => expect(dogView.getByTestId("dog-name")).toBeTruthy());
    expect(JSON.stringify(dogView.toJSON())).toMatch(/[֐-׿]/);
  });

  it("leaves no untranslated keys on the main surfaces", async () => {
    await renderScreen(<TodayScreen />, "rtl");
    await waitFor(() => expect(screen.getByTestId("today-plan")).toBeTruthy());
    // A missing translation renders the key itself, which is how untranslated copy ships unnoticed.
    expect(JSON.stringify(screen.toJSON())).not.toMatch(
      /today\.[a-zA-Z]+\.|train\.status\./,
    );
  });
});
