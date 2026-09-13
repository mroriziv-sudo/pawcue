import easJson from "../eas.json";
import appJson from "../app.json";
import {
  DEV_ONLY_ANDROID_PERMISSIONS,
  DEV_SERVER_KEYS,
  NON_PRODUCTION_SUPABASE_REFS,
  assertProductionEnvironment,
  hardenInfoPlist,
  productionBuildRequested,
  productionEnvironmentProblems,
  releaseHardeningRequested,
} from "../plugins/withReleaseHardening";

/**
 * What a store build is allowed to contain.
 *
 * Three layers, each asserted on its own terms: the pure plist transform (so the audit is of the function that
 * runs at prebuild, not of a build phase nobody can see), the condition that turns it on (so it runs for the
 * production profile and nothing else), and the EAS profiles themselves (so a production build cannot quietly
 * pick up the development client or a local-network service).
 */

/** A plist shaped like the one prebuild actually generated on 2026-09-12 with `expo-dev-client` installed. */
function devPlist(): Record<string, unknown> {
  return {
    CFBundleIdentifier: "$(PRODUCT_BUNDLE_IDENTIFIER)",
    CFBundleShortVersionString: "0.1.0",
    NSLocalNetworkUsageDescription:
      "Expo Dev Launcher uses the local network to discover and connect to development servers running on your computer.",
    NSBonjourServices: ["_expo._tcp"],
    RCTMetroPort: "$(RCT_METRO_PORT)",
    NSAppTransportSecurity: {
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: true,
    },
    UIRequiredDeviceCapabilities: ["arm64"],
  };
}

describe("hardenInfoPlist", () => {
  it("removes every development-server key", () => {
    const out = hardenInfoPlist(devPlist());
    for (const key of DEV_SERVER_KEYS) {
      expect(out).not.toHaveProperty(key);
    }
  });

  it("removes the local-networking ATS exception and keeps arbitrary loads off", () => {
    const out = hardenInfoPlist(devPlist());
    expect(out["NSAppTransportSecurity"]).toEqual({
      NSAllowsArbitraryLoads: false,
    });
  });

  it("forces NSAllowsArbitraryLoads to false even if something set it true", () => {
    const plist = devPlist();
    (plist["NSAppTransportSecurity"] as Record<string, unknown>)[
      "NSAllowsArbitraryLoads"
    ] = true;
    const out = hardenInfoPlist(plist);
    expect(
      (out["NSAppTransportSecurity"] as Record<string, unknown>)[
        "NSAllowsArbitraryLoads"
      ],
    ).toBe(false);
  });

  it("answers export compliance so App Store Connect stops asking", () => {
    expect(hardenInfoPlist(devPlist())["ITSAppUsesNonExemptEncryption"]).toBe(
      false,
    );
  });

  it("leaves everything else alone", () => {
    const out = hardenInfoPlist(devPlist());
    expect(out["CFBundleIdentifier"]).toBe("$(PRODUCT_BUNDLE_IDENTIFIER)");
    expect(out["CFBundleShortVersionString"]).toBe("0.1.0");
    expect(out["UIRequiredDeviceCapabilities"]).toEqual(["arm64"]);
  });

  it("does not mutate its input", () => {
    const plist = devPlist();
    hardenInfoPlist(plist);
    expect(plist).toHaveProperty("NSBonjourServices");
  });

  it("copes with a plist that has no ATS block", () => {
    const out = hardenInfoPlist({ CFBundleIdentifier: "x" });
    expect(out["ITSAppUsesNonExemptEncryption"]).toBe(false);
    expect(out).not.toHaveProperty("NSAppTransportSecurity");
  });
});

