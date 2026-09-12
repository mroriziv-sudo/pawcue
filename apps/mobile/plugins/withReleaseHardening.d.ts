import type { ConfigPlugin } from "expo/config-plugins";

export interface ReleaseHardeningOptions {
  enabled: boolean;
}

declare const withReleaseHardening: ConfigPlugin<ReleaseHardeningOptions>;
export default withReleaseHardening;

export function hardenInfoPlist(
  plist: Record<string, unknown>,
): Record<string, unknown>;
export function releaseHardeningRequested(
  env?: Record<string, string | undefined>,
): boolean;
export const DEV_SERVER_KEYS: readonly string[];
export const DEV_ONLY_ANDROID_PERMISSIONS: readonly string[];
