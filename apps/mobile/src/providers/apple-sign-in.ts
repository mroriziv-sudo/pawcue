import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";

/**
 * The native half of Sign in with Apple, isolated so the auth provider stays testable.
 *
 * This is the only file that imports `expo-apple-authentication` or `expo-crypto`. It produces exactly one
 * thing the rest of the app needs: an Apple identity token bound to a nonce the app generated, ready for
 * Supabase to verify. It never produces a Supabase session, never touches storage, and never decides what
 * happens to the guest's data — those belong to `SupabaseAuthProvider` and the account screen.
 *
 * ## Nonce
 *
 * Apple signs whatever nonce is placed in the request into the identity token. The app generates a random
 * value, hands Apple its SHA-256 (Apple's convention), and hands Supabase the *raw* value; Supabase hashes it
 * and compares it with the token's claim. A token replayed from another request — or minted for another app's
 * request — fails that comparison. `skip_nonce_check` stays `false` in `supabase/config.toml` for this reason.
 *
 * ## Scopes
 *
 * `EMAIL` only. The product never displays the user's name anywhere — it is about the dog — so asking for
 * `FULL_NAME` would collect a field nothing reads (PRIVACY.md, DATA_MAP.md). Apple supplies the email only on
 * the first authorisation for this app; that is the one Supabase stores. It may be a private-relay address,
 * which the server flags in `profiles.is_private_relay_email` and the app treats identically.
 */

export class AppleSignInUnavailableError extends Error {
  constructor() {
    super("Sign in with Apple is not available on this device.");
    this.name = "AppleSignInUnavailableError";
  }
}

export class AppleSignInCancelledError extends Error {
  constructor() {
    super("Sign in with Apple was cancelled.");
    this.name = "AppleSignInCancelledError";
  }
}

export interface AppleIdentity {
  /** Apple's identity token (a JWT), carrying the hashed nonce. Verified by Supabase, never decoded here. */
  identityToken: string;
  /** The raw nonce whose SHA-256 is inside the token. Sent to Supabase; never to Apple. */
  rawNonce: string;
}

/**
 * `expo-crypto` is loaded on first use rather than at import.
 *
 * Its JS entry calls `requireNativeModule`, which throws when the native module is absent — as it is in any
 * development client built before this phase. This file is imported at bootstrap through the auth provider, so
 * an eager import would turn a stale development client into a crash on launch. A store build always carries
 * the module; the laziness costs nothing there.
 */
function crypto(): typeof import("expo-crypto") {
  // A call-time `require` is what defers the native lookup; a static import would run it at bootstrap.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-crypto") as typeof import("expo-crypto");
}

/** True where the native module exists and the OS can present Apple's sheet. iOS only, by Apple's design. */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** 32 random bytes as hex: 256 bits of entropy from the platform's CSPRNG. */
export async function generateNonce(): Promise<string> {
  const Crypto = crypto();
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashNonce(rawNonce: string): Promise<string> {
  const Crypto = crypto();
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );
}

function isCancellation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ERR_REQUEST_CANCELED"
  );
}

/**
 * Presents Apple's sheet and returns the identity token with the nonce it was bound to.
 *
 * Cancellation is its own error type so the screen can return to idle without reporting a failure — the user
 * did nothing wrong. Anything else is rethrown as-is; the provider maps it.
 */
export async function requestAppleIdentity(): Promise<AppleIdentity> {
  if (!(await appleSignInAvailable())) throw new AppleSignInUnavailableError();

  const rawNonce = await generateNonce();
  const hashedNonce = await hashNonce(rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (isCancellation(error)) throw new AppleSignInCancelledError();
    throw error;
  }

  if (!credential.identityToken) {
    throw new Error("Apple returned no identity token.");
  }

  return { identityToken: credential.identityToken, rawNonce };
}

/**
 * Subscribes to Apple revoking this app's credential (Settings → Apple ID → Sign in with Apple → stop using).
 *
 * Apple's guidance is that an app signs the user out when this fires. The listener is a no-op where the native
 * module is absent. Returns an unsubscribe function.
 */
export function onAppleCredentialRevoked(listener: () => void): () => void {
  if (Platform.OS !== "ios") return () => undefined;
  try {
    const subscription = AppleAuthentication.addRevokeListener(listener);
    return () => subscription?.remove?.();
  } catch {
    return () => undefined;
  }
}
