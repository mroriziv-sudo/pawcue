# Authentication

## Identities

- **Guest** — Supabase anonymous sign-in (`supabase.auth.signInAnonymously()`), created automatically on first
  launch, no UI, no prompt (brief §4 Screen 1: "No login").
- **Continue with Apple** — Sign in with Apple, required per App Store Guideline 4.8 because we also offer Google
  (see RELEASE_CHECKLIST.md). Uses Apple's official button component/styling.
- **Continue with Google** — Google Sign-In.

All three resolve to the same `profiles` row shape (`auth.users` + `profiles`, see DATABASE.md) — the app's data
model does not branch on "is this a guest" anywhere except the merge flow itself and any UI copy that invites sign-in.

## Apple private relay email

`profiles.is_private_relay_email` is set from the identity payload at sign-in. It changes support/communication
copy (never assume the relay address is human-readable or long-lived) but never gates functionality — a private
relay user gets full functionality identically to a real-email user.

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

Clears the local session and local guest-state cache for the signed-out identity; does not delete any server-side
data (that's `POST /v1/account/delete`, a separate, explicit, confirmed action — see below).

## Account deletion

See brief §14. `Settings → Account → Delete Account` requires an explicit confirmation step that states the
consequences before calling `POST /v1/account/delete`. Server-side pipeline: delete the `auth.users` row (which
cascades to `profiles` and, via `ON DELETE CASCADE`, every owned personal-data table — see DATABASE.md), revoke
push tokens, and retain only `subscriptions`/`purchase_events` rows with `user_id` nulled (billing/audit history,
not personal data — see DATA_MAP.md). A web-accessible `/delete-account` route exists for Google Play compliance
(a user must be able to request deletion without installing the app).
