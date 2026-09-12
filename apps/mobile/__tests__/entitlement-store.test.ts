import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BillingNotConfiguredError,
  ENTITLEMENT_OFFLINE_GRACE_DAYS,
  PURCHASE_FAILURE,
} from "@pawcue/domain";
import { BILLING_PRODUCTS } from "@pawcue/config";
import type { ProductId } from "@pawcue/domain";
import {
  useEntitlementStore,
  resetEntitlementGuards,
  INITIAL_ENTITLEMENT_MEMORY,
} from "../src/state/entitlement-store";
import { STORAGE_KEYS } from "../src/lib/storage";
import {
  ANNUAL_PRODUCT,
  createFakeBillingBackend,
  fakeProviderFor,
  FAKE_USER,
  MONTHLY_PRODUCT,
} from "./support/fake-billing-backend";

/**
 * The entitlement store, driven exactly as the app drives it.
 *
 * The invariant under test throughout is that **premium comes from the server and nowhere else**. A purchase
 * callback cannot produce it, a cache belonging to another identity cannot produce it, and an unreachable server
 * cannot produce it either. The fake backend is built so that a test asserting premium has to make the server
 * grant it first.
 */

const backend = createFakeBillingBackend();

jest.mock("../src/billing/store-billing-provider", () => {
  const {
    createFakeBillingBackend: create,
  } = require("./support/fake-billing-backend");
  void create;
  return {
    billingProvider: {
      getEntitlement: () => mockProvider.getEntitlement(),
      getAvailableProducts: () => mockProvider.getAvailableProducts(),
      purchase: (id: ProductId) => mockProvider.purchase(id),
      restorePurchases: () => mockProvider.restorePurchases(),
    },
    isStoreBillingConfigured: () => true,
    storeBillingLabel: () => null,
    registerStoreBillingAdapter: jest.fn(),
  };
});

// Assigned after the mock factory runs; the factory only closes over the reference.
const mockProvider = fakeProviderFor(backend);

const store = () => useEntitlementStore.getState();

/**
 * What a relaunch does, and what it does not.
 *
 * The process starts over, so everything the store held in memory is gone. The cache on disk is not — that is the
 * whole point of writing it, and the difference between this and `clear()` (which is sign-out) is the difference
 * between "reopened the app on a train" and "someone else's account".
 */
function simulateRelaunch(): void {
  resetEntitlementGuards();
  useEntitlementStore.setState({ ...INITIAL_ENTITLEMENT_MEMORY });
}

beforeEach(async () => {
  backend.reset();
  resetEntitlementGuards();
  await AsyncStorage.clear();
  await store().clear();
});

describe("what a user is entitled to", () => {
  it("settles on free when the server has no record of a subscription", async () => {
    await store().initialize(FAKE_USER);

    expect(store().view.status).toBe("free");
    expect(store().view.isPremiumActive).toBe(false);
  });

  it("is premium once the server says so", async () => {
    backend.grantFromServer();
    await store().initialize(FAKE_USER);

    expect(store().view.status).toBe("premium");
    expect(store().view.isPremiumActive).toBe(true);
  });

  it("reports an ended subscription as expired, not as never having subscribed", async () => {
    backend.revokeFromServer();
    await store().initialize(FAKE_USER);

    expect(store().view.status).toBe("expired");
    expect(store().view.isPremiumActive).toBe(false);
  });

  it("starts from unknown, before anything has been asked", () => {
    expect(store().view.status).toBe("unknown");
    expect(store().view.isPremiumActive).toBe(false);
  });

  it("cannot be premium when the server has never answered", async () => {
    backend.offline = true;
    await store().initialize(FAKE_USER);

    expect(store().view.status).toBe("billing_unavailable");
    expect(store().view.isPremiumActive).toBe(false);
  });

  it("picks up a change on refresh", async () => {
    await store().initialize(FAKE_USER);
    expect(store().view.isPremiumActive).toBe(false);

    backend.grantFromServer();
    await store().refresh();

    expect(store().view.isPremiumActive).toBe(true);
  });

  it("asks the server once when two refreshes overlap", async () => {
    await store().initialize(FAKE_USER);
    const reads = backend.entitlementReads;

    await Promise.all([store().refresh(), store().refresh()]);

    expect(backend.entitlementReads).toBe(reads + 1);
  });
});

