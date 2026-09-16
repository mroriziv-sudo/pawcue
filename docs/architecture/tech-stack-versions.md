# Tech stack — verified current versions (checked 2026-09-09)

The brief requires "latest STABLE supported versions available at implementation time." Since Claude's knowledge
cutoff (May 2026) trails today's date, every version below was checked live against npm/official sources rather than
recalled — see citations. This doc is the source of truth for `package.json` versions; re-verify before Phase 13/14
(staging/production release), since store and tooling requirements move on their own schedule.

## Mobile

| Package                 | Version              | Note                                                                                                                                                                                          |
| ----------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo SDK                | **57.0.0**           | bundles React Native 0.86 + React 19.2.3. Do not install standalone RN 0.87 alongside Expo — Expo pins its own RN minor.                                                                      |
| expo-router             | **57.0.20**          |                                                                                                                                                                                               |
| @tanstack/react-query   | **5.102.8**          |                                                                                                                                                                                               |
| zustand                 | **5.0.15**           |                                                                                                                                                                                               |
| react-hook-form         | **7.87.0**           |                                                                                                                                                                                               |
| zod                     | **4.5.4**            | v4 is now the default `zod` package export (no `zod/v4` subpath needed)                                                                                                                       |
| expo-audio              | latest for SDK 57    | **use this, not `expo-av`** — expo-av is deprecated/frozen with no further patches. Clicker sound + success sound both go through expo-audio.                                                 |
| expo-haptics            | **57.0.2**           |                                                                                                                                                                                               |
| react-native-reanimated | **4.6.0**            | supports RN 0.83–0.87                                                                                                                                                                         |
| expo-secure-store       | **57.0.3**           |                                                                                                                                                                                               |
| expo-splash-screen      | **~57.0.9**          | Native launch screen: the welcome-screen dog on Warm Ivory, held until settings hydrate (`app/_layout.tsx`), so a cold launch never paints a blank frame. Added 2026-09-16 with the app icon. |
| i18next / react-i18next | **26.4.2 / 17.0.13** |                                                                                                                                                                                               |

## Dev tooling

| Package                       | Version                                        | Note                                                                                                                                                                                                                                                                          |
| ----------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm                          | **^12.x** (12.3.4)                             | Rust rewrite, drop-in compatible with pnpm 11 lockfiles/commands.                                                                                                                                                                                                             |
| TypeScript                    | **^6.0.2** — _deliberately not 7.x, see below_ |                                                                                                                                                                                                                                                                               |
| ESLint                        | latest 10.x flat-config                        | pair with `typescript-eslint`                                                                                                                                                                                                                                                 |
| @testing-library/react-native | **14.0.1**                                     | **breaking change**: `render`/`renderHook`/`fireEvent`/`act` are now async — every call site must `await`. Requires RN ≥0.78, Node ≥22.13 — root `package.json` `engines.node` is set to `>=22.13.0` for this reason; local dev machine uses Node 24 LTS via nvm (see below). |
| E2E                           | **Maestro** (primary)                          | Both Maestro and Detox are actively maintained; Maestro chosen for lower flakiness/YAML simplicity per the brief's "Maestro or Detox" option. Revisit only if a scenario needs Detox's gray-box JS sync.                                                                      |
| supabase (CLI)                | **2.117.0** (pinned exactly)                   | Project dev dependency, not a global install, so CI and every machine run the same CLI. A 3.0.0 beta line exists; `latest` is 2.117.0. Note: `pnpm ci` is a **built-in pnpm v12 command** and shadows a script of that name — the repo's full gate is `pnpm verify`.          |

### Why TypeScript 6.0, not 7.0

TypeScript 7.0 (stable, native Go compiler, shipped 2026-07-08) is real and dramatically faster, but it **ships
without a stable programmatic compiler API** — Microsoft has said that lands in 7.1 (targeted ~October 2026).
`typescript-eslint` (and `ts-jest`-equivalent type-aware tooling) is built directly on that API and, as of this
check, only supports TypeScript `<6.1.0`. Since the brief requires strict ESLint + strict TypeScript as a CI gate,
picking TS 7.0 today would mean giving up type-aware linting — not an acceptable trade for a v1. **Decision: pin
`typescript` to `^6.0.2`** (the final JS-based release, fully supported by the current lint toolchain) and track the
7.x migration as a follow-up once `typescript-eslint` publishes 7.x support (re-check at the start of Phase 12).

## Billing

- **Google Play Billing Library v8+ is mandatory** for new app submissions/updates as of **2026-08-31** (extension to
  2026-11-01 available) — this deadline has already passed as of today (2026-09-09), so treat v8 as a hard floor,
  not a future concern. No direct v7→v9 jump is supported; must pass through v8 semantics.
- **RevenueCat** is the recommended default IAP layer for v1: free up to $2,500 tracked monthly revenue, then ~1%,
  and it ships server-side webhook → entitlement sync out of the box, which matches the brief's
  server-authoritative-entitlement requirement with far less bespoke receipt-validation code than a raw
  StoreKit2 + Play Billing v8 implementation. It sits entirely behind our own `BillingProvider` interface
  (ARCHITECTURE.md §4), so switching to native billing later if margin pressure justifies it is a contained,
  single-package change — not a rewrite. Revisit this specific vendor choice at the start of Phase 8 against
  RevenueCat's then-current pricing.
- `expo-iap` (the actively maintained successor to `react-native-iap`) is the fallback if we ever go native-billing
  instead of RevenueCat.

## Sources

- Expo SDK 57 docs (docs.expo.dev/versions/latest)
- npm registry listings for each package above, checked live 2026-09-09
- InfoQ, The Register, devclass.com — TypeScript 7.0 stable release coverage (2026-07/08)
- `typescript-eslint` GitHub issue #12518 "TypeScript 7.0.2 Support" (open as of 2026-09)
- Microsoft DevBlogs — "Announcing TypeScript 6.0" (2026-03-20, explicitly the last JS-based release)
- AlternativeTo / Socket.dev / InfoQ — pnpm 12 stable Rust rewrite coverage (2026-08/09)
- Google Play policy communications re: target API 36 / Billing Library v8 deadline (2026-08-31, extension to
  2026-11-01)
