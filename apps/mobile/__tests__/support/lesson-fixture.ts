import type { LessonContent } from "@pawcue/domain";

/**
 * A lesson fixture shaped like the seeded Name Game, using the real translation keys.
 *
 * Real keys matter: a fixture with invented keys would render "lesson.made.up.key" and every localisation
 * assertion would be vacuous. These are the keys actually present in `packages/i18n`, so the render tests prove
 * the content pipeline resolves end to end in both languages.
 */

const TS = "2026-09-11T10:00:00.000Z";
const base = { createdAt: TS, updatedAt: TS };
const ID = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

export const LESSON_IDS = {
  lesson: ID(1),
  step1: ID(10),
  step2Clicker: ID(11),
  step3: ID(12),
  step4Reps: ID(13),
  troubleDistracted: ID(20),
  troubleEscalation: ID(21),
} as const;

export function makeLessonFixture(): LessonContent {
  return {
    lesson: {
      id: LESSON_IDS.lesson,
      slug: "name_game",
      skillId: ID(2),
      titleKey: "lesson.nameGame.title",
      goalKey: "lesson.nameGame.goal",
      estimatedMinutes: 3,
      equipment: ["treats", "clicker"],
      difficulty: 1,
      prerequisiteSkillIds: [],
      isAlwaysFree: true,
      contentVersionId: ID(3),
      ...base,
    },
    steps: [
      {
        id: LESSON_IDS.step1,
        lessonId: LESSON_IDS.lesson,
        stepOrder: 0,
        instructionKey: "lesson.nameGame.step1",
        requiresClickerPress: false,
        repetitionTarget: null,
        illustrationAssetKey: null,
        ...base,
      },
      {
        id: LESSON_IDS.step2Clicker,
        lessonId: LESSON_IDS.lesson,
        stepOrder: 1,
        instructionKey: "lesson.nameGame.step2",
        requiresClickerPress: true,
        repetitionTarget: null,
        illustrationAssetKey: null,
        ...base,
      },
      {
        id: LESSON_IDS.step3,
        lessonId: LESSON_IDS.lesson,
        stepOrder: 2,
        instructionKey: "lesson.nameGame.step3",
        requiresClickerPress: false,
        repetitionTarget: null,
        illustrationAssetKey: null,
        ...base,
      },
      {
        id: LESSON_IDS.step4Reps,
        lessonId: LESSON_IDS.lesson,
        stepOrder: 3,
        instructionKey: "lesson.nameGame.step4",
        requiresClickerPress: false,
        repetitionTarget: 5,
        illustrationAssetKey: null,
        ...base,
      },
    ],
    troubleshooting: [
      {
        id: LESSON_IDS.troubleDistracted,
        lessonId: LESSON_IDS.lesson,
        slug: "dog_distracted",
        promptKey: "troubleshoot.dogDistracted.prompt",
        guidanceKey: "troubleshoot.dogDistracted.guidance",
        safetyCategory: "NORMAL",
        sortOrder: 1,
        ...base,
      },
      {
        id: LESSON_IDS.troubleEscalation,
        lessonId: LESSON_IDS.lesson,
        slug: "biting_causes_injury",
        promptKey: "troubleshoot.bitingCausesInjury.prompt",
        guidanceKey: "troubleshoot.bitingCausesInjury.guidance",
        safetyCategory: "PROFESSIONAL_TRAINER_RECOMMENDED",
        sortOrder: 2,
        ...base,
      },
    ],
  };
}
