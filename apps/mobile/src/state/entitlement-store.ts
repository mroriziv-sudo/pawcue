import { create } from "zustand";
import {
  BillingNotConfiguredError,
  IDLE_PURCHASE,
  IDLE_RESTORE,
  PURCHASE_FAILURE,
  purchaseReducer,
  resolveEntitlement,
  restoreReducer,
  UNKNOWN_ENTITLEMENT,
  type EntitlementSnapshot,
  type EntitlementView,
  type ProductCatalogue,
  type ProductId,
  type PurchaseFlowState,
  type RestoreFlowState,
} from "@pawcue/domain";
import { reconcileStoreProducts } from "@pawcue/domain";
import {
  clearCachedEntitlement,
  readCachedEntitlement,
  toSnapshot,
  writeCachedEntitlement,
} from "../billing/entitlement-repository";
import {
  billingProvider,
  isStoreBillingConfigured,
} from "../billing/store-billing-provider";
import { devEntitlementOverride } from "../billing/dev-billing";
import { uuidV4 } from "../lib/uuid";

/**
 * The app's single source of premium access.
 *
 * Today, Train, the lesson overview, the paywall and Settings all read `view.isPremiumActive` from here. Nothing
 * else in the app decides premium, and nothing here decides it either: the view is produced by the domain policy
 * from the server's answer and the last cached one, so "is this user premium" has exactly one implementation.
 *
 * ## What this store owns
 *
 *  - **when** the server is asked, and that it is asked once at a time
 *  - **what is remembered** between launches, and under whose identity
 *  - the purchase and restore flows, forwarded to the domain reducers that hold their rules
 *
 * It deliberately does not own the *policy*. Nothing here decides that a cached answer is too old, or that an
 * expired date beats an active flag — those live in `resolveEntitlement`, where they are tested without React.
 */

export interface EntitlementState {
  view: EntitlementView;
  /** True while a verification is in flight. Distinct from `unknown`, which is about what we know. */
  refreshing: boolean;
  /** The identity the current view belongs to. */
  userId: string | null;

  /**
   * The raw material `view` is projected from, held as state rather than in a module variable.
   *
   * Keeping it here means the answer and the evidence for it can never drift apart, a re-projection after a
   * development override needs no second copy, and — the reason it moved — a process restart is expressible: a
   * fresh launch starts from these initial values while the cache on disk survives, which is precisely the case
   * the offline policy exists for.
   */
  verified: EntitlementSnapshot | null;
  cached: EntitlementSnapshot | null;
  verificationFailed: boolean;

  products: ProductCatalogue | null;
  productsLoading: boolean;
  /** i18n key describing why products could not be loaded, or null. */
  productsErrorKey: string | null;

  purchase: PurchaseFlowState;
  restore: RestoreFlowState;

  /** Reads the cached answer for this identity, then verifies against the server. */
  initialize: (userId: string) => Promise<void>;
  refresh: () => Promise<void>;
  loadProducts: () => Promise<void>;
  buy: (productId: ProductId) => Promise<void>;
  restorePurchases: () => Promise<void>;
  resetPurchase: () => void;
  resetRestore: () => void;
  /** Forgets everything, including the cached answer. Used on sign-out. */
  clear: () => Promise<void>;
  /** Development only; a no-op in a release build. Re-resolves the view through the override. */
  applyDevOverride: () => void;
}

/** One verification at a time per identity, for the same reason the plan store guards generation. */
const inFlight = new Map<string, Promise<void>>();

export function resetEntitlementGuards(): void {
  inFlight.clear();
}

/** What the store knows before it has been told anything. Exported so a test can express a cold launch. */
export const INITIAL_ENTITLEMENT_MEMORY = {
  view: UNKNOWN_ENTITLEMENT,
  refreshing: false,
  userId: null,
  verified: null,
  cached: null,
  verificationFailed: false,
  products: null,
  productsLoading: false,
  productsErrorKey: null,
  purchase: IDLE_PURCHASE,
  restore: IDLE_RESTORE,
} as const;

type Known = Pick<
  EntitlementState,
  "verified" | "cached" | "verificationFailed"
>;

function project(known: Known): EntitlementView {
  /**
   * The development override is consulted first and nowhere else.
   *
   * `devEntitlementOverride` returns null in a release build before reading any state, so this line compiles to
   * "use the real view" in anything shipped. Putting the check here rather than in each screen means there is one
   * place a simulated entitlement can enter the app.
   */
  const override = devEntitlementOverride();
  if (override) return override;

  return resolveEntitlement({
    verified: known.verified,
    cached: known.cached,
    verificationFailed: known.verificationFailed,
    now: new Date().toISOString(),
  });
}

function failureKey(error: unknown): string {
  if (error instanceof BillingNotConfiguredError) {
    return PURCHASE_FAILURE.notConfigured;
  }
  return PURCHASE_FAILURE.unknown;
}

