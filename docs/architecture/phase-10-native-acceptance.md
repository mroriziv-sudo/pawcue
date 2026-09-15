# Phase 10 — iOS native acceptance pass

Run 2026-09-15 on the first development build that carries Phase 10's six native modules. This records what was
exercised **on a real iOS runtime**, what was not, and why — kept apart from
[phase-10-field-notebook.md](phase-10-field-notebook.md) (what the phase built) so the two are never conflated.
It follows the shape of [phase-2-native-acceptance.md](phase-2-native-acceptance.md), and inherits that machine's
limits: no tap automation, everything driven through `xcrun simctl`, deep links and Metro.

**Outcome in one line:** the build boots, three cold launches are clean, Hebrew comes up right-to-left from the
device locale alone, and three blocking defects were found and fixed — each on its own commit with a test. The
Phase 10 gate in RELEASE_CHECKLIST.md stays open until the owner's manual pass at the end of this document.

## Environment

|                  |                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Xcode            | 26.6 (build 17F113), `/Applications/Xcode.app/Contents/Developer`                                                               |
| iOS SDK          | 26.5 (`iphonesimulator26.5`)                                                                                                    |
| Simulator device | **iPhone 17 Pro** (`C7B79175-4F9C-48DF-A861-29B49014782F`), runtime **iOS 26.5**                                                |
| EAS build        | `5ddd4fa0-c389-49b8-8cad-1977fbec94ff`, profile `development-simulator`, finished 2026-09-15 17:57                              |
| Commit built     | `03aecf2` (feat(phase-10)), fingerprint `2acd963e7386ca5741686e6ac7c92084e9607cdf`                                              |
| Artifact         | `https://expo.dev/artifacts/eas/kH8Xk2No4loflWZIkJkbkI9ehmyWB9WOZcoNKvkRAWw.tar.gz` (67 MB)                                     |
| JS               | Local Metro on port 8090 (`pnpm --filter @pawcue/mobile start -- --port 8090 --dev-client`), staging Supabase from `.env.local` |
| Physical device  | **none available**                                                                                                              |

Port 8090 because two `expo start --dev-client` servers from before Phase 10 were still holding 8081 and 8082;
they were left alone. Metro ran with `CI=1`, which disables file watching, so it was restarted after each fix.

## Verified from the binary

The `.app` was extracted from the artifact. The main `PawCue` binary is a 124 KB stub; the code is in
`PawCue.debug.dylib` (165 MB) and the frameworks beside it.

| Check                                                                                                     | Result                                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `RNSVGCircle` (react-native-svg)                                                                          | present in the dylib, with `RNSVGSvgView`, `RNSVGPath`, `RNSVGRect`, `RNSVGEllipse`                                       |
| `ExpoImagePicker`                                                                                         | present in the dylib                                                                                                      |
| `RNDateTimePicker`                                                                                        | present in the dylib                                                                                                      |
| `RNCPicker`                                                                                               | present in the dylib                                                                                                      |
| `ExpoSymbols`                                                                                             | present in the dylib                                                                                                      |
| `ExpoFileSystem`                                                                                          | present as its own `ExpoFileSystem.framework`                                                                             |
| `NSPhotoLibraryUsageDescription`                                                                          | present: "PawCue uses your photo library only to set a picture for your dog's profile."                                   |
| Camera, microphone, location, contacts, motion, Face ID, Bluetooth, health, tracking, `UIBackgroundModes` | **all absent**                                                                                                            |
| Identity                                                                                                  | `com.pawcue.app`, version 0.1.0, `MinimumOSVersion` 16.4, URL schemes `pawcue` and `exp+pawcue`, localizations `en`, `he` |

The dev client previously installed on the simulator predated Phase 10 and lacked all six modules; it was
uninstalled, which also cleared app data, and this build installed in its place. The installed dylib is
byte-identical to the audited one.

## How the pass was driven

- **Launch and attach.** `xcrun simctl launch` for cold launches; the first attach to Metro through the dev
  client's own deep link (`pawcue://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8090`), after which the
  launcher reconnects on its own. The dev menu's one-time onboarding sheet and its floating button were turned off
  through the preferences the dev menu itself reads (`EXDevMenuIsOnboardingFinished`,
  `EXDevMenuShowFloatingActionButton`, `EXDevMenuShowsAtLaunch`), so no screenshot carries dev-client chrome.
