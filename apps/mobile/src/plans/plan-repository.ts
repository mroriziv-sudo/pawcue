import {
  lessonSchema,
  skillSchema,
  type GeneratedPlan,
  type Lesson,
  type PlanningCatalogue,
  type PlanSelectionReason,
  type Skill,
} from "@pawcue/domain";
import { requireSupabase } from "../lib/supabase";
import { z } from "zod";
import { appStorage, STORAGE_KEYS } from "../lib/storage";

/** Validates a cached catalogue before it is trusted, the same way content is validated on the way in. */
const planningCatalogueSchema = z.object({
  lessons: z.array(lessonSchema),
  skills: z.array(skillSchema),
});

/**
 * Training plan persistence, through RLS.
 *
 * Phase 0 already defined every table this needs — `training_plans`, `plan_days`, `plan_activities`, and
 * `plan_engine_versions` — along with their ownership policies, so this phase adds no persistence of its own
 * beyond the one additive `selection_reason` column.
 *
 * Plans store **references, not copies**. A day's activity records a `lesson_id`, never a snapshot of the
 * lesson's title, steps or duration. Copying content into a plan would mean an edited lesson silently disagreeing
 * with every plan that mentioned it, and there would be no way to tell which was right.
 */

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

/**
 * Reads the `id` from an `id`-only select.
 *
 * Narrowed through `unknown` rather than asserted from the client's loosely-typed result: asserting straight from
 * `any` is not a narrowing the type-checker recognises, so it buys no safety and only silences the reader.
 */
function idOf(data: unknown): string {
  return (data as { id: string }).id;
}

interface SkillRow {
  id: string;
  slug: string;
  title_key: string;
  prerequisite_skill_ids: string[];
  difficulty: number;
  created_at: string;
  updated_at: string;
}

