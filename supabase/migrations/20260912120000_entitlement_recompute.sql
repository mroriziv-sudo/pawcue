-- ---------------------------------------------------------------------------
-- Phase 7 — entitlement derivation
--
-- `entitlements` is described throughout the architecture as derived state: "recomputed from current subscriptions
-- state" (BILLING.md). Until now nothing computed it, because nothing wrote `subscriptions` either. This adds the
-- one function that does, so there is exactly one definition of "is this user premium" on the server, and the
-- verification endpoint and the guest merge both call it rather than each assembling a row of their own.
--
-- It also closes a latent defect in `merge_guest_session` that Phase 7 makes reachable — see below.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- recompute_entitlement
--
-- Rebuilds one user's entitlement row from the subscriptions they own. Never takes a claim from a caller: the only
-- input is a user id, and every fact comes from `subscriptions`, which no client can write.
-- ---------------------------------------------------------------------------
create or replace function recompute_entitlement(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_sub subscriptions%rowtype;
begin
  /*
    The subscription that entitles, if any.

    The four statuses below are the ones that mean "this user may use premium right now" — `grace_period` and
    `billing_retry` included, because the store is still treating the subscription as live while it retries
    payment, and revoking access during a card retry is how a paying customer gets locked out of an app they are
    still being billed for.

    An entitling row must also not have run out. `current_period_end` is null for a store that has not told us one
    yet; that is treated as "no known end", not as "already over".
  */
  select * into v_sub
  from subscriptions
  where user_id = p_user_id
    and status in ('trialing', 'active', 'grace_period', 'billing_retry')
    and (current_period_end is null or current_period_end > now())
  -- Furthest-out end date wins, so an upgrade or a resubscription beats the row it replaced.
  order by current_period_end desc nulls first
  limit 1;

  if found then
    insert into entitlements (user_id, is_premium_active, source, expires_at)
    values (p_user_id, true, v_sub.status, v_sub.current_period_end)
    on conflict (user_id) do update
      set is_premium_active = excluded.is_premium_active,
          source            = excluded.source,
          expires_at        = excluded.expires_at;
    return;
  end if;

  -- Nothing entitling. The most recently touched subscription becomes the recorded reason, so the client can tell
  -- "this ended" from "there was never one" — two states that deserve different words in the UI.
  select * into v_sub
  from subscriptions
  where user_id = p_user_id
  order by updated_at desc
  limit 1;

  if not found then
    /*
      Never subscribed. No row at all is the honest representation, and it is what the client already reads as
      free: `fetchEntitlement` returns null and `toSnapshot` settles it to a verified free answer. Writing a
      `false` row for every user who has never purchased would mean inventing billing records for non-customers.
    */
    delete from entitlements where user_id = p_user_id;
    return;
  end if;

  insert into entitlements (user_id, is_premium_active, source, expires_at)
  values (p_user_id, false, v_sub.status, v_sub.current_period_end)
  on conflict (user_id) do update
    set is_premium_active = excluded.is_premium_active,
        source            = excluded.source,
        expires_at        = excluded.expires_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- merge_guest_session — entitlement handling corrected
--
-- The original body did `update entitlements set user_id = target where user_id = source`. `entitlements.user_id`
-- is NOT NULL UNIQUE, so when both sides hold a row that statement raises a unique violation and the entire merge
-- transaction fails — taking the dogs and the training history with it.
--
-- It was unreachable while nothing created entitlement rows. Phase 7 creates them, so it is reachable now.
--
-- The fix is not a bigger update. Entitlements are derived, so the guest's row is dropped and the target's is
-- recomputed from the subscriptions it now owns — which is also the only way to get the right answer when both
-- sides had one. `subscriptions` continue to move: those are the durable billing records, keyed by
-- `store_transaction_id`, and they are what the recomputation reads.
--
-- Everything else in this function is byte-for-byte the original, including the guards and the idempotency rule.
-- ---------------------------------------------------------------------------
create or replace function merge_guest_session(p_anonymous_user_id uuid, p_target_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_already_merged timestamptz;
begin
  if p_anonymous_user_id = p_target_user_id then
    raise exception 'merge_guest_session: source and target must differ (got %)', p_anonymous_user_id
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from profiles where id = p_anonymous_user_id and is_anonymous) then
    raise exception 'merge_guest_session: source % is not an anonymous profile', p_anonymous_user_id
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from profiles where id = p_target_user_id and not is_anonymous) then
    raise exception 'merge_guest_session: target % is not a permanent profile', p_target_user_id
      using errcode = 'check_violation';
  end if;

  select merged_at into v_already_merged from anonymous_sessions where id = p_anonymous_user_id;

  -- Idempotent: a retry after a successful merge is a no-op, not an error.
  if v_already_merged is not null then
    return;
  end if;

  update dogs set owner_user_id = p_target_user_id where owner_user_id = p_anonymous_user_id;
  update notification_preferences set user_id = p_target_user_id where user_id = p_anonymous_user_id;

  -- The billing record moves. A subscription bought as a guest belongs to the account the guest became.
  update subscriptions set user_id = p_target_user_id where user_id = p_anonymous_user_id;

  -- The derived row does not move; it is discarded and rebuilt from the subscriptions above.
  delete from entitlements where user_id = p_anonymous_user_id;
  perform recompute_entitlement(p_target_user_id);

  update app_events set user_id = p_target_user_id where user_id = p_anonymous_user_id;

  insert into anonymous_sessions (id, merged_into_user_id, merged_at)
  values (p_anonymous_user_id, p_target_user_id, now())
  on conflict (id) do update set merged_into_user_id = excluded.merged_into_user_id, merged_at = excluded.merged_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function EXECUTE privileges
--
-- Same reasoning as `merge_guest_session` in the initial migration: Postgres grants EXECUTE to PUBLIC by default,
-- Supabase adds anon/authenticated on the public schema, and PostgREST exposes every one at /rest/v1/rpc/<name>.
-- `recompute_entitlement` is SECURITY DEFINER and writes a table no client may write, so it must not be callable
-- with the publicly shipped anon key. It is invoked by the verification endpoint under the service role.
--
-- The re-created `merge_guest_session` needs its revoke restated: CREATE OR REPLACE preserves existing privileges,
-- but restating it means this migration is correct applied on its own, not only after the first one.
-- ---------------------------------------------------------------------------
revoke all on function recompute_entitlement(uuid) from public, anon, authenticated;
revoke all on function merge_guest_session(uuid, uuid) from public, anon, authenticated;
