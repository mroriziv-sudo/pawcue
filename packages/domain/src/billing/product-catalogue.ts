import {
  BILLING_PRODUCT_ORDER,
  BILLING_PRODUCT_PERIODS,
  isKnownProductId,
  type BillingPeriod,
} from "@pawcue/config";
import type { ProductId } from "../models/billing";
import type { StoreProductInfo } from "../providers/billing-provider";

/**
 * What the store gave us, reconciled against what this app sells.
 *
 * Store SDKs return whatever the store console happens to contain: a product can be missing because it is still in
 * review, an id can appear that this build knows nothing about, and a misconfigured console can return the same id
 * twice. None of those may crash a paywall, and none of them may result in an unpriced or duplicated row being
 * offered for sale — so every one of them is resolved here, once, before anything renders.
 */

export interface StoreProduct extends StoreProductInfo {
  /** The period this product bills on, from configuration — never parsed out of a localized price string. */
  period: BillingPeriod;
}

export interface ProductCatalogue {
  /** Offerable products, in the configured order. Only ids this build sells, each appearing once. */
  products: StoreProduct[];
  /** Expected ids the store did not return. The paywall may still open on whatever remains. */
  missing: ProductId[];
  /** Ids the store returned that this build does not sell. Dropped, never displayed. */
  unrecognized: string[];
  /** Ids the store returned more than once. The first is kept; the rest are discarded. */
  duplicated: ProductId[];
  /** True when there is nothing at all to sell — the paywall must say so rather than render an empty list. */
  empty: boolean;
}

/**
 * Validates a raw product list from the provider.
 *
 * Takes `unknown[]` on purpose: this is the boundary where a third-party SDK's data enters the app, and brief §46
 * requires external data to be validated rather than assumed. A row missing its localized price is dropped — a
 * product with no price cannot be offered for sale, and inventing a placeholder would be the exact hardcoded
 * price string the billing rules forbid.
 */
export function reconcileStoreProducts(
  raw: readonly unknown[],
): ProductCatalogue {
  const byId = new Map<ProductId, StoreProduct>();
  const unrecognized: string[] = [];
  const duplicated: ProductId[] = [];

  for (const entry of raw) {
    const parsed = parseProduct(entry);
    if (!parsed) continue;

    if (!isKnownProductId(parsed.productId)) {
      unrecognized.push(parsed.productId);
      continue;
    }

    const productId = parsed.productId;
    if (byId.has(productId)) {
      // First wins. Choosing between two rows claiming the same id would mean guessing which price is real.
      duplicated.push(productId);
      continue;
    }

    byId.set(productId, {
      ...parsed,
      productId,
      period: BILLING_PRODUCT_PERIODS[productId],
    });
  }

  const products: StoreProduct[] = [];
  const missing: ProductId[] = [];
  for (const id of BILLING_PRODUCT_ORDER) {
    const product = byId.get(id);
    if (product) products.push(product);
    else missing.push(id);
  }

  return {
    products,
    missing,
    unrecognized,
    duplicated,
    empty: products.length === 0,
  };
}

interface RawProduct {
  productId: string;
  localizedPrice: string;
  localizedPricePerPeriod: string;
  trialDurationDays: number | null;
}

function parseProduct(entry: unknown): RawProduct | null {
  if (typeof entry !== "object" || entry === null) return null;
  const row = entry as Record<string, unknown>;

  const productId = row["productId"];
  const localizedPrice = row["localizedPrice"];
  if (typeof productId !== "string" || productId.length === 0) return null;
  // No price, no sale. Everything the store-required disclosure needs comes from this string.
  if (typeof localizedPrice !== "string" || localizedPrice.length === 0) {
    return null;
  }

  const perPeriod = row["localizedPricePerPeriod"];
  const trial = row["trialDurationDays"];

  return {
    productId,
    localizedPrice,
    localizedPricePerPeriod:
      typeof perPeriod === "string" && perPeriod.length > 0
        ? perPeriod
        : localizedPrice,
    // A trial length is only real if the store says so. Zero and negative are treated as no trial, not as a
    // "0 days free" disclosure.
    trialDurationDays:
      typeof trial === "number" && Number.isFinite(trial) && trial > 0
        ? Math.floor(trial)
        : null,
  };
}

/**
 * Which product the paywall starts on.
 *
 * The first configured product — monthly, the smallest immediate charge. A paywall that preselects the larger
 * commitment is the pattern store review calls out and brief §33 forbids, so the default is fixed by
 * configuration order rather than decided per render.
 */
export function defaultSelection(
  catalogue: ProductCatalogue,
): ProductId | null {
  return catalogue.products[0]?.productId ?? null;
}
