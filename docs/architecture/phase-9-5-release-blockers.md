# Phase 9.5 — release blockers that need no Apple membership

Phase 9 stopped at Apple's signing boundary with the membership pending. This phase used the wait to close every
blocker that does not depend on it, so that membership activation leads straight to signing → TestFlight → real
purchase testing. Nothing here touches Apple signing, creates certificates, submits anything, or starts Phase 10.

## What was built

| Area                 | Files                                                                                                                                                                    | State                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Account deletion     | `supabase/functions/account-delete/`, `app/delete-account.tsx`, `src/state/account-lifecycle.ts`, `SupabaseAuthProvider.deleteAccount`                                   | Done; 44 server cases on the deployed function, 12 UI cases           |
| Sign-out             | `src/state/account-lifecycle.ts`, `app/account.tsx` signed-in state                                                                                                      | Done (shares the local reset with deletion)                           |
| Sign in with Apple   | `src/providers/apple-sign-in.ts`, `SupabaseAuthProvider.signInWithApple`, `src/components/AppleSignInButton.tsx`, `app.json`                                             | Code complete; capability + provider are external                     |
| Private relay        | `20260913120000_profile_private_relay_email.sql`                                                                                                                         | Done; 3 SQL cases                                                     |
| Privacy manifest     | `app.json` → `ios.privacyManifests`, `tools/release/audit-privacy-manifest.mjs`, `__tests__/privacy-manifest.test.ts`                                                    | Done; a real gap found and closed; archive re-check remains           |
| Production guard     | `plugins/withReleaseHardening.js` (`assertProductionEnvironment`), `app.config.ts`                                                                                       | Done; 8 cases                                                         |
| Production Supabase  | `tools/release/production-supabase.mjs`, `tools/db/guard.mjs`, `supabase/environments.json`, `config.toml` `[remotes.production]`, `supabase/tests/production-smoke.mjs` | Scripted and rehearsed on staging (45/45); project creation is manual |
| Legal drafts         | `docs/legal/`                                                                                                                                                            | Drafted from the build; placeholders marked; review + domain pending  |
| RevenueCat readiness | `docs/release/revenuecat-setup.md`                                                                                                                                       | Audited; manual sequence written                                      |
| Store launch pack    | `docs/release/app-store-launch-pack.md`                                                                                                                                  | Draft for ASO validation                                              |
| Settings legal links | `app/settings.tsx`                                                                                                                                                       | Shown only when URLs are configured                                   |

## Account deletion

The design question was where authority lives, and the answer is the same as for the merge and for billing: in
the verified JWT and nowhere else. The endpoint has no user id in its body; a body that _contains_ one is refused
with `400`, not ignored, because silence would hide the bug or the attempt. The body must say `"confirm": "delete"`
— not authentication, but the server's half of "no accidental one-tap deletion".

Order of operations: RevenueCat customer first (`DELETE /v1/subscribers/{id}`; 404 is success), then
`auth.admin.deleteUser`, then a read of `profiles` to confirm absence before `200`. RevenueCat first because a
retry after a partial failure must be able to address the customer, and after the auth row is gone nothing can. A
provider outage is `502` with the account untouched.

The schema was already the deletion pipeline — `auth.users → profiles → ON DELETE CASCADE` for personal data,
`ON DELETE SET NULL` for `subscriptions` / `purchase_events` — and the SQL suite already proved it. What Phase 9.5
added was the authorised trigger and the client's discipline: **nothing local is touched until the server
confirms.** `forgetLocalIdentity()` then clears every identity-scoped store and key in one place, logs the store
SDK out, drops the session locally, and `restartAsGuest()` re-runs bootstrap so the device starts again as a fresh
guest. Language, sound and haptics are kept: they are device preferences, and a Hebrew speaker who deletes their
account should not be handed an English app.

Guests can delete too. An anonymous identity owns a dog and a history, and the request is theirs to make.

Idempotency falls out of the design: after success the JWT's subject no longer exists, so a replay is `401`, and
the client treats "Supabase no longer knows my token's user" as the deletion having happened.

## Sign in with Apple

Native flow: `expo-apple-authentication` presents Apple's sheet with the SHA-256 of a 256-bit random nonce and the
email scope only; the identity token goes to `supabase.auth.signInWithIdToken({ provider: "apple", token, nonce })`
with the raw nonce, which Supabase hashes and compares against the token's claim (`skip_nonce_check = false`).
Cancellation is its own error and the screen says nothing; a disabled provider reads as "not available in this
build"; anything else is a sign-in failure with the training unchanged. Apple's own button is rendered where the
OS says the capability is available, with the design-system button as the fallback so Android and unconfigured
builds keep the action reachable and honest.

The guest → account merge is unchanged and still the only path by which guest data becomes account data. The
account screen captures the guest token _before_ the provider replaces the session — asserted by call order.

