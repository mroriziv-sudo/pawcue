import {
  BillingNotConfiguredError,
  PURCHASE_FAILURE,
  type BillingProvider,
  type Entitlement,
  type ProductId,
  type PurchaseResult,
  type StoreProductInfo,
} from "@pawcue/domain";
import { apiRoutes } from "@pawcue/config";
import { env } from "../lib/env";
import { supabase } from "../lib/supabase";
import { fetchEntitlement } from "./entitlement-repository";

/**
 * The concrete `BillingProvider`.
 *
 * Two halves, deliberately different in kind:
 *
 *   - **Entitlement** is fully real today. It reads the server's `entitlements` row through RLS, which is the only
 *     thing the architecture ever lets the client believe about paid access.
 *   - **Products, purchase and restore** need a store SDK (RevenueCat over StoreKit2 / Play Billing v8+, see
 *     BILLING.md) plus App Store Connect and Play Console configuration this project does not have. Those go
 *     through `StoreBillingAdapter` below and throw `BillingNotConfiguredError` until an adapter is registered.
 *
 * Nothing here returns a plausible-looking fake. That is the same call the auth layer made for Apple/Google
 * sign-in, for the same reason: a stubbed success makes the purchase path look tested when it has never run, and
 * the first time anyone finds out is in production.
 */

/** What a store purchase yields, before any of it is believed. */
export interface StorePurchase {
  /** The store's own transaction identifier — the idempotency key the server verifies and de-duplicates on. */
  storeTransactionId: string;
  productId: ProductId;
}

export type StorePurchaseOutcome =
  | { outcome: "purchased"; purchase: StorePurchase }
  | { outcome: "cancelled" }
  | { outcome: "pending" }
  | { outcome: "failed"; reasonKey: string };

/**
 * The seam a native billing SDK plugs into.
 *
 * Written as an interface with one registration point so adding `react-native-purchases` later is a new file and
 * a call to `registerStoreBillingAdapter` — not an edit spread through the paywall, the store and the provider.
 * Nothing in this repository imports a store SDK; that import belongs in the adapter and nowhere else.
 */
export interface StoreBillingAdapter {
  /** Raw rows as the SDK returns them. Validated by `reconcileStoreProducts`, never trusted as typed. */
  getAvailableProducts(): Promise<unknown[]>;
  purchase(productId: ProductId): Promise<StorePurchaseOutcome>;
  /** What the store says this account already owns. An empty list is a real answer: nothing to restore. */
  restorePurchases(): Promise<StorePurchase[]>;
  /** Shown in developer diagnostics so a simulated adapter can never be mistaken for the real one. */
  readonly label: string;
}

let adapter: StoreBillingAdapter | null = null;

export function registerStoreBillingAdapter(
  next: StoreBillingAdapter | null,
): void {
  adapter = next;
}

export function isStoreBillingConfigured(): boolean {
  return adapter !== null;
}

export function storeBillingLabel(): string | null {
  return adapter?.label ?? null;
}

function requireAdapter(
  capability: "products" | "purchase" | "restore",
): StoreBillingAdapter {
  if (!adapter) throw new BillingNotConfiguredError(capability);
  return adapter;
}

/**
 * Hands a store transaction to the server for verification.
 *
 * The body carries the store's transaction id and nothing else that matters — no user id, no product entitlement
 * claim, no `isPremium`. Identity comes from the bearer token, and what the transaction entitles is decided by the
 * server against the store's own records. A client that could assert either would be the Phase 0 privilege
 * escalation in billing form.
 */
async function verifyWithServer(purchase: StorePurchase): Promise<void> {
  if (!supabase) throw new BillingNotConfiguredError("purchase");

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new BillingNotConfiguredError("purchase");

  const response = await fetch(
    `${env.supabaseUrl}/functions/v1/purchases-verify`,
    {
      method: "POST",
      headers: {
        apikey: env.supabaseAnonKey ?? "",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        storeTransactionId: purchase.storeTransactionId,
        productId: purchase.productId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Purchase verification failed (${response.status}).`);
  }
}

export class StoreBillingProvider implements BillingProvider {
  async getAvailableProducts(): Promise<StoreProductInfo[]> {
    const raw = await requireAdapter("products").getAvailableProducts();
    // Returned unreconciled on purpose: validation is the caller's, so the paywall can report *why* a product is
    // missing rather than being handed a silently shortened list.
    return raw as StoreProductInfo[];
  }

  async purchase(productId: ProductId): Promise<PurchaseResult> {
    const outcome = await requireAdapter("purchase").purchase(productId);

    if (outcome.outcome !== "purchased") return outcome;

    try {
      await verifyWithServer(outcome.purchase);
    } catch {
      /**
       * Charged at the store, unverified by the server.
       *
       * Reported as a failure to *verify*, never as a failure to purchase, and never as a success. The purchase is
       * not lost: the store notification reaches the server independently, and Restore Purchases reconciles it.
       */
      return {
        outcome: "failed",
        reasonKey: PURCHASE_FAILURE.verificationFailed,
      };
    }

    const entitlement = await this.requireEntitlement();
    if (!entitlement) {
      return {
        outcome: "failed",
        reasonKey: PURCHASE_FAILURE.verificationFailed,
      };
    }
    return { outcome: "purchased", entitlement };
  }

  /**
   * Restore.
   *
   * Idempotent by construction: it asks the store what this account owns and re-submits each transaction for
   * verification, and the server upserts on `store_transaction_id`. Running it twice writes the same rows twice
   * and changes nothing — which is what makes the button safe to press when a user is unsure it worked.
   *
   * `restored` reports what the store returned. Whether that amounts to premium is the entitlement's answer, and
   * the two are returned separately so nothing can report a successful restore of an expired subscription.
   */
  async restorePurchases(): Promise<{
    restored: boolean;
    entitlement: Entitlement | null;
  }> {
    const purchases = await requireAdapter("restore").restorePurchases();

    for (const purchase of purchases) {
      await verifyWithServer(purchase);
    }

    return {
      restored: purchases.length > 0,
      entitlement: await this.getEntitlement(),
    };
  }

  async getEntitlement(): Promise<Entitlement | null> {
    if (!supabase) throw new BillingNotConfiguredError("purchase");
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) throw new BillingNotConfiguredError("purchase");
    return fetchEntitlement(userId);
  }

  private async requireEntitlement(): Promise<Entitlement | null> {
    try {
      return await this.getEntitlement();
    } catch {
      return null;
    }
  }
}

export const billingProvider = new StoreBillingProvider();

/** Where the verification endpoint lives in the versioned API surface. Kept beside the call that implements it. */
export const PURCHASES_VERIFY_ROUTE = apiRoutes.purchasesVerify();
