import type { Uuid } from "../models/shared";

export type AuthIdentityKind = "apple" | "google" | "anonymous";

export interface AuthSession {
  userId: Uuid;
  identityKind: AuthIdentityKind;
  /** Never a raw provider token — always Supabase's own session access/refresh token pair. */
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface GuestMergeConflict {
  code: "GUEST_MERGE_CONFLICT";
  guestSummary: { dogCount: number; sessionsCompleted: number };
  accountSummary: { dogCount: number; sessionsCompleted: number };
}

/**
 * Concrete implementation: Supabase Auth (Apple/Google/anonymous providers). Screens depend on this interface only
 * — see ARCHITECTURE.md §4. All methods are async and may fail with a typed error, never throw a raw SDK error.
 */
export interface AuthProvider {
  signInWithApple(): Promise<AuthSession>;
  signInWithGoogle(): Promise<AuthSession>;
  ensureAnonymousSession(): Promise<AuthSession>;
  signOut(): Promise<void>;
  refreshSession(): Promise<AuthSession>;
  /** Idempotent — safe to call more than once for the same anonymous session (see DATABASE.md `merge_guest_session`). */
  mergeGuestSession(
    anonymousSessionId: Uuid,
  ): Promise<{ merged: true } | GuestMergeConflict>;
  /** Caller-chosen resolution after a GuestMergeConflict is shown to the user. */
  resolveGuestMergeConflict(
    anonymousSessionId: Uuid,
    keep: "guest" | "account",
  ): Promise<{ merged: true }>;
}
