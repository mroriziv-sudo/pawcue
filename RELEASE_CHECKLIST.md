# Release checklist

Verified against live research on **2026-09-09** (see [docs/architecture/tech-stack-versions.md](docs/architecture/tech-stack-versions.md)
for sources). **Re-verify every item against official Apple/Google documentation again immediately before Phase 12
submission** — store policy moves faster than this document. Nothing here may be treated as "compliant" until every
box is actually checked against the app in hand, not just planned for.

## Apple App Store

- [ ] **Xcode 26 + iOS 26 SDK** — mandatory for all App Store Connect uploads since **2026-04-28** (already in
      effect). Build must use this toolchain from day one, not retrofitted later.
- [ ] **Sign in with Apple (Guideline 4.8)** — required _because_ we also offer Google sign-in (third-party/social
      login triggers the requirement). Must meet: (a) collect only name + email, (b) support Apple's private-relay
      "Hide My Email," (c) no tracking without consent. Use Apple's official button component/styling, not a custom
      lookalike. **Code complete (Phase 9.5):** native flow, nonce-bound, email scope only, Apple's own button
      where available (`src/providers/apple-sign-in.ts`). Unchecked because the App ID capability needs the Apple
      membership and the Supabase provider needs enabling; the real handshake has not run.
  - [x] Handle Apple private relay email correctly server-side (forwarding domain, no assumption the email is
        stable/human-readable). Derived by the profile trigger (migration `20260913120000`); 3 SQL cases.
  - [ ] Korea-based developer note: if we ever have a KR-registered developer entity, a server-to-server notification
        endpoint for the Services ID is required as of 2026-01-01 — not applicable to a US-registered developer
        account, confirm which entity actually owns the App Store Connect account before shipping.
- [ ] **In-app purchase** — auto-renewable subscriptions only through Apple's IAP (via RevenueCat/StoreKit, see
      tech-stack-versions.md). No external payment links on iOS (Apple's external-link entitlement program is a
      separate, opt-in negotiation not assumed here).
  - [x] Subscription management surfaced via the standard "Manage Subscription" deep link
        (`apps.apple.com/account/subscriptions` / `play.google.com/store/account/subscriptions`), not a custom
        in-app cancellation flow.
- [x] **Privacy manifest (`PrivacyInfo.xcprivacy`)** — enforced at upload since 2024, still active. Every SDK/code
      path using a "required reason" API (UserDefaults outside an app group, disk space, file timestamps, system boot
      time, active keyboard) must declare its reason. Audit this whenever a new dependency is added, not just once.
      **Audited 2026-09-13** on the Phase 9 release artifact with `pnpm release:privacy-audit`: found
      `ExpoFileSystem.framework` using DiskSpace with no declaration anywhere; declared in `app.json`
      (`ios.privacyManifests`) with `E174.1`, verified on a hardened prebuild and against the artifact's binaries.
      Pinned by `__tests__/privacy-manifest.test.ts`. **Re-run the audit on the final archive's `.app`.**
- [x] **Account deletion** — in-app path (Settings → Account → Delete account and data) implemented in Phase 9.5
      per §14 of the brief: explicit acknowledgement before the destructive button enables, server deletes the
      verified JWT's subject only, RevenueCat customer erased first, local state cleared only after confirmation,
      guests included. `pnpm test:delete` 44/44 against the deployed function.
- [ ] **Privacy Policy URL** live and accessible before submission. Draft ready for review:
      `docs/legal/privacy-policy.md` (placeholders for operator, contact, domain, region). Needs a domain.
- [ ] **App Privacy ("nutrition label") questionnaire** in App Store Connect filled out to match `DATA_MAP.md`
      exactly — including 2026's expanded granularity around any third-party AI data sharing (not applicable to v1,
      since no AI coach is enabled by default — confirm this stays true before submission) and the in-app
      data-deletion mechanism callout.
- [x] **Restore Purchases** button present and functional on the paywall (also in Settings → Subscription, in
      every entitlement state). Idempotent and never reports success when nothing was restored.
- [x] **Subscription disclosure** on the paywall: price, billing period and trial length all rendered from
      store-provided data (no currency literal exists in `app/paywall.tsx`), plus the auto-renewal statement.
      Asserted in `__tests__/paywall.test.tsx`, including that a trial is disclosed only when the store reports one.
- [ ] **Store products configured** in App Store Connect / Play Console. Until they are, the paywall correctly
      reports that no plans are available — which is honest, and unshippable.
- [ ] **Accessibility** — VoiceOver pass on the full critical path (Phase 11 gate).
- [ ] **Support URL** live.
- [ ] **Terms of Use (EULA)** — either Apple's standard EULA or a custom one, linked from the paywall per store
      requirement for auto-renewing subscriptions. Draft ready for review: `docs/legal/terms-of-use.md`, including
      Apple's minimum EULA terms. **Blocking:** the links exist on the paywall (and in Settings, when set) but
      `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_PRIVACY_URL` are unset, so they currently say so instead of opening;
      a production build now refuses to start without both. PawCue has no domain yet (see ARCHITECTURE.md §2).
