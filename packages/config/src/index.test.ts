import { describe, expect, it } from "vitest";
import {
  apiRoutes,
  BILLING_PRODUCTS,
  BILLING_PRODUCT_ORDER,
  BILLING_PRODUCT_PERIODS,
  DEFAULT_FEATURE_FLAGS,
  isKnownProductId,
} from "./index";

describe("BILLING_PRODUCTS", () => {
  it("exposes exactly the two stable product IDs the brief requires", () => {
    expect(BILLING_PRODUCTS).toEqual({
      monthly: "premium_monthly",
      annual: "premium_annual",
    });
  });

  it("offers the smallest immediate charge first", () => {
    // Presentation order is fixed here so no screen can reorder the choices to steer a decision.
    expect(BILLING_PRODUCT_ORDER).toEqual([
      "premium_monthly",
      "premium_annual",
    ]);
  });

  it("declares every product's billing period", () => {
    expect(BILLING_PRODUCT_PERIODS).toEqual({
      premium_monthly: "month",
      premium_annual: "year",
    });
    // A product with no declared period could reach the store-required renewal disclosure without one.
    for (const id of BILLING_PRODUCT_ORDER) {
      expect(BILLING_PRODUCT_PERIODS[id]).toBeDefined();
    }
  });

  it("recognises only the products this app sells", () => {
    expect(isKnownProductId("premium_monthly")).toBe(true);
    expect(isKnownProductId("premium_lifetime")).toBe(false);
    expect(isKnownProductId("")).toBe(false);
  });
});

describe("apiRoutes", () => {
  it("builds every route under the /v1 prefix", () => {
    expect(apiRoutes.planGenerate()).toBe("/v1/plans/generate");
    expect(apiRoutes.dog("abc-123")).toBe("/v1/dogs/abc-123");
    expect(apiRoutes.sessionEvents("session-1")).toBe(
      "/v1/sessions/session-1/events",
    );
    expect(apiRoutes.accountDelete()).toBe("/v1/account/delete");
  });
});

describe("DEFAULT_FEATURE_FLAGS", () => {
  it("ships with AI features off by default, per the brief's opt-in-only AI policy", () => {
    expect(DEFAULT_FEATURE_FLAGS).toEqual({
      aiTrainingCoachEnabled: false,
      aiPlanAdjustmentEnabled: false,
    });
  });
});
