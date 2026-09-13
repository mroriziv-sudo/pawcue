# RevenueCat — external configuration checklist

Everything the code expects of the RevenueCat and store consoles, audited against the Phase 9 integration on
2026-09-13. Nothing here can be done from the repository; each line is a dashboard action for the account owner.
Values in `[[…]]` are yours to create; none is invented here.

## What the code depends on — and what it does not

| Concern                 | Code's expectation                                                                                                                                                                                                                                                                                | Where                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| App user id             | **The Supabase user id**, always. `configure({ appUserID })` at bootstrap, `logIn` on merge, `logOut` on sign-out/deletion. RevenueCat anonymous ids are never used as identities.                                                                                                                | `src/billing/revenuecat-adapter.ts`, `src/state/account-lifecycle.ts`      |
| Product identifiers     | Exactly `premium_monthly` and `premium_annual`. Anything else in the offering is dropped by `reconcileStoreProducts` as unknown; anything else on a subscriber is skipped by the server mapping.                                                                                                  | `packages/config/src/billing-products.ts`, `_shared/revenuecat-mapping.ts` |
| Offering                | The offering marked **Current**. Its `availablePackages` are read; package identifiers (`$rc_monthly`, `$rc_annual`, or custom) do not matter — only each package's product identifier.                                                                                                           | `revenuecatAdapter.getAvailableProducts`                                   |
| Entitlement identifier  | **Not used.** The app never reads `CustomerInfo.entitlements`; entitlement is decided by the server from the subscriber's _subscriptions_. Create one anyway (`premium`) so the RevenueCat dashboard and charts make sense, and attach both products to it — the code is indifferent to its name. | `docs/architecture/phase-9-store-billing.md`                               |
| Restore behaviour       | **Transfer to new App User ID** (the project default). Required for the guest → account transfer: `logIn(account)` moves the purchase and emits a `TRANSFER` webhook that re-parents the `subscriptions` row.                                                                                     | `revenuecat-webhook` rule 5                                                |
| Stores                  | `app_store` / `mac_app_store` / `play_store` only. `promotional`, `stripe`, `amazon` grants are refused server-side — a dashboard grant is not a store purchase and never becomes premium.                                                                                                        | `storeFor()` in the mapping                                                |
| Public SDK keys         | `EXPO_PUBLIC_REVENUECAT_IOS_KEY` = `appl_…`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` = `goog_…`, in the EAS `production` (and `preview`) environment. A production build refuses a key that does not start with the right prefix, and refuses any `EXPO_PUBLIC_` value that starts with `sk_`.       | `plugins/withReleaseHardening.js` (`productionEnvironmentProblems`)        |
| Secret API key          | `REVENUECAT_SECRET_API_KEY` = `sk_…`, as a Supabase Edge Function secret only. Used by `purchases-verify` (REST lookup of the caller's subscriber), `revenuecat-webhook` (re-fetch), and `account-delete` (`DELETE /v1/subscribers/{id}`). Absent → every one of them fails closed.               | `supabase secrets set`                                                     |
| Webhook auth            | `REVENUECAT_WEBHOOK_AUTH` = a long random string, as an Edge Function secret, and the **same string** entered as the webhook's Authorization header value in the RevenueCat dashboard. Compared constant-time; a `Bearer ` prefix is tolerated.                                                   | `revenuecat-webhook` rule 1                                                |
| Webhook URL             | `https://<production-ref>.supabase.co/functions/v1/revenuecat-webhook`. Events with unknown types (`TEST` included) are acknowledged and ignored; duplicates are acknowledged and not re-applied.                                                                                                 | `revenuecat-webhook`                                                       |
| Prices, trials, periods | **Read from the store at runtime**, never configured in code. No price, currency or trial length exists in the repository; the paywall renders what StoreKit/Play report. Whether to offer an introductory trial is decided in App Store Connect / Play Console.                                  | `packageToProductRow`, `paywall.test.tsx`                                  |

## Validated without the console (Phase 9 + 9.5)

- Adapter: 33 Jest cases against a fake of the SDK's shape (products, every purchase outcome, restore,
  configure-once, identity transitions, transfer-on-merge ordering).
- Server mapping: 37 Vitest cases (status precedence, unsupported stores refused, transaction ownership,
  every webhook event type, transfer identity lists).
- Deployed endpoints (staging): 14 billing cases — fail closed, no writes on refused paths; 44 account-deletion
  cases; 45 smoke cases.
- Identity lifecycle: bootstrap configure → merge `logIn` before entitlement read → deletion/sign-out `logOut`
  then fresh configure. Each transition has a test.
- Production guards: dev entitlement override, dev store adapter and clicker diagnostics are all unreachable in
  a release build (`production-guards.test.ts`); public-key prefixes and secret-under-public-name are checked at
  config evaluation for the production profile.

## PENDING EXTERNAL VALIDATION

A real monthly purchase · a real annual purchase · cancelling the store sheet · unlock after a verified purchase ·
relaunch with a real entitlement · restore on a second device · already-owned reconciliation · renewal,
expiration and refund webhooks arriving · guest → account `TRANSFER` of a real purchase · account deletion
erasing a real subscriber · Google Play end to end. None of this is claimed until it has run through Apple's
sandbox / TestFlight.

## Manual sequence (minimal)

**App Store Connect** (needs the Apple Developer membership active)

1. Create the app record for bundle id `com.pawcue.app`.
2. Monetization → Subscriptions → create a subscription group (e.g. "PawCue Premium").
3. Add two auto-renewable subscriptions with Product IDs **exactly** `premium_monthly` and `premium_annual`.
   Set prices per territory and any introductory offer here; localise the display names (EN + HE).
4. Complete the Paid Applications agreement (Agreements, Tax, and Banking).
5. Users and Access → Sandbox → add a sandbox tester for purchase testing.
6. App Information → App-Specific Shared Secret → generate (RevenueCat needs it), and/or create an In-App
   Purchase key (Users and Access → Integrations → In-App Purchase) for StoreKit 2.

**RevenueCat**

1. Create a project; add an **App Store** app with bundle id `com.pawcue.app`; paste the shared secret / upload
   the In-App Purchase key.
2. Products → import `premium_monthly` and `premium_annual` from App Store Connect.
3. Entitlements → create `premium`; attach both products.
4. Offerings → the default offering: add packages for both products; make it **Current**.
5. Project settings → confirm restore behaviour is **Transfer to new App User ID**.
6. API keys → copy the **public** App Store key (`appl_…`); create a **secret** key (`sk_…`) with read access to
   customer info and permission to delete customers.
7. Integrations → Webhooks → URL `https://<production-ref>.supabase.co/functions/v1/revenuecat-webhook`;
   Authorization header value = the string you will store as `REVENUECAT_WEBHOOK_AUTH`. Send a `TEST` event:
   expect `200 { received: true, ignored: "TEST" }` once the secrets below exist (`501` before).

**Secrets and environment** — run these yourself; do not paste the values anywhere else.

```
cd apps/mobile
npx eas-cli env:set production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_… --visibility plaintext --type string --scope project --non-interactive
npx eas-cli env:set preview    --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_… --visibility plaintext --type string --scope project --non-interactive
cd ../..
pnpm supabase secrets set --project-ref <production-ref> REVENUECAT_SECRET_API_KEY=sk_… REVENUECAT_WEBHOOK_AUTH=<random>
```

(Repeat the two `secrets set` values on staging if you want to sandbox-test against staging first.)

**Google Play** (later): a Play Console app for `com.pawcue.app`, the same two product ids as subscriptions, a
service-account JSON for RevenueCat, `goog_…` public key in EAS as `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
