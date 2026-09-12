import type { ProductId } from "../models/billing";
import type { PurchaseResult } from "../providers/billing-provider";

/**
 * The purchase and restore lifecycles, as pure state machines.
 *
 * Store SDKs deliver results as callbacks that can arrive late, twice, or for an attempt the user already
 * abandoned. Every one of those is a way to show the wrong thing — or, much worse, to unlock premium off the back
 * of a callback. Keeping the transitions here means each of those cases is a test rather than a race in a screen.
 *
 * The invariant this file exists to hold: **a successful store callback never unlocks anything.** It moves the
 * flow to `verifying`, and only the server's entitlement answer can move it to `unlocked` (BILLING.md's one rule).
 */

/** Machine-readable failure reasons a provider may report. i18n keys, so nothing renders a provider's own string. */
export const PURCHASE_FAILURE = {
  /** The store says this account already owns the subscription. Not an error — a reconciliation.  */
  alreadyOwned: "billing.error.alreadyOwned",
  storeUnavailable: "billing.error.storeUnavailable",
  network: "billing.error.network",
  /** The store SDK or its credentials are absent from this build. */
  notConfigured: "billing.error.notConfigured",
  /** The purchase succeeded at the store but the server would not confirm entitlement. */
  verificationFailed: "billing.error.verificationFailed",
  unknown: "billing.error.unknown",
} as const;

export type PurchaseFailureKey =
  (typeof PURCHASE_FAILURE)[keyof typeof PURCHASE_FAILURE];

export type PurchasePhase =
  | "idle"
  /** The store sheet is up. */
  | "purchasing"
  /** The store reported success; the server has not confirmed entitlement yet. Nothing is unlocked here. */
  | "verifying"
  /** The server confirmed premium. This is the only phase that means access. */
  | "unlocked"
  /** The user dismissed the store sheet. Not a failure, and never shown as one. */
  | "cancelled"
  /** Deferred approval (Ask to Buy, SCA, slow payment method). The user owes nothing further right now. */
  | "pending"
  | "failed";

export interface PurchaseFlowState {
  phase: PurchasePhase;
  productId: ProductId | null;
  /** i18n key describing the outcome, or null when there is nothing to say. */
  messageKey: string | null;
  /**
   * Identifies the attempt a result belongs to.
   *
   * A store callback carrying a stale id is a duplicate or a leftover from an abandoned attempt, and is dropped.
   */
  attemptId: string | null;
}

export const IDLE_PURCHASE: PurchaseFlowState = {
  phase: "idle",
  productId: null,
  messageKey: null,
  attemptId: null,
};

export type PurchaseFlowEvent =
  | { type: "begin"; productId: ProductId; attemptId: string }
  | { type: "result"; attemptId: string; result: PurchaseResult }
  /** The server's answer after a purchase. `isPremiumActive` is the server's, never the store's. */
  | { type: "verified"; attemptId: string; isPremiumActive: boolean }
  | { type: "reset" };

export function purchaseReducer(
  state: PurchaseFlowState,
  event: PurchaseFlowEvent,
): PurchaseFlowState {
  switch (event.type) {
    case "begin": {
      // A second tap while the sheet is up must not open another one, or start a second attempt whose callback
      // would then look like a duplicate of the first.
      if (state.phase === "purchasing" || state.phase === "verifying") {
        return state;
      }
      return {
        phase: "purchasing",
        productId: event.productId,
        messageKey: null,
        attemptId: event.attemptId,
      };
    }

    case "result": {
      if (state.phase !== "purchasing") return state;
      if (event.attemptId !== state.attemptId) return state;

      switch (event.result.outcome) {
        case "purchased":
          /**
           * The store said yes. That is not the question.
           *
           * Entitlement comes from the server's `entitlements` row, so the flow waits here until the refresh
           * answers. Unlocking on this callback is precisely the client-trusted `isPremium` the architecture
           * forbids.
           */
          return { ...state, phase: "verifying", messageKey: null };

        case "cancelled":
          return { ...state, phase: "cancelled", messageKey: null };

        case "pending":
          return {
            ...state,
            phase: "pending",
            messageKey: "billing.purchase.pending",
          };

        case "failed": {
          /**
           * "Already owned" is the store telling us the server is behind, not that anything went wrong. The
           * correct response is to reconcile, which is exactly what `verifying` does.
           */
          if (event.result.reasonKey === PURCHASE_FAILURE.alreadyOwned) {
            return { ...state, phase: "verifying", messageKey: null };
          }
          return {
            ...state,
            phase: "failed",
            messageKey: event.result.reasonKey,
          };
        }
      }
    }

    case "verified": {
      if (state.phase !== "verifying") return state;
      if (event.attemptId !== state.attemptId) return state;

      if (event.isPremiumActive) {
        return { ...state, phase: "unlocked", messageKey: null };
      }
      /**
       * Paid at the store, not entitled by the server.
       *
       * Usually a webhook still in flight. It is reported as a verification state rather than a failed purchase,
       * because telling a user who was just charged that their purchase failed would be false.
       */
      return {
        ...state,
        phase: "failed",
        messageKey: PURCHASE_FAILURE.verificationFailed,
      };
    }

    case "reset":
      return IDLE_PURCHASE;
  }
}

/* -------------------------------------------------------------------------- */
/* Restore                                                                     */
/* -------------------------------------------------------------------------- */

export type RestorePhase =
  | "idle"
  | "restoring"
  /** The store returned purchases; waiting for the server to confirm what they entitle. */
  | "verifying"
  /** Premium was restored and the server confirmed it. */
  | "restored"
  /** The store had nothing for this account. Reported plainly, never dressed up as a success. */
  | "nothing_to_restore"
  | "failed";

export interface RestoreFlowState {
  phase: RestorePhase;
  messageKey: string | null;
}

export const IDLE_RESTORE: RestoreFlowState = {
  phase: "idle",
  messageKey: null,
};

export type RestoreFlowEvent =
  | { type: "begin" }
  | { type: "result"; restored: boolean }
  | { type: "verified"; isPremiumActive: boolean }
  | { type: "failed"; messageKey: string }
  | { type: "reset" };

/**
 * Restore is idempotent by construction.
 *
 * Nothing here accumulates: every run recomputes the same terminal state from the same store and server answers,
 * and a second run while one is in flight is dropped rather than queued. Restoring twice therefore produces the
 * same result as restoring once — which is what makes the button safe to press repeatedly when a user is unsure
 * whether the first press worked.
 */
export function restoreReducer(
  state: RestoreFlowState,
  event: RestoreFlowEvent,
): RestoreFlowState {
  switch (event.type) {
    case "begin":
      if (state.phase === "restoring" || state.phase === "verifying") {
        return state;
      }
      return { phase: "restoring", messageKey: null };

    case "result":
      if (state.phase !== "restoring") return state;
      if (!event.restored) {
        return {
          phase: "nothing_to_restore",
          messageKey: "billing.restore.nothingToRestore",
        };
      }
      return { phase: "verifying", messageKey: null };

    case "verified":
      if (state.phase !== "verifying") return state;
      if (event.isPremiumActive) {
        return { phase: "restored", messageKey: "billing.restore.restored" };
      }
      /**
       * The store had a purchase, the server does not consider it active — an expired or refunded subscription,
       * most often. Saying "restored" here would be a lie the next locked screen immediately contradicts.
       */
      return {
        phase: "nothing_to_restore",
        messageKey: "billing.restore.nothingToRestore",
      };

    case "failed":
      if (state.phase === "idle") return state;
      return { phase: "failed", messageKey: event.messageKey };

    case "reset":
      return IDLE_RESTORE;
  }
}
