import { authProvider } from "../providers/SupabaseAuthProvider";
import { onAppleCredentialRevoked } from "../providers/apple-sign-in";
import { resetRevenueCatIdentity } from "../billing/revenuecat-adapter";
import { useBootstrapStore } from "./bootstrap-store";
import { useDogStore } from "./dog-store";
import { useEntitlementStore } from "./entitlement-store";
import { useOnboardingStore } from "./onboarding-store";
import { usePlanStore } from "./plan-store";
import { useSessionStore } from "./session-store";
import { useTrainingLogStore } from "./training-log-store";

/**
 * The two ways an identity leaves this device: sign-out and account deletion.
 *
 * Both end in the same place — a device that remembers nothing about the previous identity and is ready to start
 * again as a fresh guest — and differ only in what happens on the server first. They share one local reset so the
 * list of things to forget lives in exactly one place. Adding a store that holds identity-scoped data means
 * adding it here; nowhere else has to know.
 *
 * ## What is forgotten
 *
 * The session token (secure tier), the cached dog id, the onboarding draft and "skipped" choice, the in-progress
 * session, the local training log, the cached entitlement, the in-memory plan, and RevenueCat's notion of who it
 * speaks for.
 *
 * ## What is kept
 *
 * Language, sound and haptics. They are device preferences, not identity data: a Hebrew speaker who deletes
 * their account should not be handed an English app, and nothing in them identifies anyone.
 *
 * ## Ordering, for deletion
 *
 * `authProvider.deleteAccount()` resolves only after the server confirmed the profile is gone. Nothing local is
 * touched before that. A failure leaves every store, every cache and the session exactly as they were, so the
 * screen can say so and offer a retry — a UI that cleared local state on the strength of having *asked* would
 * strand a user whose account still exists with an app that has forgotten them.
 */

/** Clears everything identity-scoped on this device. Idempotent; safe to call on a device with nothing to clear. */
export async function forgetLocalIdentity(): Promise<void> {
  useBootstrapStore.getState().forgetSession();

  // Store billing first: `logOut` needs the SDK's current identity, and nothing below depends on it.
  try {
    await resetRevenueCatIdentity();
  } catch {
    /* The SDK's cache is replaced on the next configure anyway; a failed logOut is not a reason to stop. */
  }

  await Promise.all([
    useEntitlementStore.getState().clear(),
    useDogStore.getState().clear(),
    useOnboardingStore.getState().forget(),
    useSessionStore.getState().clear(),
    useTrainingLogStore.getState().clear(),
  ]);
  usePlanStore.getState().clear();

  // Last: the token. Everything above may still have wanted an authenticated client.
  await authProvider.signOut();
}

/**
 * Deletes the current identity server-side, then forgets it locally.
 *
 * Rejects — with local state untouched — when the server did not confirm. The caller decides what to show;
 * this function never pretends.
 */
export async function deleteAccountAndForget(): Promise<void> {
  await authProvider.deleteAccount();
  await forgetLocalIdentity();
}

/** Signs out of this device and forgets the identity locally. Server-side data is untouched. */
export async function signOutAndForget(): Promise<void> {
  await forgetLocalIdentity();
}

/**
 * Starts the app again from local storage — which, after `forgetLocalIdentity`, holds only device preferences.
 *
 * `bootstrap()` re-hydrates every store, creates a fresh anonymous identity, configures store billing for it and
 * routes to onboarding. The root layout shows its splash while `status` is `hydrating`, which unmounts whatever
 * screen called this; that is the intended "the app starts over" experience, not a side effect to work around.
 */
export async function restartAsGuest(): Promise<void> {
  await useBootstrapStore.getState().bootstrap();
}

/**
 * Signs out of this device when Apple reports the credential revoked.
 *
 * A user who removes PawCue from "Sign in with Apple" in their Apple ID settings expects to be signed out; Apple's
 * guidelines say as much. Only an authenticated session is affected — a guest has no Apple credential to revoke.
 * Server-side data is untouched (this is sign-out, not deletion). Returns an unsubscribe function.
 */
export function installAppleRevocationHandler(): () => void {
  return onAppleCredentialRevoked(() => {
    if (useBootstrapStore.getState().sessionStatus !== "authenticated") return;
    void signOutAndForget()
      .then(() => restartAsGuest())
      .catch(() => undefined);
  });
}

/**
 * Development-only bridge, same shape and reason as `installSessionDevBridge`: tap automation is unavailable in
 * the simulator harness, so the real deletion round-trip (server, local reset, restart) can be driven and
 * screenshotted. The screen's buttons are exercised by the React Native Testing Library tests. A no-op in release.
 */
export function installAccountDevBridge(): void {
  if (!__DEV__) return;
  (globalThis as typeof globalThis & { __accountDev?: unknown }).__accountDev =
    {
      deleteAccountAndForget,
      signOutAndForget,
      restartAsGuest,
      forgetLocalIdentity,
    };
}
