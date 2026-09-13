import type {
  AuthProvider,
  AuthSession,
  GuestMergeConflict,
} from "@pawcue/domain";
import { supabase, requireSupabase } from "../lib/supabase";
import { env } from "../lib/env";
import {
  AppleSignInCancelledError,
  AppleSignInUnavailableError,
  requestAppleIdentity,
} from "./apple-sign-in";

/**
 * Concrete `AuthProvider` (the interface frozen in Phase 0). Screens depend on the interface, never on
 * `@supabase/supabase-js` directly — ARCHITECTURE.md §4.
 *
 * Anonymous sign-in is what makes the app usable with no account, which is the product's first non-negotiable
 * principle. The guest merge is implemented here against the deployed `auth-merge-guest` endpoint.
 *
 * Sign in with Apple is implemented against Supabase's native ID-token flow (`apple-sign-in.ts` produces the
 * token; this class exchanges it for a session). It still cannot succeed in a build whose App ID lacks the Sign
 * in with Apple capability, or on a Supabase project whose Apple provider is not enabled — both are external
 * configuration — and in that case it fails with a typed error rather than a plausible-looking stub. Google
 * remains unconfigured for the same reason. Returning a fake success would make the merge path look tested when
 * it never ran.
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

  /**
   * Drops the session on this device only.
   *
   * `scope: "local"` — the server-side sign-out endpoint is deliberately not called. For an identity that no
   * longer exists (after deletion) the call can only fail, and for one that does, revoking every other device's
   * refresh token is not what "sign out of this phone" means. Local state beyond the token is the caller's to
   * clear; this method knows nothing about dogs or sessions.
   */
  async signOut(): Promise<void> {
    await supabase?.auth.signOut({ scope: "local" });
  }

  /**
   * Sign in with Apple, natively.
   *
   * The nonce-bound identity token comes from `requestAppleIdentity`; Supabase verifies Apple's signature and the
   * nonce and returns its own session, which replaces the stored one. That replacement is why the account screen
   * captures the guest token *before* calling this.
   *
   * Errors are typed for the screen: cancelled (return to idle, say nothing), unavailable or unconfigured (say
   * so), anything else (report a failure). Supabase's own text for a disabled provider is recognised so that an
   * unconfigured dashboard reads as "not available in this build" rather than as a mysterious failure.
   */
  async signInWithApple(): Promise<AuthSession> {
    const client = requireSupabase();

    let identity;
    try {
      identity = await requestAppleIdentity();
    } catch (error) {
      if (error instanceof AppleSignInUnavailableError) {
        throw new ProviderNotConfiguredError("apple");
      }
      throw error;
    }

    const { data, error } = await client.auth.signInWithIdToken({
      provider: "apple",
      token: identity.identityToken,
      nonce: identity.rawNonce,
    });

    if (error || !data.session) {
      if (error && isProviderDisabled(error.message)) {
        throw new ProviderNotConfiguredError("apple");
      }
      throw new SignInFailedError(
        "apple",
        error?.message ?? "no session returned",
      );
    }
    return toAuthSession(data.session, "apple");
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

  /**
   * Calls the `account-delete` endpoint for the current identity.
   *
   * The body carries the literal confirmation and **no identity**: the server deletes the verified token's
   * subject and refuses a body that names anyone. Resolving means the server confirmed the profile is gone.
   *
   * One rejection is re-read rather than reported: a `401` after a previous attempt whose response was lost.
   * If Supabase Auth itself no longer recognises the token's subject, the deletion happened, and saying so is
   * the truth. A `401` for a token whose user still exists stays an error.
   */
  async deleteAccount(): Promise<void> {
    const client = requireSupabase();
    const { data } = await client.auth.getSession();
    const callerToken = data.session?.access_token;
    if (!callerToken) {
      throw new AccountDeletionError("no_session");
    }

    const response = await fetch(
      `${env.supabaseUrl}/functions/v1/account-delete`,
      {
        method: "POST",
        headers: {
          apikey: env.supabaseAnonKey ?? "",
          Authorization: `Bearer ${callerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: "delete" }),
      },
    );

    if (response.ok) return;

    if (response.status === 401) {
      const { error } = await client.auth.getUser(callerToken);
      if (error && identityIsGone(error.status)) return;
    }

    throw new AccountDeletionError(
      response.status === 502 ? "provider_unavailable" : "failed",
      response.status,
    );
  }
}

/** Supabase Auth answers 401/403 for a token whose subject no longer exists. */
function identityIsGone(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

/** GoTrue's wording when a provider is switched off in the dashboard. Matched loosely; the fallback is a plain failure. */
function isProviderDisabled(message: string): boolean {
  return /provider.*(not enabled|disabled|unsupported)/i.test(message);
}

/** A sign-in that reached the provider and failed there — not cancellation, not missing configuration. */
export class SignInFailedError extends Error {
  constructor(
    readonly provider: "apple" | "google",
    detail: string,
  ) {
    super(`Sign in with ${provider} failed: ${detail}`);
    this.name = "SignInFailedError";
  }
}

export type AccountDeletionFailure =
  "no_session" | "provider_unavailable" | "failed";

/** The server did not confirm the deletion. Local state must be left exactly as it was. */
export class AccountDeletionError extends Error {
  constructor(
    readonly reason: AccountDeletionFailure,
    readonly status?: number,
  ) {
    super(`Account deletion failed: ${reason}`);
    this.name = "AccountDeletionError";
  }
}

export { AppleSignInCancelledError };

/** Thrown when a provider exists in the contract but its external configuration is absent. */
export class ProviderNotConfiguredError extends Error {
  constructor(readonly provider: "apple" | "google") {
    super(`Sign in with ${provider} is not configured for this build.`);
    this.name = "ProviderNotConfiguredError";
  }
}

export const authProvider = new SupabaseAuthProvider();
