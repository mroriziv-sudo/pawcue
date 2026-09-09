# Phase 2 — what was actually verified

Phase 2 delivered a running Expo app shell. This document exists to keep the difference between "it ran" and "it
compiled" explicit, because that distinction is easy to blur and expensive to get wrong.

## Environment limits

This machine has **no Xcode** (Command Line Tools only), **no Android SDK, no `adb`, no emulator**. No iOS or
Android simulator or device was available, so **no native behaviour was exercised**. Everything below is labelled
accordingly.

## 1. Actually executed

**React Native render tests** — `pnpm --filter @pawcue/mobile test`, 20 tests, jest-expo + React Test Renderer.
Real component trees mount and are asserted: clicker renders without a session or network, accessible label and
role, press counting, the three-press threshold revealing the first-lesson CTA, Hebrew copy, RTL `writingDirection`,
design tokens applied. Plus storage tiering, device-locale resolution, settings persistence and the permission
catalogue.

**The app running in a real browser** — `apps/mobile/scripts/runtime-proof.mjs` serves the exported web bundle and
drives it in headless Chromium. 13/13 checks, zero HTTP or page errors. Screenshots in `apps/mobile/.runtime-proof/`.

| Verified at runtime           | How                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------- |
| App boot                      | Renders UI from a cold load                                                   |
| Navigation                    | `/` → `/settings` via Expo Router, URL asserted                               |
| English                       | Copy resolved from the i18n bundle                                            |
| Hebrew                        | Copy resolved after switching language                                        |
| RTL text direction            | Computed `direction: rtl` on Hebrew text                                      |
| LTR restored                  | Computed `direction: ltr` after switching back                                |
| Design system in real screens | Computed `rgb(35, 71, 60)` (Deep Evergreen) and `999px` radius on the clicker |
| Persisted language            | Written to storage, survives a full page reload                               |
| Bootstrap/session state       | Anonymous Supabase session established, `is_anonymous: true`, token present   |
| Clicker interaction           | Presses counted; prompt correctly hidden at 2 and shown at 3                  |

**Live Supabase auth against staging** — a real anonymous sign-in returned HTTP 200 with `is_anonymous: true`, and
the Phase 0 `handle_new_auth_user` trigger created the matching `profiles` row (verified by SQL, then cleaned up).

**Anonymous sign-ins had to be enabled.** The staging project returned `422 anonymous_provider_disabled`; the whole
guest-first RLS design depends on this, so `enable_anonymous_sign_ins = true` is now in `supabase/config.toml` and
pushed. This was found by running the app, not by reading code.

## 2. Bundled successfully (compiled, not run)

- **Web**: 1.7MB bundle via `expo export --platform web`.
- **iOS**: 3.4MB Hermes bytecode (`.hbc`).
- **Android**: 3.8MB Hermes bytecode (`.hbc`).

The native bundles prove the module graph resolves and compiles for both platforms. They do **not** prove the app
launches on a device.

## 3. Statically / type validated only

`pnpm verify` — Prettier, ESLint (5 packages incl. the app), `tsc` (5 packages), 170 Vitest + 20 Jest tests.

- **API client** — typed, Zod-validating, attaches bearer token and request ID. No live `/v1` endpoint exists yet
  (Phase 4), so it is type-checked but has never made a real request.
- **Auth provider** — the guest path is exercised for real; Apple/Google/merge throw by design (Phase 7).
- **Permission architecture** — asserted by tests to expose no request function at all. Nothing prompts, which is
  the property that matters, but no OS permission dialog has been exercised.

## 4. Blocked — NOT verified

| Item                                 | Blocked by                                                                                                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS app launch / simulator           | No Xcode                                                                                                                                                                                                                                        |
| Android app launch / emulator        | No Android SDK                                                                                                                                                                                                                                  |
| **Clicker audio playback**           | Requires a device. The 45ms asset is generated and bundled, and preload/playback ordering is unit-tested against a mock, but no sound has been produced                                                                                         |
| **Haptics**                          | Requires a device; asserted against a mock only                                                                                                                                                                                                 |
| **Full RTL layout mirroring**        | `I18nManager.forceRTL` needs a native app restart. Hebrew **text** direction is verified; row/flex mirroring is not. On web the "restart required" notice appears and layout does not flip — which is the designed, honest behaviour, not a fix |
| Press-to-sound latency budget (50ms) | Requires a device                                                                                                                                                                                                                               |
| Apple / Google sign-in               | Phase 7, plus store credentials                                                                                                                                                                                                                 |
| EAS build / store submission         | No credentials configured                                                                                                                                                                                                                       |

## How to re-run

```
pnpm verify                                  # format, lint, typecheck, unit + RN tests
pnpm --filter @pawcue/mobile run export:web  # bundle
node apps/mobile/scripts/runtime-proof.mjs   # browser runtime proof (needs puppeteer)
pnpm db:test                                 # Phase 0 RLS suite, 49 checks
```
