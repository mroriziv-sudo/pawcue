import { lessonContentSchema, type LessonContent } from "@pawcue/domain";
import { supabase } from "../lib/supabase";
import { appStorage } from "../lib/storage";

/**
 * Where lesson content comes from.
 *
 * Content is database rows, not files in the bundle (ARCHITECTURE.md §7): lessons and troubleshooting need to be
 * updatable without an app release, and they need translated variants. But a lesson must also be trainable with no
 * network (brief §28), so every successful fetch is written to a local cache and the cache is used whenever the
 * network cannot answer.
 *
 * The cache is deliberately hand-rolled rather than pulling in a query-persistence library: it is one key per
 * lesson holding the validated aggregate, which is a smaller and more predictable thing than a serialised query
 * cache, and it adds no dependency.
 */

const CACHE_PREFIX = "pawcue.content.lesson.";

export type ContentSource = "network" | "cache";

export interface LessonContentResult {
  content: LessonContent;
  source: ContentSource;
}

export class LessonUnavailableError extends Error {
  constructor(slug: string, cause?: unknown) {
    super(
      `Lesson "${slug}" is not available offline and could not be fetched.`,
    );
    this.name = "LessonUnavailableError";
    this.cause = cause;
  }
}

/** Row shapes as PostgREST returns them: snake_case, and `null` where the domain uses `null`. */
interface LessonRow {
  id: string;
  slug: string;
  skill_id: string;
  title_key: string;
  goal_key: string;
  estimated_minutes: number;
  equipment: string[];
  difficulty: number;
  prerequisite_skill_ids: string[];
  is_always_free: boolean;
  content_version_id: string;
  created_at: string;
  updated_at: string;
}

interface StepRow {
  id: string;
  lesson_id: string;
  step_order: number;
  instruction_key: string;
  requires_clicker_press: boolean;
  repetition_target: number | null;
  illustration_asset_key: string | null;
  created_at: string;
  updated_at: string;
}

interface TroubleshootingRow {
  id: string;
  lesson_id: string;
  slug: string;
  prompt_key: string;
  guidance_key: string;
  safety_category: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function toLessonContent(
  lesson: LessonRow,
  steps: StepRow[],
  troubleshooting: TroubleshootingRow[],
): LessonContent {
  // Parsed rather than cast: content is external input, and a schema drift should fail loudly here rather than
  // surface as an undefined instruction key halfway through a training session.
  return lessonContentSchema.parse({
    lesson: {
      id: lesson.id,
      slug: lesson.slug,
      skillId: lesson.skill_id,
      titleKey: lesson.title_key,
      goalKey: lesson.goal_key,
      estimatedMinutes: lesson.estimated_minutes,
      equipment: lesson.equipment,
      difficulty: lesson.difficulty,
      prerequisiteSkillIds: lesson.prerequisite_skill_ids,
      isAlwaysFree: lesson.is_always_free,
      contentVersionId: lesson.content_version_id,
      createdAt: lesson.created_at,
      updatedAt: lesson.updated_at,
    },
    steps: steps.map((step) => ({
      id: step.id,
      lessonId: step.lesson_id,
      stepOrder: step.step_order,
      instructionKey: step.instruction_key,
      requiresClickerPress: step.requires_clicker_press,
      repetitionTarget: step.repetition_target,
      illustrationAssetKey: step.illustration_asset_key,
      createdAt: step.created_at,
      updatedAt: step.updated_at,
    })),
    troubleshooting: troubleshooting.map((option) => ({
      id: option.id,
      lessonId: option.lesson_id,
      slug: option.slug,
      promptKey: option.prompt_key,
      guidanceKey: option.guidance_key,
      safetyCategory: option.safety_category,
      sortOrder: option.sort_order,
      createdAt: option.created_at,
      updatedAt: option.updated_at,
    })),
  });
}

async function readCache(slug: string): Promise<LessonContent | null> {
  try {
    const raw = await appStorage.getItem(CACHE_PREFIX + slug);
    if (!raw) return null;
    const parsed = lessonContentSchema.safeParse(JSON.parse(raw));
    // A cache written by an older content shape is discarded rather than repaired.
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeCache(content: LessonContent): Promise<void> {
  try {
    await appStorage.setItem(
      CACHE_PREFIX + content.lesson.slug,
      JSON.stringify(content),
    );
  } catch {
    /* A cache write failure must never fail the lesson the user is about to train. */
  }
}

async function fetchFromNetwork(slug: string): Promise<LessonContent> {
  const client = supabase;
  if (!client) throw new Error("Supabase is not configured");

  const lessonResult = await client
    .from("lessons")
    .select("*")
    .eq("slug", slug)
    .single();
  if (lessonResult.error) throw lessonResult.error;
  const lesson = lessonResult.data as LessonRow;

  const [stepsResult, troubleshootingResult] = await Promise.all([
    client
      .from("lesson_steps")
      .select("*")
      .eq("lesson_id", lesson.id)
      .order("step_order", { ascending: true }),
    client
      .from("lesson_troubleshooting")
      .select("*")
      .eq("lesson_id", lesson.id)
      .order("sort_order", { ascending: true }),
  ]);
  if (stepsResult.error) throw stepsResult.error;
  if (troubleshootingResult.error) throw troubleshootingResult.error;

  return toLessonContent(
    lesson,
    (stepsResult.data ?? []) as StepRow[],
    (troubleshootingResult.data ?? []) as TroubleshootingRow[],
  );
}

/**
 * Loads a lesson, preferring fresh content but never letting the network stand between a user and a lesson they
 * have already opened once.
 */
export async function loadLessonContent(
  slug: string,
): Promise<LessonContentResult> {
  try {
    const content = await fetchFromNetwork(slug);
    await writeCache(content);
    return { content, source: "network" };
  } catch (error) {
    const cached = await readCache(slug);
    if (cached) return { content: cached, source: "cache" };
    throw new LessonUnavailableError(slug, error);
  }
}

/** Exposed for tests and for clearing content between content versions. */
export function lessonCacheKey(slug: string): string {
  return CACHE_PREFIX + slug;
}
