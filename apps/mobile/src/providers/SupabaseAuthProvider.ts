import type {
  AuthProvider,
  AuthSession,
  GuestMergeConflict,
} from "@pawcue/domain";
import { supabase, requireSupabase } from "../lib/supabase";
import { env } from "../lib/env";

/**
 * Concrete `AuthProvider` (the interface frozen in Phase 0). Screens depend on the interface, never on
 * `@supabase/supabase-js` directly — ARCHITECTURE.md §4.
 *
 * Anonymous sign-in is what makes the app usable with no account, which is the product's first non-negotiable
 * principle. The guest merge is implemented here against the deployed `auth-merge-guest` endpoint.
 *
 * Apple and Google still throw a typed, explicit error rather than returning a plausible-looking stub: both
 * require external configuration this project does not yet have (an Apple Developer account and its Sign in with
 * Apple capability; Google OAuth client ids and the Supabase provider entries). Returning a fake success would be
 * far worse than failing loudly — it would make the merge path look tested when it never ran.
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
    throw new ProviderNotConfiguredError("apple");
  }

  signInWithGoogle(): Promise<AuthSession> {
    throw new ProviderNotConfiguredError("google");
  }

  /**
   * Calls the `auth-merge-guest` endpoint.
   *
   * The client sends two tokens and **no identity at all**: the merge target comes from the caller's verified JWT
   * and the source from the guest's, both checked server-side. That is deliberate — a client-side merge, or an
   * endpoint that trusted an id in the body, is the exact shape of the privilege-escalation bug found in Phase 0,
   * where a victim's dog was successfully stolen.
   *
   * The guest token must be captured **before** signing in, because signing in replaces the stored session.
   */
  async mergeGuestSession(
    anonymousSessionId: string,
    guestAccessToken?: string,
  ): Promise<{ merged: true } | GuestMergeConflict> {
    const client = requireSupabase();
    const { data } = await client.auth.getSession();
    const callerToken = data.session?.access_token;
    if (!callerToken) {
      throw new Error("Cannot merge: no authenticated session.");
    }
    if (!guestAccessToken) {
      // Failing here rather than sending a request that can only be rejected keeps the reason legible.
      throw new Error(
        "Cannot merge: the guest session token was not captured before sign-in.",
      );
    }

    const response = await fetch(
      `${env.supabaseUrl}/functions/v1/auth-merge-guest`,
      {
        method: "POST",
        headers: {
          apikey: env.supabaseAnonKey ?? "",
          Authorization: `Bearer ${callerToken}`,
          "X-Guest-Authorization": `Bearer ${guestAccessToken}`,
          "Content-Type": "application/json",
        },
        // The id is sent only so the server can cross-check it against the guest token and refuse a mismatch. It is
        // never what the merge acts on.
        body: JSON.stringify({ anonymousSessionId }),
      },
    );

    if (response.status === 409) {
      const conflict = (await response.json()) as GuestMergeConflict;
      return conflict;
    }
    if (!response.ok) {
      throw new Error(`Guest merge failed (${response.status}).`);
    }
    return { merged: true };
  }

  /**
   * Conflict resolution is not implemented, and deliberately not faked.
   *
   * "Keep guest" or "keep account" means discarding one side's dogs and training history. That is a destructive
   * operation which needs its own server-side transaction and its own security tests; guessing at it here would
   * risk deleting real training data. The conflict itself is surfaced to the user (409), which is the part that
   * matters for safety — an existing-account merge is never silently resolved.
   */
  resolveGuestMergeConflict(): Promise<{ merged: true }> {
    throw new Error(
      "Guest merge conflict resolution is not implemented — see supabase/functions/README.md rule 7.",
    );
  }
}

/** Thrown when a provider exists in the contract but its external configuration is absent. */
export class ProviderNotConfiguredError extends Error {
  constructor(readonly provider: "apple" | "google") {
    super(`Sign in with ${provider} is not configured for this build.`);
    this.name = "ProviderNotConfiguredError";
  }
}

export const authProvider = new SupabaseAuthProvider();
