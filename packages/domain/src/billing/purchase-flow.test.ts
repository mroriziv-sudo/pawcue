import { describe, it, expect } from "vitest";
import { BILLING_PRODUCTS } from "@pawcue/config";
import {
  IDLE_PURCHASE,
  IDLE_RESTORE,
  PURCHASE_FAILURE,
  purchaseReducer,
  restoreReducer,
  type PurchaseFlowEvent,
  type PurchaseFlowState,
  type RestoreFlowEvent,
  type RestoreFlowState,
} from "./purchase-flow";
import type { Entitlement } from "../models/billing";

/**
 * The purchase and restore lifecycles.
 *
 * The invariant under test throughout: the store saying "purchased" never unlocks anything. Only the server's
 * entitlement answer does. Everything else here is about the callbacks that arrive late, twice, or for an attempt
 * that is over.
 */

const PRODUCT = BILLING_PRODUCTS.monthly;
const ATTEMPT = "attempt-1";

const ENTITLEMENT: Entitlement = {
  id: "00000000-0000-4000-a000-0000000000e1",
  userId: "00000000-0000-4000-a000-0000000000u1",
  isPremiumActive: true,
  source: "active",
  expiresAt: "2026-10-12T00:00:00.000Z",
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
};

function run(
  events: PurchaseFlowEvent[],
  from: PurchaseFlowState = IDLE_PURCHASE,
): PurchaseFlowState {
  return events.reduce(purchaseReducer, from);
}

function runRestore(
  events: RestoreFlowEvent[],
  from: RestoreFlowState = IDLE_RESTORE,
): RestoreFlowState {
  return events.reduce(restoreReducer, from);
}

const begin: PurchaseFlowEvent = {
  type: "begin",
  productId: PRODUCT,
  attemptId: ATTEMPT,
};

describe("a successful purchase", () => {
  it("does not unlock on the store's callback alone", () => {
    const state = run([
      begin,
      {
        type: "result",
        attemptId: ATTEMPT,
        result: { outcome: "purchased", entitlement: ENTITLEMENT },
      },
    ]);
    expect(state.phase).toBe("verifying");
    expect(state.phase).not.toBe("unlocked");
  });

  it("unlocks only once the server confirms entitlement", () => {
    const state = run([
      begin,
      {
        type: "result",
        attemptId: ATTEMPT,
        result: { outcome: "purchased", entitlement: ENTITLEMENT },
      },
      { type: "verified", attemptId: ATTEMPT, isPremiumActive: true },
    ]);
    expect(state.phase).toBe("unlocked");
  });

  it("reports a verification problem rather than a failed purchase when the server disagrees", () => {
    // The user was charged. Telling them the purchase failed would be false; the webhook is simply still in flight.
    const state = run([
      begin,
      {
        type: "result",
        attemptId: ATTEMPT,
        result: { outcome: "purchased", entitlement: ENTITLEMENT },
      },
      { type: "verified", attemptId: ATTEMPT, isPremiumActive: false },
    ]);
    expect(state.phase).toBe("failed");
    expect(state.messageKey).toBe(PURCHASE_FAILURE.verificationFailed);
  });

  it("records which product the attempt was for", () => {
    expect(run([begin]).productId).toBe(PRODUCT);
  });
});

describe("the flows that are not failures", () => {
  it("returns to a plain cancelled state with no error message", () => {
    const state = run([
      begin,
      { type: "result", attemptId: ATTEMPT, result: { outcome: "cancelled" } },
    ]);
    expect(state.phase).toBe("cancelled");
    expect(state.messageKey).toBeNull();
  });

  it("reports a pending purchase as pending, not as success or failure", () => {
    const state = run([
      begin,
      { type: "result", attemptId: ATTEMPT, result: { outcome: "pending" } },
    ]);
    expect(state.phase).toBe("pending");
    expect(state.messageKey).toBe("billing.purchase.pending");
  });

  it("reconciles with the server when the store says the account already owns it", () => {
    const state = run([
      begin,
      {
        type: "result",
        attemptId: ATTEMPT,
        result: { outcome: "failed", reasonKey: PURCHASE_FAILURE.alreadyOwned },
      },
    ]);
    expect(state.phase).toBe("verifying");
  });

  it("unlocks an already-owned subscription once the server confirms it", () => {
    const state = run([
      begin,
      {
        type: "result",
        attemptId: ATTEMPT,
        result: { outcome: "failed", reasonKey: PURCHASE_FAILURE.alreadyOwned },
      },
      { type: "verified", attemptId: ATTEMPT, isPremiumActive: true },
    ]);
    expect(state.phase).toBe("unlocked");
  });
});

describe("failures", () => {
  it.each([
    PURCHASE_FAILURE.storeUnavailable,
    PURCHASE_FAILURE.network,
    PURCHASE_FAILURE.notConfigured,
    PURCHASE_FAILURE.unknown,
  ])("surfaces %s as a message key, never a provider string", (reasonKey) => {
    const state = run([
      begin,
      {
        type: "result",
        attemptId: ATTEMPT,
        result: { outcome: "failed", reasonKey },
      },
    ]);
    expect(state.phase).toBe("failed");
    expect(state.messageKey).toBe(reasonKey);
  });

  it("grants nothing on failure", () => {
    const state = run([
      begin,
      {
        type: "result",
        attemptId: ATTEMPT,
        result: { outcome: "failed", reasonKey: PURCHASE_FAILURE.network },
      },
      // A stray confirmation arriving afterwards must not resurrect the attempt.
      { type: "verified", attemptId: ATTEMPT, isPremiumActive: true },
    ]);
    expect(state.phase).toBe("failed");
  });
});

