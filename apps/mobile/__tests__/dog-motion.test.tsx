import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { Animated, AppState, type AppStateStatus } from "react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TrainingScreen from "../app/session/[slug]";
import { DogAvatar } from "../src/components/DogAvatar";
import { DOG_MOTION } from "../src/components/dog-motion";
import { i18n } from "../src/i18n";
import { drawDog, type DogAppearance } from "../src/dogs/dog-art";
import { lookFor } from "../src/dogs/breed-lookup";
import { useSessionStore } from "../src/state/session-store";
import { useTrainingLogStore } from "../src/state/training-log-store";
import { useDogStore } from "../src/state/dog-store";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { resetCatalogueCache } from "../src/lessons/useCatalogue";
import { usePlanStore } from "../src/state/plan-store";
import { makeLessonFixture, LESSON_IDS } from "./support/lesson-fixture";

/**
 * The dog moves (docs/architecture/phase-11-the-dog-at-work.md, "Motion"): a blink on a timer, breathing on a
 * loop, a wag for a counted rep, a bounce on completion — and none of it on a bust, a photo, a small dog, in the
 * background, or under Reduce Motion. Asserted on what react-native-svg and the Animated wrapper were handed,
 * the way dog-at-work.test.tsx reads the drawing: the eyelid arcs in place of the eyes, the tail group's
 * transform, the wrapper's transform.
 */

const mockReduceMotion = jest.fn(() => false);
jest.mock("@pawcue/ui", () => {
  const actual = jest.requireActual<typeof import("@pawcue/ui")>("@pawcue/ui");
  return { ...actual, useReducedMotion: () => mockReduceMotion() };
});

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => ({ slug: "sit" }),
  usePathname: () => "/",
}));

jest.mock("../src/lessons/lesson-repository", () => ({
  loadLessonContent: jest.fn(),
  LessonUnavailableError: class extends Error {},
}));

const mockLoadCatalogue = jest.fn();
jest.mock("../src/plans/plan-repository", () => ({
  loadPlanningCatalogue: () => mockLoadCatalogue(),
  persistGeneratedPlan: jest.fn(),
  fetchActivePlan: jest.fn(),
}));

jest.mock("../src/dogs/dog-repository", () => ({
  createDog: jest.fn(),
  fetchDog: jest.fn(),
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
const SKILL_SIT = ID(2);

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function wrap(node: React.ReactNode) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction="ltr">{node}</ThemeProvider>
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
      skillId: SKILL_SIT,
      titleKey: "lesson.sit.title",
      goalKey: "lesson.sit.goal",
    },
  };
}

function catalogue() {
  return {
    skills: [
      {
        id: SKILL_SIT,
        slug: "sit",
        titleKey: "skill.sit.title",
        prerequisiteSkillIds: [],
        difficulty: 1,
        ...base,
      },
    ],
    lessons: [sitLesson().lesson],
  };
}

/** The sit demo the session draws for the generic dog: sit, focused, the treat. */
const SIT_DEMO: DogAppearance = {
  ...lookFor(null),
  pose: "sit",
  expression: "focused",
  props: ["treat"],
};

// --- reading the host tree, as dog-at-work.test.tsx does ------------------------------------------------------

interface Host {
  type: string;
  props: Record<string, unknown>;
}

function hostNodes(node: unknown, types: readonly string[]): Host[] {
  const out: Host[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const element = n as {
      type?: unknown;
      props?: Record<string, unknown>;
      children?: unknown[];
    };
    if (typeof element.type === "string" && types.includes(element.type)) {
      out.push({ type: element.type, props: element.props ?? {} });
    }
    for (const child of element.children ?? []) walk(child);
  };
  walk(node);
  return out;
}

const SHAPES = ["RNSVGPath", "RNSVGEllipse", "RNSVGCircle"] as const;

function dog(testID: string) {
  return screen.getByTestId(testID, { includeHiddenElements: true });
}

/** The one drawn dog under `testID` draws exactly what the geometry module draws for this appearance. */
function expectDrawnAs(testID: string, appearance: DogAppearance) {
  const expected = drawDog(appearance).shapes;
  const rendered = hostNodes(dog(testID), SHAPES);
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

/** Whether any drawn group under the node is turned: the tail group mid-wag carries a non-identity matrix. */
function isTurned(node: unknown): boolean {
  const identity = [1, 0, 0, 1, 0, 0];
  return hostNodes(node, ["RNSVGGroup"]).some(({ props }) => {
    const matrix = props["matrix"] as number[] | undefined;
    return (
      Array.isArray(matrix) &&
      matrix.some((v, i) => Math.abs(v - (identity[i] ?? 0)) > 1e-6)
    );
  });
}

function eyelidsOf(appearance: DogAppearance): string[] {
  return drawDog({ ...appearance, blink: true })
    .shapes.filter((s) => s.part === "eyelid")
    .map((s) => (s.kind === "path" ? s.d : ""));
}

function drawsEyelids(testID: string, appearance: DogAppearance): boolean {
  const paths = hostNodes(dog(testID), ["RNSVGPath"]).map((p) => p.props["d"]);
  return eyelidsOf(appearance).every((d) => paths.includes(d));
}

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

async function layout(testID: string, height: number) {
  await fireEvent(screen.getByTestId(testID), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
  });
}

