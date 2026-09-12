import { describe, it, expect } from "vitest";
import { BILLING_PRODUCTS } from "@pawcue/config";
import { defaultSelection, reconcileStoreProducts } from "./product-catalogue";

/**
 * What the paywall is allowed to offer.
 *
 * The store console is configuration that lives outside this repository and can be wrong in ways no build can
 * prevent: a product still in review, a stale id, the same id twice. None of them may crash the paywall, and none
 * of them may put an unpriced or duplicated row in front of a user.
 */

const monthly = {
  productId: BILLING_PRODUCTS.monthly,
  localizedPrice: "$4.99",
  localizedPricePerPeriod: "$4.99/month",
  trialDurationDays: 7,
};

const annual = {
  productId: BILLING_PRODUCTS.annual,
  localizedPrice: "$39.99",
  localizedPricePerPeriod: "$39.99/year",
  trialDurationDays: null,
};

describe("a correctly configured store", () => {
  it("offers both products", () => {
    const catalogue = reconcileStoreProducts([monthly, annual]);
    expect(catalogue.products.map((p) => p.productId)).toEqual([
      BILLING_PRODUCTS.monthly,
      BILLING_PRODUCTS.annual,
    ]);
    expect(catalogue.missing).toEqual([]);
    expect(catalogue.empty).toBe(false);
  });

  it("presents them in the configured order, not the store's", () => {
    const catalogue = reconcileStoreProducts([annual, monthly]);
    expect(catalogue.products.map((p) => p.productId)).toEqual([
      BILLING_PRODUCTS.monthly,
      BILLING_PRODUCTS.annual,
    ]);
  });

  it("attaches the billing period from configuration rather than the price string", () => {
    const catalogue = reconcileStoreProducts([monthly, annual]);
    expect(catalogue.products.map((p) => p.period)).toEqual(["month", "year"]);
  });

  it("carries the store's localized price through untouched", () => {
    const catalogue = reconcileStoreProducts([
      {
        ...monthly,
        localizedPrice: "₪19.90",
        localizedPricePerPeriod: "₪19.90 לחודש",
      },
    ]);
    expect(catalogue.products[0]?.localizedPrice).toBe("₪19.90");
  });

  it("preselects the smallest immediate charge", () => {
    expect(defaultSelection(reconcileStoreProducts([annual, monthly]))).toBe(
      BILLING_PRODUCTS.monthly,
    );
  });
});

describe("an incomplete store", () => {
  it("reports the missing product and still offers what exists", () => {
    const catalogue = reconcileStoreProducts([monthly]);
    expect(catalogue.missing).toEqual([BILLING_PRODUCTS.annual]);
    expect(catalogue.products).toHaveLength(1);
    expect(catalogue.empty).toBe(false);
  });

  it("reports an empty catalogue rather than an empty list of choices", () => {
    const catalogue = reconcileStoreProducts([]);
    expect(catalogue.empty).toBe(true);
    expect(catalogue.missing).toHaveLength(2);
    expect(defaultSelection(catalogue)).toBeNull();
  });

  it("treats a store outage the same as an empty store", () => {
    // The provider throws; the caller hands the reconciler nothing. Nothing is offered and nothing crashes.
    const catalogue = reconcileStoreProducts([]);
    expect(catalogue.products).toEqual([]);
  });
});

describe("a misconfigured store", () => {
  it("drops an id this build does not sell", () => {
    const catalogue = reconcileStoreProducts([
      monthly,
      { ...monthly, productId: "premium_lifetime" },
    ]);
    expect(catalogue.unrecognized).toEqual(["premium_lifetime"]);
    expect(catalogue.products).toHaveLength(1);
  });

  it("rejects a duplicate rather than guessing which price is real", () => {
    const catalogue = reconcileStoreProducts([
      monthly,
      { ...monthly, localizedPrice: "$9.99" },
    ]);
    expect(catalogue.duplicated).toEqual([BILLING_PRODUCTS.monthly]);
    expect(catalogue.products).toHaveLength(1);
    expect(catalogue.products[0]?.localizedPrice).toBe("$4.99");
  });

  it("drops a product with no price instead of inventing one", () => {
    const catalogue = reconcileStoreProducts([
      { ...monthly, localizedPrice: "" },
      annual,
    ]);
    expect(catalogue.products.map((p) => p.productId)).toEqual([
      BILLING_PRODUCTS.annual,
    ]);
    expect(catalogue.missing).toEqual([BILLING_PRODUCTS.monthly]);
  });

  it("survives rows that are not products at all", () => {
    const catalogue = reconcileStoreProducts([
      null,
      undefined,
      42,
      "nope",
      monthly,
    ]);
    expect(catalogue.products).toHaveLength(1);
  });

  it("treats a zero or negative trial length as no trial", () => {
    const catalogue = reconcileStoreProducts([
      { ...monthly, trialDurationDays: 0 },
      { ...annual, trialDurationDays: -3 },
    ]);
    expect(catalogue.products.map((p) => p.trialDurationDays)).toEqual([
      null,
      null,
    ]);
  });

  it("falls back to the plain price when the per-period string is missing", () => {
    const catalogue = reconcileStoreProducts([
      { ...monthly, localizedPricePerPeriod: "" },
    ]);
    expect(catalogue.products[0]?.localizedPricePerPeriod).toBe("$4.99");
  });
});