- [ ] **Reviewer test account** — if guest mode alone doesn't let a reviewer reach premium screens, provide
      credentials/notes in the App Review submission form.
- [ ] Age rating questionnaire completed accurately (no medical/veterinary advice claims — see PRIVACY/training
      content safety notes).

## Google Play

- [ ] **Target API level 36 (Android 16)** — mandatory for new app submissions/updates since **2026-08-31**
      (extension to 2026-11-01 available). This deadline has already passed as of today; do not plan around it as
      "upcoming."
- [ ] **Play Billing Library v8+** — mandatory on the same 2026-08-31 deadline. `react-native-purchases@10.9.1`
      is installed; **confirm its vendored Play Billing version is ≥ 8** from the Android release build's
      dependency report before Play submission (not verifiable from a prebuild; store configuration).
  - [ ] Subscription cancellation reachable in **≤2 taps** from the subscription management screen (2026 Play policy
        requirement post-Epic-settlement).
- [ ] **Data Safety form** — completed to match `DATA_MAP.md` exactly, including the 2026 stricter "Android ID"
      (now explicit "Device or other IDs") and collection-vs-sharing distinction for any SDK data flows (crash
      reporting, if enabled).
- [ ] **Account deletion — in-app** (§14, **done**) **and a public, login-free, HTTPS web URL** (`/delete-account`,
      §14) linked from the Data Safety form. The web route must go directly to the deletion request flow, not a
      marketing homepage. Page drafted: `docs/legal/delete-account-page.md`; needs a domain.
- [ ] **Privacy Policy URL** live and accessible before submission.
- [ ] **Content rating questionnaire** completed accurately.
- [ ] **Permission declarations** match exactly what the manifest actually requests — no unused permissions (we
      request none of location/microphone/contacts/Bluetooth/motion/health per §18, so this should be a short list:
      notifications (only after opt-in), photo picker (only on explicit "Add dog photo" tap)).
- [ ] Automated pre-review binary scanning (new in 2026) — no obfuscated/dynamically-loaded code paths that would
      trip this; keep the bundle straightforward.

## Cross-cutting (both stores)

- [ ] No fake scarcity, countdowns, pre-selected deceptive options, hidden close buttons — audited against §33 line
      by line on the actual paywall UI, not just the copy.
- [ ] No advertising SDK, no cross-app tracking, no ATT prompt on iOS (nothing to justify it in v1).
- [x] `isPremium` is never a client-trusted boolean anywhere in the codebase — grep for this before every release.
      As built: the only writer of `entitlements` is `recompute_entitlement`, which is revoked from every client
      role; a store purchase callback moves the flow to a verification state and cannot unlock anything on its own.
- [x] Development-only entitlement simulation cannot activate in a release build — guarded at a single chokepoint
      and asserted by flipping `__DEV__` in `__tests__/billing-dev-guard.test.tsx`.
      build as a mechanical check, not just a design intention.
- [ ] English + Hebrew + RTL pass on the full critical path (Phase 10 gate) before either store submission.
- [ ] `PRIVACY.md`, `SECURITY.md`, `DATA_MAP.md` up to date with what the shipped build actually does, not what an
      earlier phase planned.

## Native declaration audit (added after the Phase 2 iOS acceptance pass)

Findings from auditing the generated `Info.plist` / `AndroidManifest.xml`. None of these are visible from the JS
source, which is exactly why they need a checklist entry.

- [x] **`NSMicrophoneUsageDescription` / `RECORD_AUDIO` removed.** `expo-audio`'s plugin declares microphone
      access, a media-playback foreground service and the iOS `audio` background mode **by default**, because the
      library also supports recording. This app only plays a 45ms click in the foreground. Fixed by configuring the
      plugin explicitly (`microphonePermission: false`, `recordAudioAndroid: false`,
      `enableBackgroundRecording: false`, `enableBackgroundPlayback: false`) and locked by
      `apps/mobile/__tests__/app-config.test.ts`. **Re-audit the generated manifests after any dependency upgrade.**
- [x] **`SYSTEM_ALERT_WINDOW` must not ship.** Confirmed present in the **main** manifest of a plain prebuild
      (from `expo-dev-menu`). `plugins/withReleaseHardening.js` blocks it with `tools:node="remove"` for the
      production profile, which survives library manifest merging; verified on a hardened prebuild on 2026-09-12.
      Re-verify on the actual Android release bundle before Play submission.