- **Routes** by `xcrun simctl openurl booted pawcue://<route>`; screenshots by `xcrun simctl io booted screenshot`.
- **State without taps.** The repo already exposes dev-only bridges for simulator acceptance (`__sessionDev`,
  `__accountDev`). This pass reached them through Metro's own inspector channel (the Hermes debugger websocket, a
  raw Chrome DevTools Protocol `Runtime.evaluate`; Expo only admits it from origin `http://127.0.0.1:8090`). It
  was used for four things, each named where it matters below: creating the dog through the app's own
  `createFromDraft` action (the same call onboarding's Continue makes), advancing a session with the session
  store's own `completeStep`/`addRepetition`, reading the route stack and the LogBox store, and scrolling the dev
  preview through React's fiber tree. Nothing was tapped; nothing tap-driven is claimed.
- **Hebrew** by setting the simulator's `AppleLanguages`/`AppleLocale` to `he-IL`/`he_IL` in the global domain and
  rebooting the simulator, with the app uninstalled and reinstalled so nothing carried over.
- **Dynamic Type** by `xcrun simctl ui booted content_size accessibility-extra-large`, reset to `medium` after.
- **Concurrent use.** During the Hebrew pass the Simulator window was the frontmost app on the Mac and received
  input that this automation did not send: a name was typed into the onboarding field, a Back control was pressed,
  Settings was opened, the language was switched to English, one full session was completed by hand, and the app
  was closed once. Every screenshot cited here was taken only after reading the route (and, in Hebrew, the
  language and native direction) back from the running app, and the contaminated ones were re-shot. The one
  effect kept on purpose: Progress in Hebrew shows the session that was completed by hand.

## Actually exercised on the iOS 26.5 simulator

| Area                           | Result                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bundling**                   | 1,704 modules at first launch; 1,874 once every route had been visited (the dev client bundles lazily)                                                                                                                                                                                                                   |
| **Cold launch**                | Three consecutive cold launches in English at the default size after the fixes, plus every relaunch during the pass: one bundle each, Today rendered with the seeded dog                                                                                                                                                 |
| **Redboxes / native warnings** | **Zero.** The Metro log and the LogBox store hold exactly one entry per launch: `[RevenueCat] Error fetching offerings` — the billing SDK reporting that this simulator has no store products. Not a native-module warning, not Phase 10; it shows as a LogBox toast in development builds, so the owner will see it too |
| **Permissions on launch**      | No permission dialog of any kind                                                                                                                                                                                                                                                                                         |
| **The six native modules**     | SVG marks and the drawn dog render on every screen; SF Symbols render for the standard marks; the native picker wheels and the segmented date spinner render in the profile editor. `expo-image-picker` was not invoked (it needs the Choose a photo tap)                                                                |
| **Guest auth and the API**     | Anonymous session created on each fresh install; a dog row created on staging through the app's own action; the plan generated; one session synced ("Everything is synced." in Settings)                                                                                                                                 |
| **Hebrew from device locale**  | Fresh install with the device in `he-IL`: `I18nManager.isRTL === true` at first launch with **no** `RCTI18nUtil_*` preference written — RTL came from the app's `he` localization, so no relaunch was needed                                                                                                             |
| **Layout mirroring**           | Native. Rows' leading column on the right, chevrons on the left pointing into the page, inset hairlines from the right, counts trailing on the left, tab order reversed, push transitions entering from the left, the native Switch and picker wheels mirrored                                                           |
| **Dynamic Type**               | Both languages at `accessibility-extra-large` from a cold launch: rows grow, headlines wrap by whole words, capped variants hold, the name input holds its 1.6× cap, nothing clipped                                                                                                                                     |

## English findings

Screenshots in [`assets/phase-10/en/`](assets/phase-10/en/), at the default size, iPhone 17 Pro, halved in
resolution for the repository. A fresh install lands in onboarding; Today and the clicker route redirect there
until a dog exists or onboarding is declined. Every other route renders in its no-dog state
(`*-nodog.png`). The populated screens were reached by creating "Luna", a Beagle born 2025-03-14, through the
app's own create action, and are labelled as seeded, not as walked.

Judged against DESIGN_SYSTEM.md and the Phase 10 doc, the language holds: paper ground everywhere, ink type at
the committed scale, rows with inset hairlines and no cards except the allowed tappable objects (option tiles,
breed tiles, plan tiles), 15pt section labels in sentence case, no pills, tints, icon tiles or paw, the drawn dog
as the only decoration, SF Symbols for the standard marks, amber only on counted reps. Where a screen bends a rule
it is listed under design-judgment findings below.

| Screen                           | State reached                                                                  | Screenshot                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding welcome               | Fresh install                                                                  | [`en/onboarding.png`](assets/phase-10/en/onboarding.png)                                                                                                   |
| Onboarding, name step            | Fresh install; field focused                                                   | [`en/onboarding-steps.png`](assets/phase-10/en/onboarding-steps.png)                                                                                       |
| Onboarding, breed step           | Draft stepped to 4 through the store                                           | [`en/onboarding-breed.png`](assets/phase-10/en/onboarding-breed.png)                                                                                       |
| Today                            | Seeded dog; a Sit session paused by the earlier session deep link              | [`en/today.png`](assets/phase-10/en/today.png)                                                                                                             |
| Train                            | No dog / seeded dog                                                            | [`en/train-nodog.png`](assets/phase-10/en/train-nodog.png), [`en/train.png`](assets/phase-10/en/train.png)                                                 |
| Progress                         | Empty: no session has run                                                      | [`en/progress-nodog.png`](assets/phase-10/en/progress-nodog.png)                                                                                           |
| Dog                              | No dog / seeded dog                                                            | [`en/dog-nodog.png`](assets/phase-10/en/dog-nodog.png), [`en/dog.png`](assets/phase-10/en/dog.png)                                                         |
| Profile editor                   | No dog / seeded dog, native wheels                                             | [`en/dog-profile-nodog.png`](assets/phase-10/en/dog-profile-nodog.png), [`en/dog-profile.png`](assets/phase-10/en/dog-profile.png)                         |
| Clicker                          | Seeded dog                                                                     | [`en/clicker.png`](assets/phase-10/en/clicker.png)                                                                                                         |
| Lesson overview (Sit)            | Seeded dog                                                                     | [`en/lesson-sit.png`](assets/phase-10/en/lesson-sit.png)                                                                                                   |
| Session, step 1                  | Deep link starts the session                                                   | [`en/session-sit-nodog.png`](assets/phase-10/en/session-sit-nodog.png)                                                                                     |
| Session, step 3 (clicker + reps) | Steps 1–2 completed through the store; 0 then 2 reps counted through the store | [`en/session-sit-step3.png`](assets/phase-10/en/session-sit-step3.png), [`en/session-sit-step3-2reps.png`](assets/phase-10/en/session-sit-step3-2reps.png) |
| Settings                         | No dog / seeded dog                                                            | [`en/settings-nodog.png`](assets/phase-10/en/settings-nodog.png), [`en/settings.png`](assets/phase-10/en/settings.png)                                     |
| Account                          | Guest                                                                          | [`en/account-nodog.png`](assets/phase-10/en/account-nodog.png)                                                                                             |
| Paywall                          | Store unavailable (no products on this simulator)                              | [`en/paywall-nodog.png`](assets/phase-10/en/paywall-nodog.png)                                                                                             |
| Delete account                   | Guest                                                                          | [`en/delete-account-nodog.png`](assets/phase-10/en/delete-account-nodog.png)                                                                               |

Two things this environment cannot show: the paywall's plan tiles (the store returns no products, so the screen
shows its unavailable state), and the Today skeleton (the plan resolves faster than a screenshot).