describe("callbacks that should be ignored", () => {
  it("drops a duplicate result for the same attempt", () => {
    const afterFirst = run([
      begin,
      { type: "result", attemptId: ATTEMPT, result: { outcome: "cancelled" } },
    ]);
    const afterDuplicate = purchaseReducer(afterFirst, {
      type: "result",
      attemptId: ATTEMPT,
      result: { outcome: "purchased", entitlement: ENTITLEMENT },
    });
    expect(afterDuplicate).toBe(afterFirst);
  });

  it("drops a result belonging to an abandoned attempt", () => {
    const state = run([
      begin,
      { type: "reset" },
      { type: "begin", productId: PRODUCT, attemptId: "attempt-2" },
      // The first attempt's sheet finally answers, long after the user started over.
      {
        type: "result",
        attemptId: ATTEMPT,
        result: { outcome: "purchased", entitlement: ENTITLEMENT },
      },
    ]);
    expect(state.phase).toBe("purchasing");
    expect(state.attemptId).toBe("attempt-2");
  });

  it("drops a stale verification", () => {
    const state = run([
      begin,
      {
        type: "result",
        attemptId: ATTEMPT,
        result: { outcome: "purchased", entitlement: ENTITLEMENT },
      },
      { type: "verified", attemptId: "attempt-2", isPremiumActive: true },
    ]);
    expect(state.phase).toBe("verifying");
  });

  it("does not start a second attempt while one is in flight", () => {
    const first = run([begin]);
    const second = purchaseReducer(first, {
      type: "begin",
      productId: BILLING_PRODUCTS.annual,
      attemptId: "attempt-2",
    });
    expect(second).toBe(first);
  });

  it("does not start a second attempt while verifying", () => {
    const verifying = run([
      begin,
      {
        type: "result",
        attemptId: ATTEMPT,
        result: { outcome: "purchased", entitlement: ENTITLEMENT },
      },
    ]);
    expect(
      purchaseReducer(verifying, {
        type: "begin",
        productId: PRODUCT,
        attemptId: "attempt-2",
      }),
    ).toBe(verifying);
  });

  it("allows a new attempt after a failure", () => {
    const failed = run([
      begin,
      {
        type: "result",
        attemptId: ATTEMPT,
        result: { outcome: "failed", reasonKey: PURCHASE_FAILURE.network },
      },
    ]);
    const retry = purchaseReducer(failed, {
      type: "begin",
      productId: PRODUCT,
      attemptId: "attempt-2",
    });
    expect(retry.phase).toBe("purchasing");
    expect(retry.messageKey).toBeNull();
  });

  it("returns to idle on reset", () => {
    expect(run([begin, { type: "reset" }])).toEqual(IDLE_PURCHASE);
  });
});

describe("restore", () => {
  it("restores premium once the server confirms it", () => {
    const state = runRestore([
      { type: "begin" },
      { type: "result", restored: true },
      { type: "verified", isPremiumActive: true },
    ]);
    expect(state.phase).toBe("restored");
    expect(state.messageKey).toBe("billing.restore.restored");
  });

  it("says plainly when there was nothing to restore", () => {
    const state = runRestore([
      { type: "begin" },
      { type: "result", restored: false },
    ]);
    expect(state.phase).toBe("nothing_to_restore");
    expect(state.messageKey).toBe("billing.restore.nothingToRestore");
  });

  it("does not claim success when the store had a purchase the server considers inactive", () => {
    const state = runRestore([
      { type: "begin" },
      { type: "result", restored: true },
      { type: "verified", isPremiumActive: false },
    ]);
    expect(state.phase).toBe("nothing_to_restore");
  });

  it("is safe to repeat: a second run reaches the same state", () => {
    const once = runRestore([
      { type: "begin" },
      { type: "result", restored: true },
      { type: "verified", isPremiumActive: true },
    ]);
    const twice = runRestore(
      [
        { type: "begin" },
        { type: "result", restored: true },
        { type: "verified", isPremiumActive: true },
      ],
      once,
    );
    expect(twice).toEqual(once);
  });

  it("ignores a second press while one is already running", () => {
    const running = runRestore([{ type: "begin" }]);
    expect(restoreReducer(running, { type: "begin" })).toBe(running);
  });

  it("surfaces a failure with a message key", () => {
    const state = runRestore([
      { type: "begin" },
      { type: "failed", messageKey: PURCHASE_FAILURE.notConfigured },
    ]);
    expect(state.phase).toBe("failed");
    expect(state.messageKey).toBe(PURCHASE_FAILURE.notConfigured);
  });

  it("ignores a failure reported when nothing was running", () => {
    expect(
      restoreReducer(IDLE_RESTORE, {
        type: "failed",
        messageKey: PURCHASE_FAILURE.network,
      }),
    ).toBe(IDLE_RESTORE);
  });
});
