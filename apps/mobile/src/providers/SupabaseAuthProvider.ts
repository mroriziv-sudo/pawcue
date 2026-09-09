import type {
  AuthProvider,
  AuthSession,
  GuestMergeConflict,
} from "@pawcue/domain";
import { supabase, requireSupabase } from "../lib/supabase";

/**
 * Concrete `AuthProvider` (the interface frozen in Phase 0). Screens depend on the interface, never on
 * `@supabase/supabase-js` directly — ARCHITECTURE.md §4.
 *
 * Phase 2 scope is the **guest** path only: anonymous sign-in is what makes the app usable with no account, which
 * is the product's first non-negotiable principle. Apple and Google sign-in are Phase 7 and deliberately throw
 * rather than return a plausible-looking stub, so a caller can't mistake them for working.
 */

function toAuthSession(
  session: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    user: { id: string };
  },
  identityKind: AuthSession["identityKind"],
): AuthSession {
  return {
    userId: session.user.id,
    identityKind,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: new Date((session.expires_at ?? 0) * 1000).toISOString(),
  };
}

export class SupabaseAuthProvider implements AuthProvider {
  /**
   * Resumes an existing session if there is one, so a returning guest keeps their identity — and with it their
   * dogs and training history — instead of silently becoming a new anonymous user on every launch.
   */
  async ensureAnonymousSession(): Promise<AuthSession> {
    const client = requireSupabase();

    const { data: existing } = await client.auth.getSession();
    if (existing.session) {
      return toAuthSession(
        existing.session,
        existing.session.user.is_anonymous ? "anonymous" : "apple",
      );
    }

    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.session) {
      throw new Error(
        `Anonymous sign-in failed: ${error?.message ?? "no session returned"}`,
      );
    }
    return toAuthSession(data.session, "anonymous");
  }

  async refreshSession(): Promise<AuthSession> {
    const client = requireSupabase();
    const { data, error } = await client.auth.refreshSession();
    if (error || !data.session) {
      throw new Error(
        `Session refresh failed: ${error?.message ?? "no session returned"}`,
      );
    }
    return toAuthSession(
      data.session,
      data.session.user.is_anonymous ? "anonymous" : "apple",
    );
  }

  async signOut(): Promise<void> {
    await supabase?.auth.signOut();
  }

  signInWithApple(): Promise<AuthSession> {
    throw new Error(
      "Sign in with Apple is implemented in Phase 7 (see AUTH.md).",
    );
  }

  signInWithGoogle(): Promise<AuthSession> {
    throw new Error(
      "Sign in with Google is implemented in Phase 7 (see AUTH.md).",
    );
  }

  /**
   * Phase 7. Left unimplemented on purpose: the merge is only safe when the endpoint verifies BOTH the caller's
   * authenticated JWT and the guest's anonymous-session JWT (supabase/functions/README.md). A client-side stub here
   * would be the exact shape of the privilege-escalation bug found in Phase 0.
   */
  mergeGuestSession(): Promise<{ merged: true } | GuestMergeConflict> {
    throw new Error(
      "Guest merge is implemented in Phase 7 — see supabase/functions/README.md for its security contract.",
    );
  }

  resolveGuestMergeConflict(): Promise<{ merged: true }> {
    throw new Error(
      "Guest merge conflict resolution is implemented in Phase 7.",
    );
  }
}

export const authProvider = new SupabaseAuthProvider();
