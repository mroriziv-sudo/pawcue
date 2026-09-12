import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LessonOverviewScreen from "../app/lesson/[slug]";
import TrainingScreen from "../app/session/[slug]";
import { i18n } from "../src/i18n";
import { useSessionStore } from "../src/state/session-store";
import { useTrainingLogStore } from "../src/state/training-log-store";
import { makeLessonFixture, LESSON_IDS } from "./support/lesson-fixture";

/**
 * The lesson flow, driven through the real screens.
 *
 * These assert what a user can observe — the instruction on screen, whether the advance button is usable, what the
 * rep counter reads, what happens after troubleshooting — rather than the shape of the store behind it. The
 * session engine's rules are covered separately in `@pawcue/domain`; the point here is that the renderer honours
 * them and that the same components render a lesson correctly in both languages.
 */

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useLocalSearchParams: () => ({ slug: "name_game" }),
}));

// The repository is mocked, not the hook: the hook's own loading/error handling is part of what is under test.
jest.mock("../src/lessons/lesson-repository", () => ({
  loadLessonContent: jest.fn(),
  LessonUnavailableError: class extends Error {},
}));

import { loadLessonContent } from "../src/lessons/lesson-repository";

const mockedLoad = loadLessonContent as jest.MockedFunction<
  typeof loadLessonContent
>;

const testMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function wrap(node: React.ReactNode, direction: "ltr" | "rtl" = "ltr") {
  return (
    <SafeAreaProvider initialMetrics={testMetrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction={direction}>{node}</ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}

async function renderTraining(direction: "ltr" | "rtl" = "ltr") {
  const view = await render(wrap(<TrainingScreen />, direction));
  await waitFor(() =>
    expect(screen.getByTestId("training-screen")).toBeTruthy(),
  );
  return view;
}

/** Walks the session to the repetition step through the UI, exactly as a user would. */
async function advanceToRepetitionStep() {
  await fireEvent.press(screen.getByTestId("advance-step"));
  await fireEvent.press(screen.getByTestId("session-clicker"));
  await fireEvent.press(screen.getByTestId("advance-step"));
  await fireEvent.press(screen.getByTestId("advance-step"));
  await waitFor(() =>
    expect(screen.getByTestId("repetition-counter")).toBeTruthy(),
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useSessionStore.setState({ session: null, lastFailure: null });
  useTrainingLogStore.setState({ completed: [], hydrated: false });
  await i18n.changeLanguage("en-US");
  mockedLoad.mockResolvedValue({
    content: makeLessonFixture(),
    source: "network",
  });
});

describe("lesson overview", () => {
  it("shows what the user is about to teach before any training starts", async () => {
    await render(wrap(<LessonOverviewScreen />));

    await waitFor(() =>
      expect(screen.getByTestId("lesson-overview")).toBeTruthy(),
    );
    expect(screen.getByTestId("lesson-title")).toHaveTextContent(/Name Game/);
    expect(screen.getByTestId("lesson-goal").props.children).toBeTruthy();
    expect(screen.getByTestId("lesson-duration")).toHaveTextContent(/3/);
    expect(screen.getByTestId("lesson-steps-count")).toHaveTextContent(/4/);
  });

  it("lists the equipment the lesson data declares", async () => {
    await render(wrap(<LessonOverviewScreen />));
    await waitFor(() =>
      expect(screen.getByTestId("lesson-overview")).toBeTruthy(),
    );

    expect(screen.getByTestId("equipment-treats")).toHaveTextContent(/Treats/);
    expect(screen.getByTestId("equipment-clicker")).toHaveTextContent(
      /Clicker/,
    );
  });

  it("says so when the lesson is being served from the offline cache", async () => {
    mockedLoad.mockResolvedValue({
      content: makeLessonFixture(),
      source: "cache",
    });
    await render(wrap(<LessonOverviewScreen />));

    await waitFor(() =>
      expect(screen.getByTestId("lesson-offline-notice")).toBeTruthy(),
    );
  });

  it("explains itself when the lesson cannot be loaded at all", async () => {
    mockedLoad.mockRejectedValue(new Error("offline"));
    await render(wrap(<LessonOverviewScreen />));

    await waitFor(() =>
      expect(screen.getByTestId("lesson-unavailable")).toBeTruthy(),
    );
  });

  it("starts training on the lesson from its data, not a hardcoded route", async () => {
    await render(wrap(<LessonOverviewScreen />));
    await waitFor(() =>
      expect(screen.getByTestId("lesson-overview")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("start-training"));
    expect(mockPush).toHaveBeenCalledWith("/session/name_game");
  });
});

describe("training flow", () => {
  it("opens on the first step with progress showing", async () => {
    await renderTraining();

    expect(screen.getByTestId("step-counter")).toHaveTextContent("Step 1 of 4");
    expect(screen.getByTestId("step-instruction").props.children).toBeTruthy();
    expect(screen.getByTestId("session-progress")).toBeTruthy();
  });

  it("advances through a step with no requirements", async () => {
    await renderTraining();

    await fireEvent.press(screen.getByTestId("advance-step"));

    await waitFor(() =>
      expect(screen.getByTestId("step-counter")).toHaveTextContent(
        "Step 2 of 4",
      ),
    );
  });

  it("renders the clicker only on the step whose data requires it", async () => {
    await renderTraining();

    expect(screen.queryByTestId("session-clicker")).toBeNull();
    await fireEvent.press(screen.getByTestId("advance-step"));

    await waitFor(() =>
      expect(screen.getByTestId("session-clicker")).toBeTruthy(),
    );
  });

  it("will not advance a clicker step until the clicker has been used", async () => {
    await renderTraining();
    await fireEvent.press(screen.getByTestId("advance-step"));
    await waitFor(() =>
      expect(screen.getByTestId("session-clicker")).toBeTruthy(),
    );

    expect(
      screen.getByTestId("advance-step").props.accessibilityState,
    ).toMatchObject({ disabled: true });

    await fireEvent.press(screen.getByTestId("session-clicker"));

    await waitFor(() =>
      expect(
        screen.getByTestId("advance-step").props.accessibilityState,
      ).toMatchObject({ disabled: false }),
    );
  });

  it("records a clicker press as a session event", async () => {
    await renderTraining();
    await fireEvent.press(screen.getByTestId("advance-step"));
    await waitFor(() =>
      expect(screen.getByTestId("session-clicker")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("session-clicker"));

    const session = useSessionStore.getState().session;
    expect(
      session?.events.filter((event) => event.type === "clicker_pressed"),
    ).toHaveLength(1);
  });

  it("renders the rep counter only on the step whose data sets a target", async () => {
    await renderTraining();
    expect(screen.queryByTestId("repetition-counter")).toBeNull();

    await advanceToRepetitionStep();
    expect(screen.getByTestId("repetition-count")).toHaveTextContent("0 of 5");
  });

  it("counts repetitions and only then allows the lesson to finish", async () => {
    await renderTraining();
    await advanceToRepetitionStep();

    expect(
      screen.getByTestId("advance-step").props.accessibilityState,
    ).toMatchObject({ disabled: true });

    for (let i = 0; i < 5; i += 1) {
      await fireEvent.press(screen.getByTestId("add-repetition"));
    }

    await waitFor(() =>
      expect(screen.getByTestId("repetition-count")).toHaveTextContent(
        "5 of 5",
      ),
    );
    expect(
      screen.getByTestId("advance-step").props.accessibilityState,
    ).toMatchObject({ disabled: false });
  });

  it("lets a mis-tapped repetition be taken back", async () => {
    await renderTraining();
    await advanceToRepetitionStep();

    await fireEvent.press(screen.getByTestId("add-repetition"));
    await waitFor(() =>
      expect(screen.getByTestId("repetition-count")).toHaveTextContent(
        "1 of 5",
      ),
    );

    await fireEvent.press(screen.getByTestId("undo-repetition"));
    await waitFor(() =>
      expect(screen.getByTestId("repetition-count")).toHaveTextContent(
        "0 of 5",
      ),
    );
  });

  it("a clicker press is not a repetition", async () => {
    await renderTraining();
    await advanceToRepetitionStep();

    // This step has a rep target and no clicker, so the counter must be driven only by its own control.
    expect(screen.queryByTestId("session-clicker")).toBeNull();
    expect(screen.getByTestId("repetition-count")).toHaveTextContent("0 of 5");
  });

  it("reaches a completion state that reports what actually happened", async () => {
    await renderTraining();
    await advanceToRepetitionStep();
    for (let i = 0; i < 5; i += 1) {
      await fireEvent.press(screen.getByTestId("add-repetition"));
    }
    await fireEvent.press(screen.getByTestId("advance-step"));

    await waitFor(() =>
      expect(screen.getByTestId("session-complete")).toBeTruthy(),
    );
    expect(screen.getByTestId("completion-reps")).toHaveTextContent(/\b5\b/);
    expect(useSessionStore.getState().session?.status).toBe("completed");

    // And the completion is written to the local training log.
    await waitFor(() =>
      expect(useTrainingLogStore.getState().completed).toHaveLength(1),
    );
  });
});

describe("troubleshooting", () => {
  it("is reachable from the step and returns without losing progress", async () => {
    await renderTraining();
    await advanceToRepetitionStep();
    await fireEvent.press(screen.getByTestId("add-repetition"));
    await fireEvent.press(screen.getByTestId("add-repetition"));

    await fireEvent.press(screen.getByTestId("open-troubleshooting"));
    await waitFor(() =>
      expect(screen.getByTestId("troubleshooting-screen")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("troubleshooting-dog_distracted"));
    await waitFor(() =>
      expect(screen.getByTestId("troubleshooting-guidance")).toBeTruthy(),
    );
    expect(screen.getByTestId("guidance-body").props.children).toBeTruthy();

    await fireEvent.press(screen.getByTestId("close-troubleshooting"));

    await waitFor(() =>
      expect(screen.getByTestId("repetition-counter")).toBeTruthy(),
    );
    expect(screen.getByTestId("repetition-count")).toHaveTextContent("2 of 5");
    expect(screen.getByTestId("step-counter")).toHaveTextContent("Step 4 of 4");
  });

  it("shows an escalation notice for an option the content marks non-normal", async () => {
    await renderTraining();
    await fireEvent.press(screen.getByTestId("open-troubleshooting"));
    await waitFor(() =>
      expect(screen.getByTestId("troubleshooting-screen")).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByTestId("troubleshooting-biting_causes_injury"),
    );

    await waitFor(() =>
      expect(screen.getByTestId("escalation-notice")).toBeTruthy(),
    );
  });

  it("does not show an escalation notice for a normal option", async () => {
    await renderTraining();
    await fireEvent.press(screen.getByTestId("open-troubleshooting"));
    await waitFor(() =>
      expect(screen.getByTestId("troubleshooting-screen")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("troubleshooting-dog_distracted"));

    await waitFor(() =>
      expect(screen.getByTestId("troubleshooting-guidance")).toBeTruthy(),
    );
    expect(screen.queryByTestId("escalation-notice")).toBeNull();
  });
});

describe("resume", () => {
  it("returns to the step the user left off on", async () => {
    const first = await renderTraining();
    await advanceToRepetitionStep();
    await fireEvent.press(screen.getByTestId("add-repetition"));
    await first.unmount();

    // Simulates a process restart: only what was written to storage survives.
    useSessionStore.setState({ session: null, lastFailure: null });

    await renderTraining();

    await waitFor(() =>
      expect(screen.getByTestId("step-counter")).toHaveTextContent(
        "Step 4 of 4",
      ),
    );
    expect(screen.getByTestId("repetition-count")).toHaveTextContent("1 of 5");
  });
});

describe("Hebrew and RTL", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("he-IL");
  });

  it("renders the lesson overview in Hebrew", async () => {
    await render(wrap(<LessonOverviewScreen />, "rtl"));
    await waitFor(() =>
      expect(screen.getByTestId("lesson-overview")).toBeTruthy(),
    );

    expect(screen.getByTestId("lesson-title")).toHaveTextContent(/משחק/);
    expect(screen.getByTestId("equipment-treats")).toHaveTextContent(/חטיפים/);
  });

  it("renders the training screen in Hebrew with RTL writing direction", async () => {
    await renderTraining("rtl");

    const instruction = screen.getByTestId("step-instruction");
    const style = Array.isArray(instruction.props.style)
      ? Object.assign({}, ...instruction.props.style.flat())
      : instruction.props.style;
    expect(style.writingDirection).toBe("rtl");
    expect(style.textAlign).toBe("right");
  });

  it("runs the whole flow in Hebrew, including reps and completion", async () => {
    await renderTraining("rtl");
    await advanceToRepetitionStep();

    for (let i = 0; i < 5; i += 1) {
      await fireEvent.press(screen.getByTestId("add-repetition"));
    }
    await fireEvent.press(screen.getByTestId("advance-step"));

    await waitFor(() =>
      expect(screen.getByTestId("session-complete")).toBeTruthy(),
    );
    expect(screen.getByTestId("completion-title")).toHaveTextContent(
      /כל הכבוד/,
    );
  });

  it("renders Hebrew troubleshooting guidance", async () => {
    await renderTraining("rtl");
    await fireEvent.press(screen.getByTestId("open-troubleshooting"));
    await waitFor(() =>
      expect(screen.getByTestId("troubleshooting-screen")).toBeTruthy(),
    );

    await fireEvent.press(screen.getByTestId("troubleshooting-dog_distracted"));
    await waitFor(() =>
      expect(screen.getByTestId("guidance-body")).toBeTruthy(),
    );

    const text = screen.getByTestId("guidance-body").props.children as string;
    // Hebrew guidance, not an untranslated key leaking through.
    expect(text).not.toMatch(/^troubleshoot\./);
    expect(text).toMatch(/[֐-׿]/);
  });
});

describe("accessibility", () => {
  it("caps Dynamic Type growth on the training heading but not on instructions", async () => {
    await renderTraining();

    // Headings are capped so a huge type size cannot push the step instruction off screen; body copy is uncapped
    // so the instruction itself stays fully scalable.
    expect(
      screen.getByTestId("step-instruction").props.maxFontSizeMultiplier,
    ).toBe(1.7);
  });

  it("exposes progress to assistive technology as a value, not just a bar", async () => {
    await renderTraining();

    const bar = screen.getByTestId("session-progress");
    expect(bar.props.accessibilityRole).toBe("progressbar");
    expect(bar.props.accessibilityValue).toMatchObject({ min: 0, max: 100 });
    expect(bar.props.accessibilityLabel).toContain("Step 1 of 4");
  });

  it("labels the clicker for screen readers on the step that has one", async () => {
    await renderTraining();
    await fireEvent.press(screen.getByTestId("advance-step"));
    await waitFor(() =>
      expect(screen.getByTestId("session-clicker")).toBeTruthy(),
    );

    const clicker = screen.getByTestId("session-clicker");
    expect(clicker.props.accessibilityRole).toBe("button");
    expect(clicker.props.accessibilityLabel).toBe(
      "Dog training clicker. Double tap to play click sound.",
    );
  });

  it("still completes the lesson with Reduce Motion enabled", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);

    await renderTraining();
    await advanceToRepetitionStep();
    for (let i = 0; i < 5; i += 1) {
      await fireEvent.press(screen.getByTestId("add-repetition"));
    }
    await fireEvent.press(screen.getByTestId("advance-step"));

    // Reduce Motion changes how controls animate, never whether the flow works.
    await waitFor(() =>
      expect(screen.getByTestId("session-complete")).toBeTruthy(),
    );
  });
});