function toLesson(row: LessonRow): Lesson {
  return lessonSchema.parse({
    id: row.id,
    slug: row.slug,
    skillId: row.skill_id,
    titleKey: row.title_key,
    goalKey: row.goal_key,
    estimatedMinutes: row.estimated_minutes,
    equipment: row.equipment,
    difficulty: row.difficulty,
    prerequisiteSkillIds: row.prerequisite_skill_ids,
    isAlwaysFree: row.is_always_free,
    contentVersionId: row.content_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toSkill(row: SkillRow): Skill {
  return skillSchema.parse({
    id: row.id,
    slug: row.slug,
    titleKey: row.title_key,
    prerequisiteSkillIds: row.prerequisite_skill_ids,
    difficulty: row.difficulty,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/**
 * The content the planner may choose from.
 *
 * What comes back here *is* the definition of available: an unpublished lesson is simply absent, so it can never
 * be newly recommended. Both tables are public-read catalogue content, so this works for a guest.
 */
export async function loadPlanningCatalogue(): Promise<PlanningCatalogue> {
  try {
    const catalogue = await fetchCatalogueFromNetwork();
    await writeCatalogueCache(catalogue);
    return catalogue;
  } catch (error) {
    /**
     * Offline falls back to the last catalogue seen.
     *
     * Today and Train are unusable without it, and a persisted plan that cannot resolve its lesson titles is no
     * better than no plan. The cache is the same pattern lesson content already uses. Nothing is fabricated: with
     * no cache at all the error propagates and the screens say so.
     */
    const cached = await readCatalogueCache();
    if (cached) return cached;
    throw error;
  }
}

async function fetchCatalogueFromNetwork(): Promise<PlanningCatalogue> {
  const client = requireSupabase();

  const [lessonsResult, skillsResult] = await Promise.all([
    client.from("lessons").select("*").order("slug", { ascending: true }),
    client.from("skills").select("*").order("slug", { ascending: true }),
  ]);

  if (lessonsResult.error) {
    throw new Error(`Could not load lessons: ${lessonsResult.error.message}`);
  }
  if (skillsResult.error) {
    throw new Error(`Could not load skills: ${skillsResult.error.message}`);
  }

  return {
    lessons: (lessonsResult.data as LessonRow[]).map(toLesson),
    skills: (skillsResult.data as SkillRow[]).map(toSkill),
  };
}

async function readCatalogueCache(): Promise<PlanningCatalogue | null> {
  try {
    const raw = await appStorage.getItem(STORAGE_KEYS.catalogueCache);
    if (!raw) return null;
    const parsed = planningCatalogueSchema.safeParse(JSON.parse(raw));
    // A cache written by an older content shape is discarded rather than repaired.
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeCatalogueCache(
  catalogue: PlanningCatalogue,
): Promise<void> {
  try {
    await appStorage.setItem(
      STORAGE_KEYS.catalogueCache,
      JSON.stringify(catalogue),
    );
  } catch {
    /* A cache write failure must never fail the screen that just loaded successfully. */
  }
}

/**
 * Resolves an engine version string to its catalogue row id.
 *
 * `plan_engine_versions` is public-read with **no client insert policy**, which is deliberate: a version is a
 * released fact about the engine, not something a device gets to mint. An unknown version therefore fails loudly
 * rather than being created on the fly — the fix is a migration, not a retry.
 */
export async function resolveEngineVersionId(version: string): Promise<string> {
  const client = requireSupabase();
  const result = await client
    .from("plan_engine_versions")
    .select("id")
    .eq("version", version)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      `Could not resolve plan engine version: ${result.error.message}`,
    );
  }
  if (!result.data) {
    throw new Error(
      `Plan engine version "${version}" is not registered in plan_engine_versions. ` +
        "Add it in a migration before generating plans with this engine.",
    );
  }
  return idOf(result.data);
}

export interface PersistedPlanRef {
  planId: string;
  engineVersionId: string;
  dayCount: number;
  activityCount: number;
}

/**
 * Writes a generated plan.
 *
 * Ordered plan → days → activities because each is a foreign key of the last. Every row is written through the
 * caller's own session, so `training_plans_all_own` and the policies beneath it decide whether the dog is theirs;
 * there is no service-role path and no client-side ownership check to get wrong.
 *
 * Any previously active plan for the dog is marked `superseded` first. That is the idempotency story the schema
 * already implies: a dog has one active plan, and regenerating replaces rather than accumulates. Old plans are
 * kept, not deleted — they record what was recommended at the time, under the engine version that recommended it.
 */
export async function persistGeneratedPlan(
  generated: GeneratedPlan,
  engineVersion: string,
): Promise<PersistedPlanRef> {
  const client = requireSupabase();
  const engineVersionId = await resolveEngineVersionId(engineVersion);
  const dogId = generated.plan.dogId;

  const supersede = await client
    .from("training_plans")
    .update({ status: "superseded" })
    .eq("dog_id", dogId)
    .eq("status", "active");
  if (supersede.error) {
    throw new Error(
      `Could not supersede the previous plan: ${supersede.error.message}`,
    );
  }

  const planResult = await client
    .from("training_plans")
    .insert({
      dog_id: dogId,
      plan_engine_version_id: engineVersionId,
      status: "active",
      daily_minutes: generated.plan.dailyMinutes,
      start_date: generated.plan.startDate,
      length_days: generated.plan.lengthDays,
    })
    .select("id")
    .single();
  if (planResult.error) {
    throw new Error(`Could not create the plan: ${planResult.error.message}`);
  }
  const planId = idOf(planResult.data);

  let activityCount = 0;

  for (const entry of generated.days) {
    const dayResult = await client
      .from("plan_days")
      .insert({
        plan_id: planId,
        day_index: entry.day.dayIndex,
        date: entry.day.date,
        total_minutes: entry.day.totalMinutes,
      })
      .select("id")
      .single();
    if (dayResult.error) {
      throw new Error(`Could not create plan day: ${dayResult.error.message}`);
    }
    const planDayId = idOf(dayResult.data);

    if (entry.activities.length === 0) continue;

    const activities = await client.from("plan_activities").insert(
      entry.activities.map((activity) => ({
        plan_day_id: planDayId,
        lesson_id: activity.lessonId,
        sort_order: activity.sortOrder,
        estimated_minutes: activity.estimatedMinutes,
        is_review: activity.isReview,
        selection_reason: activity.selectionReason,
      })),
    );
    if (activities.error) {
      throw new Error(
        `Could not create plan activities: ${activities.error.message}`,
      );
    }
    activityCount += entry.activities.length;
  }

  return {
    planId,
    engineVersionId,
    dayCount: generated.days.length,
    activityCount,
  };
}

/** Normalises PostgREST's embedded to-one relation, which arrives as an array. */
function readEngineVersion(
  embedded: Array<{ version: string }> | { version: string } | null,
): string {
  if (!embedded) return "unknown";
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  return row?.version ?? "unknown";
}

export interface StoredPlanActivity {
  lessonId: string;
  sortOrder: number;
  estimatedMinutes: number;
  isReview: boolean;
  selectionReason: PlanSelectionReason;
}

export interface StoredPlanDay {
  dayIndex: number;
  date: string;
  totalMinutes: number;
  activities: StoredPlanActivity[];
}

export interface StoredPlan {
  id: string;
  dogId: string;
  /** The version string of the engine that produced this plan, not the current one. */
  engineVersion: string;
  status: string;
  dailyMinutes: number;
  startDate: string;
  lengthDays: number;
  days: StoredPlanDay[];
}

/**
 * Reads the dog's active plan.
 *
 * The engine version is read back from the plan's own row rather than assumed to be the current one. That is the
 * entire point of storing it: an old plan must always be read against the rules that actually produced it, and
 * re-attributing history to a newer engine would make every past recommendation unexplainable.
 */
export async function fetchActivePlan(
  dogId: string,
): Promise<StoredPlan | null> {
  const client = requireSupabase();

  const result = await client
    .from("training_plans")
    .select(
      "id, dog_id, status, daily_minutes, start_date, length_days, plan_engine_versions(version), plan_days(day_index, date, total_minutes, plan_activities(lesson_id, sort_order, estimated_minutes, is_review, selection_reason))",
    )
    .eq("dog_id", dogId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(`Could not load the plan: ${result.error.message}`);
  }
  if (!result.data) return null;

  const row = result.data as {
    id: string;
    dog_id: string;
    status: string;
    daily_minutes: number;
    start_date: string;
    length_days: number;
    // PostgREST returns an embedded relation as an array even when it is to-one.
    plan_engine_versions:
      Array<{ version: string }> | { version: string } | null;
    plan_days: Array<{
      day_index: number;
      date: string;
      total_minutes: number;
      plan_activities: Array<{
        lesson_id: string;
        sort_order: number;
        estimated_minutes: number;
        is_review: boolean;
        selection_reason: string;
      }>;
    }>;
  };

  return {
    id: row.id,
    dogId: row.dog_id,
    engineVersion: readEngineVersion(row.plan_engine_versions),
    status: row.status,
    dailyMinutes: row.daily_minutes,
    startDate: row.start_date,
    lengthDays: row.length_days,
    days: [...row.plan_days]
      .sort((a, b) => a.day_index - b.day_index)
      .map((day) => ({
        dayIndex: day.day_index,
        date: day.date,
        totalMinutes: day.total_minutes,
        activities: [...day.plan_activities]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((activity) => ({
            lessonId: activity.lesson_id,
            sortOrder: activity.sort_order,
            estimatedMinutes: activity.estimated_minutes,
            isReview: activity.is_review,
            selectionReason: activity.selection_reason as PlanSelectionReason,
          })),
      })),
  };
}