describe("the offline cache", () => {
  it("keeps a paying customer premium across a relaunch with no connection", async () => {
    backend.grantFromServer();
    await store().initialize(FAKE_USER);
    expect(store().view.status).toBe("premium");

    simulateRelaunch();
    backend.offline = true;
    await store().initialize(FAKE_USER);

    expect(store().view.status).toBe("offline_cached");
    expect(store().view.isPremiumActive).toBe(true);
    expect(store().view.fromCache).toBe(true);
  });

  it("stops honouring the cache once it is older than the grace window", async () => {
    backend.grantFromServer();
    await store().initialize(FAKE_USER);

    // Age the stored answer past the window without touching anything else about it.
    const raw = JSON.parse(
      (await AsyncStorage.getItem(STORAGE_KEYS.entitlement)) ?? "{}",
    ) as Record<string, unknown>;
    await AsyncStorage.setItem(
      STORAGE_KEYS.entitlement,
      JSON.stringify({
        ...raw,
        verifiedAt: new Date(
          Date.now() - (ENTITLEMENT_OFFLINE_GRACE_DAYS + 1) * 86_400_000,
        ).toISOString(),
      }),
    );

    simulateRelaunch();
    backend.offline = true;
    await store().initialize(FAKE_USER);

    expect(store().view.status).toBe("billing_unavailable");
    expect(store().view.isPremiumActive).toBe(false);
  });

  it("a fresh install with no cache cannot be premium", async () => {
    await AsyncStorage.clear();
    simulateRelaunch();
    backend.offline = true;

    await store().initialize(FAKE_USER);

    expect(store().view.isPremiumActive).toBe(false);
  });

  it("never writes a cache the server did not produce", async () => {
    backend.offline = true;
    await store().initialize(FAKE_USER);

    expect(await AsyncStorage.getItem(STORAGE_KEYS.entitlement)).toBeNull();
  });

  it("does not hand one identity's premium to another on the same device", async () => {
    backend.grantFromServer();
    await store().initialize(FAKE_USER);
    expect(store().view.isPremiumActive).toBe(true);

    // A different account signs in on this device, and the server has nothing for them.
    await store().clear();
    backend.entitlement = null;
    backend.offline = true;
    await store().initialize("00000000-0000-4000-a000-00000000fe02");

    expect(store().view.isPremiumActive).toBe(false);
  });

  it("forgets the cached answer entirely on clear", async () => {
    backend.grantFromServer();
    await store().initialize(FAKE_USER);
    await store().clear();

    expect(await AsyncStorage.getItem(STORAGE_KEYS.entitlement)).toBeNull();
    expect(store().view.status).toBe("unknown");
  });
});

describe("guest becomes an account", () => {
  const GUEST = FAKE_USER;
  const ACCOUNT = "00000000-0000-4000-a000-00000000fe09";

  it("carries a subscription bought as a guest onto the account", async () => {
    backend.grantFromServer();
    await store().initialize(GUEST);
    expect(store().view.isPremiumActive).toBe(true);

    /*
      The merge re-parents `subscriptions` and recomputes the account's entitlement server-side, so the server
      answers premium for the new id too. The client's job is to ask again under that id.
    */
    backend.grantFromServer({ userId: ACCOUNT });
    await store().initialize(ACCOUNT);

    expect(store().userId).toBe(ACCOUNT);
    expect(store().view.isPremiumActive).toBe(true);
  });

  it("asks the server again rather than reusing the guest's cached answer", async () => {
    backend.grantFromServer();
    await store().initialize(GUEST);
    const reads = backend.entitlementReads;

    await store().initialize(ACCOUNT);

    expect(backend.entitlementReads).toBeGreaterThan(reads);
  });

  it("does not inherit the guest's premium when the account has none", async () => {
    backend.grantFromServer();
    await store().initialize(GUEST);
    expect(store().view.isPremiumActive).toBe(true);

    // A different account signs in — one the merge never happened for.
    backend.entitlement = null;
    await store().initialize(ACCOUNT);

    expect(store().view.isPremiumActive).toBe(false);
    expect(store().view.status).toBe("free");
  });

  it("does not inherit it offline either, where a cache is the only evidence", async () => {
    backend.grantFromServer();
    await store().initialize(GUEST);

    backend.offline = true;
    await store().initialize(ACCOUNT);

    // The cache is scoped by user id, so there is nothing here that could be mistaken for the account's answer.
    expect(store().view.isPremiumActive).toBe(false);
  });
});

