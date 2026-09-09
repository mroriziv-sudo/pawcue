import { z } from "zod";

/** Every persisted row's identity type. Always a UUID, never an incrementing int (brief §8). */
export const uuidSchema = z.uuid();
export type Uuid = z.infer<typeof uuidSchema>;

/** All timestamps are UTC ISO-8601 strings on the wire; the brief mandates UTC storage (brief §8, §11). */
export const utcTimestampSchema = z.iso.datetime({ offset: true });
export type UtcTimestamp = z.infer<typeof utcTimestampSchema>;

/** Standard row bookkeeping columns shared by every table. */
export const timestampedSchema = z.object({
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
});

export const localeSchema = z.enum(["en-US", "he-IL"]);
export type Locale = z.infer<typeof localeSchema>;

/**
 * Locales beyond launch (§25) are translation-ready resources, not shippable UI locales, until reviewed —
 * kept as a separate union so `localeSchema` (what a user can actually select) can't accidentally include one.
 */
export const translationReadyLocaleSchema = z.enum([
  "es",
  "pt-BR",
  "fr",
  "de",
  "it",
  "ja",
  "ko",
  "zh-Hans",
  "ar",
  "hi",
]);

/**
 * A row exists as either guest-owned (anonymous session) or user-owned (authenticated), never neither, and — while
 * a merge is in flight — briefly both is not a valid state either (merge is transactional, see DATABASE.md).
 */
export const ownerRefSchema = z.union([
  z.object({ kind: z.literal("user"), userId: uuidSchema }),
  z.object({ kind: z.literal("anonymousSession"), sessionId: uuidSchema }),
]);
export type OwnerRef = z.infer<typeof ownerRefSchema>;

/** AI/coach safety escalation levels (brief §10). Every troubleshooting/coach output must carry one. */
export const safetyCategorySchema = z.enum([
  "NORMAL",
  "PROFESSIONAL_TRAINER_RECOMMENDED",
  "VET_RECOMMENDED",
  "URGENT_SAFETY",
]);
export type SafetyCategory = z.infer<typeof safetyCategorySchema>;

export const ageBucketSchema = z.enum([
  "puppy_8_16_weeks",
  "puppy_4_6_months",
  "adolescent_6_18_months",
  "adult_18_months_plus",
]);
export type AgeBucket = z.infer<typeof ageBucketSchema>;

export const dailyMinutesSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(20),
]);
export type DailyMinutes = z.infer<typeof dailyMinutesSchema>;
