# Phase 2 — iOS native acceptance pass

Run 2026-09-10, after Xcode became available. This records what was exercised **on a real iOS runtime**, what was
not, and why — kept separate from
[phase-2-verification.md](phase-2-verification.md) (which covers the browser/bundle pass) so the two are never
conflated.

## Environment

|                   |                                                                    |
| ----------------- | ------------------------------------------------------------------ |
| Xcode             | 26.6 (build 17F113)                                                |
| `xcode-select -p` | `/Applications/Xcode.app/Contents/Developer`                       |
| iOS SDK           | 26.5 (`iphonesimulator26.5`)                                       |
| Simulator device  | **iPhone 17 Pro** (`C7B79175-4F9C-48DF-A861-29B49014782F`)         |
| Runtime           | **iOS 26.5** (23F77)                                               |
| Host app          | **Expo Go** (SDK 57.0.0) — _not_ a development build, see Blockers |
| Physical device   | **none available**                                                 |

Xcode 26 + iOS 26 SDK also satisfies the App Store upload floor recorded in RELEASE_CHECKLIST.md.

## Blockers hit (and why a development build was not produced)

The brief asked for a development build rather than Expo Go. That was attempted and is **blocked**:

1. `expo prebuild --platform ios` succeeded and generated `ios/` with a Podfile — so CocoaPods is required.
2. CocoaPods requires Ruby ≥ 3.1; macOS system Ruby is **2.6.10**. Installing it walks a dependency chain that
   each fail in turn on that Ruby (`ffi` → `securerandom` → `drb`).
3. Homebrew (the normal way to get a newer Ruby/CocoaPods) **requires `sudo`**, which this environment does not
   have: `Need sudo access on macOS (e.g. the user oriziv needs to be an Administrator)!`

Separately, **UI tap automation is unavailable**: AppleScript/System Events is not granted Accessibility
permission, so `osascript` hangs. This also broke `expo start --ios`, which shells out to `osascript` to activate
the Simulator window — it crashed with exit 7 _after_ bundling. Workaround: run Metro headless (`expo start`) and
open the app with `xcrun simctl openurl`.

Consequence: everything below was driven through `simctl` (launch, locale, Dynamic Type, screenshots) and Metro
logs. Anything requiring a tap was **not** exercised.

## Actually exercised on the iOS 26.5 simulator

| Area                          | Result                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bundling**                  | iOS bundle built, **1475 modules**, first build 9.9s                                                                                                                   |
| **App boot / cold launch**    | Renders correctly; verified across **9 launches**                                                                                                                      |
| **Runtime errors**            | **Zero** errors, warnings, redboxes or unhandled exceptions across all 9 launches                                                                                      |
| **English (LTR)**             | Correct copy, layout, safe areas, Dynamic Island clearance, status bar                                                                                                 |
| **Hebrew text**               | Correct Hebrew copy rendered natively, right-aligned                                                                                                                   |
| **Device-locale detection**   | Simulator set to `he-IL` with storage cleared → app detected and persisted `he-IL`. This exercises the real `resolveDeviceLocale` path on device                       |
| **Locale persistence**        | Written to native AsyncStorage (`{"pawcue.settings.language":"he-IL"}`), survives kill/relaunch                                                                        |
| **Dynamic Type**              | `content_size accessibility-extra-large`: heading wrapped to two lines, body reflowed, nothing clipped — the capped-heading / uncapped-body policy behaves as designed |
| **Guest auth**                | Anonymous Supabase sessions created from the native app; **5 users, 5 matching `profiles` rows** — the Phase 0 `handle_new_auth_user` trigger fires on device          |
| **Session survives relaunch** | Cold relaunch produced **no new user** (count stayed 5) — the session resumed from the iOS Keychain via SecureStore                                                    |
| **Account deletion cascade**  | Deleting the test users dropped `profiles` to 0, confirming `ON DELETE CASCADE`                                                                                        |
| **Permissions on launch**     | **No permission dialog of any kind** appeared across 9 launches                                                                                                        |
| **Service-role secret**       | **Absent from the iOS bundle** — checked the 8.2MB served bundle against the real service-role key; also 0 occurrences of a `service_role` claim                       |