describe("products", () => {
  it("offers both products when the store returns them", async () => {
    backend.products = [MONTHLY_PRODUCT, ANNUAL_PRODUCT];
    await store().loadProducts();

    expect(store().products?.products).toHaveLength(2);
    expect(store().productsErrorKey).toBeNull();
  });

  it("reports an empty catalogue rather than crashing when the store is unavailable", async () => {
    backend.productsThrow = new Error("store down");
    await store().loadProducts();

    expect(store().products?.empty).toBe(true);
    expect(store().productsErrorKey).toBe(PURCHASE_FAILURE.unknown);
  });

  it("names an unconfigured build specifically, so the copy can be honest about it", async () => {
    backend.productsThrow = new BillingNotConfiguredError("products");
    await store().loadProducts();

    expect(store().productsErrorKey).toBe(PURCHASE_FAILURE.notConfigured);
  });

  it("drops a product the build does not sell", async () => {
    backend.products = [
      MONTHLY_PRODUCT,
      { ...MONTHLY_PRODUCT, productId: "premium_lifetime" },
    ];
    await store().loadProducts();

    expect(store().products?.unrecognized).toEqual(["premium_lifetime"]);
    expect(store().products?.products).toHaveLength(1);
  });
});

describe("buying", () => {
  it("does not unlock on the store's callback alone", async () => {
    backend.purchaseOutcome = {
      outcome: "purchased",
      entitlement: {
        id: "x",
        userId: FAKE_USER,
        isPremiumActive: true,
        source: "active",
        expiresAt: null,
        createdAt: "",
        updatedAt: "",
      },
    };
    // The server is deliberately not told. This is the case that must not unlock.
    await store().initialize(FAKE_USER);
    await store().buy(BILLING_PRODUCTS.monthly);

    expect(store().view.isPremiumActive).toBe(false);
    expect(store().purchase.phase).toBe("failed");
    expect(store().purchase.messageKey).toBe(
      PURCHASE_FAILURE.verificationFailed,
    );
  });

  it("unlocks once the server confirms the purchase", async () => {
    await store().initialize(FAKE_USER);
    backend.purchaseOutcome = {
      outcome: "purchased",
      entitlement: {
        id: "x",
        userId: FAKE_USER,
        isPremiumActive: true,
        source: "active",
        expiresAt: null,
        createdAt: "",
        updatedAt: "",
      },
    };
    // The verification endpoint has done its work by the time the client re-reads.
    backend.grantFromServer();

    await store().buy(BILLING_PRODUCTS.monthly);

    expect(store().purchase.phase).toBe("unlocked");
    expect(store().view.isPremiumActive).toBe(true);
  });

  it("treats a cancellation as a cancellation, with nothing to apologise for", async () => {
    await store().initialize(FAKE_USER);
    backend.purchaseOutcome = { outcome: "cancelled" };

    await store().buy(BILLING_PRODUCTS.monthly);

    expect(store().purchase.phase).toBe("cancelled");
    expect(store().purchase.messageKey).toBeNull();
    expect(store().view.isPremiumActive).toBe(false);
  });

  it("reports a pending purchase without granting anything", async () => {
    await store().initialize(FAKE_USER);
    backend.purchaseOutcome = { outcome: "pending" };

    await store().buy(BILLING_PRODUCTS.monthly);

    expect(store().purchase.phase).toBe("pending");
    expect(store().view.isPremiumActive).toBe(false);
  });

  it("surfaces a failed purchase and grants nothing", async () => {
    await store().initialize(FAKE_USER);
    backend.purchaseOutcome = {
      outcome: "failed",
      reasonKey: PURCHASE_FAILURE.network,
    };

    await store().buy(BILLING_PRODUCTS.monthly);

    expect(store().purchase.phase).toBe("failed");
    expect(store().purchase.messageKey).toBe(PURCHASE_FAILURE.network);
    expect(store().view.isPremiumActive).toBe(false);
  });

  it("reconciles with the server when the store says the subscription is already owned", async () => {
    await store().initialize(FAKE_USER);
    backend.purchaseOutcome = {
      outcome: "failed",
      reasonKey: PURCHASE_FAILURE.alreadyOwned,
    };
    backend.grantFromServer();

    await store().buy(BILLING_PRODUCTS.monthly);

    expect(store().purchase.phase).toBe("unlocked");
    expect(store().view.isPremiumActive).toBe(true);
  });

  it("ignores a second tap while the store sheet is up", async () => {
    await store().initialize(FAKE_USER);
    backend.purchaseOutcome = { outcome: "cancelled" };

    await Promise.all([
      store().buy(BILLING_PRODUCTS.monthly),
      store().buy(BILLING_PRODUCTS.annual),
    ]);

    expect(backend.purchaseCalls).toEqual([BILLING_PRODUCTS.monthly]);
  });

  it("says so plainly when the build cannot sell anything", async () => {
    await store().initialize(FAKE_USER);
    mockProvider.purchase = () =>
      Promise.reject(new BillingNotConfiguredError("purchase"));

    await store().buy(BILLING_PRODUCTS.monthly);

    expect(store().purchase.messageKey).toBe(PURCHASE_FAILURE.notConfigured);
    expect(store().view.isPremiumActive).toBe(false);

    mockProvider.purchase = fakeProviderFor(backend).purchase;
  });
});

