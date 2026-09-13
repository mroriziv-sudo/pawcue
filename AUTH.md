# Authentication

## Identities

- **Guest** — Supabase anonymous sign-in (`supabase.auth.signInAnonymously()`), created automatically on first
  launch, no UI, no prompt (brief §4 Screen 1: "No login").
- **Continue with Apple** — Sign in with Apple, required per App Store Guideline 4.8 because we also offer Google
  (see RELEASE_CHECKLIST.md). **Implemented (Phase 9.5)** as the native flow: `expo-apple-authentication`
  presents Apple's sheet with a SHA-256 nonce, and the identity token is exchanged with
  `supabase.auth.signInWithIdToken({ provider: "apple", nonce })`. Only the email scope is requested — nothing
  displays a name. Apple's own button (`ASAuthorizationAppleIDButton`) is rendered where available, with the
  design-system button as the fallback. External configuration still required: the Sign in with Apple capability
  on the App ID (set up during the EAS credentials step now that the membership is active) and the Apple provider
  on the Supabase project — **enabled on production on 2026-09-13** with client id `com.pawcue.app`
  (`supabase/config.toml` `[remotes.production]`). Until a signed build carries the entitlement, the provider
  reports "not available in this build" — never a fake success.
- **Continue with Google** — Google Sign-In. Not yet configured; throws `ProviderNotConfiguredError`.

All three resolve to the same `profiles` row shape (`auth.users` + `profiles`, see DATABASE.md) — the app's data
model does not branch on "is this a guest" anywhere except the merge flow itself and any UI copy that invites sign-in.

## Apple private relay email

`profiles.is_private_relay_email` is derived server-side by the `handle_new_auth_user` trigger from the email's
domain (`@privaterelay.appleid.com`) when the profile row is created (migration
`20260913120000_profile_private_relay_email.sql`; three cases in `rls_security.sql`). It changes
support/communication copy (never assume the relay address is human-readable or long-lived) but never gates
functionality — a private relay user gets full functionality identically to a real-email user. No client can set
it.

## Token handling

- Access/refresh tokens live only in `expo-secure-store` (brief: "Never store raw OAuth credentials insecurely").
- Refresh is handled by the Supabase client SDK's own refresh flow; `AuthProvider.refreshSession()` (see
  `packages/domain/src/providers/auth-provider.ts`) wraps it so screens never touch a token directly.
- Expired/revoked credentials surface as a typed auth error, routed to a re-authentication prompt — never a silent
  logout that drops in-progress local state.

## Guest → account merge

Full detail: DATABASE.md `merge_guest_session()`, docs/architecture/state-flow.md. Summary of the contract:

**Phase 7 implementation guardrail.** The endpoint behind this flow is the entire authorization boundary for the
merge — the database cannot defend it, because `merge_guest_session` is `SECURITY DEFINER`, service-role-only, and
its UUID arguments prove nothing. The binding rules and required shape are in
[supabase/functions/README.md](supabase/functions/README.md); the seven security cases that must pass are in
[TESTING.md](TESTING.md#auth-merge-guest-security-cases). In short: the caller's authenticated JWT is required, the
guest's anonymous-session JWT is required and independently verified, and **an ID in the request body is never
sufficient to authorize a merge**.

1. `AuthProvider.mergeGuestSession(anonymousSessionId)` is called immediately after Apple/Google sign-in succeeds.
2. **Idempotent** — a retry (e.g. after a dropped network response) is a safe no-op, checked via
   `anonymous_sessions.merged_at`.
3. **Conflict-safe** — if the target account already owns data, the call returns `GuestMergeConflict` instead of
   silently overwriting anything; the client must call `resolveGuestMergeConflict` with an explicit user choice
   ("keep this device's progress" vs. "keep your account's progress").
4. Never partially merges — the whole re-parenting operation runs in one Postgres transaction.

## Duplicate identities

If a user signs in with Apple on one device and Google on another, they end up with two separate `profiles` rows —
v1 does not attempt automatic account linking across different OAuth providers (a known, documented limitation, not
an oversight). A future "link another sign-in method" flow is out of scope for v1 and not blocking launch.

## Sign-out

**Implemented (Phase 9.5)** in `apps/mobile/src/state/account-lifecycle.ts`: `signOutAndForget()` then
`restartAsGuest()`. Clears the local session (`signOut({ scope: "local" })` — this device only), every
identity-scoped store and cache (dog id, onboarding draft and "skipped" choice, in-progress session, local training
log, cached entitlement, in-memory plan), logs the store SDK out, then re-runs bootstrap so the device starts again
as a fresh guest. Device preferences (language, sound, haptics) are kept. Does not delete any server-side data
(that's `POST /v1/account/delete`, a separate, explicit, confirmed action — see below).

## Account deletion

**Implemented (Phase 9.5).** `Settings → Account → Delete account and data` opens `app/delete-account.tsx`, which
lays out the consequences in the user's language and requires an explicit acknowledgement switch before the
destructive button enables — three deliberate steps, no native alert. It calls `POST /v1/account/delete`
(`supabase/functions/account-delete`, spec in `supabase/functions/README.md`): the server deletes the **verified
JWT's subject only**, refuses any body that names an identity, requires `{ "confirm": "delete" }`, erases the
RevenueCat customer first, then `auth.admin.deleteUser`, and answers `200` only after the profile is confirmed
absent. The schema cascades everything personal (DATABASE.md) and keeps `subscriptions` / `purchase_events` with
`user_id` nulled (DATA_MAP.md). Guests can delete too — an anonymous identity owns data.

Client-side, nothing local is touched until the server confirms; then `forgetLocalIdentity()` (the same reset as
sign-out) runs and the screen shows a deleted state whose only action restarts the app as a fresh guest. A `401`
for a token whose user Supabase no longer knows is treated as the deletion having happened, so a retry after a
dropped response is safe. Security cases: `pnpm test:delete` (44, against the deployed function — one user cannot
delete another by any means tried). UI cases: `__tests__/account-deletion.test.tsx`.

The web-accessible `/delete-account` route required by Google Play is drafted in
`docs/legal/delete-account-page.md` and needs a domain to publish.