describe("when hardening runs", () => {
  it("runs for the EAS production profile", () => {
    expect(releaseHardeningRequested({ EAS_BUILD_PROFILE: "production" })).toBe(
      true,
    );
  });

  it("runs when asked for explicitly, so a local audit matches a real build", () => {
    expect(releaseHardeningRequested({ PAWCUE_RELEASE_HARDENING: "1" })).toBe(
      true,
    );
  });

  it("does not run for a development build", () => {
    expect(
      releaseHardeningRequested({ EAS_BUILD_PROFILE: "development-simulator" }),
    ).toBe(false);
    expect(releaseHardeningRequested({})).toBe(false);
    expect(releaseHardeningRequested({ PAWCUE_RELEASE_HARDENING: "0" })).toBe(
      false,
    );
  });

  it("names the one Android permission only development tooling wants", () => {
    expect(DEV_ONLY_ANDROID_PERMISSIONS).toEqual([
      "android.permission.SYSTEM_ALERT_WINDOW",
    ]);
  });
});

describe("EAS build profiles", () => {
  const build = easJson.build as Record<string, Record<string, unknown>>;
  const production = build["production"]!;
  const preview = build["preview-simulator"]!;

  it("has a production profile that goes to the store without the development client", () => {
    expect(production["distribution"]).toBe("store");
    expect(production["developmentClient"]).toBe(false);
    expect((production["ios"] as Record<string, unknown>)["simulator"]).toBe(
      false,
    );
  });

  it("draws production configuration from the EAS production environment, not from this file", () => {
    // Values in eas.json are committed; environment variables on EAS are not. Supabase keys and store keys stay out.
    expect(production["environment"]).toBe("production");
    expect(JSON.stringify(easJson)).not.toMatch(
      /supabase\.co|appl_|goog_|sk_|eyJ/,
    );
  });

  it("lets EAS own the build number so it is never edited by hand", () => {
    expect(easJson.cli.appVersionSource).toBe("remote");
    expect(production["autoIncrement"]).toBe(true);
  });

  it("ships Android as an app bundle", () => {
    expect(
      (production["android"] as Record<string, unknown>)["buildType"],
    ).toBe("app-bundle");
  });

  it("audits a release-configuration simulator build with the same hardening as production", () => {
    expect(preview["extends"]).toBe("production");
    expect((preview["ios"] as Record<string, unknown>)["simulator"]).toBe(true);
    expect(
      (preview["env"] as Record<string, string>)["PAWCUE_RELEASE_HARDENING"],
    ).toBe("1");
    // A simulator audit must not consume store build numbers.
    expect(preview["autoIncrement"]).toBe(false);
  });

  it("keeps the development profile as the only one with the development client", () => {
    const withDevClient = Object.entries(build)
      .filter(([, profile]) => profile["developmentClient"] === true)
      .map(([name]) => name);
    expect(withDevClient).toEqual(["development-simulator"]);
  });

  it("never submits automatically", () => {
    // An empty submit profile means `eas submit` needs explicit arguments and an explicit decision.
    expect(easJson.submit.production).toEqual({});
  });
});

describe("app identity", () => {
  it("uses the same bundle identifier on both platforms", () => {
    expect(appJson.expo.ios.bundleIdentifier).toBe("com.pawcue.app");
    expect(appJson.expo.android.package).toBe("com.pawcue.app");
  });

  it("carries a marketing version that is only changed by a release decision", () => {
    // Build numbers are remote and automatic; this one is not, and a test that pins it makes a bump deliberate.
    expect(appJson.expo.version).toBe("0.1.0");
  });

  it("does not set build numbers in app.json, because EAS owns them", () => {
    expect(
      (appJson.expo.ios as Record<string, unknown>)["buildNumber"],
    ).toBeUndefined();
    expect(
      (appJson.expo.android as Record<string, unknown>)["versionCode"],
    ).toBeUndefined();
  });
});

