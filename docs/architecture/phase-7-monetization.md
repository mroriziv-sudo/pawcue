# Phase 7 — monetization, entitlements and the paywall

Phase 7 implements the entitlement architecture the earlier phases described but never built. Nothing here invents
a product decision: the products, the vendor, the server-authoritative rule and the free-tier boundary all already
existed in the Phase 0 contracts, and this phase connects them to a running app.

The one rule everything else serves is BILLING.md's: **`isPremiumActive` is never client-computed or
client-trusted.** Every design choice below follows from it.

## The entitlement layer

One abstraction, consumed by Today, Train, the lesson overview, the paywall and Settings:

```
entitlements row (server)  ─┐
last cached answer         ─┼─►  resolveEntitlement()  ─►  EntitlementView { status, isPremiumActive, … }
"we could not reach it"    ─┘        (packages/domain/src/billing/entitlement.ts)
```

Six states, each reachable and each tested:

| Status                | Premium? | Means                                                                   |
| --------------------- | -------- | ----------------------------------------------------------------------- |
| `unknown`             | no       | Nothing has been asked yet. Absence of an answer is never a grant.      |
| `free`                | no       | The server answered: no subscription.                                   |
| `premium`             | **yes**  | Active, trialing, in grace period, or in billing retry.                 |
| `expired`             | no       | Premium existed and ended, by the server's own `source`/`expiresAt`.    |
| `offline_cached`      | **yes**  | Honoured from the last verified answer while the server is unreachable. |
| `billing_unavailable` | no       | Could not verify, and nothing cached may be honoured.                   |

`EntitlementView.isPremiumActive` is the only field a gate reads. There is no second boolean anywhere in the app.

The **policy** lives in the domain as a pure function. The **store**
(`apps/mobile/src/state/entitlement-store.ts`) owns only when the server is asked, that it is asked once at a time,
and what is remembered between launches. It deliberately does not decide whether a cached answer is too old.

## Provider boundary

`BillingProvider` (frozen in Phase 0) is implemented by `StoreBillingProvider`. It is two halves:

- **`getEntitlement()` is fully real.** It reads the server's `entitlements` row through RLS. No row means free —
  a real answer, since nothing creates a row until a purchase is verified.
- **`getAvailableProducts()`, `purchase()`, `restorePurchases()` need a store SDK.** They go through
  `StoreBillingAdapter`, a one-method-per-capability seam with a single registration point, and throw
  `BillingNotConfiguredError` until an adapter is registered.

Nothing in the repository imports a store SDK. Adding RevenueCat is a new file implementing `StoreBillingAdapter`
plus a call to `registerStoreBillingAdapter` — not an edit spread through the paywall, the store and the provider.

Two contract refinements were needed and are documented in the interface: `getEntitlement()` and
`restorePurchases()` return `Entitlement | null`, because "the server holds no entitlement record for this user" is
the real state of anyone who has never purchased. Synthesising a free `Entitlement` would have meant inventing a
row id, a user id and timestamps for a record that does not exist.

## Free vs premium — what the data actually defines

The boundary is **`lessons.is_always_free`**, a seeded, authored column carrying the brief's free-tier list. Four
of the thirteen seeded lessons are free (`name_game`, `sit`, `biting_foundation`, `potty_foundation`); the rest are
premium. Content decides; `packages/domain/src/billing/access.ts` only reads it.

The two locks are kept **separate**, never collapsed:

```
prerequisiteLocked  — the dog has not learned the prerequisite skill. Earned away by training.
premiumLocked       — the lesson is outside the free tier and this user is not entitled. Bought away.
canStart            — neither applies.
```

A lesson can be under both. Showing only the premium one would tell a user to pay for something they still could
not train; showing only the prerequisite one would hide the subscription entirely. Train states both, in that
order, and a doubly-locked lesson routes nowhere — paying would not make it startable.

### Boundaries defined in prose that the data does not support