What cannot be done without the membership: the Sign in with Apple capability on the App ID. `app.json` now
declares `usesAppleSignIn` and the module's plugin writes the entitlement, so a signed build will carry it; EAS
enables the capability on the App ID when it manages credentials. On the Supabase side the Apple provider must be
enabled with client id `com.pawcue.app` (`[remotes.production]` in `config.toml`, or the dashboard). **The real
handshake has not run and is not claimed.**

## Privacy manifest

The Phase 9 release artifact (EAS build `49bdafe6`) was audited with `tools/release/audit-privacy-manifest.mjs`,
which reads every `PrivacyInfo.xcprivacy` in the bundle and scans every Mach-O binary's undefined symbols for
Apple's required-reason APIs. Finding: `ExpoFileSystem.framework` imports `volumeAvailableCapacityForImportantUsage`
/ `volumeTotalCapacity` (DiskSpace) and `NSFileCreationDate` / `NSFileModificationDate` (FileTimestamp); it ships
no manifest of its own (its `_privacy.bundle` holds only an `Info.plist`), and the Expo template's app manifest
declares UserDefaults, FileTimestamp and SystemBootTime — **not DiskSpace**. Apple's upload validator would have
rejected that archive with ITMS-91053.

Fix: `app.json` → `ios.privacyManifests` declares all four categories (DiskSpace with `E174.1`, the reason that
matches the module's purpose of checking free space before writes) plus the collected data types from
DATA_MAP.md. Expo's `withPrivacyInfo` merges it into the generated manifest; a hardened prebuild confirmed the
result, and the audit script — run on the old artifact with `--app-manifest` pointing at the new file — passes.

What each party declares:

- **PawCue:** UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1; data types user
  id, email, other user content, purchase history (linked, not tracking); no tracking, no domains.
- **Third-party SDKs (own bundles):** RevenueCat (UserDefaults; declares PurchaseHistory, unlinked — PawCue links
  it), PurchasesHybridCommon (UserDefaults), React-Core (FileTimestamp, UserDefaults), React-cxxreact and
  RN dependencies folly/glog (FileTimestamp), React-timing and boost (SystemBootTime), AsyncStorage
  (FileTimestamp), expo-constants and expo-localization (UserDefaults).
- **Still to verify on the final archive:** that the new modules (`ExpoAppleAuthentication`, `ExpoCrypto` —
  neither references a required-reason API in its sources) do not change the set; that the device build's
  framework layout matches the simulator's. `pnpm release:privacy-audit <path/to/PawCue.app>` on the archive's
  `.app` is the check.

## Production configuration guard

`assertProductionEnvironment()` runs when `app.config.ts` is evaluated with `EAS_BUILD_PROFILE=production` — the
build worker — and throws with every problem listed: Supabase URL and anon key present and not the staging ref,
the platform's RevenueCat public key present and correctly prefixed, Terms and Privacy URLs present and `https`,
and no `EXPO_PUBLIC_` value that looks like a secret key. Every other profile, local prebuild and simulator audit
is untouched. Today a production build **would fail** this guard, correctly: the environment still points at
staging and carries no legal URLs.

## Production Supabase

Creating the project via CLI was blocked by the operator's tooling policy, so the account owner created
`juhkjelqfrbbhgzmedgs` in the dashboard. Everything after that ran from the repository on 2026-09-13:
`pnpm release:supabase:production` linked (the CLI's login role needs no database password), applied 5/5
migrations, seeded the catalogue once, deployed the four functions; `--push-config` applied the
`[remotes.production]` auth overrides (password sign-up off, anonymous on, Apple on with `com.pawcue.app`) — after
the block was extended to pin hosted defaults so the local template's `127.0.0.1` values could not overwrite them.
The EAS `production` environment now names the production project. The smoke suite passed 45/45 on staging and
45/45 on production; the advisors report no ERROR-level findings; the project holds catalogue rows and nothing
else. `tools/db/guard.mjs` stands in front of `db:reset` and `db:test` so neither can run against anything but
staging, and the CLI was re-linked to staging at the end.

## What was genuinely tested

- Deployed `account-delete` on staging: 44 cases, every refusal verified by reading the victim's data back.
- Smoke suite on staging: 45 cases, self-cleaning.
- SQL security suite: 93 cases (+3 private relay).
- Jest: provider Apple/deletion (18), deletion screen (12), account screen (10), privacy manifest (7), release
  hardening (+8), plus the existing suites.
- Hardened prebuilds, both platforms: iOS manifest merged with all four API categories and four data types,
  entitlement `com.apple.developer.applesignin` present, `CFBundleAllowMixedLocalizations` set; Android
  permissions unchanged.
- Privacy audit script on the Phase 9 artifact: fails on the real gap; passes with the new manifest substituted.

## PENDING EXTERNAL VALIDATION

The real Apple sign-in handshake · a production build passing the environment guard (still needs legal URLs and
the RevenueCat key) · account deletion erasing a real RevenueCat subscriber · the archive's privacy manifest on a
device build · everything listed in `docs/release/revenuecat-setup.md`.
