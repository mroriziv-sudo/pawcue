import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import OnboardingStepsScreen from "../app/onboarding/steps";
import OnboardingWelcomeScreen from "../app/onboarding/index";
import { i18n } from "../src/i18n";
import { useOnboardingStore } from "../src/state/onboarding-store";
import { useDogStore } from "../src/state/dog-store";
import { useBootstrapStore } from "../src/state/bootstrap-store";
import { STORAGE_KEYS } from "../src/lib/storage";

/**
 * Onboarding, driven through the real screens.
 *
 * The assertions are about what a user can do: whether they can move on, whether an answer they typed is still
 * there after going back, whether an interrupted flow resumes where it stopped, and whether a dog ends up
 * created with the right values. The step list itself is domain data, tested separately.
 */

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

const mockCreateDog = jest.fn();
jest.mock("../src/dogs/dog-repository", () => ({
  createDog: (...args: unknown[]) => mockCreateDog(...args),
  fetchDog: jest.fn(),
  listOwnDogs: jest.fn(),
  updateDog: jest.fn(),
}));

const OWNER = "00000000-0000-4000-a000-000000000abc";

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

async function renderSteps(direction: "ltr" | "rtl" = "ltr") {
  return await render(wrap(<OnboardingStepsScreen />, direction));
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useOnboardingStore.setState({
    draft: {},
    stepIndex: 0,
    skipped: false,
    hydrated: true,
  });
  useDogStore.setState({ dog: null, dogId: null, hydrated: true, error: null });
  useBootstrapStore.setState({ userId: OWNER });
  await i18n.changeLanguage("en-US");
  mockCreateDog.mockResolvedValue({
    id: "00000000-0000-4000-a000-0000000000d1",
    owner: { kind: "user", userId: OWNER },
    name: "Luna",
    birthdate: null,
    breed: null,
    sex: "unspecified",
    photoUrl: null,
    dailyTrainingMinutes: null,
    createdAt: "2026-09-11T10:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
  });
});

describe("the welcome screen", () => {
  it("offers a way straight to the clicker, because the app must work with no profile", async () => {
    await render(wrap(<OnboardingWelcomeScreen />));

    await fireEvent.press(screen.getByTestId("welcome-skip"));

    await waitFor(() =>
      expect(useOnboardingStore.getState().skipped).toBe(true),
    );
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("remembers that choice so the next launch does not ask again", async () => {
    await render(wrap(<OnboardingWelcomeScreen />));
    await fireEvent.press(screen.getByTestId("welcome-skip"));

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(STORAGE_KEYS.onboardingSkipped)).toBe(
        "true",
      );
    });
  });
});

describe("moving through the flow", () => {
  it("opens on the first question", async () => {
    await renderSteps();

    expect(screen.getByTestId("onboarding-progress")).toHaveTextContent(
      "Step 1 of 5",
    );
    expect(screen.getByTestId("step-title")).toHaveTextContent(/name/i);
  });

  it("will not move past the name until one is given", async () => {
    await renderSteps();

    await fireEvent.press(screen.getByTestId("onboarding-next"));

    await waitFor(() =>
      expect(screen.getByTestId("validation-message")).toBeTruthy(),
    );
    // Still on step 1 — a rejected step must not advance.
    expect(screen.getByTestId("onboarding-progress")).toHaveTextContent(
      "Step 1 of 5",
    );
  });

  it("says nothing about validation until the user tries to continue", async () => {
    await renderSteps();
    // Telling someone their name is required before they have typed anything is noise, not help.
    expect(screen.queryByTestId("validation-message")).toBeNull();
  });

  it("advances once the name is valid", async () => {
    await renderSteps();

    await fireEvent.changeText(screen.getByTestId("input-name"), "Luna");
    await fireEvent.press(screen.getByTestId("onboarding-next"));

    await waitFor(() =>
      expect(screen.getByTestId("onboarding-progress")).toHaveTextContent(
        "Step 2 of 5",
      ),
    );
  });

  it("writes a real date from the age wheels, so a malformed birthdate cannot be entered", async () => {
    useOnboardingStore.setState({ draft: { name: "Luna" }, stepIndex: 1 });
    await renderSteps();

    // The wheels are the platform's own; the only thing they can produce is a whole number of years and months.
    await fireEvent(screen.getByTestId("input-birthdate-years"), "change", {
      nativeEvent: { newValue: 2, newIndex: 2 },
    });

    await waitFor(() =>
      expect(useOnboardingStore.getState().draft.birthdate).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      ),
    );
    // And it reads the choice back as a sentence.
    expect(screen.getByTestId("input-birthdate-summary")).toHaveTextContent(
      /2 years/,
    );

    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-progress")).toHaveTextContent(
        "Step 3 of 5",
      ),
    );
  });

  it("lets an optional step be skipped outright", async () => {
    useOnboardingStore.setState({ draft: { name: "Luna" }, stepIndex: 1 });
    await renderSteps();

    await fireEvent.press(screen.getByTestId("onboarding-skip"));

    await waitFor(() =>
      expect(useOnboardingStore.getState().stepIndex).toBe(2),
    );
  });
});

describe("going back", () => {
  it("keeps what was already typed", async () => {
    await renderSteps();
    await fireEvent.changeText(screen.getByTestId("input-name"), "Luna");
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-progress")).toHaveTextContent(
        "Step 2 of 5",
      ),
    );

    await fireEvent.press(screen.getByTestId("onboarding-back"));

    await waitFor(() =>
      expect(screen.getByTestId("onboarding-progress")).toHaveTextContent(
        "Step 1 of 5",
      ),
    );
    // The answer is still there — losing it is the classic form bug this guards against.
    expect(screen.getByTestId("input-name").props.value).toBe("Luna");
  });

  it("keeps a choice answer too", async () => {
    useOnboardingStore.setState({ draft: { name: "Luna" }, stepIndex: 2 });
    await renderSteps();

    await fireEvent.press(screen.getByTestId("choice-sex-female"));
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await fireEvent.press(screen.getByTestId("onboarding-back"));

    await waitFor(() =>
      expect(useOnboardingStore.getState().draft.sex).toBe("female"),
    );
  });
});

