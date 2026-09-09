# PawCue

> Working codename — see [ARCHITECTURE.md](ARCHITECTURE.md#2-naming). Dog/puppy training app: freemium + premium
> subscription, iOS + Android, launch markets US + IL, launch languages en-US + he-IL.

"Open the app and know exactly what to train today — and what to change when it isn't working."

## Docs map

| Doc                                                                                  | What's in it                                                      |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                                   | Layering, provider abstractions, repo layout, environments        |
| [DATABASE.md](DATABASE.md)                                                           | Schema, RLS design, guest merge                                   |
| [API.md](API.md)                                                                     | API conventions + link to the OpenAPI contract                    |
| [AUTH.md](AUTH.md)                                                                   | Apple/Google/guest auth, guest-merge flow                         |
| [BILLING.md](BILLING.md)                                                             | Entitlement model, billing vendor decision, webhook handling      |
| [LOCALIZATION.md](LOCALIZATION.md)                                                   | i18n architecture, RTL, pluralization                             |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)                                                 | Tokens, motion, sound, haptics, the clicker                       |
| [PRIVACY.md](PRIVACY.md) / [SECURITY.md](SECURITY.md) / [DATA_MAP.md](DATA_MAP.md)   | Privacy-by-design, security practices, field-level data inventory |
| [TESTING.md](TESTING.md)                                                             | Test suites and the mandatory per-task testing loop               |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)                                         | Apple/Google store submission checklist                           |
| [docs/architecture/state-flow.md](docs/architecture/state-flow.md)                   | guest → first lesson → plan → sign-in → purchase state machine    |
| [docs/architecture/risks.md](docs/architecture/risks.md)                             | Implementation risks, ranked                                      |
| [docs/architecture/tech-stack-versions.md](docs/architecture/tech-stack-versions.md) | Verified current package versions + why                           |
| [docs/api/openapi.yaml](docs/api/openapi.yaml)                                       | Full API contract                                                 |

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
cp .env.example .env.local     # fill in local Supabase project values
supabase start                  # local Supabase stack
supabase db reset                # replay migrations + seed.sql
pnpm --filter @pawcue/mobile dev  # once apps/mobile exists (Phase 2)
```

## Status

End of **Phase 0** (architecture, docs, domain models, schema, API contract), validated against a real Supabase
project rather than only on paper:

- migrations replay from zero and seed cleanly (`pnpm db:reset`)
- 49-check RLS/security suite passes (`pnpm db:test`), Supabase advisors clean (`pnpm db:advisors`)
- database TypeScript types generated from the live schema and guarded against domain drift
- `pnpm verify` (format + lint + typecheck + 77 unit tests) green

**No mobile app exists yet** — `apps/mobile` is an empty placeholder until Phase 1. Do not assume a doc describes
shipped behavior; check `apps/mobile` and `supabase/` directly.
