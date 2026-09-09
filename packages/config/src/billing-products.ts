/**
 * The only place a product ID literal may appear. Screens/hooks import from here — never a raw string
 * ("premium_monthly") scattered through paywall code (coding rule §46: "Centralize subscription product IDs").
 * Prices are never hardcoded (brief §9) — always read from `BillingProvider.getAvailableProducts()` at runtime.
 */
export const BILLING_PRODUCTS = {
  monthly: "premium_monthly",
  annual: "premium_annual",
} as const;

export type BillingProductKey = keyof typeof BILLING_PRODUCTS;
export type BillingProductId = (typeof BILLING_PRODUCTS)[BillingProductKey];
