import type { SubscriptionStatus } from "../models/billing";

/**
 * The single authoritative answer to "can this user do X".
 *
 * Every premium decision in the app reads `isPremiumActive` from an `EntitlementView` produced here. There is no
 * second boolean, no screen-local `isPro`, and no store flag a purchase callback can flip directly — BILLING.md's
 * one rule is that `isPremiumActive` is never client-computed, and the only way to keep that true is to have one
 * function that computes the view and nothing else that can.
 *
 * What this file computes is *not* the entitlement. The entitlement is the server's `entitlements` row. This
 * decides how to present what the server said, including the two cases the server cannot answer for itself: we
 * have not asked yet, and we could not reach it.
 */

export type EntitlementStatus =
  /** No answer has ever been obtained. Not premium — absence of an answer is never a grant. */
  | "unknown"
  /** The server answered: this user has no active subscription. */
  | "free"
  /** The server answered: premium is active (including trial, grace period and billing retry). */
  | "premium"
  /** Premium existed and has ended, by the server's own `source`/`expiresAt`. */
  | "expired"
  /** Premium is being honoured from the last verified answer while the server is unreachable. */
  | "offline_cached"
  /** We could not verify, and nothing cached may be honoured. Not premium. */
  | "billing_unavailable";

/** The fields of the server's `entitlements` row that the client is allowed to act on. */
export interface VerifiedEntitlement {
  isPremiumActive: boolean;
  source: SubscriptionStatus | null;
  expiresAt: string | null;
}

/**
 * A server answer plus when it was obtained.
 *
 * `verifiedAt` is set by the client when the read succeeds, not by the server: it records when *this device* last
 * heard the truth, which is the only thing the offline policy can reason about.
 */
export interface EntitlementSnapshot extends VerifiedEntitlement {
  /** ISO timestamp of the successful read. */
  verifiedAt: string;
}

export interface EntitlementView {
  status: EntitlementStatus;
  /** The only field a gate is allowed to read. */
  isPremiumActive: boolean;
  source: SubscriptionStatus | null;
  expiresAt: string | null;
  /** When the server last confirmed this, or null if it never has. */
  verifiedAt: string | null;
  /** True when premium is being honoured without a fresh confirmation. */
  fromCache: boolean;
}

/**
 * How long a verified premium answer may be honoured without reconfirmation.
 *
 * This is an implementation default, not a value found in the billing contracts — BILLING.md defines the
 * verification path but no revalidation interval. Seven days is chosen to sit well inside the shortest billing
 * period the product sells (monthly), so an offline device can never ride a cached answer through a full period
 * it did not pay for, while a week of flaky connectivity does not cost a paying user their subscription.
 *
 * `expiresAt` always wins over this window: a cached answer is bounded by both.
 */
export const ENTITLEMENT_OFFLINE_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses that mean premium is over, as opposed to never having existed. */
const ENDED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "expired",
  "cancelled",
  "refunded",
  "revoked",
]);

export interface EntitlementInputs {
  /** The server's answer, when one was obtained. */
  verified: EntitlementSnapshot | null;
  /** The last answer the server gave, read from local storage. */
  cached: EntitlementSnapshot | null;
  /** True once a verification attempt has finished without producing an answer. */
  verificationFailed: boolean;
  /** ISO timestamp. Injected so the policy is testable without faking clocks. */
  now: string;
  graceDays?: number;
}

const NOT_PREMIUM = {
  isPremiumActive: false,
  source: null,
  expiresAt: null,
  verifiedAt: null,
  fromCache: false,
} as const;

/**
 * Turns what we know into what the UI may act on.
 *
 * Order is the whole policy: a fresh answer outranks a cached one, a cached one outranks silence, and silence
 * never grants anything.
 */
export function resolveEntitlement(inputs: EntitlementInputs): EntitlementView {
  const { verified, cached, verificationFailed, now } = inputs;
  const graceDays = inputs.graceDays ?? ENTITLEMENT_OFFLINE_GRACE_DAYS;

  if (verified) return fromVerified(verified, now);

  // A cached *free* answer grants nothing, so honouring it would only mean claiming certainty we do not have.
  // It falls through to the unresolved branch, where the UI can honestly offer a retry.
  if (cached?.isPremiumActive) {
    return fromCache(cached, now, graceDays);
  }

  return {
    ...NOT_PREMIUM,
    status: verificationFailed ? "billing_unavailable" : "unknown",
  };
}

function fromVerified(
  snapshot: EntitlementSnapshot,
  now: string,
): EntitlementView {
  const base = {
    source: snapshot.source,
    expiresAt: snapshot.expiresAt,
    verifiedAt: snapshot.verifiedAt,
    fromCache: false,
  };

  /**
   * Expiry binds even the server's own answer.
   *
   * `is_premium_active` is recomputed by the webhook handler, so a row can say `true` while its `expires_at` has
   * since passed and no renewal notification has arrived yet. Trusting the flag over the date would hand out
   * premium on the strength of a notification that never came.
   */
  if (snapshot.isPremiumActive && !hasExpired(snapshot.expiresAt, now)) {
    return { ...base, status: "premium", isPremiumActive: true };
  }

  const ended =
    snapshot.isPremiumActive ||
    (snapshot.source !== null && ENDED_STATUSES.has(snapshot.source));

  return {
    ...base,
    status: ended ? "expired" : "free",
    isPremiumActive: false,
  };
}

function fromCache(
  snapshot: EntitlementSnapshot,
  now: string,
  graceDays: number,
): EntitlementView {
  const base = {
    source: snapshot.source,
    expiresAt: snapshot.expiresAt,
    verifiedAt: snapshot.verifiedAt,
    fromCache: true,
  };

  // The subscription's own end date is not something connectivity can extend.
  if (hasExpired(snapshot.expiresAt, now)) {
    return { ...base, status: "expired", isPremiumActive: false };
  }

  const age = Date.parse(now) - Date.parse(snapshot.verifiedAt);
  if (!Number.isFinite(age) || age > graceDays * DAY_MS) {
    // Past the window the cache stops being evidence. Refusing here is what stops an offline device holding
    // premium forever on the strength of one old read.
    return { ...base, status: "billing_unavailable", isPremiumActive: false };
  }

  return { ...base, status: "offline_cached", isPremiumActive: true };
}

function hasExpired(expiresAt: string | null, now: string): boolean {
  if (!expiresAt) return false;
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return false;
  return Date.parse(now) > end;
}

/** The view before anything has been read. Exported so every store starts from the same place. */
export const UNKNOWN_ENTITLEMENT: EntitlementView = {
  ...NOT_PREMIUM,
  status: "unknown",
};