describe("restoring", () => {
  it("restores premium the server confirms", async () => {
    await store().initialize(FAKE_USER);
    backend.ownedTransactions = ["txn-1"];
    backend.grantFromServer();

    await store().restorePurchases();

    expect(store().restore.phase).toBe("restored");
    expect(store().view.isPremiumActive).toBe(true);
  });

  it("says there was nothing to restore rather than claiming success", async () => {
    await store().initialize(FAKE_USER);
    backend.ownedTransactions = [];

    await store().restorePurchases();

    expect(store().restore.phase).toBe("nothing_to_restore");
    expect(store().view.isPremiumActive).toBe(false);
  });

  it("does not claim a restore when the store has a purchase the server considers over", async () => {
    await store().initialize(FAKE_USER);
    backend.ownedTransactions = ["txn-1"];
    backend.revokeFromServer();

    await store().restorePurchases();

    expect(store().restore.phase).toBe("nothing_to_restore");
    expect(store().view.isPremiumActive).toBe(false);
  });

  it("is safe to press repeatedly", async () => {
    await store().initialize(FAKE_USER);
    backend.ownedTransactions = ["txn-1"];
    backend.grantFromServer();

    await store().restorePurchases();
    const first = store().restore;
    await store().restorePurchases();

    expect(store().restore).toEqual(first);
    expect(store().view.isPremiumActive).toBe(true);
  });

  it("ignores a second press while one is running", async () => {
    await store().initialize(FAKE_USER);
    backend.ownedTransactions = ["txn-1"];

    await Promise.all([store().restorePurchases(), store().restorePurchases()]);

    expect(backend.restoreCalls).toBe(1);
  });

  it("reports a store failure without changing what the user has", async () => {
    backend.grantFromServer();
    await store().initialize(FAKE_USER);
    backend.restoreThrow = new Error("store down");

    await store().restorePurchases();

    expect(store().restore.phase).toBe("failed");
    // The subscription they already had is untouched by a failed restore.
    expect(store().view.isPremiumActive).toBe(true);
  });
});