- [x] **`READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE`** arrive transitively from `expo-file-system`, capped at
      `android:maxSdkVersion="32"`. Confirmed still capped on the 2026-09-12 prebuild. Declare them in the Data
      Safety form (they are declared, even if inert on API 33+).
- [ ] **`MODIFY_AUDIO_SETTINGS` is intentionally kept** — a normal, auto-granted Android permission needed to
      configure the audio session. Not privacy-sensitive and not on the brief's forbidden list.
- [x] **`NSFaceIDUsageDescription` removed.** `expo-secure-store` injects it by default, but the app stores tokens
      without `requireAuthentication`, so Face ID is never invoked. A usage description for a capability the app
      never exercises is exactly what App Store review asks about. Fixed with `faceIDPermission: false`, confirmed
      absent from a regenerated `Info.plist`, and locked by `apps/mobile/__tests__/app-config.test.ts`.
- [x] **`ios.infoPlist.ITSAppUsesNonExemptEncryption`** is set to `false` by the release-hardening plugin for
      production builds (the app uses only platform TLS). Confirmed on the hardened prebuild.
- [x] **`NSLocalNetworkUsageDescription` / `NSBonjourServices` / `NSAllowsArbitraryLoads` / `RCTMetroPort` must not
      ship.** All present in a plain prebuild (from `expo-dev-launcher`), plus an `NSAllowsLocalNetworking` ATS
      exception. Removed at prebuild by `plugins/withReleaseHardening.js` for production; the pure transform is
      tested in `__tests__/release-hardening.test.ts` and the hardened prebuild was audited on 2026-09-12: zero
      `NS*UsageDescription` keys, ATS `{ NSAllowsArbitraryLoads: false }` only. Re-verify on the archive.

## Product decisions that must be closed before release

- [ ] **Choose the clicker sound.** Three candidates ship behind a `__DEV__` selector pending a listening test on
      a physical device — see [docs/architecture/clicker-sound-design.md](docs/architecture/clicker-sound-design.md).
- [ ] **Remove the developer-only clicker sound selector**, or get explicit approval to keep it. It is gated on
      `__DEV__` and asserted absent from a release render by `apps/mobile/__tests__/dev-only-ui.test.tsx`, so it
      cannot ship accidentally — but the gate is not a substitute for the decision.

## Sign-off

This checklist is not "done" until every box above is checked **against the actual build being submitted**, in the
release phase (Phase 12+), by re-reading the live Apple/Google documentation on that day — this document is a
starting point verified 2026-09-09, not a substitute for that final pass.

## Phase 9.5 release-blocker matrix (2026-09-13)

Every remaining item, classified. Categories: **DONE** · **WAITING FOR APPLE MEMBERSHIP** · **REQUIRES MY MANUAL
CONFIGURATION** · **REQUIRES PHYSICAL IPHONE** · **REQUIRES TESTFLIGHT / APPLE SANDBOX** · **REQUIRES GOOGLE
PLAY** · **REQUIRES LEGAL/CONTENT DECISION** · **TRUE CODE BLOCKER**. (The Phase 9 table this replaces is in git
history at `f0aeb65`.)

