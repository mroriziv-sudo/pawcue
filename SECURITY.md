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
