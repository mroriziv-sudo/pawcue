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