ARCHITECTURE.md §5 also names **"Day 2+ of the plan"** and **"advanced troubleshooting"** as premium. Neither was
implemented, and neither was invented:

- **Day 2+** describes a multi-day plan reveal. Phase 6 generates a one-day plan per day, so there is no Day 2 to
  gate. Its activities are lessons, which the `is_always_free` boundary already covers.
- **Advanced troubleshooting** has no marker in the data. `lesson_troubleshooting` carries slug, prompt, guidance,
  safety category and sort order — nothing that distinguishes basic from advanced. Gating "the last N options"
  would be a product decision invented in a screen.

Both are listed as open product decisions rather than guessed at.

## Purchase lifecycle

```
idle ──begin──► purchasing ──store says "purchased"──► verifying ──server confirms──► unlocked
                     │                                     │
                     ├─ cancelled (no message at all)      └─ server disagrees ──► failed (verification, not purchase)
                     ├─ pending  (Ask to Buy / SCA)
                     └─ failed   (reason key, never a provider string)
```

The load-bearing transition is `purchased → verifying`, **not** `purchased → unlocked`. A store callback cannot
unlock anything; only `useEntitlementStore.refresh()` reading the server's row can. Everything else follows:

- **Already owned** is not an error. The store is telling us the server is behind, so it routes to `verifying`.
- **Duplicate and stale callbacks** are dropped by `attemptId`. A result for an abandoned attempt is ignored.
- **A second tap** while a sheet is up starts nothing.
- **Charged but unverified** reports a verification state, never "your purchase failed" — which would be false.

The reducers are pure (`packages/domain/src/billing/purchase-flow.ts`), so each of those is a test rather than a
race in a screen.

## Restore lifecycle

Idempotent by construction: every run recomputes the same terminal state from the same store and server answers,
and nothing accumulates. `restored` reports what the _store_ returned; whether that amounts to premium is the
_server's_ answer, and the two are separate so an expired subscription can never be reported as restored. Reachable
from both the paywall (store requirement) and Settings, in every entitlement state — a user whose subscription
looks missing is exactly the one who needs it.

## Offline entitlement policy

| Situation                                      | Behaviour                                             |
| ---------------------------------------------- | ----------------------------------------------------- |
| Verified premium, server unreachable, ≤ 7 days | `offline_cached` — **premium honoured**               |
| Verified premium, server unreachable, > 7 days | `billing_unavailable` — not premium                   |
| Cached answer past its own `expiresAt`         | `expired` — not premium, however recently verified    |
| Cached _free_ answer, server unreachable       | `billing_unavailable` — we genuinely do not know      |
| Fresh install, no cache                        | `unknown`, then `billing_unavailable` — never premium |

`ENTITLEMENT_OFFLINE_GRACE_DAYS = 7` is an **implementation default, not a contract value** — BILLING.md defines
the verification path but no revalidation interval. Seven days sits well inside the shortest billing period sold
(monthly), so an offline device cannot ride a cached answer through a period it did not pay for, while a week of
flaky connectivity does not cost a paying customer their subscription. `expiresAt` always wins over the window.

The cache stores the **user id it was verified for** and checks it on read. Without that, signing into a different
account on the same device would inherit the previous account's premium. It is written only after a successful
read, so it can never hold something the server never said.

## Guest and account ownership

Billing follows the identity, not the device. `subscriptions` are the durable billing records and they move on
merge; `entitlements` are derived and are recomputed rather than moved.

**A real defect was found and fixed here.** The Phase 0 `merge_guest_session` did:

```sql
update entitlements set user_id = p_target_user_id where user_id = p_anonymous_user_id;
```

`entitlements.user_id` is `NOT NULL UNIQUE`, so when both sides held a row this raised a unique violation and
aborted the entire merge — taking the dogs and training history with it. It was unreachable only because nothing
created entitlement rows. Phase 7 creates them, so it is reachable now. The fix drops the guest's derived row and
recomputes the target's from the subscriptions it now owns, which is also the only way to get the right answer when
both sides had one. Reproduced against the live schema before and after; asserted in the security suite.

