import type { Entitlement } from "../models/billing";
import type { ProductId } from "../models/billing";

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
 */
export interface BillingProvider {
  getAvailableProducts(): Promise<StoreProductInfo[]>;
  purchase(productId: ProductId): Promise<PurchaseResult>;
  restorePurchases(): Promise<{ restored: boolean; entitlement: Entitlement }>;
  getEntitlement(): Promise<Entitlement>;
}
