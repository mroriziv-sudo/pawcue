# PawCue

> Working codename — see [ARCHITECTURE.md](ARCHITECTURE.md#2-naming). Dog/puppy training app: freemium + premium
> subscription, iOS + Android, launch markets US + IL, launch languages en-US + he-IL.

"Open the app and know exactly what to train today — and what to change when it isn't working."

## Docs map

| Doc                                                                                    | What's in it                                                      |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                                     | Layering, provider abstractions, repo layout, environments        |
| [DATABASE.md](DATABASE.md)                                                             | Schema, RLS design, guest merge                                   |
| [API.md](API.md)                                                                       | API conventions + link to the OpenAPI contract                    |
| [AUTH.md](AUTH.md)                                                                     | Apple/Google/guest auth, guest-merge flow                         |
| [BILLING.md](BILLING.md)                                                               | Entitlement model, billing vendor decision, webhook handling      |
| [LOCALIZATION.md](LOCALIZATION.md)                                                     | i18n architecture, RTL, pluralization                             |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)                                                   | Tokens, motion, sound, haptics, the clicker                       |
| [PRIVACY.md](PRIVACY.md) / [SECURITY.md](SECURITY.md) / [DATA_MAP.md](DATA_MAP.md)     | Privacy-by-design, security practices, field-level data inventory |
| [TESTING.md](TESTING.md)                                                               | Test suites and the mandatory per-task testing loop               |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)                                           | Apple/Google store submission checklist                           |
| [docs/architecture/state-flow.md](docs/architecture/state-flow.md)                     | guest → first lesson → plan → sign-in → purchase state machine    |
| [docs/architecture/risks.md](docs/architecture/risks.md)                               | Implementation risks, ranked                                      |
| [docs/architecture/tech-stack-versions.md](docs/architecture/tech-stack-versions.md)   | Verified current package versions + why                           |
| [docs/api/openapi.yaml](docs/api/openapi.yaml)                                         | Full API contract                                                 |
| [docs/architecture/phase-2-verification.md](docs/architecture/phase-2-verification.md) | What Phase 2 actually ran vs. only compiled                       |

## Repository layout

```
/apps/mobile          Expo Router app (screens, navigation — no business logic)
/packages/ui            design tokens + primitives
/packages/domain          types, Zod schemas, provider interfaces, plan engine
/packages/i18n              en-US / he-IL resources + i18next setup
/packages/config              feature flags, API routes, product IDs — single source of truth
/supabase/migrations           versioned SQL schema
/supabase/functions             Edge Functions implementing the /v1 API
/docs                             this doc set
/tests/e2e                         Maestro flows
```

## Getting started (local dev)

```
pnpm install
cp .env.example .env.local                    # fill in Supabase URL + anon key
pnpm --filter @pawcue/mobile start            # run the app (Expo)
pnpm --filter @pawcue/mobile run export:web   # or bundle it for the browser

pnpm verify                                   # format, lint, typecheck, unit + RN render tests
pnpm db:verify                                # replay migrations from zero, RLS suite, advisors (staging only — guarded)
pnpm test:merge && pnpm test:billing && pnpm test:delete   # deployed Edge Function security suites (staging)
pnpm test:smoke                               # self-cleaning environment smoke test (safe for production too)
pnpm env:staging | pnpm env:production        # which Supabase project `--linked` commands act on
pnpm release:supabase:production              # migrations, content, functions on production — docs/release/
pnpm release:privacy-audit <path/to/App.app>  # Apple privacy-manifest audit of a built bundle
```

## Status

**Phase 0** — architecture, domain models, schema and API contract, validated against a real Supabase project:
migrations replay from zero, a 49-check RLS/security suite passes, Supabase advisors are clean, and generated
database types are guarded against domain drift. Tagged `phase-0-baseline`.

**Phase 1** — the design system: tokens, accessibility foundations (real WCAG contrast maths) and UI primitives.
Tagged `phase-1-baseline`.

**Phase 2** adds a running Expo app shell: boot, Expo Router navigation, English + Hebrew, persisted language,
Supabase client + guest auth, API client, permission architecture and a jest-expo render harness.

Verification is tracked in two places, deliberately kept apart:
[phase-2-verification.md](docs/architecture/phase-2-verification.md) (browser/bundle) and
[phase-2-native-acceptance.md](docs/architecture/phase-2-native-acceptance.md) (iOS 26.5 simulator, iPhone 17 Pro).

The app boots and runs natively on iOS with zero runtime errors, and guest auth, locale detection, persistence and
Dynamic Type are verified there. **Still unverified: native RTL layout mirroring** (blocked on a development build —
`I18nManager.forceRTL` is a no-op in Expo Go) and **anything needing real hardware** — haptics, click-to-sound
latency, silent-mode/audio-session behaviour. Do not assume a doc describes shipped behavior; check `apps/mobile`
and `supabase/` directly.
