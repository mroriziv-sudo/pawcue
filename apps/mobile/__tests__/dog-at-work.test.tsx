import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { processColor } from "react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TrainingScreen from "../app/session/[slug]";
import TodayScreen from "../app/(tabs)/index";
import { i18n } from "../src/i18n";
import { skillDemo } from "../src/dogs/skill-demo";
import { drawDog, TREAT_FILL, type DogAppearance } from "../src/dogs/dog-art";
import { lookFor } from "../src/dogs/breed-lookup";
import { useSessionStore } from "../src/state/session-store";
import { useTrainingLogStore } from "../src/state/training-log-store";
import { useDogStore } from "../src/state/dog-store";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { useOnboardingStore } from "../src/state/onboarding-store";
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
import { makeLessonFixture, LESSON_IDS } from "./support/lesson-fixture";

/**
 * The dog at work (docs/architecture/phase-11-the-dog-at-work.md), driven through the real screens.
 *
 * What is asserted is the drawing itself: the shapes react-native-svg was handed are compared with what the
 * geometry module draws for the pose, expression and props the contract names. Decoration yields to text, so the
 * session scene is asserted present only where the measured paper allows it and absent where it does not.
 */

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockNavigate = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    navigate: mockNavigate,
  }),
  useLocalSearchParams: () => ({ slug: "sit" }),
  usePathname: () => "/",
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require("react-native");
    return <Text testID="redirect">{href}</Text>;
  },
}));

