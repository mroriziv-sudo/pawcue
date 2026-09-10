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
  - [ ] Subscription management surfaced via the standard "Manage Subscription" deep link, not a custom flow that
        could read as obstruction.
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
- [ ] **Restore Purchases** button present and functional on the paywall.
- [ ] **Subscription disclosure** on the paywall: price, billing period, trial length if any, price after trial,
      auto-renewal statement, cancellation instructions — all per §33 of the brief, no exceptions.
- [ ] **Accessibility** — VoiceOver pass on the full critical path (Phase 11 gate).
- [ ] **Support URL** live.
- [ ] **Terms of Use (EULA)** — either Apple's standard EULA or a custom one, linked from the paywall per store
      requirement for auto-renewing subscriptions.
- [ ] **Reviewer test account** — if guest mode alone doesn't let a reviewer reach premium screens, provide
      credentials/notes in the App Review submission form.
- [ ] Age rating questionnaire completed accurately (no medical/veterinary advice claims — see PRIVACY/training
      content safety notes).

## Google Play

- [ ] **Target API level 36 (Android 16)** — mandatory for new app submissions/updates since **2026-08-31**
      (extension to 2026-11-01 available). This deadline has already passed as of today; do not plan around it as
      "upcoming."
- [ ] **Play Billing Library v8+** — mandatory on the same 2026-08-31 deadline. Confirm whichever billing SDK
      (RevenueCat or expo-iap) vendors a v8-compatible Play Billing dependency before locking Phase 8.
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
- [ ] `isPremium` is never a client-trusted boolean anywhere in the codebase — grep for this before every release
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
- [ ] **`SYSTEM_ALERT_WINDOW` must not ship.** React Native declares it in its _debug_ manifest, but
      `expo-dev-client` puts it in the **main** manifest, so a release build that still carries `expo-dev-client`
      would request "draw over other apps" — a Play Store review flag for an app with no such feature. Before
      submission: build the production profile and assert the merged release manifest contains no
      `SYSTEM_ALERT_WINDOW`, and that `expo-dev-client` is absent from the release binary.
- [ ] **`READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE`** arrive transitively from `expo-file-system`, capped at
      `android:maxSdkVersion="32"` so they are inert on the API 33+ devices we target. Confirm they are still
      capped, and declare them accurately in the Data Safety form if they survive.
- [ ] **`MODIFY_AUDIO_SETTINGS` is intentionally kept** — a normal, auto-granted Android permission needed to
      configure the audio session. Not privacy-sensitive and not on the brief's forbidden list.
- [ ] **`ios.infoPlist.ITSAppUsesNonExemptEncryption`** is unset; EAS warns that App Store Connect will require it
      to be answered manually before testing. Set it explicitly (almost certainly `false`) rather than answering it
      by hand each submission.

## Sign-off

This checklist is not "done" until every box above is checked **against the actual build being submitted**, in the
release phase (Phase 12+), by re-reading the live Apple/Google documentation on that day — this document is a
starting point verified 2026-09-09, not a substitute for that final pass.
