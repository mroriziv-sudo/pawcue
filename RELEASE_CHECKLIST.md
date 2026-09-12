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
      lookalike.
  - [ ] Handle Apple private relay email correctly server-side (forwarding domain, no assumption the email is
        stable/human-readable).
  - [ ] Korea-based developer note: if we ever have a KR-registered developer entity, a server-to-server notification
        endpoint for the Services ID is required as of 2026-01-01 — not applicable to a US-registered developer
        account, confirm which entity actually owns the App Store Connect account before shipping.
- [ ] **In-app purchase** — auto-renewable subscriptions only through Apple's IAP (via RevenueCat/StoreKit, see
      tech-stack-versions.md). No external payment links on iOS (Apple's external-link entitlement program is a
      separate, opt-in negotiation not assumed here).
  - [x] Subscription management surfaced via the standard "Manage Subscription" deep link
        (`apps.apple.com/account/subscriptions` / `play.google.com/store/account/subscriptions`), not a custom
        in-app cancellation flow.
- [ ] **Privacy manifest (`PrivacyInfo.xcprivacy`)** — enforced at upload since 2024, still active. Every SDK/code
      path using a "required reason" API (UserDefaults outside an app group, disk space, file timestamps, system boot
      time, active keyboard) must declare its reason. Audit this whenever a new dependency is added, not just once.
- [ ] **Account deletion** — in-app path (Settings → Account → Delete Account) implemented per §14 of the brief,
      before submission (Apple requires this for any app supporting account creation).
- [ ] **Privacy Policy URL** live and accessible before submission.
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
      requirement for auto-renewing subscriptions. **Blocking:** the links exist on the paywall but
      `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_PRIVACY_URL` are unset, so they currently say so instead of opening.
      PawCue has no domain yet (see ARCHITECTURE.md §2 naming).
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
- [ ] **Account deletion — in-app** (§14) **and a public, login-free, HTTPS web URL** (`/delete-account`, §14) linked
      from the Data Safety form. The web route must go directly to the deletion request flow, not a marketing
      homepage.
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

## Phase 9 audit (2026-09-12) — classification of every open item

Read against the repository as built at Phase 9. Categories: **complete** · **externally blocked** (needs an
account, console or credential the repository cannot hold) · **physical device** · **content/design** · **store
configuration** · **code blocker** (a code change belongs in the release phase).

| Item                                           | Class               | Note                                                                                  |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| Xcode 26 / iOS 26 SDK toolchain                | externally blocked  | EAS production image; confirmed when the first production build runs                  |
| Sign in with Apple (4.8) + private relay       | code blocker        | Provider throws `ProviderNotConfiguredError`; needs Apple capability + implementation |
| In-app purchase via IAP only                   | complete            | RevenueCat over StoreKit 2; no external payment path exists                           |
| Manage-subscription deep link                  | complete            |                                                                                       |
| Privacy manifest (`PrivacyInfo.xcprivacy`)     | code blocker        | Must be generated/audited on the production archive for required-reason APIs          |
| Account deletion in-app                        | code blocker        | `apiRoutes.accountDelete()` exists; no endpoint or screen                             |
| Privacy Policy URL live                        | externally blocked  | No domain; `EXPO_PUBLIC_PRIVACY_URL` unset                                            |
| App Privacy questionnaire                      | store configuration | Fill from DATA_MAP.md                                                                 |
| Restore Purchases                              | complete            | Reachable on paywall and Settings; real store restore pending sandbox                 |
| Subscription disclosure from store data        | complete            | Price/period/trial from RevenueCat product; verified by tests, sandbox pending        |
| Store products configured                      | store configuration | `premium_monthly` / `premium_annual` in App Store Connect + RevenueCat offering       |
| Accessibility VoiceOver pass                   | physical device     |                                                                                       |
| Support URL live                               | externally blocked  | No domain                                                                             |
| Terms of Use linked                            | externally blocked  | No domain; `EXPO_PUBLIC_TERMS_URL` unset                                              |
| Reviewer test account                          | store configuration | Guest mode reaches the paywall; note this in the review form                          |
| Age rating                                     | store configuration |                                                                                       |
| Android target API 36                          | store configuration | Set by Expo SDK 57 defaults; confirm on the release bundle                            |
| Play Billing v8+                               | store configuration | Confirm the SDK's vendored version on the release bundle                              |
| Cancellation ≤ 2 taps                          | complete            | Settings → Manage subscription → store                                                |
| Data Safety form                               | store configuration |                                                                                       |
| Account deletion web URL                       | externally blocked  | No domain                                                                             |
| Play privacy policy / content rating           | store configuration |                                                                                       |
| Permission declarations match manifest         | complete            | Hardened prebuild audited; `BILLING` added by RevenueCat with a product reason        |
| Binary scanning (no obfuscation)               | complete            | Hermes bytecode only; no dynamic code loading                                         |
| No dark patterns on paywall                    | complete            | Audited in Phases 7–8                                                                 |
| No ad SDK / ATT                                | complete            | None present; `NSUserTrackingUsageDescription` absent                                 |
| `isPremium` never client-trusted               | complete            | Server-derived; verify/webhook fail closed; 14 endpoint cases                         |
| Dev entitlement simulation cannot ship         | complete            | `__DEV__` chokepoint; `billing-dev-guard`, `production-guards` tests                  |
| EN/HE/RTL full pass                            | physical device     | Simulator pass done in Phase 8; device pass outstanding                               |
| PRIVACY/SECURITY/DATA_MAP current              | content/design      | Re-read at submission                                                                 |
| Clicker sound decision                         | content/design      | C — Crisp preferred; not finalised                                                    |
| Remove dev clicker selector                    | content/design      | Gated and asserted absent from release; decision pending                              |
| Production Supabase project                    | externally blocked  | EAS `production` env currently points at the **staging** project — must be replaced   |
| RevenueCat secrets on the Supabase project     | externally blocked  | `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH` unset; endpoints answer `501`  |
| Apple Developer signing for a production build | externally blocked  | Needs the Apple account; see the Phase 9 report for the exact steps                   |