jest.mock("../src/lessons/lesson-repository", () => ({
  loadLessonContent: jest.fn(),
  LessonUnavailableError: class extends Error {},
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

import { loadLessonContent } from "../src/lessons/lesson-repository";

const mockedLoad = loadLessonContent as jest.MockedFunction<
  typeof loadLessonContent
>;

const TS = "2026-09-11T10:00:00.000Z";
const base = { createdAt: TS, updatedAt: TS };
const ID = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const SKILL = { name: ID(1), sit: ID(2) };

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function wrap(node: React.ReactNode, direction: "ltr" | "rtl" = "ltr") {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction={direction}>{node}</ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}

/** The Name Game fixture, re-slugged as the Sit lesson so the demo keys on the `sit` skill. */
function sitLesson() {
  const fixture = makeLessonFixture();
  return {
    ...fixture,
    lesson: {
      ...fixture.lesson,
      slug: "sit",
      skillId: SKILL.sit,
      titleKey: "lesson.sit.title",
      goalKey: "lesson.sit.goal",
    },
  };
}

function catalogue() {
  const lesson = sitLesson().lesson;
  return {
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
    lessons: [lesson],
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

/** The host nodes react-native-svg mounts, under a node: geometry as the app passed it, colours processed. */
interface Drawn {
  type: string;
  props: Record<string, unknown>;
}

function drawnShapes(node: unknown): Drawn[] {
  const out: Drawn[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const element = n as {
      type?: unknown;
      props?: Record<string, unknown>;
      children?: unknown[];
    };
    if (
      element.type === "RNSVGPath" ||
      element.type === "RNSVGEllipse" ||
      element.type === "RNSVGCircle"
    ) {
      out.push({ type: element.type, props: element.props ?? {} });
    }
    for (const child of element.children ?? []) walk(child);
  };
  walk(node);
  return out;
}

/** react-native-svg hands colours to the host as `{ payload }`, an unsigned ARGB int. */
function fillOf(shape: Drawn): number | null {
  const fill = shape.props["fill"] as { payload?: number } | null | undefined;
  return fill?.payload ?? null;
}
const argb = (hex: string) => (processColor(hex) as number) >>> 0;

/** A drawn dog is decorative — hidden from assistive technology — so the queries must look past that. */
function dog(testID: string) {
  return screen.getByTestId(testID, { includeHiddenElements: true });
}

/** The node draws exactly what the geometry module draws for this appearance. */
function expectDrawnAs(testID: string, appearance: DogAppearance) {
  const expected = drawDog(appearance).shapes;
  const rendered = drawnShapes(dog(testID));
  expect(rendered).toHaveLength(expected.length);
  for (const shape of expected) {
    const match = rendered.find(({ props }) =>
      shape.kind === "path"
        ? props["d"] === shape.d
        : shape.kind === "circle"
          ? props["cx"] === shape.cx &&
            props["cy"] === shape.cy &&
            props["r"] === shape.r
          : props["cx"] === shape.cx &&
            props["cy"] === shape.cy &&
            props["rx"] === shape.rx &&
            props["ry"] === shape.ry,
    );
    expect(match).toBeDefined();
  }
}

/** A layout event, awaited: React's act scopes must not overlap, or later state updates never flush. */
async function layout(testID: string, height: number) {
  await fireEvent(screen.getByTestId(testID), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
  });
}

const backend = createFakePlanBackend();

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetCatalogueCache();
  resetPlanLifecycleGuards();
  backend.reset();
  usePlanStore.getState().clear();
  mockLoadCatalogue.mockResolvedValue(catalogue());
  mockFetchDog.mockResolvedValue(DOG);
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
  useDogStore.setState({ dog: null, dogId: null, hydrated: true, error: null });
  useOnboardingStore.setState({
    draft: {},
    stepIndex: 0,
    skipped: false,
    hydrated: true,
  });
  useSessionStore.setState({ session: null, lastFailure: null });
  useTrainingLogStore.setState({ completed: [], hydrated: true });
  await i18n.changeLanguage("en-US");
  mockedLoad.mockResolvedValue({ content: sitLesson(), source: "network" });
});

describe("skillDemo", () => {
  it("returns the contract's pose, expression and props for every skill", () => {
    expect(skillDemo("name_response")).toEqual({
      pose: "sit",
      expression: "attentive",
      props: [],
    });
    expect(skillDemo("sit")).toEqual({
      pose: "sit",
      expression: "focused",
      props: ["treat"],
    });
    expect(skillDemo("down")).toEqual({
      pose: "down",
      expression: "focused",
      props: ["treat"],
    });
    expect(skillDemo("stay")).toEqual({
      pose: "sit",
      expression: "focused",
      props: [],
    });
    expect(skillDemo("come")).toEqual({
      pose: "run",
      expression: "happy",
      props: [],
    });
    expect(skillDemo("leave_it")).toEqual({
      pose: "sit",
      expression: "focused",
      props: ["treat"],
    });
    expect(skillDemo("place")).toEqual({
      pose: "down",
      expression: "focused",
      props: ["mat"],
    });
    expect(skillDemo("loose_leash_basics")).toEqual({
      pose: "stand",
      expression: "attentive",
      props: ["leash"],
    });
  });

  it("falls back to the plain sitting dog for a skill it does not know, or none", () => {
    const plain = { pose: "sit", expression: "attentive", props: [] };
    expect(skillDemo("fetch")).toEqual(plain);
    expect(skillDemo(null)).toEqual(plain);
    expect(skillDemo(undefined)).toEqual(plain);
  });
});

async function renderTraining() {
  await render(wrap(<TrainingScreen />));
  await waitFor(() =>
    expect(screen.getByTestId("training-screen")).toBeTruthy(),
  );
}

describe("the session scene", () => {
  it("draws the sit demo — focused, with the treat — once the paper below the text allows it", async () => {
    await renderTraining();
    // Nothing until the region has been measured: the scene is never assumed to fit.
    expect(screen.queryByTestId("session-demo")).toBeNull();

    await layout("session-instruction-region", 620);
    await layout("session-text-block", 180);

    await waitFor(() =>
      expect(screen.getByTestId("session-demo")).toBeTruthy(),
    );
    expectDrawnAs("session-demo-sit", {
      ...lookFor(null),
      pose: "sit",
      expression: "focused",
      props: ["treat"],
    });
    // The one amber shape is the treat, and it is not spoken: the scene is decorative.
    const amber = drawnShapes(screen.getByTestId("session-demo")).filter(
      (shape) => fillOf(shape) === argb(TREAT_FILL),
    );
    expect(amber).toHaveLength(1);
    expect(dog("session-demo-sit").props.accessibilityElementsHidden).toBe(
      true,
    );
  });

  it("gives way to the text when less than 200pt is left below it", async () => {
    await renderTraining();
    await layout("session-instruction-region", 400);
    await layout("session-text-block", 220);
    await waitFor(() =>
      expect(screen.getByTestId("step-instruction")).toBeTruthy(),
    );
    expect(screen.queryByTestId("session-demo")).toBeNull();

    // And comes back when the text shrinks — say, a shorter step.
    await layout("session-text-block", 120);
    await waitFor(() =>
      expect(screen.getByTestId("session-demo")).toBeTruthy(),
    );
  });

  it("steps aside for the help sheet, whose puzzled bust is the one dog in that state", async () => {
    await renderTraining();
    await layout("session-instruction-region", 620);
    await layout("session-text-block", 180);
    await waitFor(() =>
      expect(screen.getByTestId("session-demo")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("open-troubleshooting"));
    await waitFor(() =>
      expect(screen.getByTestId("troubleshooting-screen")).toBeTruthy(),
    );
    expect(screen.queryByTestId("session-demo")).toBeNull();
  });

  it("celebrates completion with the sitting, happy dog and its treat", async () => {
    await renderTraining();
    const store = useSessionStore.getState();
    const content = sitLesson();
    store.completeStep(content, LESSON_IDS.step1);
    store.click(content);
    store.completeStep(content, LESSON_IDS.step2Clicker);
    store.completeStep(content, LESSON_IDS.step3);
    store.click(content);
    for (let i = 0; i < 5; i += 1) store.addRepetition(content);
    store.completeStep(content, LESSON_IDS.step4Reps);

    await waitFor(() =>
      expect(screen.getByTestId("session-complete")).toBeTruthy(),
    );
    expectDrawnAs("completion-dog", {
      ...lookFor(null),
      pose: "sit",
      expression: "happy",
      props: ["treat"],
    });
  });
});

describe("Today", () => {
  it("rests the dog, eyes closed, when the day's plan is done", async () => {
    useDogStore.setState({
      dog: DOG,
      dogId: DOG.id,
      hydrated: true,
      error: null,
    });
    // The plan is a commitment made first; finishing the lesson is progress through it, not a new plan.
    await render(wrap(<TodayScreen />));
    await waitFor(() => expect(dog("today-dog-avatar")).toBeTruthy());

    const today = new Date().toISOString().slice(0, 10);
    const lesson = sitLesson().lesson;
    await act(() => {
      useTrainingLogStore.setState({
        completed: [
          {
            sessionId: "done-1",
            lessonId: lesson.id,
            lessonSlug: lesson.slug,
            startedAt: `${today}T09:00:00.000Z`,
            endedAt: `${today}T09:03:00.000Z`,
            status: "completed",
            stepsCompleted: 4,
            repetitionsLogged: 5,
            clickerPresses: 2,
            troubleshootingViewed: 0,
            syncedToServer: true,
          },
        ],
        hydrated: true,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("today-all-done")).toBeTruthy(),
    );
    expectDrawnAs("today-all-done-dog", {
      ...lookFor(DOG.breed),
      pose: "rest",
      expression: "resting",
    });
    // One dog in this state: the resting scene, and no bust beside a coach line.
    expect(
      screen.queryByTestId("today-dog-avatar", { includeHiddenElements: true }),
    ).toBeNull();
  });

  it("sits the dog, attentive, beside the coach line while a lesson is waiting", async () => {
    useDogStore.setState({
      dog: DOG,
      dogId: DOG.id,
      hydrated: true,
      error: null,
    });
    await render(wrap(<TodayScreen />));
    await waitFor(() => expect(dog("today-dog-avatar")).toBeTruthy());
    expectDrawnAs("today-dog-avatar", {
      ...lookFor(DOG.breed),
      pose: "sit",
      expression: "attentive",
    });
  });
});
