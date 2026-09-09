import { z } from "zod";
import { timestampedSchema, uuidSchema } from "./shared";

/**
 * Rolled-up, server-computed stats (brief §5 PROGRESS screen). Always derived from `session_events` server-side —
 * never trusted from a client write, so a client bug or offline replay quirk can't corrupt the displayed streak.
 */
export const progressSchema = z
  .object({
    id: uuidSchema,
    dogId: uuidSchema,
    sessionsCompleted: z.number().int().min(0),
    trainingMinutesTotal: z.number().int().min(0),
    skillsMasteredCount: z.number().int().min(0),
    skillsInProgressCount: z.number().int().min(0),
    lastRecalculatedAt: z.iso.datetime({ offset: true }),
  })
  .extend(timestampedSchema.shape);
export type Progress = z.infer<typeof progressSchema>;

export const streakSchema = z
  .object({
    id: uuidSchema,
    dogId: uuidSchema,
    currentStreakDays: z.number().int().min(0),
    longestStreakDays: z.number().int().min(0),
    lastTrainedDate: z.iso.date().nullable(),
  })
  .extend(timestampedSchema.shape);
export type Streak = z.infer<typeof streakSchema>;

export const reminderStatusSchema = z.enum([
  "scheduled",
  "delivered",
  "cancelled",
]);

/** A single local-notification reminder (brief §5 "one training reminder" free tier, §18 opt-in flow). */
export const reminderSchema = z
  .object({
    id: uuidSchema,
    dogId: uuidSchema,
    scheduledFor: z.iso.datetime({ offset: true }),
    status: reminderStatusSchema,
  })
  .extend(timestampedSchema.shape);
export type Reminder = z.infer<typeof reminderSchema>;

/** Per-user opt-in state — the OS permission is requested only after this flips true (brief §18). */
export const notificationPreferenceSchema = z
  .object({
    id: uuidSchema,
    userId: uuidSchema,
    trainingRemindersEnabled: z.boolean(),
    osPermissionGranted: z.boolean().nullable(),
  })
  .extend(timestampedSchema.shape);
export type NotificationPreference = z.infer<
  typeof notificationPreferenceSchema
>;
