-- ---------------------------------------------------------------------------
-- Phase 9 — a cancelled subscription is entitled until its period ends
--
-- Phase 7's `recompute_entitlement` treated `cancelled` as not entitling. Cancelling an auto-renewing subscription
-- on either store means "do not renew"; the paid period continues to its end and the store keeps serving it. The
-- Phase 7 rule would have revoked premium the moment a user turned off auto-renew — before the store did, and
-- before the period they had paid for was over. The client-side UI already assumed the correct behaviour
-- ("Access until {date}" for a cancelled-but-active subscription); the server did not deliver it. It does now.
--
-- `refunded`, `revoked` and `expired` remain non-entitling regardless of dates. Everything else in the function
-- is unchanged.
-- ---------------------------------------------------------------------------
create or replace function recompute_entitlement(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_sub subscriptions%rowtype;
begin
  select * into v_sub
  from subscriptions
  where user_id = p_user_id
    and status in ('trialing', 'active', 'grace_period', 'billing_retry', 'cancelled')
    -- A cancelled subscription must have a known end date to be honoured; an open-ended cancellation is not a
    -- state the stores produce, and would otherwise entitle forever.
    and (
      (status <> 'cancelled' and (current_period_end is null or current_period_end > now()))
      or (status = 'cancelled' and current_period_end is not null and current_period_end > now())
    )
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

  select * into v_sub
  from subscriptions
  where user_id = p_user_id
  order by updated_at desc
  limit 1;

  if not found then
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

revoke all on function recompute_entitlement(uuid) from public, anon, authenticated;
