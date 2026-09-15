import { render, fireEvent } from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import SettingsScreen from "../app/settings";
import { i18n } from "../src/i18n";
import { useSettingsStore } from "../src/state/settings-store";

/**
 * The clicker sound selector is a QA instrument, not a feature.
 *
 * Three candidates ship in the development build so they can be compared on real hardware, and the product owner
 * has not chosen one yet. Until that decision is made — and explicitly approved for release — the selector must
 * not be reachable by a user. `__DEV__` is the gate; this is the test that the gate actually holds, because a
 * `__DEV__` check is invisible in every test run that never flips it.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

const testMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderSettings() {
  return await render(
    <SafeAreaProvider initialMetrics={testMetrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction="ltr">
          <SettingsScreen />
        </ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>,
  );
}

/**
 * React Native declares `__DEV__` as a global const, so it cannot be reassigned through the bare identifier.
 * Reaching it through a typed view of `globalThis` is what lets a test flip the release/development gate.
 */
const globalRef = globalThis as typeof globalThis & { __DEV__: boolean };
const originalDev = globalRef.__DEV__;

beforeEach(async () => {
  await i18n.changeLanguage("en-US");
});

afterEach(() => {
  globalRef.__DEV__ = originalDev;
});

describe("developer-only clicker sound selector", () => {
  it("is available in a development build", async () => {
    globalRef.__DEV__ = true;
    const view = await renderSettings();

    expect(view.getByTestId("dev-sound-selector")).toBeTruthy();
    expect(view.getByTestId("click-sound-classic")).toBeTruthy();
    expect(view.getByTestId("click-sound-soft")).toBeTruthy();
    expect(view.getByTestId("click-sound-crisp")).toBeTruthy();
  });

  it("is absent from a release build", async () => {
    globalRef.__DEV__ = false;
    const view = await renderSettings();

    expect(view.queryByTestId("dev-sound-selector")).toBeNull();
    expect(view.queryByTestId("click-sound-classic")).toBeNull();
    expect(view.queryByTestId("preview-click")).toBeNull();
    // The diagnostics block is gated the same way and must go with it.
    expect(view.queryByTestId("diagnostics")).toBeNull();
    // Including the Phase 5 plan inspector, which shows engine reasoning a user must never see.
    expect(view.queryByTestId("open-dev-plan")).toBeNull();
    // And the UI preview, which renders fixtures a user must never mistake for their own dog.
    expect(view.queryByTestId("open-dev-preview")).toBeNull();
  });

  it("still renders the real settings when the developer blocks are gone", async () => {
    globalRef.__DEV__ = false;
    const view = await renderSettings();

    expect(view.getByTestId("settings-title")).toBeTruthy();
    expect(view.getByTestId("switch-sound")).toBeTruthy();
    expect(view.getByTestId("language-he-IL")).toBeTruthy();
  });

  it("offers the plan inspector in a development build", async () => {
    globalRef.__DEV__ = true;
    const view = await renderSettings();

    expect(view.getByTestId("open-dev-plan")).toBeTruthy();
  });

  it("switches the loaded sound when a candidate is chosen", async () => {
    globalRef.__DEV__ = true;
    const view = await renderSettings();

    await fireEvent.press(view.getByTestId("click-sound-crisp"));

    expect(useSettingsStore.getState().clickSoundId).toBe("crisp");
  });
});