/** The app-state listener the avatar registers, captured because `AppState.emit` does not exist on the mock. */
let appStateHandler: ((state: AppStateStatus) => void) | null = null;
/** Every breathing loop started, with its `stop` spied on. */
let loops: Array<{ stop: jest.SpyInstance }> = [];

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(Math, "random").mockReturnValue(0);
  appStateHandler = null;
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation(
      (type: string, handler: (s: AppStateStatus) => void) => {
        if (type === "change") appStateHandler = handler;
        return { remove: jest.fn() };
      },
    );
  loops = [];
  const realLoop = Animated.loop;
  jest.spyOn(Animated, "loop").mockImplementation((...args) => {
    const loop = realLoop(...args);
    const stop = jest.spyOn(loop, "stop");
    loops.push({ stop });
    return loop;
  });
  mockReduceMotion.mockReturnValue(false);

  await AsyncStorage.clear();
  resetCatalogueCache();
  usePlanStore.getState().clear();
  mockLoadCatalogue.mockResolvedValue(catalogue());
  useBootstrapStore.setState({ status: "ready" });
  useDogStore.setState({ dog: null, dogId: null, hydrated: true, error: null });
  useSessionStore.setState({ session: null, lastFailure: null });
  useTrainingLogStore.setState({ completed: [], hydrated: true });
  await i18n.changeLanguage("en-US");
  mockedLoad.mockResolvedValue({ content: sitLesson(), source: "network" });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("idle", () => {
  const still = {
    ...lookFor(null),
    pose: "sit",
    expression: "attentive",
  } as const;

  it("blinks on schedule: eyes closed for 120ms after the gap, and open again", async () => {
    await render(
      wrap(<DogAvatar breed={null} size={140} pose="sit" testID="dog" />),
    );
    expectDrawnAs("dog", still);
    expect(loops).toHaveLength(1);

    // Math.random is pinned to 0, so the gap is its minimum.
    await tick(DOG_MOTION.blink.minGap - 1);
    expect(drawsEyelids("dog", still)).toBe(false);
    await tick(1);
    expect(drawsEyelids("dog", still)).toBe(true);
    expectDrawnAs("dog", { ...still, blink: true });

    await tick(DOG_MOTION.blink.closed);
    expect(drawsEyelids("dog", still)).toBe(false);
    expectDrawnAs("dog", still);

    // And again: a loop, not a one-off.
    await tick(DOG_MOTION.blink.minGap);
    expect(drawsEyelids("dog", still)).toBe(true);
  });

  it("never runs on a bust, a photo, or a dog below 120pt", async () => {
    await render(
      wrap(
        <>
          <DogAvatar breed={null} size={56} testID="bust" />
          <DogAvatar
            breed={null}
            size={140}
            photoUri="file:///luna.jpg"
            testID="photo"
          />
          <DogAvatar breed={null} size={96} pose="sit" testID="small" />
        </>,
      ),
    );
    await tick(DOG_MOTION.blink.maxGap + DOG_MOTION.blink.closed);
    expect(loops).toHaveLength(0);
    for (const id of ["bust", "photo", "small"]) {
      expect(
        screen.queryByTestId(`${id}-motion`, { includeHiddenElements: true }),
      ).toBeNull();
    }
    expectDrawnAs("bust", { ...lookFor(null), pose: "bust" });
    expectDrawnAs("small", still);
    expect(drawsEyelids("small", still)).toBe(false);
  });

  it("stops both loops in the background, resumes them in the foreground, and stops them on unmount", async () => {
    const view = await render(
      wrap(<DogAvatar breed={null} size={140} pose="sit" testID="dog" />),
    );
    expect(loops).toHaveLength(1);
    expect(appStateHandler).not.toBeNull();
    // The wrapper carries the breathing scale and the bounce, at rest.
    const wrapper = screen.getByTestId("dog-motion", {
      includeHiddenElements: true,
    });
    expect(wrapper.props.style.transform).toEqual([
      { translateY: 0 },
      { scale: 1 },
    ]);

    await act(() => appStateHandler?.("background"));
    expect(loops[0]?.stop).toHaveBeenCalledTimes(1);
    await tick(DOG_MOTION.blink.maxGap + DOG_MOTION.blink.closed);
    expect(drawsEyelids("dog", still)).toBe(false);

    await act(() => appStateHandler?.("active"));
    expect(loops).toHaveLength(2);
    await tick(DOG_MOTION.blink.minGap);
    expect(drawsEyelids("dog", still)).toBe(true);

    await view.unmount();
    expect(loops[1]?.stop).toHaveBeenCalledTimes(1);
  });

  it("under Reduce Motion starts neither loop, and a rep reaction is the expression change alone, with no transform", async () => {
    mockReduceMotion.mockReturnValue(true);
    await render(
      wrap(
        <DogAvatar
          breed={null}
          size={140}
          pose="sit"
          expression="focused"
          props={["treat"]}
          reaction={{ kind: "rep", key: 1 }}
          testID="dog"
        />,
      ),
    );
    expect(loops).toHaveLength(0);
    expect(
      screen.queryByTestId("dog-motion", { includeHiddenElements: true }),
    ).toBeNull();
    // The happy face lands at once (the cross-fade's outgoing layer is gone after its own settle).
    await tick(500);
    expectDrawnAs("dog", { ...SIT_DEMO, expression: "happy" });
    expect(isTurned(dog("dog"))).toBe(false);
    // And the caller's face comes back after 700ms.
    await tick(DOG_MOTION.wag.happyFor);
    await tick(500);
    expectDrawnAs("dog", SIT_DEMO);

    await tick(DOG_MOTION.blink.maxGap + DOG_MOTION.blink.closed);
    expect(drawsEyelids("dog", SIT_DEMO)).toBe(false);
    expect(loops).toHaveLength(0);
  });
});

