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

## Confirmed: the dev build executes the real UI natively

After the launcher was attached to Metro by hand, the development build served and rendered the app:

```
Metro up (dev-client mode)
iOS Bundled 399ms .../expo-router/entry.js (1224 modules)
```

A simulator screenshot (`xcrun simctl io booted screenshot`, no Accessibility permission needed) shows the
clicker screen rendered by the **dev build**, not Expo Go: title, subtitle, clicker, press counter, Settings
control, and — at a press count of 3 — the "Ready to use it for real?" prompt with its CTA. Captured as
[`assets/phase-2-dev-build-clicker.png`](./assets/phase-2-dev-build-clicker.png).

This promotes several rows from _bundled_ to **actually executed on the simulator**:

| Behaviour                             | Evidence                                                          |
| ------------------------------------- | ----------------------------------------------------------------- |
| App boots natively outside Expo Go    | Own bundle id `com.pawcue.app`, own launcher, Metro bundle served |
| Expo Router renders the index route   | Clicker screen on screen                                          |
| Design tokens applied natively        | Warm Ivory ground, brand-primary clicker, type scale as specified |
| Safe-area insets honoured             | Content clears the Dynamic Island and home indicator              |
| `PressableScale` handles real touches | Press count advanced on real taps                                 |
| The 3-press reveal gate (brief §4)    | Prompt + CTA appeared exactly at 3                                |
| i18n resolves at runtime              | English strings rendered from the catalogue, not keys             |
| LTR layout                            | Settings control at top-**right**                                 |
| No permission dialog on first launch  | None shown at boot or on first press                              |

The press counter is decisive on that last-but-one point: `pressCount` is `useState(0)` in
`src/hooks/useClicker.ts` with no persistence, so a displayed 3 can only mean three real press events were
delivered after mount — it cannot be restored state.

Still **not** claimed, and not claimable here: whether the click was _audible_ (the Simulator renders audio
through the host, which proves nothing about the on-device audio session), plus the hardware-only list above.

## Manual acceptance pass — results

The manual Simulator pass was performed by the product owner on the EAS development build (iPhone 17 Pro,
iOS 26.5). It settled the outstanding RTL question and found one blocking defect.

### RTL — now verified

| Step                                           | Result                                                       |
| ---------------------------------------------- | ------------------------------------------------------------ |
| English → Hebrew                               | **Pass**                                                     |
| Hebrew persists across a full kill + relaunch  | **Pass**                                                     |
| **Native RTL layout mirroring**                | **Pass** — "הגדרות" moved to the top-**left** after relaunch |
| Hebrew → English                               | **Pass**                                                     |
| English persists across a full kill + relaunch | **Pass**                                                     |
| Layout returns to LTR, Settings top-right      | **Pass**                                                     |

This closes the gap recorded above. `I18nManager.forceRTL` is a silent no-op in Expo Go but works correctly in
our own binary, exactly as predicted — the limitation was Expo Go's, not a defect in the app.

### Blocker found: the clicker was silent on roughly every other press

Reported symptom: the counter and the press animation advanced on every press, but audio played on only about
half of them, alternating.

**Root cause.** `AudioPlayer.play()` is synchronous; `AudioPlayer.seekTo()` returns a `Promise` because it wraps
a native `seek(to:completionHandler:)`. The original implementation was:

```ts
void player.seekTo(0); // asynchronous — lands later
player.play(); // synchronous — runs immediately
```

so `play()` always ran _before_ the rewind landed. A one-shot sound parks its player at the end of the item when
it finishes, and `play()` on a player already at its end produces no sound — it is not an error, just silence.
Hence the alternation: press 1 plays and ends parked at `duration`; press 2 is swallowed, and the late seek then
returns the position to 0; press 3 plays; press 4 is swallowed.

**Fix.** Two changes, in `src/audio/clicker-engine.ts`, neither of which delays a press:

1. **Reset after playback, never before it.** A voice returns to position 0 once its clip has finished — via the
   `didJustFinish` status event, with a timer backstop so correctness does not depend on an event we do not
   control. Pressing costs exactly one synchronous `play()`, which is strictly less work than before.
2. **A pool of six voices.** Rapid presses land on different voices and overlap naturally instead of stealing
   each other's playback.

No debounce, throttle or delay was added; every press issues exactly one playback request.

**A second bug was caught by the new tests.** `refresh()` (the foreground handler) originally skipped voices it
believed were already armed — but a suspended audio session is precisely the case where that belief is wrong, so
the first press after returning from the background could be silent. It now distrusts the flag and re-seeks every
idle voice.

**Why tests missed the original defect.** The Jest mock was
`{ play: jest.fn(), seekTo: jest.fn(), remove: jest.fn() }`. It returned `undefined` where the real `seekTo`
returns a promise, and modelled no playback position, so playing from the end of a clip was indistinguishable
from playing from the start. It has been replaced with a fake that models position, asynchronous seeks, and
silent playback at end-of-clip — and the suite now includes a reproduction of the original implementation that
asserts the exact `[true, false, true, false, true, false]` pattern, which both documents the bug and proves the
fake is faithful.

### Permission re-audit after the fix

Re-run against freshly generated native projects (`expo prebuild --clean`), not just the config:

|                                                                  | iOS Info.plist             | Android main manifest                              |
| ---------------------------------------------------------------- | -------------------------- | -------------------------------------------------- |
| Microphone                                                       | absent                     | `RECORD_AUDIO` absent                              |
| Background audio                                                 | `UIBackgroundModes` absent | `FOREGROUND_SERVICE*` absent, no services declared |
| Location / contacts / camera / bluetooth / motion / health / ATT | all absent                 | all absent                                         |

