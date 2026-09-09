# Architecture

> Codename: **PawCue** (placeholder — see "Naming" below). Dog/puppy training app, freemium + subscription, iOS + Android, launch markets US + IL, launch languages en-US + he-IL.

## 1. Product architecture in one paragraph

The app is a guest-first, offline-capable training companion. A user can use a real clicker and complete a real lesson with zero network calls and zero account. Everything the user does as a guest is modeled identically to an authenticated user's data (same domain shapes, same table structure keyed by a session instead of a user), so that "sign in" is a **data merge**, not a new code path. A deterministic, versioned rules engine — not an LLM — decides what to train today. Entitlement ("is this user premium") is never a client-side boolean; it is a server-verified read, cached locally only as a hint for optimistic UI.

## 2. Naming

`APP_NAME` in the brief is a placeholder. This repo uses the working codename **PawCue** for the directory, package scope (`@pawcue/*`), and bundle identifier stub (`com.pawcue.app`) purely so the code has _something_ concrete to compile against. Before store submission this requires: trademark clearance, domain availability, App Store/Play Store name availability, and a real icon/brand pass. Renaming is a single scoped find-replace (`pawcue` → real slug) — no code should ever branch on the literal string "pawcue" for behavior.

## 3. Layering rules

```
apps/mobile        → screens, navigation, platform glue. NO business logic.
packages/ui         → design-system primitives (tokens, Button, Card, Clicker, etc). Presentational only.
packages/domain      → types, Zod schemas, provider *interfaces*, plan-engine interface + rules implementation,
                       troubleshooting resolution logic, entitlement logic. Framework-agnostic TypeScript.
packages/i18n        → locale resources + i18next setup. No product logic.
packages/config      → design tokens' non-visual counterparts: feature flags, API paths, product IDs,
                       localization key constants — single source of truth so nothing is hardcoded in screens.
supabase/migrations  → schema, source of truth for persistence shape.
supabase/functions   → Edge Functions implementing /v1 API. Uses packages/domain for validation/logic where shared.
```

**Rule:** a React screen component may call a hook (`packages/domain` query/mutation hook) and render `packages/ui`
primitives. It may not import a Supabase client directly, construct SQL, call `StoreKit`/`BillingClient` directly, or
contain plan-generation logic. This is enforced by ESLint import boundaries in Phase 1 (`no-restricted-imports` per
directory).

## 4. Provider abstraction (§17)

Six interfaces live in `packages/domain/src/providers/`. Screens and hooks depend on the **interface**, never the
concrete SDK:

| Interface               | Concrete impl (later phase)                                                                                    | Notes                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `AuthProvider`          | Supabase Auth (Apple/Google/anonymous)                                                                         | Phase 7                           |
| `BillingProvider`       | StoreKit2-backed + Google Play Billing, behind one client lib (decision pending — see RELEASE_CHECKLIST.md §D) | Phase 8                           |
| `NotificationProvider`  | `expo-notifications` local scheduling                                                                          | Phase 9                           |
| `TrainingCoachProvider` | Not enabled by default. Stubbed with a `NullTrainingCoachProvider` that returns `NOT_AVAILABLE`                | Phase 10+, off by default per §10 |
| `AnalyticsProvider`     | First-party event sink → Supabase table `app_events` via Edge Function                                         | Phase 2+                          |
| `StorageProvider`       | Supabase Storage (dog photos)                                                                                  | Phase 6                           |

This lets us swap billing vendor, swap crash/analytics vendor, or turn on an AI coach later without touching a single
screen.

## 5. State flow: guest → first lesson → plan → sign-in → purchase

Full state machine: [docs/architecture/state-flow.md](docs/architecture/state-flow.md). Summary:

1. **Guest session** created client-side on first launch (`AnonymousSession`, UUID, stored in SecureStore) — no
   network call required to use the clicker.
