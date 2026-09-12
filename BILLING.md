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

## Entitlement states in the client

`resolveEntitlement` (`packages/domain/src/billing/entitlement.ts`) turns the server's answer into the one view the
whole app reads. Six states: `unknown`, `free`, `premium`, `expired`, `offline_cached`, `billing_unavailable`.
Only `premium` and `offline_cached` grant access. `EntitlementView.isPremiumActive` is the only field any gate may
read — there is no second boolean in the codebase.

## Offline policy

A verified premium answer is honoured for **7 days** without reconfirmation
(`ENTITLEMENT_OFFLINE_GRACE_DAYS`) and never past its own `expiresAt`. This interval is an implementation default,
not a value from these contracts: it is shorter than the shortest billing period sold, so a cached answer can never
carry an offline device through a period it did not pay for. A cached _free_ answer grants nothing and is reported
as `billing_unavailable` rather than as certainty. The cache is scoped to the user id it was verified for, and is
written only after a successful read. Full table in
[docs/architecture/phase-7-monetization.md](docs/architecture/phase-7-monetization.md).

## Free vs premium

`lessons.is_always_free` is the boundary, authored in content. The premium lock is kept **separate** from the
prerequisite lock — a lesson can be under both, and collapsing them would show a paywall to someone whose real
obstacle is that their dog has not learned Sit yet.

## Guest → account

`subscriptions` move on merge; `entitlements` are derived and recomputed by `recompute_entitlement(user_id)`. The
original merge moved the entitlement row instead, which raised a unique violation whenever both sides had one and
aborted the whole merge — fixed in `20260912120000_entitlement_recompute.sql`, asserted in the security suite.

## Testing

Sandbox/test-track purchases for both stores, plus the full state matrix (§36 BILLING) including webhook replay
idempotency, still require store configuration this project does not have — see TESTING.md and the external
configuration table in [docs/architecture/phase-7-monetization.md](docs/architecture/phase-7-monetization.md).
Everything testable without those credentials is covered: the entitlement policy, the product reconciliation, the
purchase and restore lifecycles, gating, data safety, the guest/account transition, and the development-only
tooling's production guards.