describe("reactive, on the session screen", () => {
  async function renderTraining() {
    await render(wrap(<TrainingScreen />));
    await waitFor(() =>
      expect(screen.getByTestId("training-screen")).toBeTruthy(),
    );
  }

  /** Walks the session to the repetition step through the store, the way dog-at-work.test.tsx completes it. */
  async function advanceToReps() {
    const store = useSessionStore.getState();
    const content = sitLesson();
    await act(() => {
      store.completeStep(content, LESSON_IDS.step1);
      store.click(content);
      store.completeStep(content, LESSON_IDS.step2Clicker);
      store.completeStep(content, LESSON_IDS.step3);
    });
    return content;
  }

  it("wags for a counted rep and returns to the demo expression after 700ms", async () => {
    await renderTraining();
    await layout("session-instruction-region", 700);
    await layout("session-text-block", 120);
    await tick(0);
    expectDrawnAs("session-demo-sit", SIT_DEMO);
    expect(isTurned(screen.getByTestId("session-demo"))).toBe(false);

    const content = await advanceToReps();
    expect(screen.getByTestId("repetition-counter")).toBeTruthy();

    await act(() => useSessionStore.getState().addRepetition(content));
    // Mid-burst: the tail group is turned, and the face is the happy one.
    await tick(100);
    expect(isTurned(screen.getByTestId("session-demo"))).toBe(true);
    await tick(400);
    // The wag is a burst: home again inside 400ms, while the happy face is still up.
    expect(isTurned(screen.getByTestId("session-demo"))).toBe(false);
    expectDrawnAs("session-demo-sit", { ...SIT_DEMO, expression: "happy" });

    await tick(DOG_MOTION.wag.happyFor);
    await tick(500);
    expectDrawnAs("session-demo-sit", SIT_DEMO);

    // Twice in a row: a second rep is a second wag.
    await act(() => useSessionStore.getState().addRepetition(content));
    await tick(100);
    expect(isTurned(screen.getByTestId("session-demo"))).toBe(true);
  });

  it("fires no reaction, and no error, when a rep is counted with no scene on screen — and does not wag for it later", async () => {
    await renderTraining();
    // The dock leaves too little room: no scene.
    await layout("session-instruction-region", 400);
    await layout("session-text-block", 220);
    await tick(0);
    expect(screen.queryByTestId("session-demo")).toBeNull();

    const content = await advanceToReps();
    await act(() => useSessionStore.getState().addRepetition(content));
    await tick(200);
    expect(screen.queryByTestId("session-demo")).toBeNull();
    expect(screen.getByTestId("repetition-count")).toHaveTextContent("1 of 5");

    // Room appears later — say, a shorter step — and the dog arrives still, with its own face.
    await layout("session-text-block", 100);
    await tick(100);
    expectDrawnAs("session-demo-sit", SIT_DEMO);
    expect(isTurned(screen.getByTestId("session-demo"))).toBe(false);
  });

  it("bounces once as the completion screen arrives", async () => {
    const timing = jest.spyOn(Animated, "timing");
    await renderTraining();
    const content = await advanceToReps();
    const store = useSessionStore.getState();
    await act(() => {
      store.click(content);
      for (let i = 0; i < 5; i += 1) store.addRepetition(content);
      store.completeStep(content, LESSON_IDS.step4Reps);
    });
    expect(screen.getByTestId("session-complete")).toBeTruthy();
    expect(
      screen.getByTestId("completion-dog-motion", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    const hops = timing.mock.calls.filter(
      ([, config]) => config.toValue === -DOG_MOTION.bounce.rise,
    );
    expect(hops).toHaveLength(1);
  });
});