**Confirmed live, from the Phase 10 doc's "behaviour that changed on purpose":** Today's resume control appeared
for a paused Sit that today's plan did not list (the plan held The Name Game) —
[`en/today.png`](assets/phase-10/en/today.png).

**States not reached without a tap:** the completion screen, the troubleshooting sheet, the photo sheet and the
photo-library dialog, a lesson's "unfinished" status on the server (needs a session abandoned through the UI), the
onboarding steps 2, 3 and 5 as a user would fill them, the plan tiles, the language switch as a tap, and any
pressed state.

## Hebrew and RTL findings

Screenshots in [`assets/phase-10/he/`](assets/phase-10/he/). Fresh install with the device in `he-IL`, then the
same seeding ("לונה", a Beagle).

**Verdict.** The app boots in Hebrew with a native right-to-left layout from the device locale alone, and after
the fixes below every screen mirrors correctly: rows' leading column on the right and text on the reading edge
beside it, inset hairlines starting from the right, trail marks and step segments filling from the right,
chevrons and the Back control mirrored, the undo mark mirrored by its registered decision, the play, pause,
check, lock, clock, search, clicker, treat and repeat marks not mirrored, the dog mirrored so its pricked ear and
tail swap sides, Hebrew line height visibly looser than Latin with no tracking, tab labels and the segmented
control in Hebrew, dates and counts in the Hebrew locale form ("יום שלישי, 15 בספטמבר", "כ-4 דקות"), nothing
clipped or ellipsised that is not also clipped in English. The picker wheels put years on the right and months on
the left; the native Switch sits in the trailing slot on the left with its knob mirrored; a pushed screen enters
from the left edge.

