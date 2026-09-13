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
export const PRODUCTION_REQUIRED_ENV: readonly string[];
export const PLATFORM_STORE_KEYS: {
  readonly ios: readonly string[];
  readonly android: readonly string[];
};
export const NON_PRODUCTION_SUPABASE_REFS: readonly string[];
export function productionEnvironmentProblems(
  env: Record<string, string | undefined>,
): string[];
export function productionBuildRequested(
  env?: Record<string, string | undefined>,
): boolean;
export function assertProductionEnvironment(
  env?: Record<string, string | undefined>,
): void;
