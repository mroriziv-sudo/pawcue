import { NativeModules } from "react-native";
import { PURCHASE_FAILURE } from "@pawcue/domain";
import {
  configureRevenueCat,
  identifyRevenueCat,
  outcomeForError,
  packageToProductRow,
  purchasesFromCustomerInfo,
  resetRevenueCatForTests,
  resetRevenueCatIdentity,
  revenueCatAdapter,
  revenueCatNativeAvailable,
  trialDays,
} from "../src/billing/revenuecat-adapter";
import {
  isStoreBillingConfigured,
  registerStoreBillingAdapter,
  storeBillingLabel,
} from "../src/billing/store-billing-provider";
import { env } from "../src/lib/env";

/**
 * The RevenueCat adapter, against a fake of the SDK's shape.
 *
 * What is being protected: that the adapter reports what the store said and nothing more. It never turns a
 * `CustomerInfo` into an entitlement, never invents a product it was not told about, and maps every store failure
 * onto a key the UI can translate. The real SDK is never loaded under Jest — `__mocks__/react-native-purchases.ts`
 * stands in — so these are tests of the adapter's decisions, not of RevenueCat.
 */

/**
 * The fake `moduleNameMapper` substitutes for the SDK. Required through the same specifier the adapter uses, so
 * this is the very instance the adapter is talking to — not a second copy with its own state.
 */
const { __rcMock, __resetRcMock, PURCHASES_ERROR_CODE } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-native-purchases") as typeof import("../__mocks__/react-native-purchases");

const mutableEnv = env as { revenueCatIosKey?: string | undefined };
const nativeModules = NativeModules as Record<string, unknown>;

function withNative(present: boolean) {
  if (present)
    nativeModules["RNPurchases"] = { setupPurchases: () => undefined };
  else delete nativeModules["RNPurchases"];
}

const USER_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

function monthlyPackage(over: Record<string, unknown> = {}) {
  return {
    identifier: "$rc_monthly",
    packageType: "MONTHLY",
    product: {
      identifier: "premium_monthly",
      priceString: "₪19.90",
      price: 19.9,
      currencyCode: "ILS",
      introPrice: null,
      subscriptionPeriod: "P1M",
      ...over,
    },
  };
}

function annualPackage() {
  return {
    identifier: "$rc_annual",
    packageType: "ANNUAL",
    product: {
      identifier: "premium_annual",
      priceString: "₪149.90",
      price: 149.9,
      currencyCode: "ILS",
      introPrice: {
        price: 0,
        priceString: "₪0.00",
        periodUnit: "DAY",
        periodNumberOfUnits: 7,
        cycles: 1,
        period: "P7D",
      },
      subscriptionPeriod: "P1Y",
    },
  };
}

beforeEach(() => {
  __resetRcMock();
  resetRevenueCatForTests();
  registerStoreBillingAdapter(null);
  mutableEnv.revenueCatIosKey = "appl_test_public_key";
  withNative(true);
});

afterEach(() => {
  mutableEnv.revenueCatIosKey = undefined;
  withNative(false);
  registerStoreBillingAdapter(null);
});

describe("configuration and registration", () => {
  it("registers the adapter only when a key and the native module are both present", async () => {
    expect(await configureRevenueCat(USER_A)).toBe(true);
    expect(isStoreBillingConfigured()).toBe(true);
    expect(storeBillingLabel()).toBe("RevenueCat");
    expect(__rcMock.configured).toEqual({
      apiKey: "appl_test_public_key",
      appUserID: USER_A,
    });
  });

  it("leaves billing honestly unavailable without a public key", async () => {
    mutableEnv.revenueCatIosKey = undefined;
    expect(await configureRevenueCat(USER_A)).toBe(false);
    expect(isStoreBillingConfigured()).toBe(false);
    expect(__rcMock.configured).toBeNull();
  });

  it("leaves billing unavailable when the native module is not in this binary", async () => {
    // A development client built before the dependency was added must not register an adapter that explodes.
    withNative(false);
    expect(revenueCatNativeAvailable()).toBe(false);
    expect(await configureRevenueCat(USER_A)).toBe(false);
    expect(isStoreBillingConfigured()).toBe(false);
  });

  it("configures the SDK once and switches identity thereafter", async () => {
    await configureRevenueCat(USER_A);
    await configureRevenueCat(USER_B);
    // Second call did not reconfigure; it logged in.
    expect(__rcMock.configured?.appUserID).toBe(USER_A);
    expect(__rcMock.logInCalls).toEqual([USER_B]);
    expect(__rcMock.appUserId).toBe(USER_B);
  });
});

