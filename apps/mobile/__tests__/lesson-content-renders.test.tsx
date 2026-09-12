import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { ThemeProvider } from "@pawcue/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LessonContent } from "@pawcue/domain";
import TrainingScreen from "../app/session/[slug]";
import LessonOverviewScreen from "../app/lesson/[slug]";
import { i18n } from "../src/i18n";
import { useSessionStore } from "../src/state/session-store";
import { useTrainingLogStore } from "../src/state/training-log-store";
import { useEntitlementStore } from "../src/state/entitlement-store";

/**
 * Every published lesson, rendered through the real screens, in both languages.
 *
 * The content-conformance test in `packages/i18n` proves each key *resolves*. This proves the resolved copy is
 * what actually reaches the screen: the step instruction the user reads is built here from the seed's own rows,
 * pushed through the real session engine and the real training screen, and asserted to be sentences rather than
 * keys. Eleven lessons shipped showing `potty_foundation.step2` as their instruction; this is the test that would
 * have failed on that build, in the place a user would have seen it.
 *
 * Content is parsed from `supabase/seed.sql` rather than duplicated as fixtures, so a lesson added to the seed is
 * covered here without anyone remembering to add it.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => mockSearchParams,
}));
let mockSearchParams: { slug: string } = { slug: "" };

jest.mock("../src/lessons/lesson-repository", () => ({
  loadLessonContent: (...args: unknown[]) => mockLoad(...args),
  lessonCacheKey: (slug: string) => `pawcue.content.lesson.${slug}`,
}));
const mockLoad = jest.fn();

jest.mock("../src/plans/plan-repository", () => ({
  loadPlanningCatalogue: () =>
    Promise.reject(new Error("no catalogue in this test")),
  persistGeneratedPlan: jest.fn(),
  fetchActivePlan: jest.fn(),
}));

/* -------------------------------------------------------------------------- */
/* Seed parsing                                                                */
/* -------------------------------------------------------------------------- */

const SEED = readFileSync(
  resolve(__dirname, "../../../supabase/seed.sql"),
  "utf8",
);
const TS = "2026-09-11T10:00:00.000Z";
const base = { createdAt: TS, updatedAt: TS };

interface SeedLesson {
  id: string;
  slug: string;
  skillId: string;
  titleKey: string;
  goalKey: string;
  minutes: number;
  equipment: string[];
}

/** The `insert into lessons` rows. One regex per row; the seed's column order is the contract it matches. */
function seedLessons(): SeedLesson[] {
  const rows = SEED.matchAll(
    /\('([0-9a-f-]{36})',\s*'([a-z_]+)',\s*'([0-9a-f-]{36})',\s*'(lesson\.[a-zA-Z]+\.title)',\s*'(lesson\.[a-zA-Z]+\.goal)',\s*(\d+),\s*'\{([a-z_,]*)\}'/g,
  );
  return [...rows].map((m) => ({
    id: m[1]!,
    slug: m[2]!,
    skillId: m[3]!,
    titleKey: m[4]!,
    goalKey: m[5]!,
    minutes: Number(m[6]),
    equipment: m[7] ? m[7].split(",") : [],
  }));
}

interface SeedStep {
  lessonId: string;
  order: number;
  key: string;
  clicker: boolean;
  reps: number | null;
}

/** Literal `lesson_steps` rows. A computed row would not match, which is the point — those are the defect. */
function seedSteps(): SeedStep[] {
  const rows = SEED.matchAll(
    /\('([0-9a-f-]{36})',\s*(\d),\s*'([a-zA-Z.0-9_]+)',\s*(true|false),\s*(null|\d+)\)/g,
  );
  return [...rows].map((m) => ({
    lessonId: m[1]!,
    order: Number(m[2]),
    key: m[3]!,
    clicker: m[4] === "true",
    reps: m[5] === "null" ? null : Number(m[5]),
  }));
}

function contentFor(lesson: SeedLesson): LessonContent {
  const steps = seedSteps()
    .filter((step) => step.lessonId === lesson.id)
    .sort((a, b) => a.order - b.order);

  return {
    lesson: {
      id: lesson.id,
      slug: lesson.slug,
      skillId: lesson.skillId,
      titleKey: lesson.titleKey,
      goalKey: lesson.goalKey,
      estimatedMinutes: lesson.minutes,
      equipment: lesson.equipment as LessonContent["lesson"]["equipment"],
      difficulty: 1,
      prerequisiteSkillIds: [],
      isAlwaysFree: true,
      contentVersionId: "00000000-0000-4000-a000-0000000000c1",
      ...base,
    },
    steps: steps.map((step, index) => ({
      id: `00000000-0000-4000-a000-${String(index + 1).padStart(12, "0")}`,
      lessonId: lesson.id,
      stepOrder: step.order,
      instructionKey: step.key,
      requiresClickerPress: step.clicker,
      repetitionTarget: step.reps,
      illustrationAssetKey: null,
      ...base,
    })),
    troubleshooting: [],
  };
}

/** Anything shaped like `a.b.c` or `a_b.step1` is a key that reached the screen as text. */
const LOOKS_LIKE_KEY = /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function wrap(node: React.ReactNode, direction: "ltr" | "rtl") {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider direction={direction}>{node}</ThemeProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}

/** Satisfies whatever the current step demands, exactly as a user would, then advances. */
async function completeCurrentStep() {
  const clicker = screen.queryByTestId("session-clicker");
  if (clicker) await fireEvent.press(clicker);

  const counter = screen.queryByTestId("repetition-counter");
  if (counter) {
    // Press until the add control disables itself at the target.
    for (let i = 0; i < 10; i += 1) {
      const add = screen.getByTestId("add-repetition");
      if (add.props.accessibilityState?.disabled) break;
      await fireEvent.press(add);
    }
  }

  await fireEvent.press(screen.getByTestId("advance-step"));
}

const LESSONS = seedLessons();

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useSessionStore.setState({ session: null, lastFailure: null });
  useTrainingLogStore.setState({ completed: [], hydrated: true });
  useEntitlementStore.setState({
    view: {
      status: "premium",
      isPremiumActive: true,
      source: "active",
      expiresAt: null,
      verifiedAt: TS,
      fromCache: false,
    },
  });
});