| Item                                                   | Class                               | Note                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-app purchase via IAP only                           | DONE                                | RevenueCat over StoreKit 2; no external payment path                                                                                                                                                                                        |
| Manage-subscription deep link; cancellation ≤ 2 taps   | DONE                                |                                                                                                                                                                                                                                             |
| Restore Purchases                                      | DONE                                | Real store restore is sandbox-pending (below)                                                                                                                                                                                               |
| Subscription disclosure from store data                | DONE                                |                                                                                                                                                                                                                                             |
| Account deletion in-app                                | DONE                                | Phase 9.5; 44 server + 12 UI cases                                                                                                                                                                                                          |
| Sign-out                                               | DONE                                | Phase 9.5; shares the local reset with deletion                                                                                                                                                                                             |
| Private-relay email handling                           | DONE                                | Server-derived; 3 SQL cases                                                                                                                                                                                                                 |
| Privacy manifest declarations                          | DONE                                | DiskSpace gap found and closed; archive re-check is a TestFlight item                                                                                                                                                                       |
| Permission declarations match manifest                 | DONE                                | Hardened prebuilds re-audited 2026-09-13 after adding Apple auth + crypto: unchanged                                                                                                                                                        |
| Dev tooling / entitlement simulation cannot ship       | DONE                                | `production-guards`, `billing-dev-guard`, release hardening                                                                                                                                                                                 |
| Production environment fails safely                    | DONE                                | `assertProductionEnvironment` blocks a store build with staging URL, missing keys or legal URLs                                                                                                                                             |
| `isPremium` never client-trusted                       | DONE                                |                                                                                                                                                                                                                                             |
| No dark patterns; no ad SDK / ATT                      | DONE                                |                                                                                                                                                                                                                                             |
| Binary scanning (no obfuscation)                       | DONE                                | Hermes bytecode only                                                                                                                                                                                                                        |
| Sign in with Apple — code                              | DONE                                | Real handshake not run — see next two rows                                                                                                                                                                                                  |
| Sign in with Apple — App ID capability                 | WAITING FOR APPLE MEMBERSHIP        | EAS enables it on the App ID when credentials are set up; entitlement already in the build config                                                                                                                                           |
| Xcode 26 / iOS 26 toolchain on a production build      | WAITING FOR APPLE MEMBERSHIP        | Confirmed when the first signed production build runs                                                                                                                                                                                       |
| Apple distribution certificate / provisioning          | WAITING FOR APPLE MEMBERSHIP        | Do not retry until the membership is active                                                                                                                                                                                                 |
| App Store Connect app record, subscription products    | WAITING FOR APPLE MEMBERSHIP        | Then `docs/release/revenuecat-setup.md` App Store Connect steps                                                                                                                                                                             |
| Production Supabase project                            | REQUIRES MY MANUAL CONFIGURATION    | Create it (dashboard/CLI), record the ref, run `pnpm release:supabase:production` — `docs/release/production-supabase.md`                                                                                                                   |
| Apple provider enabled on production Supabase          | REQUIRES MY MANUAL CONFIGURATION    | `--push-config` or the dashboard, client id `com.pawcue.app`                                                                                                                                                                                |
| RevenueCat project, offering, keys, webhook            | REQUIRES MY MANUAL CONFIGURATION    | `docs/release/revenuecat-setup.md`; secrets via `supabase secrets set`, public key via `eas env:set`                                                                                                                                        |
| EAS `production` env → production Supabase             | REQUIRES MY MANUAL CONFIGURATION    | Currently staging; the build guard refuses until replaced                                                                                                                                                                                   |
| Privacy Policy / Terms / Support / delete-account URLs | REQUIRES LEGAL/CONTENT DECISION     | Drafts in `docs/legal/`; need review, an operator name/contact, and a domain; then `eas env:set` both URLs                                                                                                                                  |
| Hebrew legal texts                                     | REQUIRES LEGAL/CONTENT DECISION     | English governs until decided                                                                                                                                                                                                               |
| App Privacy questionnaire / Data Safety form           | REQUIRES MY MANUAL CONFIGURATION    | Fill from DATA_MAP.md and `app.json` privacy manifest (they agree by test)                                                                                                                                                                  |
| Age rating, category, reviewer notes, screenshots      | REQUIRES LEGAL/CONTENT DECISION     | Draft in `docs/release/app-store-launch-pack.md`; ASO validation pending                                                                                                                                                                    |
| Clicker sound decision; remove dev selector            | REQUIRES LEGAL/CONTENT DECISION     | Gated and asserted absent from release builds; the product decision is open                                                                                                                                                                 |
| Real purchase / restore / renewal / refund / transfer  | REQUIRES TESTFLIGHT / APPLE SANDBOX | Every item in `docs/release/revenuecat-setup.md` "PENDING EXTERNAL VALIDATION"                                                                                                                                                              |
| Real Sign in with Apple handshake + merge              | REQUIRES TESTFLIGHT / APPLE SANDBOX | Also needs a physical device for Apple's sheet                                                                                                                                                                                              |
| Privacy manifest on the final archive                  | REQUIRES TESTFLIGHT / APPLE SANDBOX | `pnpm release:privacy-audit <archive .app>`                                                                                                                                                                                                 |
| Account deletion against a real RevenueCat subscriber  | REQUIRES TESTFLIGHT / APPLE SANDBOX |                                                                                                                                                                                                                                             |
| VoiceOver pass; EN/HE/RTL device pass; clicker latency | REQUIRES PHYSICAL IPHONE            | Simulator passes done; device passes outstanding                                                                                                                                                                                            |
| Play Billing v8+, target API 36, Play Console products | REQUIRES GOOGLE PLAY                | Confirm the SDK's vendored Billing version on the release bundle                                                                                                                                                                            |
| Google sign-in                                         | REQUIRES LEGAL/CONTENT DECISION     | Not built (needs OAuth client ids + provider). Its button is now behind `googleSignInEnabled` (off), so no non-functional control ships; an Apple-only launch is compliant. **Decision:** launch Apple-only, or build Google before launch. |
| Guest-merge conflict resolution                        | REQUIRES LEGAL/CONTENT DECISION     | `409` is surfaced honestly with a clear message; "keep guest / keep account" is not built. A dead end only for a user who trained on two identities and signs in with the second — acceptable for launch or not is a product call.          |

**TRUE CODE BLOCKER: none.** Every remaining item is waiting on the Apple membership, on manual configuration,
on a device or store environment, or on a decision.
