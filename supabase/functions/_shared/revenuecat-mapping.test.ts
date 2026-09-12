import { describe, expect, it } from "vitest";
import {
  affectedUserIds,
  eventTypeFor,
  isAppUserId,
  rowsForSubscriber,
  statusFor,
  storeFor,
  subscriberHasTransaction,
  toSubscriptionRow,
  type RcSubscription,
} from "./revenuecat-mapping";

/**
 * How RevenueCat's account of a subscriber becomes this schema's rows.
 *
 * Every branch here decides whether someone is entitled, so every branch is a case. The tests read as the
 * product rules they encode: a refund beats everything, the calendar beats the flag, a billing problem outranks
 * an unsubscribe, and anything the mapping cannot represent is written as nothing rather than as something.
 */

const NOW = "2026-09-13T12:00:00.000Z";
const daysFromNow = (d: number) =>
  new Date(Date.parse(NOW) + d * 86_400_000).toISOString();

function sub(over: Partial<RcSubscription> = {}): RcSubscription {
  return {
    expires_date: daysFromNow(20),
    purchase_date: daysFromNow(-10),
    store: "app_store",
    period_type: "normal",
    unsubscribe_detected_at: null,
    billing_issues_detected_at: null,
    grace_period_expires_date: null,
    refunded_at: null,
    store_transaction_id: "tx-1",
    is_sandbox: true,
    ...over,
  };
}

describe("status derivation", () => {
  it("is active for an ordinary paid period", () => {
    expect(statusFor(sub(), NOW)).toBe("active");
  });

  it("is trialing during an introductory free period", () => {
    expect(statusFor(sub({ period_type: "trial" }), NOW)).toBe("trialing");
  });

  it("is cancelled when auto-renew is off but the period is still running", () => {
    expect(
      statusFor(sub({ unsubscribe_detected_at: daysFromNow(-1) }), NOW),
    ).toBe("cancelled");
  });

  it("is billing_retry when the store is retrying payment inside the period", () => {
    expect(
      statusFor(sub({ billing_issues_detected_at: daysFromNow(-1) }), NOW),
    ).toBe("billing_retry");
  });

  it("ranks a billing problem above an unsubscribe", () => {
    expect(
      statusFor(
        sub({
          billing_issues_detected_at: daysFromNow(-1),
          unsubscribe_detected_at: daysFromNow(-2),
        }),
        NOW,
      ),
    ).toBe("billing_retry");
  });

  it("is expired once the period has ended", () => {
    expect(statusFor(sub({ expires_date: daysFromNow(-1) }), NOW)).toBe(
      "expired",
    );
  });

  it("is grace_period when expired but the store is holding it open", () => {
    expect(
      statusFor(
        sub({
          expires_date: daysFromNow(-1),
          grace_period_expires_date: daysFromNow(5),
        }),
        NOW,
      ),
    ).toBe("grace_period");
  });

  it("is expired when the grace period has also run out", () => {
    expect(
      statusFor(
        sub({
          expires_date: daysFromNow(-10),
          grace_period_expires_date: daysFromNow(-1),
        }),
        NOW,
      ),
    ).toBe("expired");
  });

  it("is refunded regardless of every other field", () => {
    expect(
      statusFor(
        sub({
          refunded_at: daysFromNow(-1),
          expires_date: daysFromNow(20),
          period_type: "trial",
        }),
        NOW,
      ),
    ).toBe("refunded");
  });

  it("treats a missing expiry as not expired", () => {
    expect(statusFor(sub({ expires_date: null }), NOW)).toBe("active");
  });
});

describe("store names", () => {
  it("accepts the two stores this app sells through", () => {
    expect(storeFor("app_store")).toBe("app_store");
    expect(storeFor("mac_app_store")).toBe("app_store");
    expect(storeFor("play_store")).toBe("play_store");
    expect(storeFor("PLAY_STORE")).toBe("play_store");
  });

  it("refuses everything else, including promotional grants", () => {
    // A grant from the RevenueCat dashboard is not a store purchase and must not become one.
    for (const other of ["promotional", "stripe", "amazon", "rc_billing", ""]) {
      expect(storeFor(other)).toBeNull();
    }
  });
});

