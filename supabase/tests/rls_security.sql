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

select merge_guest_session('cccccccc-cccc-4ccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
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
select tests_record(
  'merge is idempotent: dog count unchanged (no duplicates)',
  '3',
  (select count(*)::text from dogs)
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
select tests_record('deletion: training_plans hard-deleted', '0', (select count(*)::text from training_plans));
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

-- === Cleanup ==============================================================
delete from auth.users where id in ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-cccc-cccccccccccc');
delete from subscriptions where store_transaction_id in ('dup-tx', 'tx-alice-retain');
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
