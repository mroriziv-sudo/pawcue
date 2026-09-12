import { NativeModules, Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";
import { PURCHASE_FAILURE, type ProductId } from "@pawcue/domain";
import { isKnownProductId } from "@pawcue/config";
import { env } from "../lib/env";
import {
  registerStoreBillingAdapter,
  type StoreBillingAdapter,
  type StorePurchase,
  type StorePurchaseOutcome,
} from "./store-billing-provider";

/**
 * The production `StoreBillingAdapter`, backed by RevenueCat over StoreKit 2 / Play Billing.
 *
 * This is the one file in the repository that imports the store SDK. Everything above it — the provider, the
 * store, the paywall — speaks the Phase 7 seam and does not know RevenueCat exists, which is what keeps the vendor
 * swappable and, more importantly, keeps the SDK's opinions about entitlement out of the app.
 *
 * ## What this adapter is allowed to believe
 *
 * Nothing about entitlement. `CustomerInfo.entitlements` is a client-side view maintained by the SDK; the app's
 * source of truth is the server's `entitlements` row, derived by `recompute_entitlement` from what RevenueCat's
 * REST API tells the server. So this adapter reports *what happened at the store* — a transaction id, a product
 * — and the provider hands that to `/purchases/verify`, which asks RevenueCat directly. A purchase that succeeds
 * here still unlocks nothing until the server says so (BILLING.md's one rule).
 *
 * ## Keys
 *
 * `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` are RevenueCat *public* SDK keys
 * (`appl_…` / `goog_…`). They are designed to ship in a client binary and grant nothing beyond what a device can
 * do anyway. The *secret* API key (`sk_…`) never appears here or under any `EXPO_PUBLIC_` name — it lives only in
 * the Edge Function environment (SECURITY.md).
 */

export const REVENUECAT_ADAPTER_LABEL = "RevenueCat";

/** The public SDK key for this platform, or undefined when the build is not configured for store billing. */
export function revenueCatPublicKey(): string | undefined {
  return Platform.select({
    ios: env.revenueCatIosKey,
    android: env.revenueCatAndroidKey,
    default: undefined,
  });
}

/**
 * True when the SDK's native half is actually in this binary.
 *
 * The JS package imports cleanly without it and only throws on the first method call. A development-client
 * build made before the dependency was added would otherwise register a "real" adapter that explodes on the
 * first tap, which is worse than the honest unavailable state.
 */
export function revenueCatNativeAvailable(): boolean {
  return Boolean((NativeModules as Record<string, unknown>)["RNPurchases"]);
}

/**
 * Two facts, kept apart on purpose.
 *
 * The SDK is configured at most once per process — RevenueCat treats a second `configure` as a misuse. Identity,
 * by contrast, changes: guest → account on merge, account → new guest on sign-out. So "is the SDK up" and "who is
 * it logged in as" are separate, and a reset clears only the second.
 */
let sdkConfigured = false;
let currentIdentity: string | null = null;

/**
 * Configures the SDK for an identity, once per process, and returns whether store billing is live.
 *
 * Called from bootstrap with the Supabase user id as RevenueCat's `appUserID`. Subsequent identity changes go
 * through `identifyRevenueCat`; the SDK is configured exactly once.
 *
 * Registration of the adapter happens here and only here, and only when both the key and the native module are
 * present. Absent either, the provider keeps throwing `BillingNotConfiguredError` and the paywall keeps saying
 * plans are unavailable — which is the truth.
 */
export async function configureRevenueCat(appUserId: string): Promise<boolean> {
  const apiKey = revenueCatPublicKey();
  if (!apiKey || !revenueCatNativeAvailable()) {
    registerStoreBillingAdapter(null);
    return false;
  }

  if (!sdkConfigured) {
    if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey, appUserID: appUserId });
    sdkConfigured = true;
    currentIdentity = appUserId;
  } else if (currentIdentity !== appUserId) {
    await identifyRevenueCat(appUserId);
  }

  registerStoreBillingAdapter(revenueCatAdapter);
  return true;
}

/**
 * Moves the SDK to a new identity.
 *
 * Used after the guest → account merge: the Supabase user id changes from the anonymous id to the account's, and
 * RevenueCat must follow so that the subscription bought as a guest is attributed to the account. With the
 * project's default restore behaviour ("transfer to new App User ID"), `logIn` moves the purchase across and the
 * server receives a `TRANSFER` webhook that re-parents the `subscriptions` row — see docs.
 */
export async function identifyRevenueCat(appUserId: string): Promise<void> {
  if (!sdkConfigured) return;
  if (currentIdentity === appUserId) return;
  await Purchases.logIn(appUserId);
  currentIdentity = appUserId;
}

/**
 * Detaches the SDK from the current identity.
 *
 * On sign-out the app creates a *new* anonymous Supabase user, so the next `configureRevenueCat` call logs the SDK
 * into that id. `logOut` first is what stops the previous account's `CustomerInfo` lingering in the SDK's cache
 * under the new identity. RevenueCat refuses to log out an already-anonymous id; that is not an error here.
 */
