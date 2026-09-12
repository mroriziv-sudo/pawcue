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

/**
 * The order products are offered in, fixed here rather than left to whatever the store returns.
 *
 * Monthly first, deliberately. Store SDKs do not promise an order, and an order chosen by the paywall at render
 * time is an order that can be chosen to manipulate — leading with the cheapest immediate charge is the one
 * arrangement that cannot be accused of steering. Presentation order is a property of the product, so it lives
 * beside the ids rather than in a screen.
 */
export const BILLING_PRODUCT_ORDER = [
  BILLING_PRODUCTS.monthly,
  BILLING_PRODUCTS.annual,
] as const satisfies readonly BillingProductId[];

/** The billing period each product bills on. Used for the store-required renewal disclosure, never for pricing. */
export const BILLING_PRODUCT_PERIODS = {
  [BILLING_PRODUCTS.monthly]: "month",
  [BILLING_PRODUCTS.annual]: "year",
} as const satisfies Record<BillingProductId, "month" | "year">;

export type BillingPeriod = (typeof BILLING_PRODUCT_PERIODS)[BillingProductId];

/** True when the id is one this app sells. Everything else must fail safely rather than be displayed. */
export function isKnownProductId(id: string): id is BillingProductId {
  return (BILLING_PRODUCT_ORDER as readonly string[]).includes(id);
}
