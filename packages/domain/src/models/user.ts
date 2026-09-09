import { z } from "zod";
import { timestampedSchema, uuidSchema, localeSchema } from "./shared";

/**
 * Mirrors `profiles` (1:1 with `auth.users`). Deliberately thin — auth identity itself lives in Supabase Auth, not
 * duplicated here.
 */
export const userSchema = z
  .object({
    id: uuidSchema,
    email: z.email().nullable(),
    /** True when email came from Apple's private relay — informs support/communication copy, not a security gate. */
    isPrivateRelayEmail: z.boolean(),
    displayName: z.string().max(100).nullable(),
    preferredLocale: localeSchema,
    hasCompletedOnboarding: z.boolean(),
  })
  .extend(timestampedSchema.shape);
export type User = z.infer<typeof userSchema>;

/**
 * A device-local guest identity (brief §4, §12). Backed by a real Supabase anonymous-auth `auth.uid()` so RLS can
 * treat it uniformly with an authenticated user (see DATABASE.md §RLS) — this row tracks the *product* metadata
 * around that identity, not the auth credential itself.
 */
export const anonymousSessionSchema = z
  .object({
    id: uuidSchema,
    /** Set once `merge_guest_session` has re-parented this session's data to a real user; merge becomes a no-op after. */
    mergedIntoUserId: uuidSchema.nullable(),
    mergedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .extend(timestampedSchema.shape);
export type AnonymousSession = z.infer<typeof anonymousSessionSchema>;
