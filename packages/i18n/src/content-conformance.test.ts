import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createI18n, SUPPORTED_LOCALES } from "./index";

/**
 * Every piece of published content must resolve to real copy in every launch locale.
 *
 * The seed stores i18n *keys*, never text, which is the right architecture and also the failure mode this test
 * exists for: a key with no translation renders as itself. Eleven lessons shipped that way — the training screen
 * showed `potty_foundation.step2` as an instruction — and nothing caught it because the keys were computed
 * (`slug || '.step1'`), so no literal audit could see them and no locale could translate them.
 *
 * Three rules, each of which would have failed on that build:
 *
 *   1. Every `*_key` value in the seed is a literal. A computed key cannot be checked, so it is not allowed.
 *   2. Every literal resolves, in every supported locale, to a string that is not the key itself.
 *   3. Nothing resolves to scaffold or placeholder copy.
 *
 * The seed is read as text rather than through a database, so this runs in the ordinary gate on every commit.
 */

const SEED_PATH = resolve(__dirname, "../../../supabase/seed.sql");
const seed = readFileSync(SEED_PATH, "utf8");

/** The columns that reach a user's screen. `changelog_key` is included: it is copy, even if rarely shown. */
const KEY_COLUMNS = [
  "title_key",
  "goal_key",
  "description_key",
  "instruction_key",
  "prompt_key",
  "guidance_key",
  "changelog_key",
];

/** Copy that means "not written yet". Case-insensitive, matched against the resolved translation. */
const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /lorem ipsum/i,
  /placeholder/i,
  /\bscaffold/i,
  /^step\s*\d+$/i,
  /^\s*$/,
];

/**
 * Every quoted dotted key in the seed: `'lesson.sit.step1'`, `'troubleshoot.dogWalksAway.prompt'`, and so on.
 *
 * The seed's own convention makes this unambiguous — no other quoted literal in the file contains a dot between
 * two identifier segments.
 */
function keyLiterals(): string[] {
  const matches = seed.match(/'([a-zA-Z]+(?:\.[a-zA-Z0-9_]+)+)'/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))].sort();
}

describe("published content keys are literals", () => {
  it("never computes a key from a slug or any other column", () => {
    // `slug || '.step1'` was the scaffold. Any concatenation feeding a *_key column is the same defect.
    const computed = seed
      .split("\n")
      .filter(
        (line) => /\|\|\s*'\./.test(line) && !line.trim().startsWith("--"),
      );
    expect(computed).toEqual([]);
  });

  it("uses a key column for every content row that carries copy", () => {
    // Sanity on the audit itself: if the seed stopped naming these columns, rule 2 would pass vacuously.
    for (const column of KEY_COLUMNS) {
      if (column === "description_key" || column === "changelog_key") continue;
      expect(seed).toContain(column);
    }
  });

  it("gives every lesson step a key under the lesson namespace", () => {
    const stepKeys = keyLiterals().filter((key) => /\.step\d+$/.test(key));
    expect(stepKeys.length).toBeGreaterThanOrEqual(40);
    for (const key of stepKeys) {
      expect(key.startsWith("lesson.")).toBe(true);
    }
  });
});

describe.each(SUPPORTED_LOCALES)(
  "published content resolves in %s",
  (locale) => {
    const i18n = createI18n();

    it("has a translation for every key the seed references", async () => {
      await i18n.changeLanguage(locale);
      const unresolved: string[] = [];

      for (const key of keyLiterals()) {
        const resolved = i18n.t(key);
        // i18next returns the key itself for a miss; `exists` is the explicit check.
        if (
          !i18n.exists(key) ||
          resolved === key ||
          typeof resolved !== "string"
        ) {
          unresolved.push(key);
        }
      }

      expect(unresolved).toEqual([]);
    });

    it("never resolves to placeholder copy", async () => {
      await i18n.changeLanguage(locale);
      const placeholders: Array<[string, string]> = [];

      for (const key of keyLiterals()) {
        const resolved = i18n.t(key);
        if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(resolved))) {
          placeholders.push([key, resolved]);
        }
      }

      expect(placeholders).toEqual([]);
    });

    it("never leaks a raw key fragment into copy", async () => {
      await i18n.changeLanguage(locale);
      const leaks: Array<[string, string]> = [];

      for (const key of keyLiterals()) {
        const resolved = i18n.t(key);
        // A translation that contains something shaped like `word.word.word` is a key that was pasted as text.
        if (
          /\b[a-z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z0-9_]+\b/.test(
            resolved,
          )
        ) {
          leaks.push([key, resolved]);
        }
      }

      expect(leaks).toEqual([]);
    });
  },
);

describe("the eleven authored lessons", () => {
  const AUTHORED = [
    "down",
    "come",
    "stay",
    "leaveIt",
    "place",
    "calmSettle",
    "looseLeashFoundation",
    "jumpingFoundation",
    "bitingFoundation",
    "crateFoundation",
    "pottyFoundation",
  ];

  it.each(SUPPORTED_LOCALES)(
    "each has three real steps in %s",
    async (locale) => {
      const i18n = createI18n();
      await i18n.changeLanguage(locale);

      for (const lesson of AUTHORED) {
        for (const n of [1, 2, 3]) {
          const key = `lesson.${lesson}.step${n}`;
          expect(i18n.exists(key), key).toBe(true);
          expect(i18n.t(key).length, key).toBeGreaterThan(10);
        }
      }
    },
  );

  it("uses positive-reinforcement language and no aversive methods", async () => {
    const i18n = createI18n();
    await i18n.changeLanguage("en-US");
    const AVERSIVE =
      /\b(punish|scold|yank|jerk|hit|smack|alpha roll|dominan|shock|prong|choke)\w*/i;

    for (const lesson of AUTHORED) {
      for (const n of [1, 2, 3]) {
        const copy = i18n.t(`lesson.${lesson}.step${n}`);
        expect(copy, `${lesson} step ${n}`).not.toMatch(AVERSIVE);
      }
    }
  });
});