**Before the fix**, the mirroring was already right and the text was wrong: every Hebrew paragraph sat flush-left
— wrapped headline lines hugged the left edge, row titles hugged the chevrons instead of the marks, and the
PawCue wordmark sat top-left ([`he/onboarding-before-fix.png`](assets/phase-10/he/onboarding-before-fix.png),
[`he/train-before-fix.png`](assets/phase-10/he/train-before-fix.png)). See "Defects fixed" for the cause.

| Screen                   | Screenshot                                                                                                                                     | Pair                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Onboarding welcome       | [`he/onboarding.png`](assets/phase-10/he/onboarding.png)                                                                                       | `en/onboarding.png`                                          |
| Onboarding, name step    | [`he/onboarding-steps.png`](assets/phase-10/he/onboarding-steps.png)                                                                           | `en/onboarding-steps.png`                                    |
| Today                    | [`he/today.png`](assets/phase-10/he/today.png) — the plan after the hand-completed session                                                     | `en/today.png`                                               |
| Train                    | [`he/train.png`](assets/phase-10/he/train.png)                                                                                                 | `en/train.png`                                               |
| Progress                 | [`he/progress.png`](assets/phase-10/he/progress.png) — one session, completed by hand                                                          | `en/progress-nodog.png` (empty)                              |
| Dog                      | [`he/dog.png`](assets/phase-10/he/dog.png)                                                                                                     | `en/dog.png`                                                 |
| Profile editor           | [`he/dog-profile.png`](assets/phase-10/he/dog-profile.png)                                                                                     | `en/dog-profile.png`                                         |
| Clicker                  | [`he/clicker.png`](assets/phase-10/he/clicker.png)                                                                                             | `en/clicker.png`                                             |
| Lesson overview          | [`he/lesson-sit.png`](assets/phase-10/he/lesson-sit.png)                                                                                       | `en/lesson-sit.png`                                          |
| Session, step 1 / step 3 | [`he/session-sit-nodog.png`](assets/phase-10/he/session-sit-nodog.png), [`he/session-sit-step3.png`](assets/phase-10/he/session-sit-step3.png) | `en/session-sit-nodog.png`, `en/session-sit-step3-2reps.png` |
| Settings                 | [`he/settings.png`](assets/phase-10/he/settings.png)                                                                                           | `en/settings.png`                                            |
| Account                  | [`he/account.png`](assets/phase-10/he/account.png)                                                                                             | `en/account-nodog.png`                                       |
| Paywall                  | [`he/paywall.png`](assets/phase-10/he/paywall.png)                                                                                             | `en/paywall-nodog.png`                                       |
| Delete account           | [`he/delete-account.png`](assets/phase-10/he/delete-account.png)                                                                               | `en/delete-account-nodog.png`                                |

Hebrew copy findings (not layout, listed for the owner): the dog's sex is recorded as female, yet the age phrase,
the profile hint and the "already knows" section use masculine forms ("בן 18 חודשים", "בערך בן כמה?", "נולד",
"מה לונה כבר יודע"); and one prefix before a number lacks its hyphen ("נלמד ב15 בספטמבר" where the app writes
"כ-4" elsewhere).

## Dynamic Type findings

`accessibility-extra-large`, both languages, screenshots in [`assets/phase-10/en-axl/`](assets/phase-10/en-axl/)
and [`assets/phase-10/he-axl/`](assets/phase-10/he-axl/), each set taken from a **cold launch at that size**.

