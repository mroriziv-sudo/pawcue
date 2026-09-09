import { describe, expect, it } from "vitest";
import { createI18n, isRtlLocale, SUPPORTED_LOCALES } from "./index";
import enUS from "./locales/en-US/common.json";
import heIL from "./locales/he-IL/common.json";

function collectKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(
    ([key, value]) => collectKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * Different locales have different CLDR plural category sets by design (English: one/other; Hebrew:
 * one/two/many/other — see LOCALIZATION.md). Comparing raw key names would flag that as a false mismatch, so
 * plural-suffixed keys are normalized to their base form before comparing "did both locales cover this concept."
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
function normalizePluralKeys(keys: string[]): string[] {
  return [...new Set(keys.map((key) => key.replace(PLURAL_SUFFIX, "")))];
}

describe("locale metadata", () => {
  it("treats he-IL as RTL and en-US as LTR", () => {
    expect(isRtlLocale("he-IL")).toBe(true);
    expect(isRtlLocale("en-US")).toBe(false);
  });

  it("every en-US key has a he-IL counterpart and vice versa (no silent fallback for launch locales)", () => {
    const enKeys = normalizePluralKeys(collectKeys(enUS));
    const heKeys = normalizePluralKeys(collectKeys(heIL));
    expect(enKeys.sort()).toEqual(heKeys.sort());
  });

  it("English uses the one/other plural suffixes i18next expects (a bare unsuffixed count key never resolves)", () => {
    expect(enUS.plan).toMatchObject({
      minutes_one: expect.any(String),
      minutes_other: expect.any(String),
    });
    expect(enUS.plan).not.toHaveProperty("minutes");
  });

  it("Hebrew plural minutes key uses the full CLDR category set (one/two/many/other)", () => {
    expect(heIL.plan).toMatchObject({
      minutes_one: expect.any(String),
      minutes_two: expect.any(String),
      minutes_many: expect.any(String),
      minutes_other: expect.any(String),
    });
  });
});

describe("createI18n", () => {
  it("initializes and resolves a known key in the default locale (en-US)", async () => {
    const i18n = createI18n();
    await i18n.init;
    expect(i18n.t("clicker.freeTitle")).toBe("Your free dog clicker");
  });

  it("resolves the same key correctly after switching to he-IL", async () => {
    const i18n = createI18n();
    await i18n.init;
    await i18n.changeLanguage("he-IL");
    expect(i18n.t("clicker.freeTitle")).toBe("הקליקר החינמי שלך לאילוף כלבים");
  });

  it("falls back to English for a locale outside the supported set rather than throwing", async () => {
    const i18n = createI18n();
    await i18n.init;
    // i18next's changeLanguage accepts any string at the type level; "fr" is unsupported at the app level,
    // which is exactly the runtime fallback path this test exercises.
    await i18n.changeLanguage("fr");
    expect(i18n.t("clicker.freeTitle")).toBe("Your free dog clicker");
  });

  it("resolves English plural categories correctly for 1 and 2 minutes", async () => {
    const i18n = createI18n();
    await i18n.init;
    expect(i18n.t("plan.minutes", { count: 1 })).toBe("1 minute");
    expect(i18n.t("plan.minutes", { count: 2 })).toBe("2 minutes");
  });

  it("resolves Hebrew plural categories correctly for 1, 2, and 10 minutes", async () => {
    const i18n = createI18n();
    await i18n.init;
    await i18n.changeLanguage("he-IL");
    expect(i18n.t("plan.minutes", { count: 1 })).toBe("דקה");
    expect(i18n.t("plan.minutes", { count: 2 })).toBe("שתי דקות");
    expect(i18n.t("plan.minutes", { count: 10 })).toBe("10 דקות");
  });
});

describe("SUPPORTED_LOCALES", () => {
  it("is exactly the two launch locales — no translation-ready-only locale leaks in", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en-US", "he-IL"]);
  });
});