describe("production environment guard", () => {
  /** Everything a store build needs, pointed at a production project. */
  function fitEnv(): Record<string, string | undefined> {
    return {
      EAS_BUILD_PROFILE: "production",
      EAS_BUILD_PLATFORM: "ios",
      EXPO_PUBLIC_SUPABASE_URL: "https://prodprodprodprodprod.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon",
      EXPO_PUBLIC_REVENUECAT_IOS_KEY: "appl_publishable",
      EXPO_PUBLIC_TERMS_URL: "https://example.com/terms",
      EXPO_PUBLIC_PRIVACY_URL: "https://example.com/privacy",
    };
  }

  it("accepts a complete production environment", () => {
    expect(productionEnvironmentProblems(fitEnv())).toEqual([]);
    expect(() => assertProductionEnvironment(fitEnv())).not.toThrow();
  });

  it("refuses the staging Supabase project in a store build", () => {
    const env = fitEnv();
    env["EXPO_PUBLIC_SUPABASE_URL"] =
      `https://${NON_PRODUCTION_SUPABASE_REFS[0]}.supabase.co`;
    expect(productionEnvironmentProblems(env).join("\n")).toMatch(
      /staging project/,
    );
  });

  it("lists every missing value at once", () => {
    const problems = productionEnvironmentProblems({
      EAS_BUILD_PROFILE: "production",
      EAS_BUILD_PLATFORM: "ios",
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        "EXPO_PUBLIC_SUPABASE_URL is not set",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY is not set",
        "EXPO_PUBLIC_TERMS_URL is not set",
        "EXPO_PUBLIC_PRIVACY_URL is not set",
        "EXPO_PUBLIC_REVENUECAT_IOS_KEY is not set",
      ]),
    );
    expect(problems).not.toContain(
      "EXPO_PUBLIC_REVENUECAT_ANDROID_KEY is not set",
    );
  });

  it("requires the Android store key for an Android build and both when the platform is unknown", () => {
    const android = fitEnv();
    android["EAS_BUILD_PLATFORM"] = "android";
    expect(productionEnvironmentProblems(android)).toEqual([
      "EXPO_PUBLIC_REVENUECAT_ANDROID_KEY is not set",
    ]);

    const unknown = fitEnv();
    delete unknown["EAS_BUILD_PLATFORM"];
    expect(productionEnvironmentProblems(unknown)).toEqual([
      "EXPO_PUBLIC_REVENUECAT_ANDROID_KEY is not set",
    ]);
  });

  it("refuses a secret key under a public name", () => {
    const env = fitEnv();
    env["EXPO_PUBLIC_REVENUECAT_IOS_KEY"] = "sk_secret";
    const problems = productionEnvironmentProblems(env);
    expect(problems.join("\n")).toMatch(/never put a secret key here/);
    expect(problems.join("\n")).toMatch(/secret key under a public name/);
  });

  it("requires https for the backend and the legal links", () => {
    const env = fitEnv();
    env["EXPO_PUBLIC_SUPABASE_URL"] = "http://prodprodprodprodprod.supabase.co";
    env["EXPO_PUBLIC_TERMS_URL"] = "http://example.com/terms";
    const problems = productionEnvironmentProblems(env);
    expect(problems).toContain(
      "EXPO_PUBLIC_SUPABASE_URL must be an https:// URL",
    );
    expect(problems).toContain("EXPO_PUBLIC_TERMS_URL must be an https:// URL");
  });

  it("only runs for the EAS production profile, so local prebuilds and simulator audits keep working", () => {
    expect(productionBuildRequested({ EAS_BUILD_PROFILE: "production" })).toBe(
      true,
    );
    expect(
      productionBuildRequested({ EAS_BUILD_PROFILE: "preview-simulator" }),
    ).toBe(false);
    expect(productionBuildRequested({ PAWCUE_RELEASE_HARDENING: "1" })).toBe(
      false,
    );
    expect(productionBuildRequested({})).toBe(false);
    // An empty environment is fine for anything that is not a production build.
    expect(() => assertProductionEnvironment({})).not.toThrow();
    expect(() =>
      assertProductionEnvironment({ EAS_BUILD_PROFILE: "preview-simulator" }),
    ).not.toThrow();
  });

  it("fails a production build with every problem named", () => {
    expect(() =>
      assertProductionEnvironment({
        EAS_BUILD_PROFILE: "production",
        EAS_BUILD_PLATFORM: "ios",
        EXPO_PUBLIC_SUPABASE_URL: `https://${NON_PRODUCTION_SUPABASE_REFS[0]}.supabase.co`,
      }),
    ).toThrow(/EXPO_PUBLIC_TERMS_URL is not set[\s\S]*staging project/);
  });
});
