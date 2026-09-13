import appJson from "../app.json";

/**
 * The app's Apple privacy manifest, as declared in `app.json` and merged into `PrivacyInfo.xcprivacy` at
 * prebuild.
 *
 * Every entry here is a claim Apple checks against the binary (required-reason APIs) or against the App Privacy
 * questionnaire (collected data). Both must be true of the app as built, so the expected sets below are written
 * out in full rather than derived: a change to either is a product/privacy decision that should fail a test
 * until DATA_MAP.md, PRIVACY.md and the store questionnaire are updated with it.
 *
 * The API set is what `tools/release/audit-privacy-manifest.mjs` found in the release-configuration artifact
 * of 2026-09-12 (EAS build 49bdafe6): UserDefaults (RevenueCat, React), FileTimestamp (React, folly, glog,
 * ExpoFileSystem), SystemBootTime (React timing, boost), DiskSpace (ExpoFileSystem — undeclared by that
 * framework and by the Expo template, which is the defect this declaration closes).
 */

const manifest = appJson.expo.ios.privacyManifests;

const EXPECTED_APIS: Record<string, string[]> = {
  NSPrivacyAccessedAPICategoryUserDefaults: ["CA92.1"],
  NSPrivacyAccessedAPICategoryFileTimestamp: ["C617.1"],
  NSPrivacyAccessedAPICategorySystemBootTime: ["35F9.1"],
  NSPrivacyAccessedAPICategoryDiskSpace: ["E174.1"],
};

/** Mirrors DATA_MAP.md: identity, sign-in email, the dog and training the user records, purchases. Nothing else. */
const EXPECTED_DATA_TYPES = [
  "NSPrivacyCollectedDataTypeUserID",
  "NSPrivacyCollectedDataTypeEmailAddress",
  "NSPrivacyCollectedDataTypeOtherUserContent",
  "NSPrivacyCollectedDataTypePurchaseHistory",
];

describe("required-reason APIs", () => {
  it("declares exactly the categories the release binary uses, with one approved reason each", () => {
    const declared = Object.fromEntries(
      manifest.NSPrivacyAccessedAPITypes.map((t) => [
        t.NSPrivacyAccessedAPIType,
        t.NSPrivacyAccessedAPITypeReasons,
      ]),
    );
    expect(declared).toEqual(EXPECTED_APIS);
  });

  it("does not declare the active-keyboard API, which nothing in the binary uses", () => {
    expect(
      manifest.NSPrivacyAccessedAPITypes.map((t) => t.NSPrivacyAccessedAPIType),
    ).not.toContain("NSPrivacyAccessedAPICategoryActiveKeyboards");
  });
});

describe("collected data", () => {
  it("lists exactly what DATA_MAP.md says is collected", () => {
    expect(
      manifest.NSPrivacyCollectedDataTypes.map(
        (t) => t.NSPrivacyCollectedDataType,
      ).sort(),
    ).toEqual([...EXPECTED_DATA_TYPES].sort());
  });

  it("marks every type as linked to the user and none as used for tracking", () => {
    for (const t of manifest.NSPrivacyCollectedDataTypes) {
      expect(t.NSPrivacyCollectedDataTypeLinked).toBe(true);
      expect(t.NSPrivacyCollectedDataTypeTracking).toBe(false);
      expect(t.NSPrivacyCollectedDataTypePurposes).toEqual([
        "NSPrivacyCollectedDataTypePurposeAppFunctionality",
      ]);
    }
  });

  it("declares no analytics, advertising, location, contacts, health or diagnostics data", () => {
    const types = manifest.NSPrivacyCollectedDataTypes.map(
      (t) => t.NSPrivacyCollectedDataType,
    );
    for (const forbidden of [
      "NSPrivacyCollectedDataTypePreciseLocation",
      "NSPrivacyCollectedDataTypeCoarseLocation",
      "NSPrivacyCollectedDataTypeContacts",
      "NSPrivacyCollectedDataTypeHealth",
      "NSPrivacyCollectedDataTypeCrashData",
      "NSPrivacyCollectedDataTypePerformanceData",
      "NSPrivacyCollectedDataTypeDeviceID",
      "NSPrivacyCollectedDataTypeAdvertisingData",
      "NSPrivacyCollectedDataTypeProductInteraction",
      "NSPrivacyCollectedDataTypeName",
    ]) {
      expect(types).not.toContain(forbidden);
    }
  });
});

describe("tracking", () => {
  it("is off, with no tracking domains", () => {
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyTrackingDomains).toEqual([]);
  });
});

describe("Sign in with Apple", () => {
  it("requests the entitlement through Expo's declaration and the module's plugin", () => {
    expect(appJson.expo.ios.usesAppleSignIn).toBe(true);
    expect(appJson.expo.plugins).toContain("expo-apple-authentication");
  });
});
