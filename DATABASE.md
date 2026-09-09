# Database

PostgreSQL via Supabase. Schema is the source of truth for persistence shape; source-controlled migrations only
(`supabase/migrations/*.sql`), no manual prod schema edits. See the actual migration:
[supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql).

## Design principles

- Normalized core (users, dogs, plans, sessions) — `JSONB` only where the shape is genuinely flexible/schemaless
  (troubleshooting `guidance` rich content blocks, `app_events.properties`, denormalized locale bundles). Anything
  queried, filtered, or joined on gets a real column.
- Every table: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
  `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` (kept current by a shared `set_updated_at()` trigger).
- Indexes on every foreign key and on the columns the API actually filters by (`user_id`, `dog_id`,
  `(dog_id, plan_date)`, etc.) — enumerated per-table below and in the migration.
- No generic soft-delete flag. Instead, on account deletion: everything that is purely personal training data
  (`dogs`, `training_plans`, `training_sessions`, `progress`, …) is **hard-deleted** via `ON DELETE CASCADE` from
  `profiles`; `subscriptions` and `purchase_events` — billing/audit history with a real retention reason — use
  `ON DELETE SET NULL` on their `user_id`, so the row (and its store transaction IDs) survives for legally required
  audit purposes while the personally-identifying link to the deleted account is removed. See §14 of the brief and
  `DATA_MAP.md`.
- All timestamps UTC (`timestamptz`), all IDs UUID.

## Table inventory

| Table                      | Purpose                                                                            | Owner column                          | Public read?                                    |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| `profiles`                 | 1:1 with `auth.users`, app-level user data                                         | `id` = `auth.uid()`                   | no                                              |
| `anonymous_sessions`       | Guest identity before sign-in                                                      | `id` (bearer-verified, see RLS)       | no                                              |
| `dogs`                     | Dog profile                                                                        | `owner_user_id` \| `owner_session_id` | no                                              |
| `training_goals`           | Catalog: biting, potty, leash, recall, ...                                         | —                                     | **yes**                                         |
| `dog_goals`                | A dog's selected primary/secondary goals                                           | via `dog_id`                          | no                                              |
| `skills`                   | Catalog: sit, down, recall, ... with prerequisites                                 | —                                     | **yes**                                         |
| `dog_skills`               | Skills a dog already knows / is learning                                           | via `dog_id`                          | no                                              |
| `lessons`                  | Catalog: structured lesson content                                                 | —                                     | **yes**                                         |
| `lesson_steps`             | Ordered steps within a lesson                                                      | via `lesson_id`                       | **yes**                                         |
| `lesson_troubleshooting`   | "Not working?" options + guidance, per lesson                                      | via `lesson_id`                       | **yes**                                         |
| `training_plans`           | A generated plan for a dog                                                         | via `dog_id`                          | no                                              |
| `plan_days`                | One day within a plan                                                              | via `plan_id`                         | no                                              |
| `plan_activities`          | One lesson-slot within a plan day                                                  | via `plan_day_id`                     | no                                              |
| `training_sessions`        | One in-progress/completed lesson attempt                                           | via `dog_id`                          | no                                              |
| `session_events`           | Append-only event log within a session (click, complete, troubleshoot-opened, ...) | via `session_id`                      | no                                              |
| `progress`                 | Rolled-up per-dog stats (minutes, sessions, skills mastered)                       | via `dog_id`                          | no                                              |
| `streaks`                  | Current/longest streak per dog                                                     | via `dog_id`                          | no                                              |
| `reminders`                | Scheduled local-notification reminders                                             | via `dog_id`                          | no                                              |
| `notification_preferences` | Per-user notification opt-ins                                                      | via `user_id`                         | no                                              |
| `subscriptions`            | Store subscription state (server-verified)                                         | via `user_id`                         | no                                              |
| `entitlements`             | Resolved "what is this user allowed" (derived from subscriptions)                  | via `user_id`                         | no                                              |
| `purchase_events`          | Raw store receipt/webhook audit log                                                | via `user_id`                         | no (service role only)                          |
| `content_versions`         | Version stamps for lesson/troubleshooting content bundles                          | —                                     | **yes**                                         |
| `app_events`               | First-party analytics events                                                       | via `user_id` \| `session_id`         | no (write-only from client, service role reads) |

Full column definitions: see the migration file, which is the authoritative version of this list.

## Row Level Security

RLS is **on** for every table from the first migration — nothing ships with RLS disabled "temporarily."

Two ownership shapes appear repeatedly:

1. **Authenticated-owned** (`dogs`, `training_plans`, `progress`, ...): policy checks `auth.uid() = owner_user_id`
   (directly, or via a join to a table that has `owner_user_id`, e.g. `plan_days` checks through `training_plans`).
2. **Guest-owned** (same tables, nullable `owner_session_id` alternative): a guest has no `auth.uid()`. Anonymous
   access uses **Supabase anonymous sign-in** (`supabase.auth.signInAnonymously()`), which issues a real (if
   ephemeral) `auth.uid()` bound to that device's `anonymous_sessions.id`. This means the _same_ RLS predicate
   (`auth.uid() = owner_user_id`) works for both guest and signed-in rows — a guest's `owner_user_id` is simply the
   anonymous auth user's ID, and merge-on-sign-in re-parents rows to the permanent user ID (see `merge_guest_session`
   below). This avoids a second, weaker "trust a client-supplied session ID" RLS path entirely.
3. **Public catalog** (`training_goals`, `skills`, `lessons`, `lesson_steps`, `lesson_troubleshooting`,
   `content_versions`): `SELECT` allowed for `anon` and `authenticated` roles, no write policy for either — writes
   happen only via service role (content pipeline / seed scripts / future CMS).

Cross-user access is denied by construction (predicate keyed to `auth.uid()`), not by application-level filtering —
verified by the RLS test suite (`supabase/tests/rls/*.sql` via `pgTAP`, wired up in Phase 4) which asserts that user
A's JWT cannot read/write user B's `dogs`/`training_plans`/`progress` rows.

## `merge_guest_session(anonymous_user_id uuid)`

`SECURITY DEFINER` Postgres function, called from the `POST /v1/auth/merge-guest` Edge Function immediately after a
guest's anonymous auth identity is linked to a real Apple/Google identity. Runs in one transaction:

1. Re-parents every row owned by `anonymous_user_id` across `dogs`, `training_plans`, `training_sessions`, `progress`,
   `streaks`, `reminders` to the now-authenticated `auth.uid()`.
2. Is idempotent: re-running after a successful merge is a no-op (checked via a `merged_at` marker on
   `anonymous_sessions`), so a client retry after a dropped response can't double-merge or duplicate rows.
3. Never merges into an account that already has its own dog/plan data silently — see
   [docs/architecture/state-flow.md](docs/architecture/state-flow.md) for the conflict UX (existing-account case asks
   the user which data to keep rather than auto-merging two real training histories together).

## Migrations workflow

`supabase migration new <name>` → hand-write SQL → `supabase db reset` locally to replay all migrations from zero
(this is the CI check that migrations are reproducible) → `supabase db push` per environment. No migration is edited
after it has been applied to `staging` or `production`; fixes are new migrations.
