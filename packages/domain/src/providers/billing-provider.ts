import type { Entitlement, ProductId } from "../models/billing";

export interface StoreProductInfo {
  productId: ProductId;
  /** Store-localized, already formatted for display — never a hardcoded currency string (brief §9, §33). */
  localizedPrice: string;
  localizedPricePerPeriod: string;
  trialDurationDays: number | null;
}

export type PurchaseResult =
  | { outcome: "purchased"; entitlement: Entitlement }
  | { outcome: "cancelled" }
  | { outcome: "pending" }
  | { outcome: "failed"; reasonKey: string };

/**
 * Concrete implementation: RevenueCat (default, see docs/architecture/tech-stack-versions.md) fronting
 * StoreKit2 (iOS) / Play Billing v8+ (Android). The client NEVER computes entitlement itself — `getEntitlement`
 * always reflects the server-verified `entitlements` table (brief §15).
 *
 * `getEntitlement` and `restorePurchases` return `null` for "the server holds no entitlement record for this
 * user". That is the real state of a user who has never purchased: `entitlements` has no row, the client has no
 * insert policy on that table, and nothing else may create one. Synthesising a free `Entitlement` here to keep the
 * type non-nullable would mean inventing a row id, a user id and timestamps for a record that does not exist —
 * a fabricated server answer, which is the opposite of what this interface is for.
 */
export interface BillingProvider {
  getAvailableProducts(): Promise<StoreProductInfo[]>;
  purchase(productId: ProductId): Promise<PurchaseResult>;
  /** `restored` reports what the *store* returned; the entitlement is what the *server* confirmed. */
  restorePurchases(): Promise<{
    restored: boolean;
    entitlement: Entitlement | null;
  }>;
  getEntitlement(): Promise<Entitlement | null>;
}

/**
 * Thrown when the billing contract exists but its external configuration does not — no store SDK in this build,
 * no RevenueCat API key, no product configured in App Store Connect / Play Console.
 *
 * Mirrors `ProviderNotConfiguredError` in the auth layer, and for the same reason: a provider that cannot do its
 * job must fail in a way callers can recognise and explain, rather than return a plausible-looking result. There
 * is deliberately no "development mode" branch inside a provider that returns a fake purchase — that is how a
 * build ships believing it can sell something it cannot.
 */
export class BillingNotConfiguredError extends Error {
  constructor(readonly capability: "products" | "purchase" | "restore") {
    super(
      `Billing capability "${capability}" is not configured for this build.`,
    );
    this.name = "BillingNotConfiguredError";
  }
}
