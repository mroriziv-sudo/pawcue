import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { Dimensions, StyleSheet, type ScaledSize } from "react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import {
  Glyph,
  ROW_LEADING_WIDTH,
  ThemeProvider,
  TrailMark,
  defaultTheme,
} from "@pawcue/ui";
import type { TrainingSessionState } from "@pawcue/domain";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TodayScreen from "../app/(tabs)/index";
import TrainScreen from "../app/(tabs)/train";
import DogScreen from "../app/(tabs)/dog";
import LessonOverviewScreen from "../app/lesson/[slug]";
import DogProfileScreen from "../app/dog-profile";
import SettingsScreen from "../app/settings";
import ClickerScreen from "../app/clicker";
import { BreedPicker } from "../src/components/BreedPicker";
import { BackControl } from "../src/components/BackControl";
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
 * The Phase 10 acceptance pass's design-judgment findings (phase-10-native-acceptance.md), as behaviour.
 *
 * Each block is one finding the owner chose to act on, and asserts the rule the finding named — two tiles fit in
 * a row, one paused lesson reads one way on four screens, a Back control always goes somewhere — never the pixels.
 */

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
let mockSearchParams: { slug?: string } = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: jest.fn(),
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
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

/** Sit, begun and set down on this device — nothing abandoned, nothing logged, nothing the server knows. */
function pausedSit(): TrainingSessionState {
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
  mockCanGoBack = true;
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

// ---------------------------------------------------------------------------------------------------------------

describe("finding 1 — the breed picker's Common grid holds two tiles per row", () => {
  /** A tile's footprint in the grid: its width plus the selection margin on both sides. */
  function footprint(testID: string): number {
    const style = StyleSheet.flatten(screen.getByTestId(testID).props.style);
    expect(typeof style.width).toBe("number");
    return (style.width as number) + 2 * ((style.margin as number) ?? 0);
  }

  it("derives the tile width from the measured grid minus the gap, so two fit in 350pt", async () => {
    await renderScreen(
      <BreedPicker
        value="Labrador Retriever"
        onChange={jest.fn()}
        inputTestID="input-breed"
      />,
    );
    await fireEvent(screen.getByTestId("input-breed-common"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 350, height: 600 } },
    });

    const gap = 12;
    const unselected = footprint("input-breed-option-golden_retriever");
    const selected = footprint("input-breed-option-labrador_retriever");

    // The selection margin is taken out of the tile, never added around it: both footprints are the same.
    expect(unselected).toBe(Math.floor((350 - gap) / 2));
    expect(selected).toBe(unselected);
    expect(2 * unselected + gap).toBeLessThanOrEqual(350);
  });

  it("follows the grid when it is narrower than the window", async () => {
    await renderScreen(
      <BreedPicker value="" onChange={jest.fn()} inputTestID="input-breed" />,
    );
    await fireEvent(screen.getByTestId("input-breed-common"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 280, height: 600 } },
    });

    const tile = footprint("input-breed-option-golden_retriever");
    expect(2 * tile + 12).toBeLessThanOrEqual(280);
  });
});

describe("finding 2 — one paused lesson reads one way on every screen", () => {
  beforeEach(() => {
    useSessionStore.setState({ session: pausedSit(), lastFailure: null });
  });

  it("Today offers to continue it", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("today-resume")).toBeTruthy(),
    );

    expect(screen.getByTestId("today-resume").props.accessibilityLabel).toBe(
      "Continue Sit",
    );
  });

  it("the Dog tab marks it paused", async () => {
    await renderScreen(<DogScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("dog-lesson-sit")).toBeTruthy(),
    );

    expect(
      screen.getByTestId("dog-lesson-sit").props.accessibilityLabel,
    ).toMatch(/Paused/);
    expect(
      screen.getByTestId("dog-lesson-name_game").props.accessibilityLabel,
    ).toMatch(/Ready to start/);
  });

  it("Train lists it under Left unfinished with the paused state, not 'Not started'", async () => {
    await renderScreen(<TrainScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesson-card-sit")).toBeTruthy(),
    );

    expect(screen.getByTestId("train-section-unfinished")).toBeTruthy();
    expect(screen.getByTestId("lesson-status-sit")).toHaveTextContent(
      "Unfinished",
    );
    expect(screen.getByTestId("lesson-status-name_game")).toHaveTextContent(
      "Not started",
    );
    // The row still opens the overview, where the button continues the session.
    await fireEvent.press(screen.getByTestId("lesson-card-sit"));
    expect(mockPush).toHaveBeenCalledWith("/lesson/sit");
  });

  it("the overview's button continues it, in Today's words", async () => {
    mockSearchParams = { slug: "sit" };
    await renderScreen(<LessonOverviewScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("start-training")).toBeTruthy(),
    );

    expect(screen.getByTestId("start-training").props.accessibilityLabel).toBe(
      "Continue Sit",
    );
    await fireEvent.press(screen.getByTestId("start-training"));
    expect(mockPush).toHaveBeenCalledWith("/session/sit");
  });

  it("says Start for a lesson that is not the paused one", async () => {
    mockSearchParams = { slug: "name_game" };
    await renderScreen(<LessonOverviewScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("start-training")).toBeTruthy(),
    );

    expect(screen.getByTestId("start-training").props.accessibilityLabel).toBe(
      "Start The Name Game",
    );
  });
});

