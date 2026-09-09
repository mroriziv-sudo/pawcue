import { z } from "zod";
import { timestampedSchema, uuidSchema, localeSchema } from "./shared";

/**
 * A single translated string resource.
 *
 * Deliberately NOT a database table in v1: translations ship as reviewed JSON resources in `packages/i18n` so a
 * string change is a code review with a diff, not a silent production row edit — and so the app can render fully
 * offline (brief §28). This type describes that file-backed shape and exists for tooling that reads/validates the
 * resources. Revisit only if translations ever need to change without an app release; that would mean adding a
 * `localization_strings` table and a cache-invalidation story via `content_versions`.
 */
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
