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
