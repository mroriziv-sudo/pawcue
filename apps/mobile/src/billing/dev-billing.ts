import {
  UNKNOWN_ENTITLEMENT,
  type EntitlementStatus,
  type EntitlementView,
} from "@pawcue/domain";
import { BILLING_PRODUCTS } from "@pawcue/config";
import {
  registerStoreBillingAdapter,
  type StoreBillingAdapter,
  type StorePurchaseOutcome,
} from "./store-billing-provider";

/**
 * Simulated billing, for developing the entitlement UI.
 *
 * The paywall, the locked states and the billing section in Settings cannot otherwise be seen at all: real
 * entitlement needs App Store Connect / Play Console configuration and a sandbox account, and the honest provider
 * throws without them. This exists so those screens can be built and reviewed — not so anything can be sold.
 *
 * ## The production guard
 *
 * `__DEV__` is checked **here**, in `devEntitlementOverride`, and that is the single chokepoint: every consumer
 * goes through this function, so there is one line to reason about rather than a gate per call site. A release
 * bundle takes the `null` branch before it reads any stored value, so no sequence of taps, no leftover state and
 * no stale storage can turn a shipped build premium. `__tests__/billing-dev-guard.test.ts` flips `__DEV__` and
 * asserts it.
 *
 * This never replaces the real integration. A simulated purchase writes nothing to `entitlements`, so it cannot
 * make the server agree — which is exactly the property that makes it safe.
 */

/** Statuses a developer can force, covering every branch of the entitlement policy. */
export const DEV_ENTITLEMENT_STATES = [
  "unknown",
  "free",
  "premium",
  "expired",
  "offline_cached",
  "billing_unavailable",
] as const satisfies readonly EntitlementStatus[];

export type DevEntitlementState = (typeof DEV_ENTITLEMENT_STATES)[number];

/** Deliberately module state, never persisted: a simulation must not survive a relaunch and be mistaken for real. */
let forcedState: DevEntitlementState | null = null;

export function setDevEntitlementState(
  state: DevEntitlementState | null,
): void {
  if (!__DEV__) return;
  forcedState = state;
}

export function devEntitlementStateOrNull(): DevEntitlementState | null {
  return __DEV__ ? forcedState : null;
}

const DAY_MS = 86_400_000;

/**
 * The forced entitlement view, or null when nothing is forced.
 *
 * Returns `null` in a release build before looking at anything, whatever a developer left set.
 */
export function devEntitlementOverride(
  now: string = new Date().toISOString(),
): EntitlementView | null {
  if (!__DEV__) return null;
  if (!forcedState) return null;

  const at = Date.parse(now);

  switch (forcedState) {
    case "unknown":
      return UNKNOWN_ENTITLEMENT;
    case "free":
      return {
        status: "free",
        isPremiumActive: false,
        source: null,
        expiresAt: null,
        verifiedAt: now,
        fromCache: false,
      };
    case "premium":
      return {
        status: "premium",
        isPremiumActive: true,
        source: "active",
        expiresAt: new Date(at + 30 * DAY_MS).toISOString(),
        verifiedAt: now,
        fromCache: false,
      };
    case "expired":
      return {
        status: "expired",
        isPremiumActive: false,
        source: "expired",
        expiresAt: new Date(at - DAY_MS).toISOString(),
        verifiedAt: now,
        fromCache: false,
      };
    case "offline_cached":
      return {
        status: "offline_cached",
        isPremiumActive: true,
        source: "active",
        expiresAt: new Date(at + 30 * DAY_MS).toISOString(),
        verifiedAt: new Date(at - DAY_MS).toISOString(),
        fromCache: true,
      };
    case "billing_unavailable":
      return {
        status: "billing_unavailable",
        isPremiumActive: false,
        source: null,
        expiresAt: null,
        verifiedAt: null,
        fromCache: false,
      };
  }
}

/**
 * A store adapter that returns invented products so the paywall's layout can be reviewed.
 *
 * Its prices are obviously not real and its label says so, because a screenshot of a paywall showing plausible
 * prices is the kind of artefact that ends up in a deck. Purchases through it never succeed: `pending` is the
 * honest outcome for a store that does not exist, and it exercises the one branch where the UI must neither
 * celebrate nor apologise.
 */
export const devStoreBillingAdapter: StoreBillingAdapter = {
  label: "SIMULATED — not a real store",

  getAvailableProducts(): Promise<unknown[]> {
    return Promise.resolve([
      {
        productId: BILLING_PRODUCTS.monthly,
        localizedPrice: "—.— (simulated)",
        localizedPricePerPeriod: "—.— (simulated)",
        trialDurationDays: null,
      },
      {
        productId: BILLING_PRODUCTS.annual,
        localizedPrice: "—.— (simulated)",
        localizedPricePerPeriod: "—.— (simulated)",
        trialDurationDays: null,
      },
    ]);
  },

  purchase(): Promise<StorePurchaseOutcome> {
    // Never "purchased". A simulated purchase that reported success would be a fake paid state, and the server
    // would immediately contradict it anyway.
    return Promise.resolve({ outcome: "pending" });
  },

  restorePurchases() {
    return Promise.resolve([]);
  },
};

/**
 * Registers or removes the simulated adapter.
 *
 * The `__DEV__` check is here rather than at the call site for the same reason as above: one chokepoint. In a
 * release build this returns before touching the registration, so the real provider keeps throwing
 * `BillingNotConfiguredError` exactly as it should.
 */
export function installDevStoreAdapter(install: boolean): void {
  if (!__DEV__) return;
  registerStoreBillingAdapter(install ? devStoreBillingAdapter : null);
}