## RTL findings — the important one

**Native RTL layout mirroring is NOT verified, and cannot be in Expo Go.**

Investigated rather than assumed. Instrumented `applyLocale` and observed on device:

```
[RTL-DIAG] locale=he-IL shouldBeRtl=true I18nManager.isRTL=false doesRTLFlipLeftAndRightStyles=undefined
[RTL-DIAG] after forceRTL(true): isRTL=false
```

- The code path **did** execute (`isRTL=false` ≠ `shouldBeRtl=true`, so the early return was skipped).
- `I18nManager.forceRTL(true)` is a **silent no-op in Expo Go**: it does not throw, `isRTL` stays `false`, and
  **nothing is written to NSUserDefaults** (no `RCTI18nUtil_*` keys).
- After a full app restart, the layout still did not mirror — "הגדרות" stayed top-right.

This is an Expo Go limitation, not a defect in our code: `forceRTL` sets an **app-level** native preference read at
startup, and Expo Go is a shared host that must not let one experience permanently flip its own layout. Verifying
it requires our own binary — i.e. the development build that CocoaPods currently blocks.

What _is_ verified natively: Hebrew text rendering, right-alignment, device-locale detection, and locale
persistence. What is **not**: flex/row mirroring, navigation header and back-arrow mirroring, tab bar, card and
modal mirroring, icon mirroring, and gesture/transition direction.

## Defect found and fixed

**The app claimed it was restarting when nothing ever restarts.** `applyLocale` returns `requiresReload: true`
after a direction change and Settings displayed _"Restarting to apply the new layout direction…"_ — but no reload
is ever triggered, so on a real device the user would wait for a restart that never comes.

Fixed by making the copy truthful in both locales:

- en-US: _"Reopen the app to apply the new layout direction."_
- he-IL: _"פתחו מחדש את האפליקציה כדי להחיל את כיוון הפריסה החדש."_

The proper long-term fix is to actually trigger the reload (`expo-updates` `reloadAsync()` in production,
`DevSettings.reload()` in development). That is deliberately **not** implemented here because it cannot be
verified without a development build; it belongs with the RTL work once that unblocks.

## Not exercised in this pass (needs tap automation)

Clicker press, press-count threshold, in-app language switching, navigation to Settings, modal presentation, back
navigation, switch toggles, VoiceOver focus traversal. These need either Accessibility permission for AppleScript,
or `idb` (which needs Homebrew, which needs sudo). The same flows **are** covered by the 20 Jest render tests and
the 13 browser runtime checks.

## Still requires a physical iPhone — cannot be settled by any simulator

- **Real haptic feedback.** The Simulator has no haptic engine; `expo-haptics` calls are no-ops there. Nothing
  about haptics has been verified on real hardware.
- **Real click-to-sound latency** against the 50ms budget (`CLICK_LATENCY_BUDGET_MS`). Simulator audio runs
  through the host's CoreAudio stack and is not representative of device latency.
- **Real silent-mode / audio-session behaviour**, including the `playsInSilentMode` setting and the physical
  ring/silent switch, which the Simulator does not model.
- **Hardware lifecycle and interruption behaviour**: incoming calls, Siri, other apps taking the audio session,
  route changes (AirPods/Bluetooth), and true background/foreground audio resumption.
- Real-device performance: cold-launch time, memory, and audio-thread behaviour under load.

## Regression run after this pass

```
pnpm verify   → EXIT 0   (prettier, eslint x5, tsc x5, 170 Vitest tests, 20 Jest tests)
pnpm db:test  → 49/49 ALL CHECKS PASSED
```

---

# Addendum — EAS cloud development build (2026-09-10)

Follow-up pass using an **EAS cloud build** instead of local CocoaPods, to avoid changing the local
Ruby/Homebrew environment and without needing Terminal Accessibility permission.

## What was set up

|                         |                                                                                |
| ----------------------- | ------------------------------------------------------------------------------ |
| `expo-dev-client`       | **57.0.18** (SDK 57 compatible)                                                |
| EAS profile             | **`development-simulator`** — `developmentClient: true`, `ios.simulator: true` |
| Production profile      | **deliberately not defined**, so no production build can be triggered          |
| Apple Developer account | **not required** — no signing/credentials referenced anywhere                  |
| EAS project             | `@oriziv/pawcue` (`c84c5b35-84e8-4d5b-9277-d5531c83e48c`)                      |
| Build                   | `46b489ad-0f74-411c-b253-09641f1e684d` → **FINISHED**                          |

