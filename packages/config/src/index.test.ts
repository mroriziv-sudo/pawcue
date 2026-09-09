import { describe, expect, it } from "vitest";
import { apiRoutes, BILLING_PRODUCTS, DEFAULT_FEATURE_FLAGS } from "./index";

describe("BILLING_PRODUCTS", () => {
  it("exposes exactly the two stable product IDs the brief requires", () => {
    expect(BILLING_PRODUCTS).toEqual({
      monthly: "premium_monthly",
      annual: "premium_annual",
    });
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