describe("finding 16 — a Back control always goes somewhere", () => {
  it("goes back when there is a screen behind it", async () => {
    mockCanGoBack = true;
    await renderScreen(<BackControl testID="back" />);

    await fireEvent.press(screen.getByTestId("back"));

    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("goes to Today when there is nothing behind it, rather than doing nothing", async () => {
    mockCanGoBack = false;
    await renderScreen(<BackControl testID="back" />);

    await fireEvent.press(screen.getByTestId("back"));

    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("defers to a caller that has its own idea of back", async () => {
    mockCanGoBack = false;
    const onPress = jest.fn();
    await renderScreen(<BackControl onPress={onPress} testID="back" />);

    await fireEvent.press(screen.getByTestId("back"));

    expect(onPress).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("finding 17 — the profile editor needs a dog", () => {
  it("sends a user with no dog to onboarding instead of rendering an empty page", async () => {
    useDogStore.setState({
      dog: null,
      dogId: null,
      hydrated: true,
      error: null,
    });
    await renderScreen(<DogProfileScreen />);

    expect(screen.getByTestId("redirect")).toHaveTextContent("/onboarding");
    expect(screen.queryByTestId("dog-profile-editor")).toBeNull();
  });

  it("still edits a dog that exists", async () => {
    await renderScreen(<DogProfileScreen />);

    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(screen.getByTestId("dog-profile-editor")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------------------------

/** A rendered node and everything beneath it, flattened. */
interface HostNode {
  type?: unknown;
  props?: Record<string, unknown>;
  children?: HostNode[];
}

function descendants(node: HostNode): HostNode[] {
  const out: HostNode[] = [];
  const visit = (n: HostNode) => {
    out.push(n);
    for (const child of n.children ?? []) {
      if (typeof child === "object") visit(child);
    }
  };
  visit(node);
  return out;
}

function flatStyle(node: HostNode): Record<string, unknown> {
  return (StyleSheet.flatten(node.props?.style as never) ?? {}) as Record<
    string,
    unknown
  >;
}

/** Every view painted in evergreen: the "dark objects" DESIGN_SYSTEM.md allows one of per screen. */
function darkObjects(root: HostNode): HostNode[] {
  return descendants(root).filter(
    (node) =>
      flatStyle(node).backgroundColor === defaultTheme.colors.brand.primary,
  );
}

/** Whether a row draws the 28pt leading column. */
function hasLeadingColumn(row: HostNode): boolean {
  return descendants(row).some((node) => {
    const style = flatStyle(node);
    return style.width === ROW_LEADING_WIDTH && style.alignSelf === "stretch";
  });
}

describe("finding 3 — Today keeps one dark object", () => {
  it("draws the primary button and nothing else in evergreen; the clicker shortcut is a glyph", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getByTestId("today-start")).toBeTruthy());

    const root = screen.getByTestId("today-screen") as unknown as HostNode;
    const dark = darkObjects(root);
    expect(dark).toHaveLength(1);
    expect(dark[0]?.props?.testID).toBe("today-start");

    const clicker = screen.getByTestId("today-clicker") as unknown as HostNode;
    expect(darkObjects(clicker)).toHaveLength(0);
  });
});

describe("finding 6 — the Dog tab's scene is centred at scene size", () => {
  it("centres the dog and keeps the words beneath it on the text edge", async () => {
    await renderScreen(<DogScreen />);
    await waitFor(() => expect(screen.getByTestId("dog-name")).toBeTruthy());

    expect(flatStyle(screen.getByTestId("dog-avatar") as never).alignSelf).toBe(
      "center",
    );
    expect(
      flatStyle(screen.getByTestId("dog-name") as never).textAlign,
    ).not.toBe("center");
  });
});

describe("finding 7 — rows in one list share a leading column", () => {
  it("gives the synced row no leading column, like the Account row above it", async () => {
    await renderScreen(<SettingsScreen />);
    await waitFor(() => expect(screen.getByTestId("sync-status")).toBeTruthy());

    expect(hasLeadingColumn(screen.getByTestId("open-account") as never)).toBe(
      false,
    );
    expect(hasLeadingColumn(screen.getByTestId("sync-status") as never)).toBe(
      false,
    );
    // The state is still said, in words.
    expect(screen.getByTestId("sync-status").props.accessibilityLabel).toBe(
      "Everything is synced.",
    );
  });

  it("still draws the column on a trail row", async () => {
    await renderScreen(<TodayScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("today-activity-name_game")).toBeTruthy(),
    );

    expect(
      hasLeadingColumn(screen.getByTestId("today-activity-name_game") as never),
    ).toBe(true);
  });
});

describe("finding 9 — Restore Purchases is a text control beneath the list", () => {
  it("is not a second stacked button", async () => {
    await renderScreen(<SettingsScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("billing-restore")).toBeTruthy(),
    );

    const style = flatStyle(screen.getByTestId("billing-restore") as never);
    expect(style.backgroundColor).toBe("transparent");
    expect(style.alignSelf).toBe("flex-start");
    expect(style.paddingHorizontal).toBe(0);
    // Settings keeps its one dark object: Go Premium.
    const dark = darkObjects(
      screen.getByTestId("settings-screen") as unknown as HostNode,
    );
    expect(dark.map((node) => node.props?.testID)).toEqual(["billing-upgrade"]);
  });
});

describe("finding 11 — the clicker screen's words sit on the text edge", () => {
  it("does not centre the headline; the clicker beneath stays centred", async () => {
    await renderScreen(<ClickerScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("clicker-title")).toBeTruthy(),
    );

    expect(
      flatStyle(screen.getByTestId("clicker-title") as never).textAlign,
    ).toBe("left");
    expect(
      flatStyle(screen.getByTestId("press-count") as never).textAlign,
    ).toBe("center");
  });
});

describe("finding 14 — marks scale with the text they sit beside, up to the leading column", () => {
  // Marks are decorative and hidden from assistive technology; the query has to say so.
  const hidden = { includeHiddenElements: true };
  const window = Dimensions.get("window");
  const atTextSize = (fontScale: number) =>
    Dimensions.set({ window: { ...window, fontScale } as ScaledSize });
  afterEach(() => Dimensions.set({ window }));

  it("keeps its size beside 17pt text at the default size", async () => {
    atTextSize(1);
    await renderScreen(
      <>
        <Glyph name="chevron-end" size={20} testID="chevron" />
        <Glyph name="check" size={16} testID="check" />
        <TrailMark state="next" label="1" testID="mark" />
      </>,
    );

    expect(
      flatStyle(screen.getByTestId("chevron", hidden) as never).width,
    ).toBe(20);
    expect(flatStyle(screen.getByTestId("check", hidden) as never).width).toBe(
      16,
    );
    expect(flatStyle(screen.getByTestId("mark", hidden) as never).width).toBe(
      24,
    );
  });

  it("grows with the font until it fills the 28pt column, then stops", async () => {
    // accessibility-extra-large: text about two and a half times its size.
    atTextSize(2.35);
    await renderScreen(
      <>
        <Glyph name="chevron-end" size={20} testID="chevron" />
        <Glyph name="check" size={16} testID="check" />
        <Glyph name="clicker-glyph" size={40} testID="large" />
        <TrailMark state="next" label="1" testID="mark" />
      </>,
    );

    expect(
      flatStyle(screen.getByTestId("chevron", hidden) as never).width,
    ).toBe(ROW_LEADING_WIDTH);
    expect(flatStyle(screen.getByTestId("check", hidden) as never).width).toBe(
      ROW_LEADING_WIDTH,
    );
    // A mark already wider than the column is left alone.
    expect(flatStyle(screen.getByTestId("large", hidden) as never).width).toBe(
      40,
    );
    expect(flatStyle(screen.getByTestId("mark", hidden) as never).width).toBe(
      ROW_LEADING_WIDTH,
    );
  });

  it("grows in step below the cap", async () => {
    atTextSize(1.35);
    await renderScreen(<Glyph name="check" size={16} testID="check" />);

    expect(flatStyle(screen.getByTestId("check", hidden) as never).width).toBe(
      22,
    );
  });
});
