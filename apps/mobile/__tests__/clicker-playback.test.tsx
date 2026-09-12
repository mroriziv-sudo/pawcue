import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import ClickerScreen from "../app/clicker";
import { i18n } from "../src/i18n";
import { useSettingsStore } from "../src/state/settings-store";
import { resetClickerForTests } from "../src/audio/clicker-audio";
import {
  beginPress,
  resetRecorder,
  silentPresses,
  type AudioRecorder,
} from "./support/fake-audio-player";

/**
 * End-to-end playback coverage, driven through the real screen rather than the engine.
 *
 * `clicker-engine.test.ts` proves the engine's algorithm. This proves the wiring around it: the hook, the settings
 * store, the app-state listener and the module-level singleton that lets the voice pool outlive the screen. Both
 * are needed — the original defect lived in that wiring, not in an algorithm.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

/** The shared fake's recorder, published by `jest.setup.js` when it installs the expo-audio mock. */
const recorder = (
  globalThis as typeof globalThis & { __audioRecorder: AudioRecorder }
).__audioRecorder;

const testMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Screen() {
  return (
    <SafeAreaProvider initialMetrics={testMetrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction="ltr">
          <ClickerScreen />
        </ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}

/**
 * The app-state handler the screen registers.
 *
 * `AppState.emit` does not exist on the React Native mock, so the listener is captured at registration and invoked
 * directly — which also proves the screen actually subscribes, rather than assuming it did.
 */
let appStateHandler: ((state: AppStateStatus) => void) | null = null;

/** A press through the real button, with an attribution window so silent presses are detectable. */
async function pressClicker(view?: Pick<typeof screen, "getByTestId">) {
  beginPress(recorder);
  const button = (view ?? screen).getByTestId("clicker-button");
  await fireEvent.press(button);
}

/** Lets the clip finish and the voice return to position 0, as it would between unhurried presses. */
async function settle(ms = 200) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

beforeEach(async () => {
  jest.useFakeTimers();
  appStateHandler = null;
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation(
      (type: string, handler: (s: AppStateStatus) => void) => {
        if (type === "change") appStateHandler = handler;
        return { remove: jest.fn() };
      },
    );
  resetRecorder(recorder);
  resetClickerForTests();
  useSettingsStore.setState({ soundEnabled: true, hapticsEnabled: true });
  await i18n.changeLanguage("en-US");
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("one press, one audible click (through the screen)", () => {
  it("plays on a single press", async () => {
    await render(<Screen />);

    await pressClicker();
    await settle();

    expect(recorder.presses).toEqual([true]);
    expect(recorder.silentAttempts).toBe(0);
  });

  it("plays on 3 presses", async () => {
    await render(<Screen />);

    for (let i = 0; i < 3; i += 1) {
      await pressClicker();
      await settle(400);
    }

    expect(silentPresses(recorder)).toBe(0);
    expect(screen.getByTestId("press-count")).toHaveTextContent("3");
  });

  it("plays on 10 presses", async () => {
    await render(<Screen />);

    for (let i = 0; i < 10; i += 1) {
      await pressClicker();
      await settle(400);
    }

    expect(recorder.presses).toHaveLength(10);
    expect(silentPresses(recorder)).toBe(0);
    expect(screen.getByTestId("press-count")).toHaveTextContent("10");
  });

  it("plays on 10 rapid presses", async () => {
    await render(<Screen />);

    // 20ms apart, well inside the 45ms clip, so voices genuinely overlap.
    for (let i = 0; i < 10; i += 1) {
      await pressClicker();
      await settle(20);
    }
    await settle();

    expect(recorder.presses).toHaveLength(10);
    expect(silentPresses(recorder)).toBe(0);
    expect(screen.getByTestId("press-count")).toHaveTextContent("10");
  });
});

describe("sound setting", () => {
  it("plays again after sound is turned off and back on", async () => {
    await render(<Screen />);

    await pressClicker();
    await settle();

    await act(async () => {
      useSettingsStore.setState({ soundEnabled: false });
    });
    const callsBeforeMutedPress = recorder.playCalls;
    // A muted press must still count and must issue no playback at all.
    await fireEvent.press(screen.getByTestId("clicker-button"));
    await settle();
    expect(recorder.playCalls).toBe(callsBeforeMutedPress);

    await act(async () => {
      useSettingsStore.setState({ soundEnabled: true });
    });
    await pressClicker();
    await settle();

    // Both attributed presses were heard; the muted one in between never opened a window.
    expect(recorder.presses).toEqual([true, true]);
    expect(recorder.silentAttempts).toBe(0);
    expect(screen.getByTestId("press-count")).toHaveTextContent("3");
  });
});

describe("app lifecycle", () => {
  it("plays after background → foreground", async () => {
    await render(<Screen />);

    await pressClicker();
    await settle();

    // Mirrors iOS reclaiming the audio session: players are left parked at the end of their clips.
    for (const player of recorder.players) player.currentTime = player.duration;

    expect(appStateHandler).not.toBeNull();
    await act(async () => {
      appStateHandler?.("background");
      appStateHandler?.("active");
      jest.advanceTimersByTime(50);
      await Promise.resolve();
    });

    await pressClicker();
    await settle();

    expect(recorder.presses).toEqual([true, true]);
    expect(recorder.silentAttempts).toBe(0);
  });
});

describe("navigation", () => {
  it("plays after repeatedly leaving and returning to the screen", async () => {
    // Unmount/remount is what navigating to Settings and back does to this screen.
    for (let visit = 0; visit < 3; visit += 1) {
      const view = await render(<Screen />);
      await pressClicker(view);
      await settle();
      await view.unmount();
    }

    const last = await render(<Screen />);
    await pressClicker(last);
    await settle();

    expect(recorder.presses).toEqual([true, true, true, true]);
    expect(recorder.silentAttempts).toBe(0);
  });

  it("keeps the preloaded voice pool alive across screen remounts", async () => {
    const first = await render(<Screen />);
    const playersAfterFirstMount = recorder.players.length;
    await first.unmount();

    await render(<Screen />);

    // No new players: the pool is a module singleton, so returning to the screen never re-decodes the asset.
    expect(recorder.players).toHaveLength(playersAfterFirstMount);
  });
});
