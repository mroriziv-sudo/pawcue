# Production Supabase — runbook

Status on 2026-09-13: **production exists and is configured.** Project `juhkjelqfrbbhgzmedgs`
(`pawcue-production`, `us-east-1`) was created by the account owner in the dashboard; everything below was then
run from this repository the same day: 5/5 migrations applied, the catalogue seeded once (13 lessons, 40 steps,
10 troubleshooting options, 8 skills, 9 goals, 1 engine version, 2 content versions), all four Edge Functions
deployed, `[remotes.production]` auth config pushed (anonymous sign-ins on, password sign-up off, Apple provider on
with client id `com.pawcue.app`), the EAS `production` environment repointed, the smoke suite **45/45**, the
advisors clean of ERROR-level findings, and the CLI re-linked to staging. The project holds catalogue rows and
**zero** users, dogs, sessions or billing rows. Staging was not written to.

Still unset on production, by design (values only the account owner holds): `REVENUECAT_SECRET_API_KEY`,
`REVENUECAT_WEBHOOK_AUTH` (§3).

The sections below are the runbook as it was executed, kept for the next environment or a re-run.

## 1. Create the project (manual — dashboard or CLI)

Either:

- **Dashboard:** supabase.com → organisation "mroriziv-sudo's Org" → New project → name `pawcue-production`,
  region of your choice (staging is `us-east-1`; `eu-central-1` is nearer Israel — a product decision), a strong
  database password you keep in a password manager. Wait for "Active / Healthy".
- **CLI, in your terminal:**
  `pnpm supabase projects create pawcue-production --org-id qrpxuzteoddrqzrxtqii --region us-east-1`
  (it prompts for the database password).

Then record the 20-character project ref in two places and commit them:

- `supabase/environments.json` → `"production": "<ref>"`
- `supabase/config.toml` → `[remotes.production] project_id = "<ref>"`

The ref is public (it is the URL the app talks to); the password and keys are not and never enter the repository.

## 2. Bring it to the app's state (scripted)

```
pnpm release:supabase:production
```

`tools/release/production-supabase.mjs` then, in order: links the CLI to production (the CLI asks for the database
password once and keeps it in the OS keychain; or set `SUPABASE_DB_PASSWORD` for that one command), pushes every
migration, seeds the content catalogue **only if `lessons` is empty**, deploys the four Edge Functions with
`--no-verify-jwt`, prints the config diff, lists secret _names_, and re-links the CLI to staging so that
`pnpm db:reset` cannot hit production by accident. (`tools/db/guard.mjs` refuses `db:reset` / `db:test` unless
staging is the linked project, regardless.)

Then apply the production auth overrides — password sign-up off, anonymous sign-ins on, Apple provider on with
client id `com.pawcue.app` — after reading the diff the script printed:

```
node tools/release/production-supabase.mjs --env production --push-config --relink staging
```

Review the diff first. The base config is the local-development template, so `[remotes.production]` pins
`site_url`, redirect URLs, OTP length, MFA, pooler sizes and storage analytics to the hosted project's own values —
otherwise a push would overwrite them with `127.0.0.1` defaults. On 2026-09-13 the push changed exactly:
`auth.enable_anonymous_sign_ins → true`, `auth.email.enable_signup → false`, `auth.external.apple.enabled → true`
with `client_id = com.pawcue.app`. Verify in the dashboard (Authentication → Providers → Apple) before the first
real sign-in; no secret is needed for the native flow.

## 3. Secrets (manual, from your terminal)

```
pnpm supabase secrets set --project-ref <ref> REVENUECAT_SECRET_API_KEY=sk_… REVENUECAT_WEBHOOK_AUTH=<random>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions by the
platform. The service-role key is never copied anywhere.

## 4. Point the app at it

Fetch the anon key from the dashboard (Project Settings → API) or `pnpm supabase projects api-keys --project-ref <ref>`
— it is publishable, like the URL. Then replace the two EAS values that currently point at staging:

```
cd apps/mobile
npx eas-cli env:set production --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --visibility plaintext --type string --scope project --non-interactive
npx eas-cli env:set production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --visibility sensitive --type string --scope project --non-interactive
```

(`env:set` creates or updates. Done on 2026-09-13: `production` → `juhkjelqfrbbhgzmedgs`; `preview` stays on
staging.)

Leave the `preview` environment on staging: the simulator audit build is where test identities belong.

A production build now refuses to start while `EXPO_PUBLIC_SUPABASE_URL` still names the staging ref
(`plugins/withReleaseHardening.js`), so this step cannot be forgotten silently.

## 5. Validate

Create `.env.production.local` (git-ignored) with the production URL and anon key, then:

```
pnpm test:smoke:production
```

`supabase/tests/production-smoke.mjs` checks, against the live project: every migration applied; the catalogue
row counts match `seed.sql` (9 goals, 8 skills, 13 lessons, 40 steps, 10 troubleshooting options, 1 engine
version, 2 content versions) and the four always-free lessons are the four the product promises; the anon key
reads nothing from any owner-scoped table and cannot call either privileged RPC; anonymous guest creation and the
profile trigger; dog creation and ownership forgery refused; session sync with replay; plan persistence read back
through RLS; a second guest sees nothing and cannot rename the dog; all four Edge Functions deployed and refusing
what they must (merge 401/403, verify never grants on a body claim, webhook 401/501, delete refuses a body
identity); and finally deletes every identity it created through the real `account-delete` endpoint, leaving the
project as it found it. **45 checks; 45/45 on staging and 45/45 on production on 2026-09-13.** (The first
production run reported one transient `-1` count immediately after the config push restarted the auth service;
the helper now retries once, and the rerun was clean.)

Not covered on production, by design: the positive merge path (needs a permanent account; production has no
password sign-up — it is proven on staging, 43/43, with identical code) and anything involving a real purchase.

## 6. What stays on staging

Everything: the throwaway identities, the test fixtures, `pnpm db:verify`, `pnpm test:merge`,
`pnpm test:billing`, `pnpm test:delete`. Staging is not altered by any of the above.
