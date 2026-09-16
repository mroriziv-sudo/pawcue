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
 *
 * The same goes for i18next's `context` suffix: Hebrew agrees a handful of strings with the dog's sex
 * (`ageMonths_female_one`, `knows_female`) where English has one form, and i18next falls back from the context
 * key to the base key, so the concept is covered in both.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const CONTEXT_SUFFIX = /_(female|male)$/;
function normalizePluralKeys(keys: string[]): string[] {
  return [
    ...new Set(
      keys.map((key) =>
        key.replace(PLURAL_SUFFIX, "").replace(CONTEXT_SUFFIX, ""),
      ),
    ),
  ];
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
  it("initializes and resolves a known key in the default locale (en-US)", () => {
    const i18n = createI18n();
    expect(i18n.t("clicker.freeTitle")).toBe("Your free dog clicker");
  });

  it("resolves the same key correctly after switching to he-IL", async () => {
    const i18n = createI18n();
    await i18n.changeLanguage("he-IL");
    expect(i18n.t("clicker.freeTitle")).toBe("הקליקר החינמי שלך לאילוף כלבים");
  });

  it("falls back to English for a locale outside the supported set rather than throwing", async () => {
    const i18n = createI18n();
    // i18next's changeLanguage accepts any string at the type level; "fr" is unsupported at the app level,
    // which is exactly the runtime fallback path this test exercises.
    await i18n.changeLanguage("fr");
    expect(i18n.t("clicker.freeTitle")).toBe("Your free dog clicker");
  });

  it("resolves English plural categories correctly for 1 and 2 minutes", () => {
    const i18n = createI18n();
    expect(i18n.t("plan.minutes", { count: 1 })).toBe("1 minute");
    expect(i18n.t("plan.minutes", { count: 2 })).toBe("2 minutes");
  });

  it("resolves Hebrew plural categories correctly for 1, 2, and 10 minutes", async () => {
    const i18n = createI18n();
    await i18n.changeLanguage("he-IL");
    expect(i18n.t("plan.minutes", { count: 1 })).toBe("דקה");
    expect(i18n.t("plan.minutes", { count: 2 })).toBe("שתי דקות");
    expect(i18n.t("plan.minutes", { count: 10 })).toBe("10 דקות");
  });
});

describe("session strings", () => {
  /**
   * Guards a bug found during Phase 3 simulator acceptance: the completion screen read "1 clicks".
   *
   * A key holding `{{count}}` without plural variants renders the plural form for every value, which is the kind
   * of wrong that never fails a build and is only visible on a screen someone happens to look at.
   */
  it("renders singular and plural forms in English", () => {
    const i18n = createI18n();
    expect(i18n.t("session.complete.clicksSummary", { count: 1 })).toBe(
      "1 click",
    );
    expect(i18n.t("session.complete.clicksSummary", { count: 4 })).toBe(
      "4 clicks",
    );
    expect(i18n.t("session.complete.repsSummary", { count: 1 })).toBe(
      "1 successful rep logged",
    );
    expect(i18n.t("session.overview.stepsLabel", { count: 1 })).toBe("1 step");
    expect(i18n.t("session.overview.durationLabel", { count: 1 })).toBe(
      "About 1 minute",
    );
  });

  it("renders Hebrew plural categories, including the dual", async () => {
    const i18n = createI18n();
    await i18n.changeLanguage("he-IL");
    // Hebrew has a genuine dual category; treating it as "other" reads as broken to a native speaker.
    expect(i18n.t("session.complete.clicksSummary", { count: 1 })).toBe(
      "קליק אחד",
    );
    expect(i18n.t("session.complete.clicksSummary", { count: 2 })).toBe(
      "שני קליקים",
    );
    expect(i18n.t("session.complete.clicksSummary", { count: 7 })).toBe(
      "7 קליקים",
    );
  });

  it("leaves no count-bearing session string without plural forms", async () => {
    const en = (await import("./locales/en-US/common.json")).default as Record<
      string,
      unknown
    >;

    const offenders: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === "string") {
        // A key that interpolates `count` but carries no `_one`/`_other` sibling cannot pluralise.
        if (
          node.includes("{{count}}") &&
          !/_(one|two|few|many|other)$/.test(path)
        ) {
          offenders.push(path);
        }
        return;
      }
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          walk(value, path ? `${path}.${key}` : key);
        }
      }
    };
    walk(en.session, "session");

    // `repetitionsProgress` is "{{count}} of {{target}}" — a ratio, not a pluralised noun.
    expect(offenders).toEqual(["session.train.repetitionsProgress"]);
  });
});

describe("SUPPORTED_LOCALES", () => {
  it("is exactly the two launch locales — no translation-ready-only locale leaks in", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en-US", "he-IL"]);
  });
});
