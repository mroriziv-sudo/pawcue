import { z } from "zod";
import { uuidSchema, ownerRefSchema } from "./shared";

/** First-party product events only (brief §29) — closed enum, not a free-text event name. */
export const appEventNameSchema = z.enum([
  "app_opened",
  "clicker_pressed",
  "first_lesson_started",
  "first_lesson_completed",
  "plan_started",
  "plan_generated",
  "day1_started",
  "day1_completed",
  "paywall_viewed",
  "trial_started",
  "purchase_completed",
  "lesson_started",
  "lesson_completed",
  "troubleshooting_opened",
  "reminder_enabled",
]);
export type AppEventName = z.infer<typeof appEventNameSchema>;

/**
 * `properties` is a small, closed set of primitive values (ids, enums, numbers) — never free-text user content
 * (brief §29: "Do not log free-text user content"). `actor` uses a pseudonymous ref, not raw PII.
 */
export const appEventSchema = z.object({
  id: uuidSchema,
  name: appEventNameSchema,
  actor: ownerRefSchema,
  properties: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  /** When the event happened on the device — which, for a queued offline event, is well before the server saw it. */
  occurredAt: z.iso.datetime({ offset: true }),
  /**
   * When the server recorded it. Distinct from `occurredAt` on purpose: the gap between the two is exactly the
   * offline-queue delay, which is worth being able to measure. `app_events` is append-only and so has no
   * `updated_at`.
   */
  createdAt: z.iso.datetime({ offset: true }),
});
export type AppEvent = z.infer<typeof appEventSchema>;
