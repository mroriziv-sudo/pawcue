# Billing

## The one rule

`isPremiumActive` is **never** a client-computed or client-trusted boolean (brief §15). The client only ever reads
it from `GET /v1/entitlements`, which reflects the server-side `entitlements` table — itself derived from
`subscriptions`, which is written only by verified purchase/restore calls and store webhook handlers, never by an
arbitrary client mutation (see DATABASE.md table inventory: no client write policy exists on `subscriptions` or
`purchase_events`).

## Vendor decision

**RevenueCat**, fronting StoreKit2 (iOS) and Google Play Billing Library v8+ (Android) — see
[docs/architecture/tech-stack-versions.md](docs/architecture/tech-stack-versions.md) for the full rationale
(verified 2026-09-09) and the fallback (`expo-iap`) if we ever move to native billing. This sits entirely behind
`BillingProvider` (`packages/domain/src/providers/billing-provider.ts`); no screen or hook imports RevenueCat's SDK
directly.

## Product IDs

Centralized in `packages/config/src/billing-products.ts`: `premium_monthly`, `premium_annual`. Prices are always
read from `BillingProvider.getAvailableProducts()` (store-localized, formatted) — never a literal `"$39.99"` (brief
§9).

## Entitlement lifecycle

```
purchase/restore → BillingProvider.purchase()/restorePurchases()
                        │
                        ▼
        RevenueCat webhook → Edge Function `purchases/verify` (or push-based webhook handler)
                        │
                        ▼
        subscriptions row upserted, keyed by store_transaction_id (idempotent — brief §36 webhook replay)
                        │
                        ▼
        entitlements row recomputed from current subscriptions state
                        │
                        ▼
        client re-fetches GET /v1/entitlements (or receives a realtime update)
```

States handled end to end (brief §15, §36): `trialing`, `active`, `grace_period`, `billing_retry`, `cancelled`,
`expired`, `refunded`, `revoked`. Server notification handling is prepared for both **App Store Server
Notifications v2** and **Google Play Real-Time Developer Notifications** — RevenueCat normalizes both into one
webhook shape, which is itself a large part of its value for v1 (see tech-stack-versions.md).

## Paywall disclosure (brief §33)

Every paywall render must show, sourced from live store data, never hardcoded: price, billing period, trial length
if any (`"{{trialDays}} days free, then {{price}}/{{period}}"` — see `packages/i18n` `paywall.trialDisclosure`),
auto-renewal statement, and links to Restore Purchases / Terms / Privacy / a close button. No fake countdowns, no
pre-selected deceptive option, no hidden close button — this is a hard product requirement, not a style preference,
audited explicitly in RELEASE_CHECKLIST.md.

## Testing

Sandbox/test-track purchases for both stores, plus the full state matrix (§36 BILLING) including webhook replay
idempotency, are required before Phase 8 is considered done — see TESTING.md.
