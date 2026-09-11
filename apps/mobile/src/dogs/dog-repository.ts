import { dogSchema, type Dog, type DogInsert } from "@pawcue/domain";
import { requireSupabase } from "../lib/supabase";

/**
 * Dog rows, through RLS.
 *
 * There is no admin path here and no service-role key: `dogs_all_own` is `auth.uid() = owner_user_id` for both
 * `USING` and `WITH CHECK`, so the database decides what a caller may read and write. A guest is a real
 * authenticated identity with a real profile row (anonymous sign-in), so a guest owns their dog exactly the way a
 * signed-in user does — which is what lets onboarding finish before any account exists.
 */

interface DogRow {
  id: string;
  owner_user_id: string;
  name: string;
  birthdate: string | null;
  breed: string | null;
  sex: string;
  photo_url: string | null;
  daily_training_minutes: number | null;
  created_at: string;
  updated_at: string;
}

/** Parsed rather than cast: a schema drift should fail here, not as an undefined name on a profile screen. */
function toDog(row: DogRow): Dog {
  return dogSchema.parse({
    id: row.id,
    owner: { kind: "user", userId: row.owner_user_id },
    name: row.name,
    birthdate: row.birthdate,
    breed: row.breed,
    sex: row.sex,
    photoUrl: row.photo_url,
    dailyTrainingMinutes: row.daily_training_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function createDog(insert: DogInsert): Promise<Dog> {
  const client = requireSupabase();
  // Not destructured: the client is untyped here, so pulling `data` out of the result would be an implicit `any`
  // assignment. Reading the fields and parsing the row keeps the untyped surface to a single expression.
  const result = await client.from("dogs").insert(insert).select("*").single();

  if (result.error)
    throw new Error(`Could not create dog: ${result.error.message}`);
  return toDog(result.data as DogRow);
}

/**
 * The caller's dogs, newest first.
 *
 * RLS scopes this to the current identity, so after a merge the same call returns the guest's dog under the
 * permanent account with no client-side filtering to get wrong.
 */
export async function listOwnDogs(): Promise<Dog[]> {
  const client = requireSupabase();
  const result = await client
    .from("dogs")
    .select("*")
    .order("created_at", { ascending: false });

  if (result.error)
    throw new Error(`Could not load dogs: ${result.error.message}`);
  return (result.data as DogRow[]).map(toDog);
}

export async function fetchDog(dogId: string): Promise<Dog | null> {
  const client = requireSupabase();
  const result = await client
    .from("dogs")
    .select("*")
    .eq("id", dogId)
    .maybeSingle();

  if (result.error)
    throw new Error(`Could not load dog: ${result.error.message}`);
  return result.data ? toDog(result.data as DogRow) : null;
}

export type DogUpdate = Partial<
  Pick<
    DogInsert,
    "name" | "birthdate" | "breed" | "sex" | "daily_training_minutes"
  >
>;

export async function updateDog(dogId: string, patch: DogUpdate): Promise<Dog> {
  const client = requireSupabase();
  const result = await client
    .from("dogs")
    .update(patch)
    .eq("id", dogId)
    .select("*")
    .single();

  if (result.error)
    throw new Error(`Could not update dog: ${result.error.message}`);
  return toDog(result.data as DogRow);
}
