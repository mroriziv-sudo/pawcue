import i18next, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import enUS from "./locales/en-US/common.json";
import heIL from "./locales/he-IL/common.json";

export const SUPPORTED_LOCALES = ["en-US", "he-IL"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const RTL_LOCALES: ReadonlySet<SupportedLocale> = new Set(["he-IL"]);

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale as SupportedLocale);
}

/**
 * `compatibilityJSON: "v4"` (the i18next default) resolves plural suffixes from each locale's real CLDR plural
 * categories — Hebrew needs one/two/many/other, not just one/other, see `plan.minutes_*` in he-IL/common.json.
 *
 * The returned instance is usable immediately: resources are bundled inline, so there is no async backend and
 * `init` resolves synchronously. If a lazy-loading backend is ever added, this becomes async and every caller
 * (and the app's render gate) has to start awaiting readiness.
 */
export function createI18n(): I18nInstance {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources: {
      "en-US": { translation: enUS },
      "he-IL": { translation: heIL },
    },
    lng: "en-US",
    fallbackLng: "en-US",
    supportedLngs: SUPPORTED_LOCALES,
    compatibilityJSON: "v4",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}

export type { SupportedLocale as Locale };
