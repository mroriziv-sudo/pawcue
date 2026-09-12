import { describe, it, expect } from "vitest";
import {
  ENTITLEMENT_OFFLINE_GRACE_DAYS,
  resolveEntitlement,
  UNKNOWN_ENTITLEMENT,
  type EntitlementSnapshot,
} from "./entitlement";

/**
 * The entitlement policy, stated as behaviour.
 *
 * Every test here answers one question a user would recognise: am I premium right now, and why. Nothing asserts on
 * how the view is assembled — what matters is that no combination of stale data, missing data or a server flag
 * that disagrees with its own expiry date can produce premium access that was not paid for, and that a paying
 * customer does not lose access to a flaky connection.
 */

const NOW = "2026-09-12T12:00:00.000Z";
const daysBefore = (days: number) =>
  new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
const daysAfter = (days: number) =>
  new Date(Date.parse(NOW) + days * 86_400_000).toISOString();

const premium = (
  over: Partial<EntitlementSnapshot> = {},
): EntitlementSnapshot => ({
  isPremiumActive: true,
  source: "active",
  expiresAt: daysAfter(20),
  verifiedAt: NOW,
  ...over,
});

const free = (
  over: Partial<EntitlementSnapshot> = {},
): EntitlementSnapshot => ({
  isPremiumActive: false,
  source: null,
  expiresAt: null,
  verifiedAt: NOW,
  ...over,
});

const resolve = (inputs: Partial<Parameters<typeof resolveEntitlement>[0]>) =>
  resolveEntitlement({
    verified: null,
    cached: null,
    verificationFailed: false,
    now: NOW,
    ...inputs,
  });

describe("nothing is known yet", () => {
  it("is unknown, and unknown is never premium", () => {
    const view = resolve({});
    expect(view.status).toBe("unknown");
    expect(view.isPremiumActive).toBe(false);
  });

  it("starts from the same view the stores use", () => {
    expect(resolve({})).toEqual(UNKNOWN_ENTITLEMENT);
  });

  it("reports billing as unavailable once an attempt has failed with nothing cached", () => {
    const view = resolve({ verificationFailed: true });
    expect(view.status).toBe("billing_unavailable");
    expect(view.isPremiumActive).toBe(false);
  });
});

describe("the server answered", () => {
  it("grants premium for an active subscription", () => {
    const view = resolve({ verified: premium() });
    expect(view.status).toBe("premium");
    expect(view.isPremiumActive).toBe(true);
    expect(view.fromCache).toBe(false);
  });

  it.each(["trialing", "grace_period", "billing_retry"] as const)(
    "grants premium while the subscription is %s",
    (source) => {
      const view = resolve({ verified: premium({ source }) });
      expect(view.isPremiumActive).toBe(true);
      expect(view.status).toBe("premium");
    },
  );

  it("reports a user who has never subscribed as free", () => {
    const view = resolve({ verified: free() });
    expect(view.status).toBe("free");
    expect(view.isPremiumActive).toBe(false);
  });

  it.each(["expired", "cancelled", "refunded", "revoked"] as const)(
    "distinguishes an ended subscription (%s) from never having had one",
    (source) => {
      const view = resolve({
        verified: free({ source, expiresAt: daysBefore(1) }),
      });
      expect(view.status).toBe("expired");
      expect(view.isPremiumActive).toBe(false);
    },
  );

  it("refuses premium when the row says active but its own expiry has passed", () => {
    // A renewal notification that never arrived leaves `is_premium_active` true past `expires_at`. The date wins.
    const view = resolve({
      verified: premium({ expiresAt: daysBefore(1) }),
    });
    expect(view.status).toBe("expired");
    expect(view.isPremiumActive).toBe(false);
  });
});

describe("offline, with a cached answer", () => {
  it("keeps a paying customer premium through a brief outage", () => {
    const view = resolve({
      cached: premium({ verifiedAt: daysBefore(1) }),
      verificationFailed: true,
    });
    expect(view.status).toBe("offline_cached");
    expect(view.isPremiumActive).toBe(true);
    expect(view.fromCache).toBe(true);
  });

  it("still honours the cache one hour inside the grace window", () => {
    const view = resolve({
      cached: premium({
        verifiedAt: daysBefore(ENTITLEMENT_OFFLINE_GRACE_DAYS - 0.04),
      }),
      verificationFailed: true,
    });
    expect(view.isPremiumActive).toBe(true);
  });

  it("stops honouring it past the grace window", () => {
    const view = resolve({
      cached: premium({
        verifiedAt: daysBefore(ENTITLEMENT_OFFLINE_GRACE_DAYS + 1),
      }),
      verificationFailed: true,
    });
    expect(view.status).toBe("billing_unavailable");
    expect(view.isPremiumActive).toBe(false);
  });

  it("never extends a subscription past its own end date, however recently it was verified", () => {
    const view = resolve({
      cached: premium({ verifiedAt: NOW, expiresAt: daysBefore(1) }),
      verificationFailed: true,
    });
    expect(view.status).toBe("expired");
    expect(view.isPremiumActive).toBe(false);
  });

  it("treats an unparseable verification time as no evidence at all", () => {
    const view = resolve({
      cached: premium({ verifiedAt: "not-a-date" }),
      verificationFailed: true,
    });
    expect(view.isPremiumActive).toBe(false);
  });

  it("does not turn a cached free answer into a claim of certainty", () => {
    // Someone may have subscribed on another device since. "We could not check" is the honest report.
    const view = resolve({ cached: free(), verificationFailed: true });
    expect(view.status).toBe("billing_unavailable");
    expect(view.isPremiumActive).toBe(false);
  });

  it("prefers a fresh answer over the cache, even when the fresh answer is worse", () => {
    const view = resolve({
      verified: free({ source: "cancelled", expiresAt: daysBefore(1) }),
      cached: premium({ verifiedAt: daysBefore(1) }),
    });
    expect(view.status).toBe("expired");
    expect(view.isPremiumActive).toBe(false);
  });
});

describe("a fresh install", () => {
  it("cannot fabricate premium from an empty cache", () => {
    expect(
      resolve({ cached: null, verificationFailed: true }).isPremiumActive,
    ).toBe(false);
    expect(resolve({ cached: null }).isPremiumActive).toBe(false);
  });
});