describe("identity lifecycle", () => {
  it("follows the guest → account merge with a logIn", async () => {
    await configureRevenueCat(USER_A);
    await identifyRevenueCat(USER_B);
    expect(__rcMock.logInCalls).toEqual([USER_B]);
  });

  it("does not log in again for the identity it already has", async () => {
    await configureRevenueCat(USER_A);
    await identifyRevenueCat(USER_A);
    expect(__rcMock.logInCalls).toEqual([]);
  });

  it("is a no-op before the SDK is configured", async () => {
    await identifyRevenueCat(USER_B);
    expect(__rcMock.logInCalls).toEqual([]);
  });

  it("logs out on reset so the next identity does not inherit cached customer info", async () => {
    await configureRevenueCat(USER_A);
    await resetRevenueCatIdentity();
    expect(__rcMock.logOutCalls).toBe(1);

    // The next configure logs the still-configured SDK into the new identity; it never configures twice.
    await configureRevenueCat(USER_B);
    expect(__rcMock.logInCalls).toEqual([USER_B]);
    expect(__rcMock.configured?.appUserID).toBe(USER_A);
  });

  it("tolerates the SDK refusing to log out an anonymous id", async () => {
    await configureRevenueCat(USER_A);
    __rcMock.appUserId = "$RCAnonymousID:x";
    await expect(resetRevenueCatIdentity()).resolves.toBeUndefined();
  });
});

describe("products", () => {
  it("maps the current offering's packages to raw rows with the store's own price string", async () => {
    __rcMock.offerings = {
      current: { availablePackages: [monthlyPackage(), annualPackage()] },
    };
    const rows = await revenueCatAdapter.getAvailableProducts();
    expect(rows).toEqual([
      {
        productId: "premium_monthly",
        localizedPrice: "₪19.90",
        localizedPricePerPeriod: "₪19.90",
        trialDurationDays: null,
      },
      {
        productId: "premium_annual",
        localizedPrice: "₪149.90",
        localizedPricePerPeriod: "₪149.90",
        trialDurationDays: 7,
      },
    ]);
  });

  it("returns nothing when there is no current offering", async () => {
    __rcMock.offerings = { current: null };
    expect(await revenueCatAdapter.getAvailableProducts()).toEqual([]);
  });

  it("passes unknown product ids through for the reconciler to refuse, rather than hiding them", async () => {
    __rcMock.offerings = {
      current: {
        availablePackages: [monthlyPackage({ identifier: "premium_lifetime" })],
      },
    };
    const rows = (await revenueCatAdapter.getAvailableProducts()) as Array<{
      productId: string;
    }>;
    expect(rows[0]?.productId).toBe("premium_lifetime");
  });

  it("discloses a trial only when the intro price is free", () => {
    expect(
      trialDays({ price: 0, periodUnit: "DAY", periodNumberOfUnits: 7 }),
    ).toBe(7);
    expect(
      trialDays({ price: 0, periodUnit: "WEEK", periodNumberOfUnits: 1 }),
    ).toBe(7);
    expect(
      trialDays({ price: 0, periodUnit: "MONTH", periodNumberOfUnits: 1 }),
    ).toBe(30);
    // A paid introductory price is a discount, not a trial, and must not be disclosed as "days free".
    expect(
      trialDays({ price: 0.99, periodUnit: "DAY", periodNumberOfUnits: 7 }),
    ).toBeNull();
    expect(trialDays(null)).toBeNull();
    expect(
      trialDays({ price: 0, periodUnit: "FORTNIGHT", periodNumberOfUnits: 1 }),
    ).toBeNull();
  });

  it("never fabricates a price", () => {
    const row = packageToProductRow(
      monthlyPackage({ priceString: "" }) as never,
    ) as { localizedPrice: string };
    // An empty price string is passed through as empty; `reconcileStoreProducts` then drops the product.
    expect(row.localizedPrice).toBe("");
  });
});

