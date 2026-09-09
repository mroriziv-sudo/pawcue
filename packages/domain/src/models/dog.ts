import { z } from "zod";
import { timestampedSchema, uuidSchema, ownerRefSchema } from "./shared";

export const dogSexSchema = z.enum(["male", "female", "unspecified"]);

/**
 * Dog + DogProfile are one table/type in practice (brief lists both as separate models, but splitting "profile"
 * fields into a second row would just be a 1:1 join with no independent lifecycle — see DATABASE.md `dogs`).
 * Breed and sex are always skippable per brief §4; breed is never used to infer behavior anywhere in the domain
 * layer (no `breedTraits` lookup exists on purpose).
 */
export const dogSchema = z
  .object({
    id: uuidSchema,
    owner: ownerRefSchema,
    name: z.string().min(1).max(60),
    birthdate: z.iso.date().nullable(),
    breed: z.string().max(100).nullable(),
    sex: dogSexSchema,
    photoUrl: z.url().nullable(),
    dailyTrainingMinutes: z
      .union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)])
      .nullable(),
  })
  .extend(timestampedSchema.shape);
export type Dog = z.infer<typeof dogSchema>;
