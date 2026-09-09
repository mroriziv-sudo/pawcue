import { z } from "zod";
import { timestampedSchema, uuidSchema, localeSchema } from "./shared";

/** A single translated string resource — see also `packages/i18n`, which is the runtime-facing mirror of this. */
export const localizationStringSchema = z
  .object({
    id: uuidSchema,
    key: z.string(),
    locale: localeSchema,
    value: z.string(),
  })
  .extend(timestampedSchema.shape);
export type LocalizationString = z.infer<typeof localizationStringSchema>;

/**
 * Version stamp for a bundle of lesson/troubleshooting content (brief §7, §11). Lets the app cache content
 * offline and know when a cached copy is stale without re-fetching everything.
 */
export const contentVersionSchema = z
  .object({
    id: uuidSchema,
    /** e.g. "lessons", "troubleshooting" — independent content domains can version independently. */
    domain: z.string(),
    version: z.string(),
    publishedAt: z.iso.datetime({ offset: true }),
  })
  .extend(timestampedSchema.shape);
export type ContentVersion = z.infer<typeof contentVersionSchema>;