export async function resetRevenueCatIdentity(): Promise<void> {
  if (!sdkConfigured) return;
  try {
    await Purchases.logOut();
  } catch (error) {
    if (
      errorCode(error) !== PURCHASES_ERROR_CODE.LOG_OUT_ANONYMOUS_USER_ERROR
    ) {
      throw error;
    }
  }
  // The SDK stays configured; only who it speaks for is forgotten.
  currentIdentity = null;
}

/** Test seam. */
export function resetRevenueCatForTests(): void {
  sdkConfigured = false;
  currentIdentity = null;
}

/* -------------------------------------------------------------------------- */
/* Adapter                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * ISO-8601 period → whole days, for the free-trial disclosure. `P7D` → 7, `P1W` → 7, `P1M` → 30, `P1Y` → 365.
 *
 * Only ever used to say "N days free"; anything unrecognised reports no trial rather than a guessed one.
 */
export function trialDays(
  intro: {
    price: number;
    periodUnit: string;
    periodNumberOfUnits: number;
  } | null,
): number | null {
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits;
  if (!Number.isFinite(n) || n <= 0) return null;
  switch (intro.periodUnit.toUpperCase()) {
    case "DAY":
      return n;
    case "WEEK":
      return n * 7;
    case "MONTH":
      return n * 30;
    case "YEAR":
      return n * 365;
    default:
      return null;
  }
}

/** One store package → the raw product row the provider validates through `reconcileStoreProducts`. */
export function packageToProductRow(pkg: PurchasesPackage): unknown {
  const product = pkg.product;
  return {
    productId: product.identifier,
    localizedPrice: product.priceString,
    // The store already formats this per locale; the period word is added by the paywall from configuration.
    localizedPricePerPeriod: product.priceString,
    trialDurationDays: trialDays(product.introPrice),
  };
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/**
 * Maps a store failure onto the app's failure vocabulary.
 *
 * Every branch is an i18n key. Nothing the SDK says ever reaches a screen verbatim.
 */
export function outcomeForError(error: unknown): StorePurchaseOutcome {
  switch (errorCode(error)) {
    case PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR:
      return { outcome: "cancelled" };
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return { outcome: "pending" };
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
    case PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR:
      // Not a failure: the store says this account owns it. The flow reconciles with the server.
      return { outcome: "failed", reasonKey: PURCHASE_FAILURE.alreadyOwned };
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
    case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
      return { outcome: "failed", reasonKey: PURCHASE_FAILURE.network };
    case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
    case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
      return {
        outcome: "failed",
        reasonKey: PURCHASE_FAILURE.storeUnavailable,
      };
    case PURCHASES_ERROR_CODE.CONFIGURATION_ERROR:
    case PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR:
      return { outcome: "failed", reasonKey: PURCHASE_FAILURE.notConfigured };
    default:
      return { outcome: "failed", reasonKey: PURCHASE_FAILURE.unknown };
  }
}

/**
 * What the store says this account holds, as transactions the server can look up.
 *
 * Only known products, only subscriptions with a transaction id. Anything else is not something the server
 * could verify, so it is not something worth telling it about.
 */
export function purchasesFromCustomerInfo(info: CustomerInfo): StorePurchase[] {
  const purchases: StorePurchase[] = [];
  for (const [productId, subscription] of Object.entries(
    info.subscriptionsByProductIdentifier ?? {},
  )) {
    if (!isKnownProductId(productId)) continue;
    const transactionId = subscription.storeTransactionId;
    if (!transactionId) continue;
    purchases.push({ storeTransactionId: transactionId, productId });
  }
  return purchases;
}

async function packageFor(
  productId: ProductId,
): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return null;
  return (
    current.availablePackages.find(
      (pkg) => pkg.product.identifier === productId,
    ) ?? null
  );
}

export const revenueCatAdapter: StoreBillingAdapter = {
  label: REVENUECAT_ADAPTER_LABEL,

  /**
   * The current offering's packages, as raw rows.
   *
   * "Current" is the offering RevenueCat's dashboard marks as such; product identifiers must match this app's
   * `BILLING_PRODUCTS` exactly or `reconcileStoreProducts` drops them as unrecognised — which is the honest
   * outcome for a console that is configured differently from the code.
   */
  async getAvailableProducts(): Promise<unknown[]> {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return [];
    return current.availablePackages.map(packageToProductRow);
  },

  async purchase(productId: ProductId): Promise<StorePurchaseOutcome> {
    const pkg = await packageFor(productId);
    if (!pkg) {
      return {
        outcome: "failed",
        reasonKey: PURCHASE_FAILURE.storeUnavailable,
      };
    }

    try {
      const result = await Purchases.purchasePackage(pkg);
      /**
       * The store said yes. This adapter says only that, and only in the store's own terms: the transaction id
       * and the product the store reports — never the product that was *asked* for, in case they differ.
       */
      const purchasedId = result.productIdentifier;
      if (!isKnownProductId(purchasedId)) {
        return { outcome: "failed", reasonKey: PURCHASE_FAILURE.unknown };
      }
      return {
        outcome: "purchased",
        purchase: {
          storeTransactionId: result.transaction.transactionIdentifier,
          productId: purchasedId,
        },
      };
    } catch (error) {
      return outcomeForError(error);
    }
  },

  async restorePurchases(): Promise<StorePurchase[]> {
    const info = await Purchases.restorePurchases();
    return purchasesFromCustomerInfo(info);
  },
};
