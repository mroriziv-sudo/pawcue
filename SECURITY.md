# Security

## Secrets

Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, Apple/Google server credentials, RevenueCat webhook secrets) live
only in Supabase Edge Function environment config / EAS secret storage — never in the mobile bundle, never
committed to source control. `.env.example` documents every variable name with an empty value; a real `.env` is
git-ignored. Client-side config (`EXPO_PUBLIC_*`) is, by construction, public — nothing sensitive may ever be
prefixed `EXPO_PUBLIC_`.

## Transport

TLS everywhere (Supabase endpoints, Edge Functions are HTTPS-only by default). No custom certificate pinning in v1
— not required given no sensitive-beyond-normal data class, revisit if that changes.

## At-rest / on-device

- OAuth/session tokens: `expo-secure-store` only (iOS Keychain / Android Keystore-backed), never `AsyncStorage`
  (brief §31, AUTH.md).
- Local guest-state cache (dog profile draft, clicker settings): plain local storage is acceptable — it's the same
  class of data the user would see rendered on-screen anyway, not a credential.
- No passwords are ever stored — auth is exclusively Apple/Google/anonymous (brief §31: "Never store passwords").

## Database

- RLS enabled on every table from the first migration (DATABASE.md) — the primary defense against cross-user data
  access, not an application-layer filter that could be bypassed by a bug in one code path.
- Least-privilege roles: the mobile app only ever uses the Supabase `anon`/`authenticated` client roles (subject to
  RLS); `SUPABASE_SERVICE_ROLE_KEY` (which bypasses RLS) is used only inside Edge Functions for operations that
  legitimately need to cross ownership boundaries (webhook-driven entitlement writes, account deletion pipeline,
  content seeding) — never shipped to or reachable from the client.
- `merge_guest_session` and `handle_new_auth_user` are the only `SECURITY DEFINER` functions; both have a narrow,
  audited purpose and validate their own preconditions (idempotency check, etc.) rather than trusting the caller.
- **Every function in `public` has `EXECUTE` revoked from `public`/`anon`/`authenticated` unless it is deliberately
  a client-facing RPC** (none are today), and every function pins `search_path`. This is not boilerplate — see the
  finding below.

### Finding: `merge_guest_session` was remotely exploitable (found and fixed during Phase 0 validation, 2026-09-09)

Validating the schema against a real Supabase project — rather than reviewing the SQL by eye — surfaced a critical
privilege-escalation bug that both manual review and SQL syntax checking had passed.

**What was wrong.** `merge_guest_session(source, target)` is `SECURITY DEFINER` and re-parents one account's dogs,
subscriptions and entitlements onto another. PostgREST automatically exposes every function in the `public` schema
at `/rest/v1/rpc/<name>`, and Postgres grants `EXECUTE` to `PUBLIC` by default. The migration never revoked it.

**Impact.** Anyone holding the anon key — which ships inside the mobile app by design and is therefore public —
could `POST /rest/v1/rpc/merge_guest_session` with an arbitrary victim UUID and an attacker UUID, with no
authentication at all, and take ownership of that victim's dogs, training history, subscription, and entitlement
(i.e. also grant themselves premium). This was **confirmed by exploit, not inferred**: as the `anon` role, a test
victim's dog was successfully transferred to a test attacker.

**Root cause.** The design put authorization in the calling Edge Function but never restricted who could reach the
function directly, and the UUID arguments carry no proof of ownership on their own.

**Fix.** `EXECUTE` revoked from `public`, `anon`, and `authenticated` (service role only); plus in-function guards
rejecting a self-merge, a non-anonymous source, and a non-permanent target. Authorization remains the Edge
Function's job — it must verify both the caller's authenticated JWT and the guest's anonymous-session JWT — but the
function is no longer reachable without the service role.

**Regression cover.** `supabase/tests/rls_security.sql` asserts that both `anon` and `authenticated` are refused,
that the victim's data is untouched afterwards, and that the guard conditions hold even for the service role.

**Generalized lesson.** Any new `public` function is internet-reachable the moment it is created. Adding one
requires an explicit decision about its `EXECUTE` grants, and `pnpm db:advisors` (Supabase's linter) must be clean
before a schema change ships.

## Dependencies

`pnpm audit` (or equivalent) runs in CI (Phase 0/1 setup); a major third-party SDK is only added after the brief's
five-point check (maintenance status, App Store compliance, Play compliance, privacy implications, Apple privacy
manifest applicability — brief §2) is actually done, not assumed.

## Observability / crash reporting

No crash/observability vendor is selected yet. When one is, it must go behind an interface (brief §40) with PII
scrubbing configured before first data is sent, and the choice documented in PRIVACY.md and both stores' privacy
questionnaires before it ships.

## Reporting

Until a public security contact exists, route any security concern to the same support channel published in the
App Store / Play Store listings (RELEASE_CHECKLIST.md "Support URL"). This doc will get a formal disclosure process
before public launch if warranted by scale.