export const useEntitlementStore = create<EntitlementState>((set, get) => ({
  ...INITIAL_ENTITLEMENT_MEMORY,

  initialize: async (userId) => {
    if (get().userId !== userId) {
      // A different identity starts from nothing: the previous user's answer is not evidence about this one.
      const fresh: Known = {
        verified: null,
        cached: null,
        verificationFailed: false,
      };
      set({ userId, ...fresh, view: project(fresh) });
    }

    /**
     * The cached answer first, and without waiting for the network.
     *
     * A premium user must not see their own content locked for the second it takes to reach the server. The cache
     * is only ever *evidence* — `resolveEntitlement` decides whether it may still be honoured — so reading it
     * early grants nothing that a fresh answer would not.
     */
    const cached = await readCachedEntitlement(userId);
    const withCache: Known = {
      verified: get().verified,
      cached,
      verificationFailed: get().verificationFailed,
    };
    set({ ...withCache, view: project(withCache) });

    await get().refresh();
  },

  refresh: async () => {
    const userId = get().userId;
    if (!userId) return;

    const existing = inFlight.get(userId);
    if (existing) return existing;

    const run = (async () => {
      set({ refreshing: true });
      let next: Known;
      try {
        const entitlement = await billingProvider.getEntitlement();
        const snapshot = toSnapshot(entitlement);
        next = {
          verified: snapshot,
          cached: get().cached,
          verificationFailed: false,
        };
        // Cached only after a successful read, so the cache can never hold something the server never said.
        await writeCachedEntitlement(userId, snapshot);
      } catch {
        /**
         * Unreachable, or unconfigured.
         *
         * The last verified answer is not discarded: the offline policy decides whether it may still be honoured,
         * which is what stops a paying customer losing access to a dropped connection.
         */
        next = {
          verified: null,
          cached: get().cached,
          verificationFailed: true,
        };
      }
      set({ ...next, view: project(next), refreshing: false });
    })().finally(() => {
      inFlight.delete(userId);
    });

    inFlight.set(userId, run);
    return run;
  },

  loadProducts: async () => {
    set({ productsLoading: true, productsErrorKey: null });
    try {
      const raw = await billingProvider.getAvailableProducts();
      set({
        products: reconcileStoreProducts(raw),
        productsLoading: false,
      });
    } catch (error) {
      /**
       * An empty catalogue, not a crash.
       *
       * The paywall still has to render — a user who tapped "upgrade" is owed an explanation, and the close
       * button must work. `reconcileStoreProducts([])` gives the honest "nothing to offer" shape.
       */
      set({
        products: reconcileStoreProducts([]),
        productsLoading: false,
        productsErrorKey: failureKey(error),
      });
    }
  },

  buy: async (productId) => {
    const attemptId = uuidV4();
    const before = get().purchase;
    const started = purchaseReducer(before, {
      type: "begin",
      productId,
      attemptId,
    });
    // The reducer refuses a second attempt while one is running; an unchanged state means this tap was one.
    if (started === before) return;
    set({ purchase: started });

    let result;
    try {
      result = await billingProvider.purchase(productId);
    } catch (error) {
      result = { outcome: "failed" as const, reasonKey: failureKey(error) };
    }

    set({
      purchase: purchaseReducer(get().purchase, {
        type: "result",
        attemptId,
        result,
      }),
    });

    if (get().purchase.phase !== "verifying") return;

    /**
     * The store said yes; now ask the server.
     *
     * Only this answer can unlock anything. A store callback claiming success moves the flow to `verifying` and
     * no further — the invariant BILLING.md exists to protect.
     */
    await get().refresh();
    set({
      purchase: purchaseReducer(get().purchase, {
        type: "verified",
        attemptId,
        isPremiumActive: get().view.isPremiumActive,
      }),
    });
  },

  restorePurchases: async () => {
    const before = get().restore;
    const started = restoreReducer(before, { type: "begin" });
    if (started === before) return;
    set({ restore: started });

    let restored: boolean;
    try {
      const outcome = await billingProvider.restorePurchases();
      restored = outcome.restored;
    } catch (error) {
      set({
        restore: restoreReducer(get().restore, {
          type: "failed",
          messageKey: failureKey(error),
        }),
      });
      return;
    }

    set({
      restore: restoreReducer(get().restore, { type: "result", restored }),
    });
    if (get().restore.phase !== "verifying") return;

    await get().refresh();
    set({
      restore: restoreReducer(get().restore, {
        type: "verified",
        isPremiumActive: get().view.isPremiumActive,
      }),
    });
  },

  resetPurchase: () => set({ purchase: IDLE_PURCHASE }),
  resetRestore: () => set({ restore: IDLE_RESTORE }),

  /**
   * Sign-out, not relaunch.
   *
   * The cached answer is deleted from disk as well as memory, because the next identity on this device must start
   * from nothing. A relaunch is the other case — memory resets, the cache survives — and that is what makes
   * offline premium work across launches.
   */
  clear: async () => {
    inFlight.clear();
    await clearCachedEntitlement();
    set({ ...INITIAL_ENTITLEMENT_MEMORY });
  },

  applyDevOverride: () => {
    set({ view: project(get()) });
  },
}));

/** True when a real store is wired up. Drives the "billing is not available in this build" copy, nothing else. */
export function storeBillingAvailable(): boolean {
  return isStoreBillingConfigured();
}
