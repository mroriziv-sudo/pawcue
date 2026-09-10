import appJson from "../app.json";

/**
 * Guards the native permission surface declared by the app config.
 *
 * This exists because of a real defect caught during the iOS acceptance pass: `expo-audio` also supports
 * recording and background playback, so its config plugin injects `NSMicrophoneUsageDescription`,
 * `RECORD_AUDIO`, a media-playback foreground service and the iOS `audio` background mode **by default**. The app
 * only ever plays a 45ms click in the foreground, so every one of those was being declared without cause —
 * contradicting brief §18 ("Do NOT request: microphone"), PRIVACY.md and DATA_MAP.md.
 *
 * Nothing in the JS surfaced it: it only appears in the generated Info.plist / AndroidManifest. Asserting on the
 * config is the cheapest place to stop it regressing when a dependency is upgraded.
 *
 * A second instance of the same class was caught later: `expo-secure-store` injects `NSFaceIDUsageDescription`
 * by default, but the app stores tokens without `requireAuthentication`, so Face ID is never invoked. A usage
 * description for a capability the app never exercises is exactly what App Store review asks about, and it
 * contradicts the same minimal-permissions rule.
 */

type PluginEntry = string | [string, Record<string, unknown>];

const plugins = appJson.expo.plugins as PluginEntry[];

function pluginConfig(name: string): Record<string, unknown> | undefined {
  const entry = plugins.find((p) =>
    Array.isArray(p) ? p[0] === name : p === name,
  );
  return Array.isArray(entry) ? entry[1] : undefined;
}

describe("expo-audio native declarations", () => {
  const audio = pluginConfig("expo-audio");

  it("is configured with explicit options rather than plugin defaults", () => {
    expect(audio).toBeDefined();
  });

  it("declares no microphone usage on iOS", () => {
    expect(audio?.microphonePermission).toBe(false);
  });

  it("declares no RECORD_AUDIO permission on Android", () => {
    expect(audio?.recordAudioAndroid).toBe(false);
  });

  it("enables neither background recording nor background playback", () => {
    // Background playback also pulls in the iOS `audio` UIBackgroundModes entry and an Android
    // media-playback foreground service. The clicker is foreground-only (shouldPlayInBackground: false).
    expect(audio?.enableBackgroundRecording).toBe(false);
    expect(audio?.enableBackgroundPlayback).toBe(false);
  });
});

describe("expo-secure-store native declarations", () => {
  const secureStore = pluginConfig("expo-secure-store");

  it("is configured with explicit options rather than plugin defaults", () => {
    expect(secureStore).toBeDefined();
  });

  it("declares no Face ID usage, because the app never requests biometric auth", () => {
    expect(secureStore?.faceIDPermission).toBe(false);
  });
});

describe("declared Android permissions", () => {
  it("requests no permissions of its own", () => {
    expect(appJson.expo.android.permissions).toEqual([]);
  });
});

describe("permissions the brief forbids outright", () => {
  const serialized = JSON.stringify(appJson);

  it.each([
    ["microphone", /NSMicrophoneUsageDescription|RECORD_AUDIO/],
    ["location", /NSLocation|ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION/],
    ["contacts", /NSContacts|READ_CONTACTS/],
    ["camera", /NSCameraUsageDescription/],
    ["bluetooth", /NSBluetooth|BLUETOOTH_CONNECT/],
    ["motion", /NSMotionUsageDescription|ACTIVITY_RECOGNITION/],
    ["health", /NSHealth/],
    ["tracking (ATT)", /NSUserTrackingUsageDescription/],
    ["biometrics", /NSFaceIDUsageDescription/],
  ])("never declares %s", (_label, pattern) => {
    expect(serialized).not.toMatch(pattern);
  });
});
