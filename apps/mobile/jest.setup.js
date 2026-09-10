/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Native modules that have no JS implementation under the Jest environment are mocked here.
 *
 * These are mocks of *device* capabilities only. Nothing that carries product logic is mocked — the i18n stack,
 * the stores, the design system and the navigation tree all run for real in these tests, which is what makes the
 * assertions meaningful.
 */

/**
 * expo-audio: no audio device under Jest, so playback is backed by a fake that models the real player's semantics.
 *
 * This used to be `{ play: jest.fn(), seekTo: jest.fn(), remove: jest.fn() }`, and that shallow mock is the reason
 * the every-other-press-is-silent defect reached a device. It returned `undefined` where the real `seekTo` returns
 * a promise, and modelled no playback position, so playing from the end of a clip was indistinguishable from
 * playing from the start. The fake tracks position and reports which presses actually produced sound.
 */
jest.mock("expo-audio", () => {
  const {
    createRecorder,
    FakeAudioPlayer,
  } = require("./__tests__/support/fake-audio-player");
  const recorder = createRecorder();
  // Exposed so screen-level tests can assert on what was actually audible.
  globalThis.__audioRecorder = recorder;
  return {
    createAudioPlayer: jest.fn(() => new FakeAudioPlayer(recorder, 45)),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

// SecureStore has no web/Jest backing store; an in-memory map keeps session persistence testable.
jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn((k) => Promise.resolve(store.get(k) ?? null)),
    setItemAsync: jest.fn((k, v) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((k) => {
      store.delete(k);
      return Promise.resolve();
    }),
  };
});

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Default to an English device. Individual tests override this to exercise the Hebrew/RTL path.
jest.mock("expo-localization", () => ({
  getLocales: jest.fn(() => [
    { languageTag: "en-US", languageCode: "en", textDirection: "ltr" },
  ]),
}));
