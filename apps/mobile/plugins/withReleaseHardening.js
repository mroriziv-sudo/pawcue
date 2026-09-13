// @ts-check
const { withInfoPlist, AndroidConfig } = require("expo/config-plugins");

/**
 * Release hardening for the generated iOS project.
 *
 * `expo-dev-client` is a dependency so development builds can load from Metro, and its config plugins run at
 * prebuild for *every* profile — there is no "only for development builds" hook at that layer. The result is that
 * a store build's `Info.plist` starts life declaring local-network access, a Bonjour service and a Metro port,
 * and relies on a Release-only Xcode build phase (installed by the same plugin) to remove two of the three
 * before packaging.
 *
 * This plugin removes all of them at prebuild time when the build is a release, so the native project EAS
 * compiles is already clean and the audit in `__tests__/release-hardening.test.ts` is of the plist we actually
 * ship, not of a script we hope ran. It also answers the export-compliance question Apple otherwise asks by hand
 * on every upload.
 *
 * Plain CommonJS on purpose: Expo evaluates `app.config.ts` but does not transpile the modules it imports.
 *
 * Enabled by `EAS_BUILD_PROFILE=production` (set by EAS) or `PAWCUE_RELEASE_HARDENING=1` (for a local audit).
 * Off, the plugin changes nothing — a development build keeps everything Metro needs.
 */

/** Keys that exist only to talk to a development server. None has a product reason in a store build. */
const DEV_SERVER_KEYS = [
  "NSLocalNetworkUsageDescription",
  "NSBonjourServices",
  "RCTMetroPort",
];

/**
 * Pure, so it can be tested without a native project.
 * @param {Record<string, unknown>} plist
 * @returns {Record<string, unknown>}
 */
function hardenInfoPlist(plist) {
  const next = { ...plist };

  for (const key of DEV_SERVER_KEYS) {
    delete next[key];
  }

  const ats = next["NSAppTransportSecurity"];
  if (ats && typeof ats === "object") {
    const hardened = { .../** @type {Record<string, unknown>} */ (ats) };
    // Plaintext to local addresses is a Metro convenience. A store build talks to Supabase over TLS and nothing else.
    delete hardened["NSAllowsLocalNetworking"];
    hardened["NSAllowsArbitraryLoads"] = false;
    next["NSAppTransportSecurity"] = hardened;
  }

  /**
   * Export compliance. The app uses only the platform's TLS (exempt) and no proprietary cryptography, so the
   * answer is a stable `false`. Declaring it here removes a manual step from every App Store Connect upload.
   */
  next["ITSAppUsesNonExemptEncryption"] = false;

  return next;
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
function releaseHardeningRequested(env = process.env) {
  return (
    env["EAS_BUILD_PROFILE"] === "production" ||
    env["PAWCUE_RELEASE_HARDENING"] === "1"
  );
}

/**
 * Values a store build cannot ship without.
 *
 * Each is public configuration (`EXPO_PUBLIC_`), supplied by the EAS `production` environment, and each absent
 * value produces an app that boots but cannot do its job: no backend, a paywall that cannot sell, or legal links
 * that say "not set up" — all of which the app handles honestly at runtime, and none of which should reach a store.
 * Checking them at config-evaluation time fails the build in seconds instead of at review.
 */
const PRODUCTION_REQUIRED_ENV = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_TERMS_URL",
  "EXPO_PUBLIC_PRIVACY_URL",
];

/** The store SDK key each platform's build needs. `EAS_BUILD_PLATFORM` says which; unknown means both. */
const PLATFORM_STORE_KEYS = {
  ios: ["EXPO_PUBLIC_REVENUECAT_IOS_KEY"],
  android: ["EXPO_PUBLIC_REVENUECAT_ANDROID_KEY"],
};

/**
 * Supabase project refs that must never be baked into a store build. The staging project holds test fixtures,
 * throwaway identities and no production secrets; the EAS `production` environment pointed at it during Phase 9
 * so a release-configuration binary could boot, which is exactly the state this check exists to catch.
 */
const NON_PRODUCTION_SUPABASE_REFS = ["ccqitncejkgsaborfubc"];

