# Phase 9 — real store billing and production readiness

Phase 7 built the entitlement architecture and stopped at the store boundary with a seam. Phase 9 fills the seam
with RevenueCat, completes the server's side of the conversation, and makes the build that ships auditable. The
architecture is unchanged: **the server's `entitlements` row is the only thing the app believes about paid access,
and only `recompute_entitlement` writes it.** RevenueCat is a witness the server consults, not an authority the
client relays.

## What was built

| Layer  | File                                                           | Role                                                                                       |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Client | `src/billing/revenuecat-adapter.ts`                            | The production `StoreBillingAdapter`. The only file that imports `react-native-purchases`. |
| Client | `src/state/bootstrap-store.ts`, `app/account.tsx`              | Configure the SDK with the Supabase user id; move it across on merge.                      |
| Server | `supabase/functions/_shared/revenuecat-mapping.ts`             | Pure: RevenueCat's subscriber → `subscriptions` rows, event → audit type. Vitest-covered.  |
| Server | `supabase/functions/_shared/revenuecat.ts`                     | Fetch a subscriber with the secret key; write rows; recompute.                             |
| Server | `supabase/functions/purchases-verify/index.ts`                 | The client-initiated path. Now asks RevenueCat rather than refusing unconditionally.       |
| Server | `supabase/functions/revenuecat-webhook/index.ts`               | Renewals, expirations, refunds, cancellations, transfers — without the app open.           |
| Schema | `20260913090000_entitlement_cancelled_until_period_end.sql`    | A cancelled subscription is entitled until its paid period ends.                           |
| Build  | `plugins/withReleaseHardening.js`, `app.config.ts`, `eas.json` | Production profile; a store build's native project is clean at prebuild.                   |

## RevenueCat integration

### The client's side