describe("interruption and resume", () => {
  it("comes back to the step the user had reached, with answers intact", async () => {
    await renderSteps();
    await fireEvent.changeText(screen.getByTestId("input-name"), "Luna");
    await fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() =>
      expect(useOnboardingStore.getState().stepIndex).toBe(1),
    );

    // Simulates a process restart: in-memory state is gone, only storage remains.
    useOnboardingStore.setState({ draft: {}, stepIndex: 0, hydrated: false });
    await useOnboardingStore.getState().hydrate();

    expect(useOnboardingStore.getState().stepIndex).toBe(1);
    expect(useOnboardingStore.getState().draft.name).toBe("Luna");
  });

  it("starts clean when the stored draft is unreadable", async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.onboardingDraft, "{not json");

    await useOnboardingStore.getState().hydrate();

    expect(useOnboardingStore.getState().draft).toEqual({});
    expect(useOnboardingStore.getState().stepIndex).toBe(0);
  });
});

describe("creating the dog", () => {
  it("creates it from the draft and clears the draft afterwards", async () => {
    useOnboardingStore.setState({
      draft: { name: "Luna", breed: "Border Collie", sex: "female" },
      stepIndex: 4,
    });
    await renderSteps();

    await fireEvent.press(screen.getByTestId("onboarding-next"));

    await waitFor(() => expect(mockCreateDog).toHaveBeenCalledTimes(1));
    expect(mockCreateDog).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_user_id: OWNER,
        name: "Luna",
        breed: "Border Collie",
        sex: "female",
      }),
    );

    await waitFor(() => expect(useDogStore.getState().dogId).toBeTruthy());
    expect(useOnboardingStore.getState().draft).toEqual({});
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("keeps every answer when creation fails", async () => {
    mockCreateDog.mockRejectedValue(new Error("offline"));
    useOnboardingStore.setState({ draft: { name: "Luna" }, stepIndex: 4 });
    await renderSteps();

    await fireEvent.press(screen.getByTestId("onboarding-next"));

    await waitFor(() =>
      expect(screen.getByTestId("create-error")).toBeTruthy(),
    );
    // The draft is cleared only after the row exists, so a failure costs nothing.
    expect(useOnboardingStore.getState().draft.name).toBe("Luna");
    expect(useDogStore.getState().dogId).toBeNull();
  });

  it("stores the new dog id so startup routing can use it immediately", async () => {
    useOnboardingStore.setState({ draft: { name: "Luna" }, stepIndex: 4 });
    await renderSteps();

    await fireEvent.press(screen.getByTestId("onboarding-next"));

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(STORAGE_KEYS.activeDogId)).toBe(
        "00000000-0000-4000-a000-0000000000d1",
      );
    });
  });
});

describe("Hebrew and RTL", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("he-IL");
  });

  it("renders the questions in Hebrew", async () => {
    await renderSteps("rtl");

    expect(screen.getByTestId("step-title")).toHaveTextContent(/קוראים/);
    expect(screen.getByTestId("onboarding-next")).toBeTruthy();
  });

  it("gives the text field RTL direction and start-edge alignment", async () => {
    await renderSteps("rtl");

    const input = screen.getByTestId("input-name");
    const style = Array.isArray(input.props.style)
      ? Object.assign({}, ...input.props.style.flat())
      : input.props.style;
    expect(style.writingDirection).toBe("rtl");
    expect(style.textAlign).toBe("right");
  });

  it("shows validation messages in Hebrew", async () => {
    await renderSteps("rtl");

    await fireEvent.press(screen.getByTestId("onboarding-next"));

    await waitFor(() => {
      const message = screen.getByTestId("validation-message");
      expect(message).toHaveTextContent(/[֐-׿]/);
    });
  });

  it("completes the whole flow in Hebrew", async () => {
    await renderSteps("rtl");
    await fireEvent.changeText(screen.getByTestId("input-name"), "לונה");
    await fireEvent.press(screen.getByTestId("onboarding-next"));

    // Jump to the final step through the store's own action, then wait for the screen to catch up before
    // pressing — otherwise the press lands on the step that is still rendered.
    useOnboardingStore.getState().goToStep(4);
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-progress")).toHaveTextContent(/5/),
    );
    await fireEvent.press(screen.getByTestId("onboarding-next"));

    await waitFor(() => expect(mockCreateDog).toHaveBeenCalled());
    expect(mockCreateDog.mock.calls[0]?.[0]).toMatchObject({ name: "לונה" });
  });
});

describe("accessibility", () => {
  it("labels the text field with its question", async () => {
    await renderSteps();
    expect(screen.getByTestId("input-name").props.accessibilityLabel).toMatch(
      /name/i,
    );
  });

  it("caps how far the input grows with Dynamic Type so it cannot clip", async () => {
    await renderSteps();
    expect(screen.getByTestId("input-name").props.maxFontSizeMultiplier).toBe(
      1.6,
    );
  });

  it("exposes onboarding progress as a value, not just a bar", async () => {
    await renderSteps();
    const bar = screen.getByTestId("onboarding-progress-bar");
    expect(bar.props.accessibilityRole).toBe("progressbar");
    expect(bar.props.accessibilityValue).toMatchObject({ min: 0, max: 100 });
  });
});
