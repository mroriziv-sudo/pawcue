import { I18nManager } from "react-native";
import * as Localization from "expo-localization";
import {
  createI18n,
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from "@pawcue/i18n";
import { appStorage, STORAGE_KEYS } from "../lib/storage";

export const i18n = createI18n();

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Device locale → app locale, falling back to English (brief §25).
 *
 * Matches on the language subtag rather than the full tag, so a device set to `he` or `he-US` still gets Hebrew
 * instead of silently falling back to English.
 */
export function resolveDeviceLocale(): SupportedLocale {
  for (const locale of Localization.getLocales()) {
    const tag = locale.languageTag;
    if (isSupportedLocale(tag)) return tag;
    const match = SUPPORTED_LOCALES.find(
      (supported) => supported.split("-")[0] === locale.languageCode,
    );
    if (match) return match;
  }
  return "en-US";
}

/** An explicit user choice always wins over the device setting. */
export async function resolveInitialLocale(): Promise<SupportedLocale> {
  const stored = await appStorage.getItem(STORAGE_KEYS.language);
  if (stored && isSupportedLocale(stored)) return stored;
  return resolveDeviceLocale();
}

export interface DirectionChange {
  /** True when the native layout direction had to change, which requires an app reload to take full effect. */
  requiresReload: boolean;
}

/**
 * Applies a locale to i18next and to React Native's layout direction.
 *
 * `I18nManager.forceRTL` only takes full effect after a reload — RN reads the flag when the view hierarchy is
 * created. Reporting that back to the caller (rather than pretending the flip already happened) is what lets the
 * settings screen show an honest "restarting…" state instead of a half-mirrored layout (LOCALIZATION.md).
 */
export async function applyLocale(
  locale: SupportedLocale,
): Promise<DirectionChange> {
  await i18n.changeLanguage(locale);
  await appStorage.setItem(STORAGE_KEYS.language, locale);

  const shouldBeRtl = isRtlLocale(locale);

  /**
   * The native preference is written every time, not only when this process disagrees with it. `I18nManager.isRTL`
   * says how *this* process was laid out; it says nothing about what is saved for the next one. Hebrew → English →
   * Hebrew without a relaunch used to leave the English answer on disk — the second switch saw a process still
   * laid out RTL and returned early — so the next launch opened Hebrew in a left-to-right layout
   * (docs/architecture/phase-10-native-acceptance.md). Both calls are idempotent writes to NSUserDefaults.
   */
  I18nManager.allowRTL(shouldBeRtl);
  I18nManager.forceRTL(shouldBeRtl);

  /**
   * `forceRTL` writes an app-level native preference that React Native only reads when the view hierarchy is
   * built, so a flip needs a full app restart — this function never pretends otherwise: it reports a reload only
   * when the direction this process runs in is not the one the language needs.
   *
   * Verified on the iOS 26.5 simulator (2026-09-10): in **Expo Go** this call is a silent no-op. It does not
   * throw, `isRTL` stays false, and nothing is written to NSUserDefaults, because Expo Go is a shared host app
   * and one experience must not permanently flip its layout. Confirming that RTL mirroring actually works
   * therefore requires our own binary (a development build) — see docs/architecture/phase-2-verification.md.
   */
  return { requiresReload: I18nManager.isRTL !== shouldBeRtl };
}