**A second permission declared without cause was found and fixed.** `expo-secure-store` injects
`NSFaceIDUsageDescription` by default, but the app stores tokens without `requireAuthentication`, so Face ID is
never invoked. Fixed with `faceIDPermission: false` and confirmed absent from a regenerated Info.plist.

`MODIFY_AUDIO_SETTINGS` and `VIBRATE` are intentionally kept — normal, auto-granted Android permissions needed to
configure the audio session and fire haptics. `SYSTEM_ALERT_WINDOW` and the `maxSdkVersion="32"` storage
permissions remain as previously documented in RELEASE_CHECKLIST.md.

### Still device-only, still not claimed

The Simulator routes audio through the host's output device, so it can show that playback was _requested_ and
that the engine's state machine behaves, but it cannot establish real-world audio behaviour. Unchanged and
**not claimed**: haptics, real click-to-sound latency, silent-mode/audio-session behaviour, phone-call and Siri
interruptions, Bluetooth/AirPods routing, and how each candidate sounds on a phone speaker outdoors.

The final choice of clicker sound is therefore explicitly deferred to a listening test on a physical iPhone.

## Second silence defect: silent after the first pool cycle

Reported after the voice-pool engine shipped: the first six or so presses sounded, then everything went quiet,
reproducibly, while the counter kept advancing.

### Reproduced by measurement, not by assumption

UI tap automation is unavailable, so the engine was instrumented (`src/audio/clicker-engine.ts` trace hook plus
`src/audio/clicker-diagnostics.ts`) and driven through the **real** `expo-audio` players on the simulator,
recording for every press what the engine believed against what the player reported. Enable with
`EXPO_PUBLIC_CLICKER_DIAG=1`; results are written to AsyncStorage and can be read from the app container.

The first sweep reproduced it exactly, and ruled out the obvious suspect: **every re-arm seek did work**
(`rearm-done` reported `positionAfter: 0` every single time). The failure was block-structured — whole pool
cycles alternating:

```
presses  1–6   position at play 0       audible
presses  7–12  position at play 0.038   SILENT   ← 0.038s is the end of the 38ms clip
presses 13–18  position at play 0       audible
presses 19–20  position at play 0.038   SILENT
```

The ordered trace for one voice showed the mechanism:

```
2331ms  play         before=0
2415ms  rearm-seek   before=0.0042   playing=TRUE    ← seek issued 84ms after play(), only 4.2ms into the clip
2455ms  rearm-done   after=0         playing=TRUE    ← voice flagged ready, while still sounding
2598ms  finished     after=0.038                     ← clip ends and parks at its end; re-arm is skipped
                                                        because the voice is already flagged ready
4883ms  play         before=0.038                    ← next press on this voice: silent
```

### Root cause

**`play()` returns long before audio begins.** Measured on device, AVPlayer took roughly 80ms to actually start —
`play()` at 2331ms, and at 2415ms the player had advanced just 4.2ms into the clip.

The re-arm was scheduled from the moment `play()` was _called_, at clip length + 40ms. With a 38ms clip that is
78ms, which lands in the middle of playback. That premature seek did two harmful things: it restarted the click
during its own attack, and it set `armed = true` before the playback it was meant to follow had finished. When
`didJustFinish` then arrived and parked the player at the end of the clip, `rearm()` returned early — the voice
was already flagged armed. The voice was left believing it sat at zero while its player sat at the end, and every
later press on it was silent until the next timer happened to reset it.

No fixed margin can fix this: start latency is variable and unbounded.

### Fix

The player, not a flag, is now the source of truth.

1. **A voice is never re-armed while it is still sounding.** If the re-arm check finds `playing` true it looks
   again in 25ms (bounded at 40 attempts) instead of seeking. This also removes the audible mid-attack restart.
2. **`didJustFinish` clears the ready flag before re-arming**, since the player has just parked itself at the end
   and any prior belief is void.
3. **The press path verifies readiness against the player** — not sounding, and within 1ms of the start. A voice
   whose flag has drifted is corrected and skipped rather than played silently.

No debounce, no throttle, no added delay on the press path, and the pool is still six voices.

### Why the existing tests missed it

The fake modelled playback as beginning the instant `play()` returned, so the re-arm timer always fired after
`didJustFinish` and the ordering that causes the bug was unreachable. The fake now models the measured start
latency.

The "pool exhaustion" test did not catch it either, for a different reason: it pressed every 5ms, so voices were
still in flight and every press went down the _recycle_ path, which seeks before playing — and that masks a stale
ready flag completely. The bug only appears at ordinary tapping speed, on the fast path, on the second pool cycle.

### Proof the fix holds

Re-run on the simulator against the real players after the fix:

| Scenario  | Presses | Interval | Silent |
| --------- | ------- | -------- | ------ |
| normal    | 20      | 400ms    | **0**  |
| rapid     | 20      | 60ms     | **0**  |
| sustained | 50      | 250ms    | **0**  |
| varied    | 30      | 150ms    | **0**  |
| **total** | **120** |          | **0**  |

Every press had a position of 0 at the moment `play()` was called.

In the suite, 12 tests fail against the old logic and pass against the fix — including 7, 12, 20 and 50 presses,
several complete pool cycles, varying intervals, and an explicit invariant check that no voice parked at the end
of its clip is ever handed to a press.

### Still device-only

Unchanged: haptics, real click-to-sound latency, silent-mode and audio-session behaviour, call/Siri interruptions,
Bluetooth routing, and how each candidate sounds through a phone speaker. The simulator can prove the state
machine is correct and that playback is genuinely under way; it cannot establish how it sounds.
