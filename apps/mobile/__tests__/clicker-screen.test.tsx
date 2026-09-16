import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider, CLICKER_CORNER_RATIO } from "@pawcue/ui";
import ClickerScreen from "../app/clicker";
import { i18n } from "../src/i18n";
import * as Haptics from "expo-haptics";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

/** Fixed insets standing in for a notched device, so safe-area padding is deterministic across runs. */
const testMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderScreen(direction: "ltr" | "rtl" = "ltr") {
  return await render(
    <SafeAreaProvider initialMetrics={testMetrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction={direction}>
          <ClickerScreen />
        </ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>,
  );
}

describe("Clicker screen", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage("en-US");
  });

  it("renders without a session, an account, or any network call", async () => {
    await renderScreen();
    expect(await screen.findByTestId("clicker-button")).toBeTruthy();
    expect(screen.getByTestId("clicker-title")).toHaveTextContent(
      "Your free dog clicker",
    );
  });

  it("exposes an accessible label that describes the sound, since the sound is the point", async () => {
    await renderScreen();
    const button = await screen.findByTestId("clicker-button");
    expect(button.props.accessibilityLabel).toBe(
      "Dog training clicker. Double tap to play click sound.",
    );
    expect(button.props.accessibilityRole).toBe("button");
  });

  it("counts presses and fires a light haptic on each", async () => {
    await renderScreen();
    const button = await screen.findByTestId("clicker-button");

    await fireEvent.press(button);
    await waitFor(() =>
      expect(screen.getByTestId("press-count")).toHaveTextContent(/\b1\b/),
    );

    await fireEvent.press(button);
    await waitFor(() =>
      expect(screen.getByTestId("press-count")).toHaveTextContent(/\b2\b/),
    );

    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith("light");
  });

  it("offers the first lesson only after three intentional presses", async () => {
    await renderScreen();
    const button = await screen.findByTestId("clicker-button");

    expect(screen.queryByTestId("ready-prompt")).toBeNull();
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(screen.queryByTestId("ready-prompt")).toBeNull();

    await fireEvent.press(button);
    await waitFor(() =>
      expect(screen.getByTestId("ready-prompt")).toBeTruthy(),
    );
    expect(screen.getByTestId("start-first-lesson")).toBeTruthy();
  });

  it("renders Hebrew copy when the language changes", async () => {
    await i18n.changeLanguage("he-IL");
    await renderScreen("rtl");
    await waitFor(() =>
      expect(screen.getByTestId("clicker-title")).toHaveTextContent(
        "הקליקר החינמי שלך לאילוף כלבים",
      ),
    );
  });

  it("aligns text to the right and sets RTL writing direction in Hebrew", async () => {
    await i18n.changeLanguage("he-IL");
    await renderScreen("rtl");
    const title = await screen.findByTestId("clicker-title");
    const style = Array.isArray(title.props.style)
      ? Object.assign({}, ...title.props.style.flat())
      : title.props.style;
    // On the reading edge like every other screen's headline (Phase 10 acceptance, finding 11) — which in
    // Hebrew is the right. It used to be centred, the one headline that was.
    expect(style.textAlign).toBe("right");
    expect(style.writingDirection).toBe("rtl");
  });

  it("applies design-system colour and radius tokens rather than ad-hoc values", async () => {
    await renderScreen();
    const button = await screen.findByTestId("clicker-button");
    const style = Array.isArray(button.props.style)
      ? Object.assign({}, ...button.props.style.flat())
      : button.props.style;
    expect(style.backgroundColor).toBe("#23473C"); // Deep Evergreen
    // DESIGN_SYSTEM.md: "large rounded squircle" — the corner is the documented ratio of the 220pt surface.
    expect(style.borderRadius).toBe(Math.round(220 * CLICKER_CORNER_RATIO));
  });
});
