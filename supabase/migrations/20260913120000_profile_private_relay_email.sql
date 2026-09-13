-- Phase 9.5: derive `profiles.is_private_relay_email` at profile creation.
--
-- AUTH.md promises the flag is set from the identity at sign-in, and RELEASE_CHECKLIST.md (Guideline 4.8) asks
-- that Apple's private relay be handled server-side. The trigger that creates the profile row is the one place
-- every sign-in passes through — anonymous, Apple, Google — so it is where the answer is derived, from the only
-- fact available: Apple's relay addresses all live under `privaterelay.appleid.com`.
--
-- The flag changes copy about support and email, never functionality (AUTH.md). No client can write it: the
-- column is not in any client policy's UPDATE list, and the function stays revoked from every client role.

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, is_anonymous, is_private_relay_email)
  values (
    new.id,
    new.email,
    coalesce(new.is_anonymous, false),
    coalesce(new.email, '') ilike '%@privaterelay.appleid.com'
  );
  return new;
end;
$$;

-- Restated so the grant surface of this function is visible in the migration that last touched it.
revoke all on function handle_new_auth_user() from public, anon, authenticated;