describe("the seed parser sees the whole catalogue", () => {
  it("finds every lesson and every step", () => {
    expect(LESSONS.map((l) => l.slug).sort()).toEqual([
      "biting_foundation",
      "calm_settle",
      "come",
      "crate_foundation",
      "down",
      "jumping_foundation",
      "leave_it",
      "loose_leash_foundation",
      "name_game",
      "place",
      "potty_foundation",
      "sit",
      "stay",
    ]);
    // 4 + 3 + 11 × 3. If a lesson's steps go missing from the seed, or revert to a computed form, this drops.
    expect(seedSteps()).toHaveLength(40);
    const thin = LESSONS.filter((l) => contentFor(l).steps.length < 3).map(
      (l) => l.slug,
    );
    expect(thin).toEqual([]);
  });

  it("only asks for a clicker where the lesson's equipment includes one", () => {
    const mismatched = LESSONS.filter((lesson) => {
      const demandsClicker = contentFor(lesson).steps.some(
        (s) => s.requiresClickerPress,
      );
      return demandsClicker && !lesson.equipment.includes("clicker");
    }).map((l) => l.slug);
    expect(mismatched).toEqual([]);
  });
});

describe.each([
  ["en-US", "ltr"],
  ["he-IL", "rtl"],
] as const)("every lesson renders real copy in %s", (locale, direction) => {
  beforeEach(async () => {
    await i18n.changeLanguage(locale);
  });

  it.each(LESSONS.map((l) => [l.slug, l] as const))(
    "%s — overview shows a title and goal, never a key",
    async (_slug, lesson) => {
      mockSearchParams = { slug: lesson.slug };
      mockLoad.mockResolvedValue({
        content: contentFor(lesson),
        source: "network",
      });

      await render(wrap(<LessonOverviewScreen />, direction));
      await waitFor(() =>
        expect(screen.getByTestId("lesson-overview")).toBeTruthy(),
      );

      const title = screen.getByTestId("lesson-title").props.children;
      const goal = screen.getByTestId("lesson-goal").props.children;
      expect(String(title)).not.toMatch(LOOKS_LIKE_KEY);
      expect(String(goal)).not.toMatch(LOOKS_LIKE_KEY);
      expect(String(goal).length).toBeGreaterThan(10);
    },
  );

  it.each(LESSONS.map((l) => [l.slug, l] as const))(
    "%s — every step instruction is a sentence, all the way to completion",
    async (_slug, lesson) => {
      mockSearchParams = { slug: lesson.slug };
      const content = contentFor(lesson);
      mockLoad.mockResolvedValue({ content, source: "network" });

      await render(wrap(<TrainingScreen />, direction));
      await waitFor(() =>
        expect(screen.getByTestId("training-screen")).toBeTruthy(),
      );

      const seen: string[] = [];
      for (let i = 0; i < content.steps.length; i += 1) {
        const instruction = String(
          screen.getByTestId("step-instruction").props.children,
        );
        seen.push(instruction);

        // Labelled so a failure names the step rather than an index into a loop.
        const labelled = { at: `${lesson.slug} step ${i + 1}`, instruction };
        expect(labelled).not.toMatchObject({
          instruction: expect.stringMatching(LOOKS_LIKE_KEY),
        });
        // A floor for empties and "Step 1"-style stubs, not a style rule: "תגמלו מיד." is ten characters and
        // a complete instruction. Key shape is caught above; this only has to catch nothing-at-all.
        expect(labelled.instruction.length).toBeGreaterThanOrEqual(8);
        // Hebrew must actually be Hebrew, not English falling through.
        if (locale === "he-IL") {
          expect(instruction).toMatch(/[֐-׿]/);
        }

        await completeCurrentStep();
      }

      await waitFor(() =>
        expect(screen.getByTestId("session-complete")).toBeTruthy(),
      );
      // Each step said something different; a lesson whose three steps read identically is not authored.
      expect(new Set(seen).size).toBe(content.steps.length);
    },
  );
});