/**
 * Every reason the given environment is unfit for a store build. Empty means fit.
 *
 * Pure and exhaustive — all problems are reported at once, so a misconfigured environment is fixed in one pass
 * rather than one failed build at a time.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
function productionEnvironmentProblems(env) {
  const problems = [];

  const platform = env["EAS_BUILD_PLATFORM"];
  const storeKeys =
    platform === "ios" || platform === "android"
      ? PLATFORM_STORE_KEYS[platform]
      : [...PLATFORM_STORE_KEYS.ios, ...PLATFORM_STORE_KEYS.android];

  for (const name of [...PRODUCTION_REQUIRED_ENV, ...storeKeys]) {
    const value = env[name];
    if (typeof value !== "string" || value.trim().length === 0) {
      problems.push(`${name} is not set`);
    }
  }

  const supabaseUrl = env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
  for (const ref of NON_PRODUCTION_SUPABASE_REFS) {
    if (supabaseUrl.includes(ref)) {
      problems.push(
        `EXPO_PUBLIC_SUPABASE_URL points at the staging project (${ref}); a store build must use the production project`,
      );
    }
  }
  if (supabaseUrl && !supabaseUrl.startsWith("https://")) {
    problems.push("EXPO_PUBLIC_SUPABASE_URL must be an https:// URL");
  }

  for (const name of ["EXPO_PUBLIC_TERMS_URL", "EXPO_PUBLIC_PRIVACY_URL"]) {
    const value = env[name];
    if (value && !value.startsWith("https://")) {
      problems.push(`${name} must be an https:// URL`);
    }
  }

  const iosKey = env["EXPO_PUBLIC_REVENUECAT_IOS_KEY"];
  if (iosKey && !iosKey.startsWith("appl_")) {
    problems.push(
      "EXPO_PUBLIC_REVENUECAT_IOS_KEY is not an iOS public SDK key (appl_…) — never put a secret key here",
    );
  }
  const androidKey = env["EXPO_PUBLIC_REVENUECAT_ANDROID_KEY"];
  if (androidKey && !androidKey.startsWith("goog_")) {
    problems.push(
      "EXPO_PUBLIC_REVENUECAT_ANDROID_KEY is not an Android public SDK key (goog_…) — never put a secret key here",
    );
  }
  for (const name of Object.keys(env)) {
    const value = env[name];
    if (name.startsWith("EXPO_PUBLIC_") && value && /^sk_/.test(value)) {
      problems.push(
        `${name} carries a RevenueCat secret key under a public name`,
      );
    }
  }

  return problems;
}

/**
 * True only on the EAS build worker for the `production` profile. A local `expo prebuild` or a simulator audit
 * build never trips the check, so those keep working against staging.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
function productionBuildRequested(env = process.env) {
  return env["EAS_BUILD_PROFILE"] === "production";
}

/**
 * Throws with every problem listed when a production build's environment is unfit. Called from `app.config.ts`.
 *
 * @param {Record<string, string | undefined>} [env]
 */
function assertProductionEnvironment(env = process.env) {
  if (!productionBuildRequested(env)) return;
  const problems = productionEnvironmentProblems(env);
  if (problems.length === 0) return;
  throw new Error(
    [
      "Refusing to build the production profile with an unfit environment:",
      ...problems.map((p) => `  - ${p}`),
      "Set the values in the EAS `production` environment (eas env:create --environment production …).",
    ].join("\n"),
  );
}

/**
 * Android permissions that exist only for development tooling.
 *
 * `SYSTEM_ALERT_WINDOW` ("draw over other apps") comes from `expo-dev-menu`, which puts it in the *main* manifest
 * rather than the debug one — so a release build carries it, and Play review asks why an app with no overlay
 * feature wants one. Blocked with `tools:node="remove"`, which survives manifest merging; a plain delete would be
 * re-added by the library's own manifest at build time.
 */
const DEV_ONLY_ANDROID_PERMISSIONS = ["android.permission.SYSTEM_ALERT_WINDOW"];

/**
 * @type {import("expo/config-plugins").ConfigPlugin<{ enabled: boolean }>}
 */
const withReleaseHardening = (config, { enabled }) => {
  if (!enabled) return config;
  const withPlist = withInfoPlist(config, (mod) => {
    mod.modResults = /** @type {any} */ (hardenInfoPlist(mod.modResults));
    return mod;
  });
  return AndroidConfig.Permissions.withBlockedPermissions(
    withPlist,
    DEV_ONLY_ANDROID_PERMISSIONS,
  );
};

module.exports = withReleaseHardening;
module.exports.default = withReleaseHardening;
module.exports.hardenInfoPlist = hardenInfoPlist;
module.exports.releaseHardeningRequested = releaseHardeningRequested;
module.exports.DEV_SERVER_KEYS = DEV_SERVER_KEYS;
module.exports.DEV_ONLY_ANDROID_PERMISSIONS = DEV_ONLY_ANDROID_PERMISSIONS;
module.exports.PRODUCTION_REQUIRED_ENV = PRODUCTION_REQUIRED_ENV;
module.exports.PLATFORM_STORE_KEYS = PLATFORM_STORE_KEYS;
module.exports.NON_PRODUCTION_SUPABASE_REFS = NON_PRODUCTION_SUPABASE_REFS;
module.exports.productionEnvironmentProblems = productionEnvironmentProblems;
module.exports.productionBuildRequested = productionBuildRequested;
module.exports.assertProductionEnvironment = assertProductionEnvironment;
