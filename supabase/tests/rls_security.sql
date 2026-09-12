-- PawCue database security suite (brief §36 DATABASE, TESTING.md).
--
-- Run against a NON-PRODUCTION project only — it creates and deletes auth users:
--   pnpm exec supabase db query --linked -f supabase/tests/rls_security.sql
--
-- Every check appends a row to `results`; the final SELECT reports PASS/FAIL per check and the run fails loudly
-- if any check did not pass. Role switching (`set local role ...` + `request.jwt.claims`) is what makes these real
-- RLS tests rather than assertions about policy text: the privileged migration role bypasses RLS, so a test that
-- never drops privileges proves nothing.

create temp table results (
  check_name text,
  expected text,
  actual text,
  pass boolean
) on commit drop;

-- The suite deliberately drops to the anon/authenticated roles, which would otherwise be unable to record their
-- own results into this scratch table.
grant select, insert on results to anon, authenticated;

create or replace function tests_record(p_check text, p_expected text, p_actual text)
returns void language plpgsql as $$
begin
  insert into results values (p_check, p_expected, p_actual, p_expected is not distinct from p_actual);
end;
$$;

-- Impersonate an end user the way PostgREST does: assume the `authenticated` role and set the JWT claims that
-- auth.uid() reads from.
create or replace function tests_become(p_user_id uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function tests_become_anon()
returns void language plpgsql as $$
begin
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end;
$$;

create or replace function tests_become_admin()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values
  ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@pawcue.test', '{}', '{}', now(), now(), false),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@pawcue.test',   '{}', '{}', now(), now(), false),
  ('cccccccc-cccc-4ccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null,                '{}', '{}', now(), now(), true);

-- === Auth trigger =========================================================
select tests_record(
  'auth trigger: profile auto-created for each new auth user',
  '3',
  (select count(*)::text from profiles where id in ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-cccc-cccccccccccc'))
);

select tests_record(
  'auth trigger: is_anonymous propagated from auth.users',
  'true',
  (select is_anonymous::text from profiles where id = 'cccccccc-cccc-4ccc-cccc-cccccccccccc')
);

insert into dogs (id, owner_user_id, name) values
  ('d0000000-0000-4000-a000-00000000000a', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'AliceDog'),
  ('d0000000-0000-4000-a000-00000000000b', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',   'BobDog');

insert into anonymous_sessions (id) values ('cccccccc-cccc-4ccc-cccc-cccccccccccc');

-- === updated_at trigger ===================================================
-- NB: now() is the TRANSACTION timestamp, so created_at and updated_at are equal inside a single transaction —
-- comparing them proves nothing here. Instead, write a deliberately stale updated_at and assert the trigger
-- overrode it, which is unambiguous regardless of transaction timing.
update dogs
set name = 'AliceDogRenamed', updated_at = timestamptz '2000-01-01 00:00:00Z'
where id = 'd0000000-0000-4000-a000-00000000000a';

select tests_record(
  'updated_at trigger: overrides a client-supplied stale value',
  'true',
  (select (updated_at > timestamptz '2020-01-01 00:00:00Z')::text
   from dogs where id = 'd0000000-0000-4000-a000-00000000000a')
);

-- === Public/anonymous catalog access ======================================
select tests_become_anon();

select tests_record(
  'anon CAN read public catalog: training_goals',
  '9',
  (select count(*)::text from training_goals)
);

select tests_record(
  'anon CAN read public catalog: lessons',
  '13',
  (select count(*)::text from lessons)
);

select tests_record(
  'anon CAN read public catalog: lesson_troubleshooting',
  'true',
  (select (count(*) > 0)::text from lesson_troubleshooting)
);

select tests_record(
  'anon CANNOT read user data: dogs',
  '0',
  (select count(*)::text from dogs)
);

select tests_record(
  'anon CANNOT read user data: profiles',
  '0',
  (select count(*)::text from profiles)
);

-- anon writes to the public catalog must be rejected (no write policy exists).
do $$
declare v_err text := 'no error';
begin
  begin
    insert into lessons (slug, skill_id, title_key, goal_key, estimated_minutes, difficulty, content_version_id)
    values ('anon_injected', (select id from skills limit 1), 'x', 'y', 3, 1, (select id from content_versions limit 1));
    v_err := 'INSERT SUCCEEDED';
  exception when insufficient_privilege or others then
    v_err := 'rejected';
  end;
  perform tests_record('anon CANNOT write to public catalog (lessons)', 'rejected', v_err);
end;
$$;

select tests_become_admin();

-- === Authenticated user: own data =========================================
select tests_become('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');

select tests_record(
  'alice CAN read her own profile',
  '1',
  (select count(*)::text from profiles where id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
);

select tests_record(
  'alice CAN read her own dog',
  'AliceDogRenamed',
  (select name from dogs where owner_user_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
);

select tests_record(
  'alice sees exactly one dog (hers)',
  '1',
  (select count(*)::text from dogs)
);

-- === Cross-user isolation =================================================
select tests_record(
  'alice CANNOT read bob''s profile',
  '0',
  (select count(*)::text from profiles where id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

select tests_record(
  'alice CANNOT read bob''s dog',
  '0',
  (select count(*)::text from dogs where owner_user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

do $$
declare v_rows int; v_err text := 'no error';
begin
  begin
    update dogs set name = 'HIJACKED' where id = 'd0000000-0000-4000-a000-00000000000b';
    get diagnostics v_rows = row_count;
    v_err := case when v_rows = 0 then 'rejected (0 rows)' else 'UPDATED ' || v_rows || ' ROWS' end;
  exception when others then
    v_err := 'rejected';
  end;
  perform tests_record('alice CANNOT update bob''s dog', 'rejected (0 rows)', v_err);
end;
$$;

do $$
declare v_rows int; v_err text := 'no error';
begin
  begin
    delete from dogs where id = 'd0000000-0000-4000-a000-00000000000b';
    get diagnostics v_rows = row_count;
    v_err := case when v_rows = 0 then 'rejected (0 rows)' else 'DELETED ' || v_rows || ' ROWS' end;
  exception when others then
    v_err := 'rejected';
  end;
  perform tests_record('alice CANNOT delete bob''s dog', 'rejected (0 rows)', v_err);
end;
$$;

-- Forging ownership on insert must fail the WITH CHECK clause.
do $$
declare v_err text := 'no error';
begin
  begin
    insert into dogs (owner_user_id, name) values ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'ForgedDog');
    v_err := 'INSERT SUCCEEDED';
  exception when others then
    v_err := 'rejected';
  end;
  perform tests_record('alice CANNOT insert a dog owned by bob', 'rejected', v_err);
end;
$$;

-- === Training sessions and session events (Phase 4: newly client-writable) ==
-- These tables are owned transitively, through the dog. Phase 4 is the first time a client writes them, so the
-- ownership chain needs proving directly: session_events -> training_sessions -> dogs -> owner_user_id.
select tests_become_admin();

insert into training_sessions (id, dog_id, lesson_id, status, started_at, completed_at)
select '50000000-0000-4000-a000-00000000000a', 'd0000000-0000-4000-a000-00000000000a', id,
       'completed', now(), now()
from lessons where slug = 'name_game';

insert into session_events (id, session_id, type, occurred_at)
values ('e0000000-0000-4000-a000-00000000000a', '50000000-0000-4000-a000-00000000000a', 'session_completed', now());

select tests_become('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');

select tests_record(
  'owner CAN read own training_sessions',
  '1',
  (select count(*)::text from training_sessions where id = '50000000-0000-4000-a000-00000000000a')
);

select tests_record(
  'owner CAN read own session_events',
  '1',
  (select count(*)::text from session_events where id = 'e0000000-0000-4000-a000-00000000000a')
);

-- Bob must not reach Alice's training history through any of the three tables.
select tests_become('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');

select tests_record(
  'other user CANNOT read another user''s training_sessions',
  '0',
  (select count(*)::text from training_sessions where id = '50000000-0000-4000-a000-00000000000a')
);

select tests_record(
  'other user CANNOT read another user''s session_events',
  '0',
  (select count(*)::text from session_events where id = 'e0000000-0000-4000-a000-00000000000a')
);

-- An UPDATE that matches no visible row affects nothing; the check is that the row is genuinely unchanged.
do $$
begin
  update training_sessions set status = 'abandoned'
  where id = '50000000-0000-4000-a000-00000000000a';
exception when others then null;
end $$;

select tests_become_admin();
select tests_record(
  'other user CANNOT modify another user''s training_session',
  'completed',
  (select status from training_sessions where id = '50000000-0000-4000-a000-00000000000a')
);

-- The write side: inserting a session against a dog you do not own must be refused by WITH CHECK.
select tests_become('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
do $$
begin
  insert into training_sessions (id, dog_id, lesson_id, status, started_at)
  select '50000000-0000-4000-a000-0000000000ff', 'd0000000-0000-4000-a000-00000000000a', id, 'in_progress', now()
  from lessons where slug = 'name_game';
exception when others then null;
end $$;

select tests_become_admin();
select tests_record(
  'other user CANNOT create a session against another user''s dog',
  '0',
  (select count(*)::text from training_sessions where id = '50000000-0000-4000-a000-0000000000ff')
);

-- Idempotency of the sync path: re-upserting the same event id must not create a second row.
insert into session_events (id, session_id, type, occurred_at)
values ('e0000000-0000-4000-a000-00000000000a', '50000000-0000-4000-a000-00000000000a', 'session_completed', now())
on conflict (id) do nothing;

select tests_record(
  'session_events replay is idempotent by client-generated id',
  '1',
  (select count(*)::text from session_events where id = 'e0000000-0000-4000-a000-00000000000a')
);

-- Hand the suite back exactly as it was found: the checks that follow run as Alice, and leaving the admin role
-- active would silently turn every later "must be rejected" assertion into a privileged success.
select tests_become('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');


-- === Training plans (Phase 5: newly client-writable) =======================
-- Plans are owned transitively through the dog, like sessions: plan_activities -> plan_days -> training_plans
-- -> dogs -> owner_user_id. Phase 5 is the first time a client writes them.
select tests_become_admin();

insert into training_plans (id, dog_id, plan_engine_version_id, status, daily_minutes, start_date, length_days)
values ('60000000-0000-4000-a000-00000000000a', 'd0000000-0000-4000-a000-00000000000a',
        '00000000-0000-4000-a000-000000000001', 'active', 10, current_date, 3);

insert into plan_days (id, plan_id, day_index, date, total_minutes)
values ('61000000-0000-4000-a000-00000000000a', '60000000-0000-4000-a000-00000000000a', 0, current_date, 6);

insert into plan_activities (id, plan_day_id, lesson_id, sort_order, estimated_minutes, is_review, selection_reason)
select '62000000-0000-4000-a000-00000000000a', '61000000-0000-4000-a000-00000000000a', id, 0, 3, false, 'new_skill'
from lessons where slug = 'name_game';

select tests_become('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');

select tests_record(
  'owner CAN read own training_plan',
  '1',
  (select count(*)::text from training_plans where id = '60000000-0000-4000-a000-00000000000a')
);

select tests_record(
  'owner CAN read own plan_activities',
  '1',
  (select count(*)::text from plan_activities where id = '62000000-0000-4000-a000-00000000000a')
);

select tests_become('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');

select tests_record(
  'other user CANNOT read another user''s training_plan',
  '0',
  (select count(*)::text from training_plans where id = '60000000-0000-4000-a000-00000000000a')
);

select tests_record(
  'other user CANNOT read another user''s plan_days',
  '0',
  (select count(*)::text from plan_days where id = '61000000-0000-4000-a000-00000000000a')
);

select tests_record(
  'other user CANNOT read another user''s plan_activities',
  '0',
  (select count(*)::text from plan_activities where id = '62000000-0000-4000-a000-00000000000a')
);

-- Writing a plan against someone else's dog must fail the WITH CHECK clause.
do $$
begin
  insert into training_plans (id, dog_id, plan_engine_version_id, status, daily_minutes, start_date, length_days)
  values ('60000000-0000-4000-a000-0000000000ff', 'd0000000-0000-4000-a000-00000000000a',
          '00000000-0000-4000-a000-000000000001', 'active', 10, current_date, 3);
exception when others then null;
end $$;

-- Superseding someone else's plan must be invisible, not merely refused loudly.
do $$
begin
  update training_plans set status = 'superseded' where id = '60000000-0000-4000-a000-00000000000a';
exception when others then null;
end $$;

select tests_become_admin();

select tests_record(
  'other user CANNOT create a plan against another user''s dog',
  '0',
  (select count(*)::text from training_plans where id = '60000000-0000-4000-a000-0000000000ff')
);

select tests_record(
  'other user CANNOT supersede another user''s plan',
  'active',
  (select status from training_plans where id = '60000000-0000-4000-a000-00000000000a')
);

-- The selection reason is constrained, so an unknown value cannot be written by any caller.
do $$
declare v_err text := 'no error';
begin
  begin
    insert into plan_activities (plan_day_id, lesson_id, sort_order, estimated_minutes, selection_reason)
    select '61000000-0000-4000-a000-00000000000a', id, 9, 3, 'because_i_said_so' from lessons where slug = 'sit';
    v_err := 'INSERT SUCCEEDED';
  exception when others then
    v_err := 'rejected';
  end;
  perform tests_record('plan_activities rejects an unknown selection_reason', 'rejected', v_err);
end;
$$;

-- Released before the suite continues: `training_plans_one_active_per_dog` allows a dog exactly one active plan,
-- and a later section creates its own for the same dog. A fixture that outlived its block would make an unrelated
-- check fail for a reason that had nothing to do with what it was testing.
delete from plan_activities where id = '62000000-0000-4000-a000-00000000000a';
delete from plan_days where id = '61000000-0000-4000-a000-00000000000a';
delete from training_plans where id in ('60000000-0000-4000-a000-00000000000a', '60000000-0000-4000-a000-0000000000ff');

-- Hand the suite back as Alice, which is what the checks that follow assume.
select tests_become('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');

-- Entitlements are server-authoritative: a client must not be able to grant itself premium.
do $$
declare v_err text := 'no error';
begin
  begin
    insert into entitlements (user_id, is_premium_active) values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', true);
    v_err := 'INSERT SUCCEEDED';
  exception when others then
    v_err := 'rejected';
  end;
  perform tests_record('alice CANNOT self-grant an entitlement (no insert policy)', 'rejected', v_err);
end;
$$;

do $$
declare v_err text := 'no error';
begin
  begin
    insert into subscriptions (user_id, product_id, store, status, store_transaction_id)
    values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'premium_annual', 'app_store', 'active', 'forged-tx-1');
    v_err := 'INSERT SUCCEEDED';
  exception when others then
    v_err := 'rejected';
  end;
  perform tests_record('alice CANNOT forge a subscription row', 'rejected', v_err);
end;
$$;

select tests_record(
  'alice CANNOT read purchase_events (service-role only, no policy)',
  '0',
  (select count(*)::text from purchase_events)
);

-- === Entitlement derivation (Phase 7) =====================================
-- `recompute_entitlement` is SECURITY DEFINER and writes a table no client may write. PostgREST exposes every
-- public function at /rest/v1/rpc/<name>, so an un-revoked grant would let anyone holding the publicly shipped
-- anon key call it — the same shape as the Phase 0 `merge_guest_session` escalation.
do $$
declare v_err text := 'no error';
begin
  perform tests_become_anon();
  begin
    perform recompute_entitlement('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    v_err := 'EXECUTE SUCCEEDED';
  exception when insufficient_privilege then
    v_err := 'rejected';
  when others then
    v_err := 'rejected';
  end;
  perform tests_record('anon CANNOT execute recompute_entitlement', 'rejected', v_err);
end;
$$;

do $$
declare v_err text := 'no error';
begin
  perform tests_become('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
  begin
    perform recompute_entitlement('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    v_err := 'EXECUTE SUCCEEDED';
  exception when insufficient_privilege then
    v_err := 'rejected';
  when others then
    v_err := 'rejected';
  end;
  perform tests_record('authenticated user CANNOT execute recompute_entitlement', 'rejected', v_err);
end;
$$;

select tests_become_admin();

-- Never subscribed: no row at all, which the client reads as free. A `false` row for every non-customer would be
-- inventing billing records for people who have none.
select recompute_entitlement('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
select tests_record(
  'recompute: a user who never subscribed has no entitlement row',
  '0',
  (select count(*)::text from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

insert into subscriptions (id, user_id, product_id, store, status, store_transaction_id, current_period_end)
values ('50000000-0000-4000-a000-00000000000a', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        'premium_monthly', 'app_store', 'active', 'suite-tx-active', now() + interval '30 days');

select recompute_entitlement('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
select tests_record(
  'recompute: an active subscription grants premium',
  'true',
  (select is_premium_active::text from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);
select tests_record(
  'recompute: the entitlement records which subscription state granted it',
  'active',
  (select source from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

-- A payment retry is still an entitlement: the store is treating the subscription as live, and cutting access off
-- mid-retry locks a paying customer out of an app they are still being billed for.
update subscriptions set status = 'billing_retry' where id = '50000000-0000-4000-a000-00000000000a';
select recompute_entitlement('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
select tests_record(
  'recompute: a billing retry keeps premium active',
  'true',
  (select is_premium_active::text from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

-- An expiry the store has told us about ends access, and is distinguishable from never having subscribed.
update subscriptions
set status = 'expired', current_period_end = now() - interval '1 day'
where id = '50000000-0000-4000-a000-00000000000a';
select recompute_entitlement('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
select tests_record(
  'recompute: an expired subscription revokes premium',
  'false',
  (select is_premium_active::text from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);
select tests_record(
  'recompute: an ended subscription is still distinguishable from never having had one',
  'expired',
  (select source from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

-- A subscription whose period ran out without the store saying so must not keep granting access on the strength
-- of a status nobody updated.
update subscriptions
set status = 'active', current_period_end = now() - interval '1 day'
where id = '50000000-0000-4000-a000-00000000000a';
select recompute_entitlement('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
select tests_record(
  'recompute: an active status past its own period end does not grant premium',
  'false',
  (select is_premium_active::text from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

-- Phase 9: turning off auto-renew keeps access until the paid period ends. The store keeps serving a cancelled
-- subscription to its end date; revoking it early would take back something already paid for.
update subscriptions
set status = 'cancelled', current_period_end = now() + interval '10 days', cancelled_at = now()
where id = '50000000-0000-4000-a000-00000000000a';
select recompute_entitlement('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
select tests_record(
  'recompute: a cancelled subscription stays premium until its period end',
  'true',
  (select is_premium_active::text from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);
select tests_record(
  'recompute: the entitlement says it is cancelled, so the UI can show "access until"',
  'cancelled',
  (select source from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

-- ...and not one day past it.
update subscriptions
set current_period_end = now() - interval '1 day'
where id = '50000000-0000-4000-a000-00000000000a';
select recompute_entitlement('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
select tests_record(
  'recompute: a cancelled subscription past its period end does not grant premium',
  'false',
  (select is_premium_active::text from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

-- A cancellation with no end date is not a state the stores produce, and must not entitle forever.
update subscriptions
set current_period_end = null
where id = '50000000-0000-4000-a000-00000000000a';
select recompute_entitlement('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
select tests_record(
  'recompute: a cancelled subscription with no period end does not grant premium',
  'false',
  (select is_premium_active::text from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

-- Refunds and revocations never entitle, whatever their dates say.
update subscriptions
set status = 'refunded', current_period_end = now() + interval '10 days'
where id = '50000000-0000-4000-a000-00000000000a';
select recompute_entitlement('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
select tests_record(
  'recompute: a refunded subscription does not grant premium even inside its period',
  'false',
  (select is_premium_active::text from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

-- Losing access must never cost a user their data.
select tests_record(
  'revoking premium leaves the dog untouched',
  '1',
  (select count(*)::text from dogs where id = 'd0000000-0000-4000-a000-00000000000b')
);

-- A client may read its own entitlement and nothing more — no update policy exists, so a self-grant by UPDATE is
-- as impossible as one by INSERT.
select tests_become('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
select tests_record(
  'bob CAN read his own entitlement',
  '1',
  (select count(*)::text from entitlements)
);
do $$
declare v_rows int := -1;
begin
  update entitlements set is_premium_active = true
  where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  get diagnostics v_rows = row_count;
  perform tests_record('bob CANNOT update his own entitlement to premium', '0', v_rows::text);
end;
$$;
select tests_record(
  'bob''s entitlement is still not premium after the attempted update',
  'false',
  (select is_premium_active::text from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

select tests_become('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
select tests_record(
  'alice CANNOT read bob''s entitlement',
  '0',
  (select count(*)::text from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);
select tests_record(
  'alice CANNOT read bob''s subscription',
  '0',
  (select count(*)::text from subscriptions where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
);

select tests_become_admin();
delete from subscriptions where id = '50000000-0000-4000-a000-00000000000a';
delete from entitlements where user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

select tests_become('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');

-- === Nested ownership (plans/progress reached through dogs) ===============
select tests_become_admin();

insert into training_plans (id, dog_id, plan_engine_version_id, daily_minutes, start_date, length_days)
values ('e0000000-0000-4000-a000-00000000000a', 'd0000000-0000-4000-a000-00000000000a',
        (select id from plan_engine_versions limit 1), 10, current_date, 14);
insert into plan_days (id, plan_id, day_index, date, total_minutes)
values ('f0000000-0000-4000-a000-00000000000a', 'e0000000-0000-4000-a000-00000000000a', 0, current_date, 10);
insert into progress (dog_id) values ('d0000000-0000-4000-a000-00000000000a');
insert into streaks (dog_id, current_streak_days) values ('d0000000-0000-4000-a000-00000000000a', 3);

select tests_become('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
select tests_record('alice CAN read her own plan',      '1', (select count(*)::text from training_plans));
select tests_record('alice CAN read her own plan_days', '1', (select count(*)::text from plan_days));
select tests_record('alice CAN read her own progress',  '1', (select count(*)::text from progress));
select tests_record('alice CAN read her own streak',    '1', (select count(*)::text from streaks));

select tests_become('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
select tests_record('bob CANNOT read alice''s plan',      '0', (select count(*)::text from training_plans));
select tests_record('bob CANNOT read alice''s plan_days', '0', (select count(*)::text from plan_days));
select tests_record('bob CANNOT read alice''s progress',  '0', (select count(*)::text from progress));
select tests_record('bob CANNOT read alice''s streak',    '0', (select count(*)::text from streaks));

-- === merge_guest_session privilege escalation (regression) ================
-- An anon caller previously could re-parent any victim's data onto their own account via /rest/v1/rpc.
select tests_become_anon();
do $$
declare v_err text := 'no error';
begin
  begin
    perform merge_guest_session('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
    v_err := 'EXECUTED — PRIVILEGE ESCALATION';
  exception when insufficient_privilege then
    v_err := 'rejected';
  when others then
    v_err := 'rejected';
  end;
  perform tests_record('anon CANNOT execute merge_guest_session', 'rejected', v_err);
end;
$$;

select tests_become('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
do $$
declare v_err text := 'no error';
begin
  begin
    perform merge_guest_session('cccccccc-cccc-4ccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    v_err := 'EXECUTED — PRIVILEGE ESCALATION';
  exception when insufficient_privilege then
    v_err := 'rejected';
  when others then
    v_err := 'rejected';
  end;
  perform tests_record('authenticated user CANNOT execute merge_guest_session', 'rejected', v_err);
end;
$$;

select tests_become_admin();

select tests_record(
  'alice''s dog still belongs to alice after attempted merges',
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  (select owner_user_id::text from dogs where id = 'd0000000-0000-4000-a000-00000000000a')
);

-- Guard rails still hold for the privileged (service-role) caller.
do $$
declare v_err text := 'no error';
begin
  begin
    perform merge_guest_session('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
    v_err := 'ACCEPTED';
  exception when others then
    v_err := 'rejected';
  end;
  perform tests_record('service role CANNOT merge a non-anonymous source', 'rejected', v_err);
end;
$$;

do $$
declare v_err text := 'no error';
begin
  begin
    perform merge_guest_session('cccccccc-cccc-4ccc-cccc-cccccccccccc', 'cccccccc-cccc-4ccc-cccc-cccccccccccc');
    v_err := 'ACCEPTED';
  exception when others then
    v_err := 'rejected';
  end;
  perform tests_record('service role CANNOT merge a session into itself', 'rejected', v_err);
end;
$$;

-- === Legitimate guest merge + idempotency =================================
insert into dogs (id, owner_user_id, name)
values ('d0000000-0000-4000-a000-00000000000c', 'cccccccc-cccc-4ccc-cccc-cccccccccccc', 'GuestDog');

/*
  Both sides hold an entitlement, which is the case that used to break the merge outright.

  `entitlements.user_id` is NOT NULL UNIQUE, and the original function did
  `update entitlements set user_id = target where user_id = source` — a unique violation whenever both had a row,
  failing the whole transaction and taking the dogs and training history with it. It was unreachable only because
  nothing created entitlement rows; Phase 7 creates them.

  The guest is the one with a live subscription here, so the merge also has to *keep* premium: a subscription
  bought as a guest belongs to the account that guest became.
*/
insert into subscriptions (id, user_id, product_id, store, status, store_transaction_id, current_period_end)
values
  ('50000000-0000-4000-a000-00000000000b', 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
   'premium_annual', 'app_store', 'active', 'suite-tx-guest', now() + interval '300 days'),
  ('50000000-0000-4000-a000-00000000000c', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
   'premium_monthly', 'app_store', 'expired', 'suite-tx-alice', now() - interval '10 days');

select recompute_entitlement('cccccccc-cccc-4ccc-cccc-cccccccccccc');
select recompute_entitlement('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
select tests_record(
  'merge fixture: both sides hold an entitlement row before the merge',
  '2',
  (select count(*)::text from entitlements
   where user_id in ('cccccccc-cccc-4ccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'))
);

select merge_guest_session('cccccccc-cccc-4ccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');

-- The merge completed at all — before the fix, this transaction raised a unique violation here.
select tests_record(
  'merge survives an entitlement row on both sides',
  '1',
  (select count(*)::text from entitlements where user_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
);
select tests_record(
  'merge leaves no entitlement behind on the guest',
  '0',
  (select count(*)::text from entitlements where user_id = 'cccccccc-cccc-4ccc-cccc-cccccccccccc')
);
select tests_record(
  'merge moves the guest''s subscription to the account',
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  (select user_id::text from subscriptions where id = '50000000-0000-4000-a000-00000000000b')
);
-- A subscription bought as a guest still entitles the account afterwards, recomputed rather than carried over.
select tests_record(
  'a subscription bought as a guest survives the merge',
  'true',
  (select is_premium_active::text from entitlements where user_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
);
select tests_record(
  'legitimate merge re-parents the guest dog to the real account',
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  (select owner_user_id::text from dogs where id = 'd0000000-0000-4000-a000-00000000000c')
);
select tests_record(
  'merge marks the anonymous session merged',
  'true',
  (select (merged_at is not null)::text from anonymous_sessions where id = 'cccccccc-cccc-4ccc-cccc-cccccccccccc')
);

-- Re-running must be a harmless no-op, not a duplicate or an error.
select merge_guest_session('cccccccc-cccc-4ccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
select tests_record(
  'merge is idempotent: replay does not re-parent to a different account',
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  (select owner_user_id::text from dogs where id = 'd0000000-0000-4000-a000-00000000000c')
);
-- Scoped to this suite's own fixtures rather than counting every dog in the project.
-- A global count was a valid invariant when this suite was the only thing that created dogs; it is not any more,
-- because the merge-guest endpoint suite creates real guests and real dogs in the same staging project. Counting
-- globally made a passing security check depend on whatever else had been run that day.
select tests_record(
  'merge is idempotent: dog count unchanged (no duplicates)',
  '3',
  (select count(*)::text from dogs
   where owner_user_id in (
     'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
     'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
     'cccccccc-cccc-4ccc-cccc-cccccccccccc'
   ))
);

-- === Constraints ==========================================================
do $$
declare v_err text := 'no error';
begin
  begin
    insert into dog_goals (dog_id, goal_id, priority)
    select 'd0000000-0000-4000-a000-00000000000a', id, 'primary' from training_goals limit 1;
    insert into dog_goals (dog_id, goal_id, priority)
    select 'd0000000-0000-4000-a000-00000000000a', id, 'primary' from training_goals offset 1 limit 1;
    v_err := 'ACCEPTED';
  exception when unique_violation then
    v_err := 'rejected';
  end;
  perform tests_record('constraint: only one primary goal per dog', 'rejected', v_err);
end;
$$;

do $$
declare v_err text := 'no error';
begin
  begin
    insert into training_plans (dog_id, plan_engine_version_id, daily_minutes, start_date, length_days)
    values ('d0000000-0000-4000-a000-00000000000a', (select id from plan_engine_versions limit 1), 10, current_date, 14);
    v_err := 'ACCEPTED';
  exception when unique_violation then
    v_err := 'rejected';
  end;
  perform tests_record('constraint: only one active plan per dog', 'rejected', v_err);
end;
$$;

do $$
declare v_err text := 'no error';
begin
  begin
    insert into dogs (owner_user_id, name, daily_training_minutes)
    values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'BadMinutes', 7);
    v_err := 'ACCEPTED';
  exception when check_violation then
    v_err := 'rejected';
  end;
  perform tests_record('constraint: daily_training_minutes limited to 5/10/15/20', 'rejected', v_err);
end;
$$;

do $$
declare v_err text := 'no error';
begin
  begin
    insert into lesson_troubleshooting (lesson_id, slug, prompt_key, guidance_key, safety_category)
    values ((select id from lessons limit 1), 'bogus', 'p', 'g', 'DEFINITELY_FINE');
    v_err := 'ACCEPTED';
  exception when check_violation then
    v_err := 'rejected';
  end;
  perform tests_record('constraint: safety_category restricted to the four levels', 'rejected', v_err);
end;
$$;

do $$
declare v_err text := 'no error';
begin
  begin
    insert into subscriptions (user_id, product_id, store, status, store_transaction_id)
    values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'premium_annual', 'app_store', 'active', 'dup-tx');
    insert into subscriptions (user_id, product_id, store, status, store_transaction_id)
    values ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'premium_annual', 'app_store', 'active', 'dup-tx');
    v_err := 'ACCEPTED';
  exception when unique_violation then
    v_err := 'rejected';
  end;
  perform tests_record('constraint: store_transaction_id unique (webhook replay safety)', 'rejected', v_err);
end;
$$;

-- === Account deletion behavior ============================================
-- These audit rows are inserted here, NOT reused from the constraint tests above: a PL/pgSQL exception handler
-- rolls back everything inside its block, so the row that tripped the unique-violation test no longer exists.
insert into purchase_events (user_id, type, store, store_event_id)
values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'purchase_verified', 'app_store', 'evt-alice-1');

insert into subscriptions (user_id, product_id, store, status, store_transaction_id)
values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'premium_annual', 'app_store', 'active', 'tx-alice-retain');

delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

select tests_record('deletion: profile hard-deleted',        '0', (select count(*)::text from profiles where id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'));
select tests_record('deletion: dogs hard-deleted (cascade)', '0', (select count(*)::text from dogs where owner_user_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'));
-- Scoped to this suite's own fixture, like the checks above it. A global count was valid when the suite was the
-- only thing creating plans; the app now persists real ones, so counting everything made a cascade check depend
-- on unrelated data.
select tests_record('deletion: training_plans hard-deleted', '0', (select count(*)::text from training_plans where id = 'e0000000-0000-4000-a000-00000000000a'));
select tests_record('deletion: progress hard-deleted',       '0', (select count(*)::text from progress));
select tests_record('deletion: streaks hard-deleted',        '0', (select count(*)::text from streaks));

select tests_record(
  'deletion: purchase_events RETAINED for audit, owner unlinked',
  'retained/unlinked',
  (select case when count(*) = 1 and bool_and(user_id is null) then 'retained/unlinked'
               else 'count=' || count(*) || ' user_id_null=' || coalesce(bool_and(user_id is null)::text, 'n/a') end
   from purchase_events where store_event_id = 'evt-alice-1')
);

select tests_record(
  'deletion: subscriptions RETAINED for audit, owner unlinked',
  'retained/unlinked',
  (select case when count(*) = 1 and bool_and(user_id is null) then 'retained/unlinked'
               else 'count=' || count(*) || ' user_id_null=' || coalesce(bool_and(user_id is null)::text, 'n/a') end
   from subscriptions where store_transaction_id = 'tx-alice-retain')
);

-- Entitlements are pure derived state, so they go with the profile rather than being retained like the billing
-- record that produced them (DATA_MAP.md). Alice held one at this point: the merge above recomputed her a premium
-- entitlement from the guest's subscription.
select tests_record(
  'deletion: entitlements hard-deleted (derived state, not an audit record)',
  '0',
  (select count(*)::text from entitlements where user_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
);

-- === Cleanup ==============================================================
delete from auth.users where id in ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-cccc-cccccccccccc');
delete from subscriptions where store_transaction_id in (
  'dup-tx', 'tx-alice-retain', 'suite-tx-active', 'suite-tx-guest', 'suite-tx-alice'
);
delete from session_events where id = 'e0000000-0000-4000-a000-00000000000a';
delete from plan_activities where id = '62000000-0000-4000-a000-00000000000a';
delete from plan_days where id = '61000000-0000-4000-a000-00000000000a';
delete from training_plans where id in ('60000000-0000-4000-a000-00000000000a', '60000000-0000-4000-a000-0000000000ff');
delete from training_sessions where id in ('50000000-0000-4000-a000-00000000000a', '50000000-0000-4000-a000-0000000000ff');
delete from purchase_events where store_event_id = 'evt-alice-1';

drop function tests_record(text, text, text);
drop function tests_become(uuid);
drop function tests_become_anon();
drop function tests_become_admin();

-- === Report ===============================================================
-- Summary first, then failing checks last: `supabase db query` returns only the final result set, so the
-- failures must be the last SELECT to be visible when the suite is run through the CLI.
select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  case when count(*) filter (where not pass) = 0 then 'ALL CHECKS PASSED' else 'SUITE FAILED' end as verdict
from results;

select 'FAIL' as status, check_name, expected, actual
from results
where not pass
order by check_name;