| Screen                | English                                                                        | Hebrew                                                                         |
| --------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Today                 | [`en-axl/today.png`](assets/phase-10/en-axl/today.png)                         | [`he-axl/today.png`](assets/phase-10/he-axl/today.png)                         |
| Train                 | [`en-axl/train.png`](assets/phase-10/en-axl/train.png)                         | [`he-axl/train.png`](assets/phase-10/he-axl/train.png)                         |
| Lesson overview (Sit) | [`en-axl/lesson-sit.png`](assets/phase-10/en-axl/lesson-sit.png)               | [`he-axl/lesson-sit.png`](assets/phase-10/he-axl/lesson-sit.png)               |
| Session, step 3       | [`en-axl/session-sit-step3.png`](assets/phase-10/en-axl/session-sit-step3.png) | [`he-axl/session-sit-step3.png`](assets/phase-10/he-axl/session-sit-step3.png) |
| Settings              | [`en-axl/settings.png`](assets/phase-10/en-axl/settings.png)                   | [`he-axl/settings.png`](assets/phase-10/he-axl/settings.png)                   |
| Paywall               | [`en-axl/paywall.png`](assets/phase-10/en-axl/paywall.png)                     | [`he-axl/paywall.png`](assets/phase-10/he-axl/paywall.png)                     |
| Onboarding, name step | [`en-axl/onboarding-steps.png`](assets/phase-10/en-axl/onboarding-steps.png)   | —                                                                              |