Because `developmentClient: true` means JS is served by **local** Metro at runtime, the cloud build compiles only
the native shell — **no Supabase keys or app secrets were uploaded to EAS**.

## Verified from the built artifact

The `.app` (51MB) was downloaded and its **shipped `Info.plist`** audited directly — stronger evidence than
inspecting prebuild output:

- **No** `NSMicrophoneUsageDescription`
- **No** `UIBackgroundModes`
- **None** of `NSLocation*`, `NSContacts*`, `NSCameraUsageDescription`, `NSUserTrackingUsageDescription`,
  `NSBluetooth*`, `NSMotionUsageDescription`, `NSHealth*`
- `CFBundleIdentifier` = `com.pawcue.app`, version `0.1.0`, `MinimumOSVersion` 16.4
- `EXDevLauncher.bundle` / `EXDevMenu.bundle` present, as expected for a development build

Installed on the **iPhone 17 Pro / iOS 26.5** simulator and launched: it runs as **PawCue, independently of
Expo Go**, showing its own launcher ("PawCue — Development Build") and detecting the local Metro server.

## Defect found and fixed: microphone permission was being declared

`expo-audio` also supports **recording** and background playback, so its config plugin injects, **by default**:

- iOS: `NSMicrophoneUsageDescription` ("Allow PawCue to access your microphone") and `UIBackgroundModes: ["audio"]`
- Android: `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`

This app only ever **plays** a 45ms click in the foreground. Declaring microphone access directly contradicts
brief §18 ("Do NOT request: microphone"), PRIVACY.md, DATA_MAP.md, and this repo's own
`FORBIDDEN_PERMISSIONS` list. It was invisible from the JS source — it only exists in the generated native
manifests, which is precisely why it survived every previous phase.

Fixed at the source using the plugin's own flags:

```json
[
  "expo-audio",
  {
    "microphonePermission": false,
    "recordAudioAndroid": false,
    "enableBackgroundRecording": false,
    "enableBackgroundPlayback": false
  }
]
```

`MODIFY_AUDIO_SETTINGS` is **intentionally kept**: a normal, auto-granted Android permission needed to configure
the audio session, not privacy-sensitive and not on the forbidden list.

Locked by `apps/mobile/__tests__/app-config.test.ts`, which asserts the plugin flags and that the config declares
none of the eight permission classes the brief forbids.

## Further native-declaration findings (recorded in RELEASE_CHECKLIST.md)

- **`SYSTEM_ALERT_WINDOW` would ship in a release build.** React Native declares it in its _debug_ manifest, but
  `expo-dev-client` places it in the **main** manifest. A release build still carrying `expo-dev-client` would
  request "draw over other apps". Must be asserted absent from the release manifest before submission.
- `READ_/WRITE_EXTERNAL_STORAGE` arrive transitively from `expo-file-system`, capped `maxSdkVersion="32"`, so
  inert on the API 33+ devices we target.
- `ios.infoPlist.ITSAppUsesNonExemptEncryption` is unset; EAS warns App Store Connect will require it manually.

## The verification boundary now

**Automated tapping is still unavailable** (Terminal lacks Accessibility permission), and the dev launcher needs
one tap to attach to Metro. So the interactive matrix — RTL mirroring, clicker presses, in-app language switching,
navigation, modals — requires a human in the Simulator.

Crucially, the result of that manual pass **can be verified programmatically afterwards**: this is our own binary,
so `I18nManager.forceRTL` should persist `RCTI18nUtil_forceRTL` into `com.pawcue.app`'s NSUserDefaults. That domain
was confirmed **absent** before the manual pass, so its appearance is unambiguous evidence rather than
interpretation.

Unchanged: everything requiring real hardware — haptics, click-to-sound latency, silent-mode/audio-session
behaviour, and phone-call/Siri interruptions — remains **device-only** and is not claimed here.