describe("purchase", () => {
  beforeEach(() => {
    __rcMock.offerings = {
      current: { availablePackages: [monthlyPackage(), annualPackage()] },
    };
  });

  it("reports the store's transaction and product on success — and nothing about entitlement", async () => {
    __rcMock.purchaseResult = {
      productIdentifier: "premium_monthly",
      transaction: {
        transactionIdentifier: "2000000123456789",
        productIdentifier: "premium_monthly",
      },
      customerInfo: {
        entitlements: { active: { premium: { isActive: true } } },
      },
    };

    const outcome = await revenueCatAdapter.purchase("premium_monthly");

    expect(outcome).toEqual({
      outcome: "purchased",
      purchase: {
        storeTransactionId: "2000000123456789",
        productId: "premium_monthly",
      },
    });
    // The shape has no room for `isPremium` or `entitlement`. The server decides.
    expect(JSON.stringify(outcome)).not.toMatch(/entitle|isPremium|isActive/);
  });

  it("reports the product the store says was bought, not the one that was asked for", async () => {
    __rcMock.purchaseResult = {
      productIdentifier: "premium_annual",
      transaction: {
        transactionIdentifier: "tx-a",
        productIdentifier: "premium_annual",
      },
      customerInfo: {},
    };
    const outcome = await revenueCatAdapter.purchase("premium_monthly");
    expect(outcome).toMatchObject({
      outcome: "purchased",
      purchase: { productId: "premium_annual" },
    });
  });

  it("fails safely when the store returns a product this app does not sell", async () => {
    __rcMock.purchaseResult = {
      productIdentifier: "premium_lifetime",
      transaction: {
        transactionIdentifier: "tx-x",
        productIdentifier: "premium_lifetime",
      },
      customerInfo: {},
    };
    expect(await revenueCatAdapter.purchase("premium_monthly")).toEqual({
      outcome: "failed",
      reasonKey: PURCHASE_FAILURE.unknown,
    });
  });

  it("reports store-unavailable when the product is not in the current offering", async () => {
    __rcMock.offerings = { current: { availablePackages: [annualPackage()] } };
    expect(await revenueCatAdapter.purchase("premium_monthly")).toEqual({
      outcome: "failed",
      reasonKey: PURCHASE_FAILURE.storeUnavailable,
    });
  });

  it.each([
    [PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR, { outcome: "cancelled" }],
    [PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR, { outcome: "pending" }],
    [
      PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR,
      { outcome: "failed", reasonKey: PURCHASE_FAILURE.alreadyOwned },
    ],
    [
      PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR,
      { outcome: "failed", reasonKey: PURCHASE_FAILURE.alreadyOwned },
    ],
    [
      PURCHASES_ERROR_CODE.NETWORK_ERROR,
      { outcome: "failed", reasonKey: PURCHASE_FAILURE.network },
    ],
    [
      PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR,
      { outcome: "failed", reasonKey: PURCHASE_FAILURE.network },
    ],
    [
      PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR,
      { outcome: "failed", reasonKey: PURCHASE_FAILURE.storeUnavailable },
    ],
    [
      PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR,
      { outcome: "failed", reasonKey: PURCHASE_FAILURE.storeUnavailable },
    ],
    [
      PURCHASES_ERROR_CODE.CONFIGURATION_ERROR,
      { outcome: "failed", reasonKey: PURCHASE_FAILURE.notConfigured },
    ],
    [
      PURCHASES_ERROR_CODE.UNKNOWN_ERROR,
      { outcome: "failed", reasonKey: PURCHASE_FAILURE.unknown },
    ],
  ])(
    "maps store error code %s onto the app's vocabulary",
    async (code, expected) => {
      __rcMock.purchaseError = {
        code,
        message: "provider text that must never reach a screen",
      };
      const outcome = await revenueCatAdapter.purchase("premium_monthly");
      expect(outcome).toEqual(expected);
      expect(JSON.stringify(outcome)).not.toContain("provider text");
    },
  );

  it("treats an error without a code as unknown, not as success", () => {
    expect(outcomeForError(new Error("boom"))).toEqual({
      outcome: "failed",
      reasonKey: PURCHASE_FAILURE.unknown,
    });
    expect(outcomeForError(null)).toEqual({
      outcome: "failed",
      reasonKey: PURCHASE_FAILURE.unknown,
    });
  });
});

describe("restore", () => {
  it("returns the known subscriptions the store holds, with their transaction ids", async () => {
    __rcMock.customerInfo = {
      subscriptionsByProductIdentifier: {
        premium_monthly: { storeTransactionId: "tx-m", isActive: true },
        premium_annual: { storeTransactionId: "tx-a", isActive: false },
        premium_lifetime: { storeTransactionId: "tx-x", isActive: true },
        other_app_thing: { storeTransactionId: "tx-o", isActive: true },
      },
    };
    const purchases = await revenueCatAdapter.restorePurchases();
    expect(purchases.map((p) => p.storeTransactionId).sort()).toEqual([
      "tx-a",
      "tx-m",
    ]);
  });

  it("reports nothing to restore as an empty list, never as a failure", async () => {
    __rcMock.customerInfo = { subscriptionsByProductIdentifier: {} };
    expect(await revenueCatAdapter.restorePurchases()).toEqual([]);
  });

  it("omits a subscription the store cannot name a transaction for", async () => {
    expect(
      purchasesFromCustomerInfo({
        subscriptionsByProductIdentifier: {
          premium_monthly: { storeTransactionId: null },
        },
      } as never),
    ).toEqual([]);
  });

  it("does not read entitlement out of customer info", async () => {
    __rcMock.customerInfo = {
      subscriptionsByProductIdentifier: {
        premium_monthly: { storeTransactionId: "tx-m" },
      },
      entitlements: { active: { premium: { isActive: true } } },
    };
    const purchases = await revenueCatAdapter.restorePurchases();
    expect(JSON.stringify(purchases)).not.toMatch(/entitle|isActive/);
  });
});