`configureRevenueCat(userId)` runs from bootstrap once the Supabase session resolves. It registers the adapter
**only** when both a public SDK key (`EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `…_ANDROID_KEY`) and the SDK's native
module are present. Absent either, the provider keeps throwing `BillingNotConfiguredError` and the paywall keeps
saying plans are unavailable — the same honest state as Phase 7. A development client built before this phase
therefore still works, without a first-tap crash.

What the adapter reports, and what it does not:

- `getAvailableProducts` → the current offering's packages as raw rows, each carrying the store's own
  `priceString`. The paywall's `reconcileStoreProducts` validates them; a product id that is not one of ours is
  dropped there, not hidden here.
- `purchase` → the transaction id and product **the store reports** — never the product that was asked for, in
  case they differ. Every store error becomes an i18n key; no SDK text reaches a screen. `PRODUCT_ALREADY_PURCHASED`
  is not a failure: it is reported as `alreadyOwned` and the flow reconciles with the server.
- `restorePurchases` → the known subscriptions in `CustomerInfo.subscriptionsByProductIdentifier` with a
  transaction id, as things the server can look up.
- **Nothing about entitlement.** `CustomerInfo.entitlements` is never read. A purchase that succeeds at the store
  moves the flow to `verifying` and unlocks nothing until `/purchases/verify` says so.

The public SDK keys are publishable by design, like the Supabase anon key. The secret key (`sk_…`) never acquires
an `EXPO_PUBLIC_` name; `__tests__/release-hardening.test.ts` asserts `eas.json` carries no key of any kind.

### The server's side

`purchases-verify` now:

1. Verifies the caller's JWT. Identity comes from the token and nowhere else.
2. Reads at most one field from the body: `storeTransactionId`, a _question_. `isPremium`, a product, a status —
   none of those fields exist to the handler.
3. Asks RevenueCat's REST API for **the caller's** subscriber, with the secret key. `501 PROVIDER_NOT_CONFIGURED`
   without it; `502` if RevenueCat is unreachable. Nothing is written in either case.
4. If a transaction id was named, refuses (`409 TRANSACTION_NOT_VERIFIED`) unless that subscriber holds it. This is
   the check that stops a transaction id lifted from another device.
5. Upserts every representable subscription keyed on `store_transaction_id`, then `recompute_entitlement`, then
   reads the row back for the response.

Restore is the same endpoint with no transaction id: "look at everything I hold."

`revenuecat-webhook` treats every event as a trigger, not a source of truth: it claims the event id in
`purchase_events` (duplicate delivery → `200`, untouched), then re-fetches every affected subscriber and re-derives.
A `TRANSFER` names both identities; reconciling the new owner moves the row (same transaction id, new `user_id`),
and reconciling the old owner recomputes them without it. A failure releases the claim and answers `5xx` so
RevenueCat retries.

The mapping from RevenueCat's subscriber to our rows lives in one pure module and is tested exhaustively: a refund
beats everything; past the end date it is expired unless the store is holding a grace period; before it, a billing
problem outranks an unsubscribe, which outranks trial/active. `promotional`, `stripe` and `amazon` stores are
refused — a grant from the dashboard is not a store purchase.

### A defect found and fixed

`recompute_entitlement` did not count `cancelled` as entitling. Cancelling auto-renew on either store means "do
not renew" — the paid period runs to its end. The Phase 7 rule would have revoked premium the moment a user turned
off auto-renew, before the period they had paid for was over. The Settings UI already said "Access until {date}"
for exactly this case; the server now delivers it, bounded by `current_period_end` (an open-ended cancellation
entitles nothing). Five new cases in `rls_security.sql`.

## Identity lifecycle

RevenueCat's `appUserID` **is** the Supabase user id, always. That single decision is what keeps purchases and
verification attached to the same identity through every transition.

| Transition            | Supabase                                  | RevenueCat                              | Server                                                               |
| --------------------- | ----------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| First launch          | anonymous user `G` created                | `configure({ appUserID: G })`           | —                                                                    |
| Purchase as guest     | —                                         | receipt posted under `G`                | `verify` fetches subscriber `G`, writes `subscriptions.user_id = G`  |
| Sign in + merge       | account `A`; `merge_guest_session(G → A)` | `logIn(A)` — purchase transfers `G → A` | merge moves `subscriptions` rows; `TRANSFER` webhook reconciles both |
| Relaunch as `A`       | session resumed                           | `configure({ appUserID: A })`           | entitlement read for `A`                                             |
| Sign out (when built) | new anonymous user `G2`                   | `logOut()` then `logIn(G2)`             | `G2` has nothing; the cache for `A` is discarded (scoped by user id) |

Two invariants, each a test:

- **The SDK is configured once per process.** After `logOut` it stays configured and the next identity is a
  `logIn`, never a second `configure`. (`revenuecat-adapter.test.ts` — "configures the SDK once".)
- **Entitlement cache is identity-bound.** Phase 7's cache carries the user id it was verified for and is ignored
  for any other; `logOut` before the next `logIn` stops the SDK's own `CustomerInfo` cache lingering. No account
  can see another's premium.

On merge, `identifyRevenueCat` runs **before** the entitlement re-read, so the server is asked about an account
RevenueCat has already attributed the purchase to. RevenueCat's project setting "restore behaviour" must be
**Transfer to new App User ID** (the default) for the guest → account transfer to happen.

Sign-out has no UI yet (AUTH.md describes it; nothing builds it). `resetRevenueCatIdentity` is the hook and is
tested; wiring it is part of building sign-out.

## Production build

`eas.json` now has a `production` profile — store distribution, no development client, Android app bundle, build
numbers owned remotely by EAS and auto-incremented — and a `preview-simulator` profile that extends it for a
release-configuration simulator binary that needs no Apple signing.

### Release hardening

`expo-dev-client`'s config plugins run at prebuild for every profile. The generated `Info.plist` therefore starts
with `NSLocalNetworkUsageDescription`, `NSBonjourServices`, `RCTMetroPort` and an `NSAllowsLocalNetworking` ATS
exception, and the Android main manifest carries `SYSTEM_ALERT_WINDOW` — all of it development tooling. SDK 57's
dev launcher installs a Release-only Xcode phase that strips two of the iOS keys after compilation; it does not
touch the rest, and it is a script nobody can audit before the build.

`plugins/withReleaseHardening.js` removes all of it **at prebuild** when `EAS_BUILD_PROFILE=production` (set by
EAS) or `PAWCUE_RELEASE_HARDENING=1` (for a local audit), sets `ITSAppUsesNonExemptEncryption=false`, and blocks
`SYSTEM_ALERT_WINDOW` with `tools:node="remove"` so the library manifest cannot re-add it at merge. The pure
transform is tested; the audit below is of a prebuild that actually ran.

### Native audit, hardened prebuild (2026-09-12)

**iOS `Info.plist`** — no `NS*UsageDescription` of any kind; no `UIBackgroundModes`; no Bonjour, local-network or
Metro keys; ATS is `{ NSAllowsArbitraryLoads: false }` only; `ITSAppUsesNonExemptEncryption = false`.

**Android main manifest** — `INTERNET`, `MODIFY_AUDIO_SETTINGS`, `VIBRATE`, `READ/WRITE_EXTERNAL_STORAGE`
(capped `maxSdkVersion=32`, inert on the API 33+ devices targeted), and `SYSTEM_ALERT_WINDOW` present only as a
`tools:node="remove"` directive. `com.android.vending.BILLING` arrives from the RevenueCat library manifest at
build time; it is the one permission this phase adds, and it has a product reason.

Historical issues re-checked: microphone — absent; background audio — absent; Face ID — absent; local network /
Bonjour / Metro — absent in the hardened build; tracking / location / photos / contacts — absent.

### Versioning rule

- `expo.version` in `app.json` is the marketing version (`0.1.0`). It changes only by an explicit release
  decision, and `release-hardening.test.ts` pins it so a bump is deliberate.
- Build numbers (`buildNumber`, `versionCode`) are **not in `app.json`**. `appVersionSource: remote`; EAS holds
  them (initialised at 1 for both platforms) and the production profile auto-increments. Simulator audit builds do
  not increment.

## Terms and privacy

The paywall renders Terms and Privacy from `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_PRIVACY_URL` and says "not set
up in this build" when they are absent. They are absent. PawCue has no domain (ARCHITECTURE.md §2) and no hosted
policy; PRIVACY.md and DATA_MAP.md are engineering documents, not the public text either store requires. This is
**release-blocking** and cannot be closed from the repository. The variables are documented in `.env.example`
and are supplied to a build through the EAS `production` environment, never committed.

## What was genuinely exercised

- Adapter behaviour: 33 Jest cases against a fake of the SDK's shape — products, every purchase outcome, restore,
  configure-once, identity transitions.
- Server mapping: 37 Vitest cases.
- Deployed functions, staging: 14 cases — authentication, malformed bodies, entitlement claims in the body, and
  that **no row is written** on any refused path. Both functions fail closed with `501` today.
- Schema: 90 SQL cases including the five new cancellation/refund rules.
- Native configuration: hardened prebuilds for both platforms, audited above.
- A release-configuration simulator build through EAS (`preview-simulator`) — see the report for the artifact
  audit.

## PENDING EXTERNAL VALIDATION

None of the following has been exercised, and this document does not claim it works:

monthly purchase · annual purchase · cancelling the store sheet · entitlement unlock after a real purchase ·
relaunch with a real entitlement · restore on a second device · already-owned reconciliation · renewal, expiration
and refund webhooks · guest → account transfer of a real purchase · no duplicate entitlement rows under real
traffic · Google Play, entirely.

Each requires the external configuration listed in the report. The code paths exist and are unit-tested; the
integration has not run.