2. Guest state (dog profile draft, goal, skills, plan, session history) is persisted **locally first**
   (MMKV/AsyncStorage-backed Zustand store), and mirrored to `anonymous_sessions`-scoped Supabase rows opportunistically
   when online, keyed by the anonymous session UUID (RLS allows a row to be read/written only when the request
   presents that session's bearer, via a signed anonymous JWT — see DATABASE.md §RLS).
3. On sign-in (Apple/Google), the client calls `POST /v1/auth/merge-guest` with the anonymous session ID. This runs a
   single Postgres transaction (`merge_guest_session()` function) that re-parents guest rows to the authenticated
   `user_id` and is idempotent (safe to retry, safe if already merged).
4. Paywall is reached only when the user tries to consume something beyond the free tier (Day 2+ of the plan, full
   lesson catalog, advanced troubleshooting). Purchase updates a client-cached entitlement hint immediately for UX,
   but the source of truth is always the server-verified `entitlements` table, refreshed via `GET /v1/entitlements`
   and store server-to-server notifications.

## 6. Plan generation engine (§9)

`TrainingPlanGenerator` interface in `packages/domain/src/plan-engine/`. v1 implementation is
`RulesBasedTrainingPlanGenerator` — pure function of `(dog, goals, knownSkills, dailyMinutes, history) → TrainingPlan`,
fully deterministic and unit-testable without network or randomness (any tie-breaking uses a stable sort, never
`Math.random`). Every generated plan stores the `plan_engine_version` that produced it so a plan can be reproduced or
diffed after the engine changes. `AITrainingCoachProvider` is a parallel, _optional_ interface for later
plan-adjustment suggestions — never a dependency of the base plan engine.

## 6a. Database types and domain/schema drift

`packages/domain/src/generated/database.types.ts` is generated from the live linked project
(`pnpm db:types`) and committed. It is not hand-edited. `packages/domain/src/models/schema-conformance.test.ts`
parses it and fails if any domain model and the real schema disagree in either direction — a domain field with no
column, or a column no model represents. Two divergences are declared intentional there rather than silently
tolerated: `dogs.owner_user_id` and `app_events.user_id` are modeled as the richer `OwnerRef` union
(`{kind: "user"} | {kind: "anonymousSession"}`) because the guest/permanent distinction is product-meaningful even
though both map to the same physical column.

`LocalizationString` is the one domain model with no table: translations are reviewed JSON resources in
`packages/i18n`, so a copy change is a code review with a diff rather than a silent production row edit, and the
app renders fully offline. Revisit only if translations must change without an app release.

## 7. Content model

Lessons, steps, and troubleshooting options are structured rows (`lessons`, `lesson_steps`,
`lesson_troubleshooting`), not files inside the app bundle, and not prose inside screen components. This is required
both by §7 (troubleshooting must be structured data) and by localization (content needs translated variants without a
rebuild). Content is versioned via `content_versions` so we can ship a content update independent of an app binary
release where possible (served through Supabase, cached locally for offline lessons).

## 8. Offline behavior

- Clicker: 100% local, no network dependency ever. Audio preloaded at app boot.
- Today's plan + the lesson(s) in it: fetched and cached (TanStack Query persisted cache) whenever online; readable
  and completable offline.
- Mutations made offline (session events, completions) are queued (TanStack Query mutation queue backed by
  AsyncStorage) and flushed on reconnect. Conflict rule: session events are append-only and idempotent by
  client-generated UUID, so replay is safe — there is no "last write wins" ambiguity to resolve for the common case.
  Plan-affecting state (e.g., streak) is recomputed server-side from `session_events`, never trusted from the client.

## 9. Environments

`local` (Supabase CLI, on-device simulator), `staging`, `production` — three separate Supabase projects, three EAS
build profiles, distinct `.env` per environment, never sharing keys. See `.env.example`.

## 10. Repository layout

```
/apps/mobile              Expo Router app
/packages/ui               design tokens + primitives (Button, Card, Clicker, ProgressRing, ...)
/packages/domain            models, Zod schemas, provider interfaces, plan engine, troubleshooting resolver
/packages/i18n               i18next setup + en-US / he-IL resources
/packages/config              feature flags, API route constants, product ID constants, i18n key constants
/supabase/migrations           versioned SQL migrations (source of truth for schema)
/supabase/functions             Edge Functions implementing /v1 API
/docs                            README-level docs (this file, DATABASE.md, DESIGN_SYSTEM.md, ...)
/docs/api                         OpenAPI contract
/docs/architecture                  state-flow.md, risks.md
/tests/e2e                           Maestro flows
```

See also: [DATABASE.md](DATABASE.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md),
[docs/architecture/state-flow.md](docs/architecture/state-flow.md), [docs/architecture/risks.md](docs/architecture/risks.md),
[docs/api/openapi.yaml](docs/api/openapi.yaml).
