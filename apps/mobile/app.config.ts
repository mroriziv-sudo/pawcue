import type { ConfigContext, ExpoConfig } from "expo/config";
import {
  assertProductionEnvironment,
  releaseHardeningRequested,
} from "./plugins/withReleaseHardening";

/**
 * Dynamic config, layered over `app.json`.
 *
 * `app.json` stays the declarative source of truth — bundle ids, plugins with their permission-disabling options,
 * the EAS project id — and is what `__tests__/app-config.test.ts` audits. This file exists for the one thing a
 * static file cannot express: a plugin whose behaviour depends on which build profile is running.
 *
 * The plugin is referenced by path, as Expo's config typings expect; it is the same module the tests import.
 */
/**
 * A production build with an unfit environment fails here, at config evaluation, with every problem listed.
 * No-op for every other profile and for local prebuilds.
 */
assertProductionEnvironment();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "PawCue",
  slug: config.slug ?? "pawcue",
  plugins: [
    ...(config.plugins ?? []),
    [
      "./plugins/withReleaseHardening",
      { enabled: releaseHardeningRequested() },
    ],
  ],
});
