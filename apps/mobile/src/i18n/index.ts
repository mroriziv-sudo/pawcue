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
  if (I18nManager.isRTL === shouldBeRtl) {
    return { requiresReload: false };
  }

  I18nManager.allowRTL(shouldBeRtl);
  I18nManager.forceRTL(shouldBeRtl);
  return { requiresReload: true };
}
