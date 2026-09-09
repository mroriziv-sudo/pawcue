import { z } from "zod";
import { timestampedSchema, uuidSchema } from "./shared";

export const trainingSessionStatusSchema = z.enum([
  "in_progress",
  "completed",
  "abandoned",
]);

/** One attempt at a lesson (brief §6). A dog can have multiple sessions against the same lesson over time. */
export const trainingSessionSchema = z
  .object({
    id: uuidSchema,
    dogId: uuidSchema,
    lessonId: uuidSchema,
    planActivityId: uuidSchema.nullable(),
    status: trainingSessionStatusSchema,
    startedAt: z.iso.datetime({ offset: true }),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .extend(timestampedSchema.shape);
export type TrainingSession = z.infer<typeof trainingSessionSchema>;

/**
 * Append-only event log within a session — the mechanism that makes offline sync safe (ARCHITECTURE.md §8):
 * events are idempotent by client-generated `id`, so a queued-and-replayed event can never double-count.
 */
export const sessionEventTypeSchema = z.enum([
  "step_advanced",
  "clicker_pressed",
  "troubleshooting_opened",
  "troubleshooting_resolved",
  "repetition_logged",
  "session_completed",
  "session_abandoned",
]);
export type SessionEventType = z.infer<typeof sessionEventTypeSchema>;

export const sessionEventSchema = z
  .object({
    /** Client-generated UUID — the idempotency key for offline replay. */
    id: uuidSchema,
    sessionId: uuidSchema,
    type: sessionEventTypeSchema,
    lessonStepId: uuidSchema.nullable(),
    troubleshootingOptionId: uuidSchema.nullable(),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .extend(timestampedSchema.shape);
export type SessionEvent = z.infer<typeof sessionEventSchema>;