describe("row construction", () => {
  it("builds a complete row for a known product", () => {
    const row = toSubscriptionRow(
      "premium_monthly",
      sub({ unsubscribe_detected_at: daysFromNow(-1) }),
      NOW,
    );
    expect(row).toEqual({
      product_id: "premium_monthly",
      store: "app_store",
      status: "cancelled",
      store_transaction_id: "tx-1",
      current_period_end: daysFromNow(20),
      trial_ends_at: null,
      cancelled_at: daysFromNow(-1),
    });
  });

  it("records the trial end only while trialing", () => {
    expect(
      toSubscriptionRow("premium_annual", sub({ period_type: "trial" }), NOW)
        ?.trial_ends_at,
    ).toBe(daysFromNow(20));
    expect(
      toSubscriptionRow("premium_annual", sub(), NOW)?.trial_ends_at,
    ).toBeNull();
  });

  it.each([
    ["an unknown product", "premium_lifetime", sub()],
    ["an unsupported store", "premium_monthly", sub({ store: "promotional" })],
    [
      "a missing transaction id",
      "premium_monthly",
      sub({ store_transaction_id: null }),
    ],
  ])("writes nothing for %s", (_label, productId, subscription) => {
    expect(toSubscriptionRow(productId, subscription, NOW)).toBeNull();
  });

  it("collects every representable subscription and drops the rest", () => {
    const rows = rowsForSubscriber(
      {
        subscriptions: {
          premium_monthly: sub({ store_transaction_id: "tx-m" }),
          premium_annual: sub({
            store_transaction_id: "tx-a",
            period_type: "trial",
          }),
          premium_lifetime: sub({ store_transaction_id: "tx-x" }),
          promo: sub({ store: "promotional", store_transaction_id: "tx-p" }),
        },
      },
      NOW,
    );
    expect(rows.map((r) => r.store_transaction_id).sort()).toEqual([
      "tx-a",
      "tx-m",
    ]);
  });

  it("handles a subscriber with no subscriptions", () => {
    expect(rowsForSubscriber({}, NOW)).toEqual([]);
  });
});

describe("transaction ownership", () => {
  it("confirms a transaction the subscriber holds", () => {
    const subscriber = {
      subscriptions: { premium_monthly: sub({ store_transaction_id: "tx-9" }) },
    };
    expect(subscriberHasTransaction(subscriber, "tx-9", NOW)).toBe(true);
  });

  it("refuses a transaction the subscriber does not hold", () => {
    // The check that stops a client presenting a transaction id lifted from another device.
    const subscriber = {
      subscriptions: { premium_monthly: sub({ store_transaction_id: "tx-9" }) },
    };
    expect(subscriberHasTransaction(subscriber, "tx-someone-else", NOW)).toBe(
      false,
    );
  });

  it("does not count a transaction that could not be represented", () => {
    const subscriber = {
      subscriptions: {
        premium_lifetime: sub({ store_transaction_id: "tx-9" }),
      },
    };
    expect(subscriberHasTransaction(subscriber, "tx-9", NOW)).toBe(false);
  });
});

describe("webhook events", () => {
  it.each([
    ["INITIAL_PURCHASE", null, "purchase_verified"],
    ["RENEWAL", null, "renewal"],
    ["UNCANCELLATION", null, "renewal"],
    ["PRODUCT_CHANGE", null, "renewal"],
    ["CANCELLATION", "UNSUBSCRIBE", "cancellation"],
    ["CANCELLATION", "REFUND", "refund"],
    ["CANCELLATION", "CUSTOMER_SUPPORT", "refund"],
    ["BILLING_ISSUE", null, "billing_retry"],
    ["EXPIRATION", null, "expiration"],
    ["TRANSFER", null, "restore"],
    ["SUBSCRIPTION_PAUSED", null, "cancellation"],
  ] as const)("records %s (%s) as %s", (type, reason, expected) => {
    expect(eventTypeFor(type, reason)).toBe(expected);
  });

  it("ignores TEST and unknown event types", () => {
    expect(eventTypeFor("TEST")).toBeNull();
    expect(eventTypeFor("SOMETHING_NEW")).toBeNull();
    expect(eventTypeFor("")).toBeNull();
  });

  it("recognises only this app's identities", () => {
    expect(isAppUserId("aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa")).toBe(true);
    expect(isAppUserId("$RCAnonymousID:abc123")).toBe(false);
    expect(isAppUserId("")).toBe(false);
    expect(isAppUserId(undefined)).toBe(false);
  });

  it("lists every one of our identities a transfer touches, once each", () => {
    const guest = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const account = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    expect(
      affectedUserIds({
        type: "TRANSFER",
        app_user_id: account,
        original_app_user_id: account,
        transferred_from: [guest, "$RCAnonymousID:old"],
        transferred_to: [account],
      }).sort(),
    ).toEqual([guest, account]);
  });

  it("yields nothing for an event about identities that are not ours", () => {
    expect(affectedUserIds({ app_user_id: "$RCAnonymousID:x" })).toEqual([]);
  });
});