- Nothing clipped; rows grow rather than truncate; headlines wrap by whole words (Hebrew Train's headline to three
  lines, Today's coach line to four beside the bust).
- The capped variants hold: headline at 1.7×, buttons at 1.8×, the display numeral at 1.4×, and the name input's
  1.6× cap as the Phase 10 doc describes
  ([`en-axl/onboarding-steps.png`](assets/phase-10/en-axl/onboarding-steps.png)).
- The session dock keeps its shape: numeral, marks, clicker and the two controls in place; the instruction sits in
  its own scroll region, so its subline and the troubleshooting control fall below that region's fold with no
  visible scroll cue ([`he-axl/session-sit-step3.png`](assets/phase-10/he-axl/session-sit-step3.png)).
- Tab labels held on one line only after the second fix below; before it, the Hebrew Progress label broke in the
  middle of the word.
- **Changing the size while the app is running** left already-mounted screens with stale text layout — glyphs
  clipped to slivers on Today until a relaunch
  ([`he-axl/today-after-live-size-change.png`](assets/phase-10/he-axl/today-after-live-size-change.png)), while a
  freshly rendered screen was fine and a cold launch at the same size was fine. Whether this reproduces when a
  person changes text size in iOS Settings with the app in the background is a device question (the simulator
  command may not fire the same notification); it is on the manual checklist and not claimed either way.
- Marks do not scale with the text: chevrons, the check, the plus and the undo mark stay at their point size
  beside text two and a half times larger ([`he-axl/settings.png`](assets/phase-10/he-axl/settings.png)).

## The dev preview

`pawcue://dev-preview` renders the whole system. Its first screen is
[`en/dev-preview.png`](assets/phase-10/en/dev-preview.png); the rest was reached by scrolling the ScrollView
through React's fiber tree (no tap), and the pages that matter are kept: rows and the trail
([`dev-preview-4.png`](assets/phase-10/en/dev-preview-4.png)), fields and onboarding controls
([`dev-preview-5.png`](assets/phase-10/en/dev-preview-5.png)), the breed picker
([`dev-preview-7.png`](assets/phase-10/en/dev-preview-7.png)), the marks side by side with their SF Symbol
([`dev-preview-17.png`](assets/phase-10/en/dev-preview-17.png),
[`dev-preview-18.png`](assets/phase-10/en/dev-preview-18.png)), the generic dog and the nine families in bust,
scene and happy poses ([`dev-preview-19.png`](assets/phase-10/en/dev-preview-19.png)), the exact breeds, the
photo, resting and senior states ([`dev-preview-21.png`](assets/phase-10/en/dev-preview-21.png)) and the Today
states and skeletons ([`dev-preview-22.png`](assets/phase-10/en/dev-preview-22.png)).

**Drift against the desktop preview:** `node --experimental-strip-types tools/dog-art/preview.mjs <outDir>` was
run and its sheets compared with the device. The geometry agrees — same blaze, ear forms, caps, coats and poses
for the generic dog and every family; the only differences are presentational (the device draws busts on the
paper disc with its hairline ring, the sheet draws bare heads). No drift.

**Dev-preview-only findings** (a `__DEV__` screen, nothing ships): each family row is wider than the screen and
its last bust is clipped at the right edge; the "Platform symbols on iOS" switch uses the iOS default green rather
than evergreen; embedding the whole breed picker makes the page some 13,000pt tall, most of it the alphabetic list;
the sample photo is the Expo icon.

## Defects fixed

Each on its own commit, each with a test that would fail against the previous code. `pnpm verify` was green
before every commit.

### 1. Hebrew text sat flush-left under a native RTL layout — `30b29d9`

**Symptom.** Every paragraph on the Hebrew build aligned to the left edge while the layout around it mirrored
correctly. **Cause.** React Native flips `left`/`right` text alignment itself whenever the native hierarchy is laid
out right-to-left (Fabric: `RCTAttributedTextUtils.mm`, keyed on Yoga's resolved direction; Paper:
`RCTTextAttributes.mm`). The design system already resolved `start` to `right` for Hebrew, so the two flips
cancelled. Expo Go never showed it because it cannot lay the hierarchy out RTL — which is also why the Phase 2
pass recorded Hebrew as right-aligned. Read off the live element: the wordmark's resolved style was
`textAlign: "right", writingDirection: "rtl"`, and it drew on the left.

**Fix.** `resolveTextStyle` takes the native layout direction (`I18nManager.isRTL`, passed by the Text primitive)
and pre-flips the physical edge when the native layout is RTL. While the native layout still lags a language
change — Hebrew chosen in Settings, app not yet relaunched — nothing is flipped and the value stays physical, which
this pass also observed live after the owner's switch to English. Inputs are untouched: the iOS text-input path
never sets a layout direction on its attributes, and the profile editor's name field was already on the right.

**Decision encoded.** The one the design system always stated: Hebrew aligns to the reading edge. The existing
alignment tests are unchanged and still true (they describe a native LTR layout); two resolver cases and a render
test with `I18nManager.isRTL` set document the swap and the lagging state
(`packages/ui/src/primitives/styles/styles.test.ts`, `apps/mobile/__tests__/rtl-text-alignment.test.tsx`).

### 2. Tab labels broke mid-word at the largest accessibility size — `c2cf7e3`

**Symptom.** At `accessibility-extra-large` the Hebrew Progress label wrapped as "התקד / מות" inside the tab bar.
**Cause.** The tab bar caps its labels at 1.3× and says why beside the prop; the Text primitive spread the caller's
props and then set the variant's own default (uncapped, for a caption) after them, so the cap never reached React
Native. **Fix.** An explicit `maxFontSizeMultiplier` wins over the variant default; nothing else changes.
**Decision encoded.** The one already written beside the tab bar: a label the caller has bounded stays bounded,
and above the bound the platform's large-content viewer is the accessible route
(`apps/mobile/__tests__/text-scaling-cap.test.tsx`).

### 3. Hebrew → English → Hebrew without a relaunch came back left-to-right — `e5168c7`

**Symptom.** Seen live: after the language was switched to English and back in one process, the next launch
opened Hebrew in a left-to-right layout, with Settings owing a "reopen the app" notice. **Cause.** `applyLocale`
compared the language with `I18nManager.isRTL` — the running process — and returned early when they agreed, so the
switch back never re-saved the preference the English switch had written. **Fix.** The native preference is
written for the chosen language every time (`allowRTL`/`forceRTL` are idempotent), and a reopen is reported only
when the running direction differs. **Decision encoded.** The stored language is the source of truth for the
native direction; the running process only decides whether a reopen is still owed
(`apps/mobile/__tests__/layout-direction-persistence.test.ts`). Confirmed on the simulator: the same double switch
followed by a relaunch comes back RTL with nothing pending, and `RCTI18nUtil_forceRTL` reads `true` on disk.

## Design-judgment findings for the owner

Ranked. Each names the screenshot and the rule it bends; none was changed.

1. **The breed picker's "Common" grid collapses to one column.** Every tile is `width: "48%"` plus a 1pt margin
   on both sides, and two of those plus the 12pt gap need 352pt inside a 350pt content width, so each tile wraps
   onto its own row and `flexGrow` stretches it full-width: seven 215pt cards before the search reaches the list.
   [`en/onboarding-breed.png`](assets/phase-10/en/onboarding-breed.png),
   [`en/dev-preview-7.png`](assets/phase-10/en/dev-preview-7.png). Rule: the picker's own "two columns" intent.
2. **One paused lesson reads three ways.** Today says "Pick up Sit where you left off", the Dog tab marks it
   paused, Train says "Not started." with the plain mark, and the overview button says "Start Sit". Train and the
   overview read only the server-derived status; Today and Dog also consult the local active session.
   [`en/today.png`](assets/phase-10/en/today.png), [`en/train.png`](assets/phase-10/en/train.png),
   [`en/lesson-sit.png`](assets/phase-10/en/lesson-sit.png). Rule: the trail vocabulary has a paused state.
3. **Two dark objects on Today.** The clicker shortcut top-right and the primary button are both evergreen fills.
   [`en/today.png`](assets/phase-10/en/today.png). Rule: one dark object per screen.
4. **Text controls sit off the text edge.** "Not working?", "Choose a photo" and "I know the exact date" start a
   button-padding's width in from the gutter that the headline above them sits on.
   [`en/session-sit-nodog.png`](assets/phase-10/en/session-sit-nodog.png), [`en/dog.png`](assets/phase-10/en/dog.png),
   [`en/dog-profile.png`](assets/phase-10/en/dog-profile.png). Rule: marks and text share edges.
5. **The paywall says the store failure twice.** With no products, the "Plans aren't available right now" block
   and the alert line "Something went wrong. Please try again." both render from the same failed fetch.
   [`en/paywall-nodog.png`](assets/phase-10/en/paywall-nodog.png). Rule: one question per screen.
6. **The Dog tab's scene sits at the start edge** while the welcome and the empty Dog tab centre theirs.
   [`en/dog.png`](assets/phase-10/en/dog.png). Rule: nothing is centred except the character at scene size.
7. **Mixed leading columns in one list.** Settings' synced row uses the 28pt column; the row above it starts at
   the gutter. [`en/settings.png`](assets/phase-10/en/settings.png). Rule: rows share edges.
8. **Premium rows say Premium twice and lose their chevron.** "Premium. About 5 minutes." then "Part of PawCue
   Premium." on three meta lines, and no trailing chevron although the row routes to what resolves the lock.
   [`en/train.png`](assets/phase-10/en/train.png).
9. **Restore Purchases is a second stacked 52pt button inside a list.**
   [`en/settings-nodog.png`](assets/phase-10/en/settings-nodog.png). Rule: one dark object, no card around a list.
10. **Account and Delete have no Back control** where Settings and the lesson overview gained one; "Not now" and
    "Keep my account" are the only ways back. [`en/account-nodog.png`](assets/phase-10/en/account-nodog.png).
11. **The clicker screen centres its headline and subline.** [`en/clicker.png`](assets/phase-10/en/clicker.png).
    Rule: nothing is centred but the character, the clicker and terminal buttons.
12. **Today with a locked plan item puts "Unlock with Premium" in the primary slot** once the free lesson for the
    day is done and the engine picks a premium one next. [`he/today.png`](assets/phase-10/he/today.png). A
    product question, not a layout one.
13. **The step-1 session page is mostly empty paper** — a consequence of the deferred demonstration scenes.
    [`en/session-sit-nodog.png`](assets/phase-10/en/session-sit-nodog.png).
14. **Marks do not scale with Dynamic Type** (see above).
15. **The vector "repeat" mark draws as a fragment** on device; iOS ships the SF Symbol, so Android and the
    preview are the only places it shows. [`en/dev-preview-17.png`](assets/phase-10/en/dev-preview-17.png).
16. **A Back control on a deep-linked screen has nothing behind it** and warns in development ("Is there any
    screen to go back to?"); in production the control does nothing.
17. **The profile editor with no dog is a wordless page with a Close button.** Unreachable through the UI.
    [`en/dog-profile-nodog.png`](assets/phase-10/en/dog-profile-nodog.png).
18. **Copy nits.** Today's plan meta "Something new to learn" has no final period where every other meta does; the
    Hebrew gender agreement and hyphen above.
19. **The dev-preview items** listed in its section.

## Manual checklist — the owner's next ten minutes

On the same build, freshly installed. Start Metro with `pnpm --filter @pawcue/mobile start` (the two servers from
before Phase 10 still hold 8081 and 8082; either stop them or pass `--port`). Pass criteria are what to see.

1. **Language, both ways, with kill and relaunch.** Settings → עברית: the row's check moves and Settings shows
   the reopen notice. Kill, relaunch: Hebrew, layout mirrored, Back control top-right, text on the right edge.
   Settings → English: notice again; kill, relaunch: English, LTR, Back control top-left. Then the double switch:
   Hebrew → English → Hebrew _without_ relaunching, kill, relaunch — pass is Hebrew **mirrored**, not Hebrew in an
   LTR layout.
2. **A full session on Sit.** Steps 1 and 2 advance with "Next step". Step 3: press the clicker — hear the click,
   see the amber ring, and the count stays at 0; press "Count it" — one treat mark fills amber, the numeral rolls
   to 1, "Undo" appears; the advance control reads "4 more to go" in white and stays that way until the fifth rep,
   then becomes the primary evergreen control. Finish: the completion screen names the next plan activity; Today,
   Train and Dog all show Sit done.
3. **Breed picker and birthdate wheels in Hebrew.** Onboarding step 4: Common tiles (currently one per row — see
   finding 1), search filters the alphabetic list, a tile selects with the evergreen ring and the bust changes.
   Step 2: years wheel on the right, months on the left, the sentence updates; "I know the exact date" swaps in the
   platform date spinner in Hebrew form.
4. **Choose a photo.** Dog tab → Choose a photo: the photo-library dialog appears **here and nowhere else** on a
   fresh install (no dialog at launch, onboarding or the session). Pick one: the bust on Dog, Today and the tab bar
   becomes the photo; the scenes keep the drawing; kill, relaunch: the photo persists.
5. **The Switch inside a Settings row with VoiceOver.** Settings → Sound Effects: VoiceOver reads the label and
   "on"/"off" as one element; double-tap toggles and announces the new state.
6. **Sheets.** Session → "Not working?" opens the troubleshooting sheet as a page sheet; swipe down dismisses.
   Dog → Choose a photo opens the photo sheet; Close dismisses.
7. **Back controls.** Train → Sit → Back returns to Train; Today → Settings → Back returns to Today. In Hebrew
   both chevrons point right.
8. **Paywall plan tiles.** Needs products: attach `apps/mobile/PawCue.storekit` to the Xcode scheme (Product →
   Scheme → Edit Scheme → Run → Options → StoreKit Configuration) or a sandbox account. Pass: two tiles with the
   store's price and period, the selected one with the evergreen ring and check, the disclosure under them, and
   the RevenueCat toast gone.
9. **VoiceOver over Today, Train and a session.** Today's plan row reads its trail state ("next"); Train reads
   "paused" for a lesson left mid-session and "locked, Premium" for a premium one; on step 3 the rep marks read as
   a count ("2 of 5 repetitions") and the clicker as a button.
10. **Text size changed in iOS Settings while the app is in the background.** Return to the app: pass is text
    reflowed everywhere; fail is glyphs clipped to slivers on Today until a relaunch (the simulator finding above).

## Still device-only, still not claimed

Audio: whether the click is audible and its latency against the 50ms budget; silent-mode and audio-session
behaviour; interruptions. Haptics: the simulator has no engine. The real photo library and its permission dialog
(the simulator's library is synthetic and no pick was made). Real VoiceOver traversal — the simulator has no
VoiceOver, only the Accessibility Inspector. Real store products and a purchase. Dynamic Type changed from iOS
Settings at runtime.

## Regression run after this pass

```
pnpm verify   → EXIT 0   (prettier, eslint x5, tsc x5, 22 Vitest files, 39 Jest suites / 663 tests)
```

The Jest count is up from 36 suites / 655 tests on the Phase 10 commit by the three test files the fixes
added, plus two resolver cases in the ui package's Vitest suite. One tooling note: `expo start` rewrites the git-ignored `apps/mobile/expo-env.d.ts`, which `.prettierignore`
does not cover, so `pnpm verify` fails on formatting after any Metro run until that file is re-formatted.