## Server verification

`POST /v1/purchases/verify` (`supabase/functions/purchases-verify/`) is the only path to premium. Identity comes
from the verified JWT; the body carries a `storeTransactionId` and nothing the client asserts about what it is
entitled to. The store decides what the transaction is, `recompute_entitlement(user_id)` derives the row, and the
response reads that row back.

`recompute_entitlement` is `SECURITY DEFINER` and revoked from `public`/`anon`/`authenticated` — PostgREST exposes
every public function at `/rest/v1/rpc/<name>`, which is exactly how the Phase 0 escalation happened.

**It is not stubbed.** Without a provider credential `verifyWithProvider` returns null and the endpoint answers
`501 PROVIDER_NOT_CONFIGURED`, writing nothing. A stub returning a plausible subscription would make every test
pass against a fiction and put the first real verification in production.

## Development tooling, and why it cannot ship

`apps/mobile/src/billing/dev-billing.ts` can force any of the six entitlement states so the locks, the paywall and
the billing section can be built and reviewed — none of which is otherwise visible without store configuration and
a sandbox account.

The `__DEV__` check lives **inside** `devEntitlementOverride`, before it reads any stored value, and again inside
every setter. That single chokepoint means neither a stale value nor an accidentally-rendered component can
produce premium in a release build. It also cannot fake a _purchase_: the simulated adapter never returns
`purchased`, and entitlement comes from a server row nothing local can write.

`__tests__/billing-dev-guard.test.tsx` flips `__DEV__` and asserts both halves — the UI is gone _and_ the functions
refuse — because either alone would leave a way in.

## Paywall

Built from the existing design system, with store-provided pricing only: there is no currency literal in
`app/paywall.tsx`, and an unpriced product is not offered rather than shown with a placeholder.

What is deliberately **absent**, and asserted absent: fake countdowns, crossed-out prices, "most popular" badges, a
preselected annual plan, a delayed or hidden close button. The default selection is the first configured product —
monthly, the smallest immediate charge — fixed in configuration order so no screen can reorder the choices to
steer a decision.

**Claims are limited to features that exist.** `paywall.feature.*` carries six keys; only two are rendered:
`fullCatalog` and `fullPlan`. Daily plan updates are free for everyone, and advanced troubleshooting, goal programs
and full history are not built. A third line states the real number of premium lessons, counted from the
catalogue.

## External configuration still required

Nothing below is a code change; all of it is account and console setup this project does not have.

| What                                                              | Needed for                                     |
| ----------------------------------------------------------------- | ---------------------------------------------- |
| Apple Developer account + App Store Connect subscription group    | Real products, prices, trials, sandbox testing |
| Google Play Console + Play Billing v8+ subscription               | The same on Android                            |
| RevenueCat project + `react-native-purchases` + a native rebuild  | `StoreBillingAdapter` implementation           |
| `REVENUECAT_SECRET_API_KEY` (server secret, never `EXPO_PUBLIC_`) | `verifyWithProvider`; lifts the `501`          |
| RevenueCat webhook → `purchases-verify`                           | Renewals, cancellations, refunds, revocations  |
| `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_PRIVACY_URL`                | The store-required paywall links               |

The paywall says a legal link is unconfigured rather than doing nothing, because a dead link is worse than an
honest one — but neither store will accept a build in that state.

## Open product decisions

1. **Advanced troubleshooting** — named as premium in ARCHITECTURE.md, with nothing in the data to gate on.
2. **Plan-day gating** — "Day 2+" assumes a multi-day plan the product does not currently generate.
3. **Prices and trial length** — store-configured by design, so no decision is needed in code, but they must be
   set in App Store Connect and Play Console before anything can be sold.
