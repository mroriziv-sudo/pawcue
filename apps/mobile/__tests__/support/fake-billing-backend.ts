import type {
  Entitlement,
  ProductId,
  PurchaseResult,
  StoreProductInfo,
} from "@pawcue/domain";

/**
 * A billing backend that behaves like the real one.
 *
 * The rule it enforces is the one the whole architecture rests on: **a purchase does not change entitlement.**
 * Only `grantFromServer` does, standing in for the verification endpoint recomputing the row. A test that wants to
 * see premium has to say the server granted it, which is exactly the property the production code must have.
 *
 * It also counts calls, so "did this read the server once or three times" is answerable.
 */

const TS = "2026-09-12T09:00:00.000Z";

export interface FakeBillingBackend {
  /** What the server would return for the current user. Null means no row: never subscribed. */
  entitlement: Entitlement | null;
  /** Set when the server is unreachable — `getEntitlement` throws instead of answering. */
  offline: boolean;
  /** What the store returns from `purchase()`. */
  purchaseOutcome: PurchaseResult;
  /** What the store says this account already owns. */
  ownedTransactions: string[];
  /** Raw product rows, exactly as a store SDK would hand them over. */
  products: unknown[];
  /** Set to make product loading fail, standing in for a store outage. */
  productsThrow: Error | null;
  /** Set to make restore fail at the store. */
  restoreThrow: Error | null;
  /**
   * What the server would grant once a restore re-submits the store's receipt. Stands in for `purchases-verify`
   * being called with each restored transaction; null means the server still finds nothing.
   */
  grantOnRestore: Partial<Entitlement> | null;

  entitlementReads: number;
  purchaseCalls: ProductId[];
  restoreCalls: number;

  /** The server granting premium — the only thing in this fake that can. */
  grantFromServer: (over?: Partial<Entitlement>) => void;
  /** The server revoking it: an expired subscription, a refund, a cancellation that has run out. */
  revokeFromServer: (over?: Partial<Entitlement>) => void;
  reset: () => void;
}

export const FAKE_USER = "00000000-0000-4000-a000-00000000fe01";

export function createFakeBillingBackend(): FakeBillingBackend {
  const backend: FakeBillingBackend = {
    entitlement: null,
    offline: false,
    purchaseOutcome: { outcome: "cancelled" },
    ownedTransactions: [],
    products: [],
    productsThrow: null,
    restoreThrow: null,
    grantOnRestore: null,
    entitlementReads: 0,
    purchaseCalls: [],
    restoreCalls: 0,

    grantFromServer: (over = {}) => {
      backend.entitlement = {
        id: "00000000-0000-4000-a000-00000000ee01",
        userId: FAKE_USER,
        isPremiumActive: true,
        source: "active",
        expiresAt: "2026-10-12T00:00:00.000Z",
        createdAt: TS,
        updatedAt: TS,
        ...over,
      };
    },

    revokeFromServer: (over = {}) => {
      backend.entitlement = {
        id: "00000000-0000-4000-a000-00000000ee01",
        userId: FAKE_USER,
        isPremiumActive: false,
        source: "expired",
        expiresAt: "2026-09-01T00:00:00.000Z",
        createdAt: TS,
        updatedAt: TS,
        ...over,
      };
    },

    reset: () => {
      backend.entitlement = null;
      backend.offline = false;
      backend.purchaseOutcome = { outcome: "cancelled" };
      backend.ownedTransactions = [];
      backend.products = [];
      backend.productsThrow = null;
      backend.restoreThrow = null;
      backend.grantOnRestore = null;
      backend.entitlementReads = 0;
      backend.purchaseCalls = [];
      backend.restoreCalls = 0;
    },
  };

  return backend;
}

/** The `BillingProvider` surface, backed by the fake. Mirrors what `StoreBillingProvider` does, without a store. */
export function fakeProviderFor(backend: FakeBillingBackend) {
  return {
    getEntitlement(): Promise<Entitlement | null> {
      backend.entitlementReads += 1;
      if (backend.offline) {
        return Promise.reject(new Error("offline"));
      }
      return Promise.resolve(backend.entitlement);
    },

    getAvailableProducts(): Promise<StoreProductInfo[]> {
      if (backend.productsThrow) return Promise.reject(backend.productsThrow);
      return Promise.resolve(backend.products as StoreProductInfo[]);
    },

    purchase(productId: ProductId): Promise<PurchaseResult> {
      backend.purchaseCalls.push(productId);
      /**
       * Note what is missing: nothing here touches `backend.entitlement`. A store purchase is not a grant, and a
       * test that expects one has to have the server grant it — the same order the real system works in.
       */
      return Promise.resolve(backend.purchaseOutcome);
    },

    restorePurchases(): Promise<{
      restored: boolean;
      entitlement: Entitlement | null;
    }> {
      backend.restoreCalls += 1;
      if (backend.restoreThrow) return Promise.reject(backend.restoreThrow);
      // The real provider verifies each restored transaction with the server, which may then grant.
      if (backend.grantOnRestore)
        backend.grantFromServer(backend.grantOnRestore);
      return Promise.resolve({
        restored: backend.ownedTransactions.length > 0,
        entitlement: backend.entitlement,
      });
    },
  };
}

export const MONTHLY_PRODUCT = {
  productId: "premium_monthly",
  localizedPrice: "$4.99",
  localizedPricePerPeriod: "$4.99/month",
  trialDurationDays: null,
};

export const ANNUAL_PRODUCT = {
  productId: "premium_annual",
  localizedPrice: "$39.99",
  localizedPricePerPeriod: "$39.99/year",
  trialDurationDays: null,
};
