-- PawCue initial schema (brief §11). RLS is enabled on every table from this first migration — never added later.
--
-- Guest identity design (see DATABASE.md §RLS): a guest is a real Supabase anonymous-auth user
-- (`supabase.auth.signInAnonymously()`), so `auth.uid()` exists for guests too. `profiles.owner_user_id`-style
-- columns therefore work identically for guest and signed-in rows — merge-on-sign-in re-parents rows rather than
-- requiring a second "trust a client session id" RLS path.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at bookkeeping
-- ---------------------------------------------------------------------------
-- search_path is pinned on every function here: without it a caller can prepend a schema they control and
-- shadow the objects the function body resolves (Supabase linter 0011_function_search_path_mutable).
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users, including anonymous users)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  is_private_relay_email boolean not null default false,
  display_name text check (char_length(display_name) <= 100),
  preferred_locale text not null default 'en-US' check (preferred_locale in ('en-US', 'he-IL')),
  has_completed_onboarding boolean not null default false,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

-- Auto-create a profile row whenever Supabase Auth creates a user (real or anonymous).
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, is_anonymous)
  values (new.id, new.email, coalesce(new.is_anonymous, false));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- anonymous_sessions — merge-state metadata for a guest profile
-- ---------------------------------------------------------------------------
create table anonymous_sessions (
  id uuid primary key references profiles (id) on delete cascade,
  merged_into_user_id uuid references profiles (id) on delete set null,
  merged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger anonymous_sessions_set_updated_at before update on anonymous_sessions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- dogs
-- ---------------------------------------------------------------------------
create table dogs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  birthdate date,
  breed text check (char_length(breed) <= 100),
  sex text not null default 'unspecified' check (sex in ('male', 'female', 'unspecified')),
  photo_url text,
  daily_training_minutes smallint check (daily_training_minutes in (5, 10, 15, 20)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dogs_owner_user_id_idx on dogs (owner_user_id);
create trigger dogs_set_updated_at before update on dogs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- training_goals (public catalog) + dog_goals
-- ---------------------------------------------------------------------------
create table training_goals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title_key text not null,
  description_key text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger training_goals_set_updated_at before update on training_goals
  for each row execute function set_updated_at();

create table dog_goals (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references dogs (id) on delete cascade,
  goal_id uuid not null references training_goals (id) on delete restrict,
  priority text not null check (priority in ('primary', 'secondary')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dog_id, goal_id)
);

create index dog_goals_dog_id_idx on dog_goals (dog_id);
-- A dog may only have one primary goal at a time (brief §4 Screen 3).
create unique index dog_goals_one_primary_per_dog on dog_goals (dog_id) where (priority = 'primary');
create trigger dog_goals_set_updated_at before update on dog_goals
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- skills (public catalog) + dog_skills
-- ---------------------------------------------------------------------------
create table skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title_key text not null,
  prerequisite_skill_ids uuid[] not null default '{}',
  difficulty smallint not null check (difficulty between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger skills_set_updated_at before update on skills
  for each row execute function set_updated_at();

create table dog_skills (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references dogs (id) on delete cascade,
  skill_id uuid not null references skills (id) on delete restrict,
  status text not null check (status in ('known', 'learning', 'mastered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dog_id, skill_id)
);

create index dog_skills_dog_id_idx on dog_skills (dog_id);
create trigger dog_skills_set_updated_at before update on dog_skills
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- lessons / lesson_steps / lesson_troubleshooting (public catalog, structured content — brief §7, §41)
-- ---------------------------------------------------------------------------
create table content_versions (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  version text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain, version)
);

create trigger content_versions_set_updated_at before update on content_versions
  for each row execute function set_updated_at();

create table lessons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  skill_id uuid not null references skills (id) on delete restrict,
  title_key text not null,
  goal_key text not null,
  estimated_minutes smallint not null check (estimated_minutes between 1 and 15),
  equipment text[] not null default '{}',
  difficulty smallint not null check (difficulty between 1 and 5),
  prerequisite_skill_ids uuid[] not null default '{}',
  is_always_free boolean not null default false,
  content_version_id uuid not null references content_versions (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lessons_skill_id_idx on lessons (skill_id);
create trigger lessons_set_updated_at before update on lessons
  for each row execute function set_updated_at();

create table lesson_steps (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons (id) on delete cascade,
  step_order integer not null check (step_order >= 0),
  instruction_key text not null,
  requires_clicker_press boolean not null default false,
  repetition_target smallint check (repetition_target >= 1),
  illustration_asset_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, step_order)
);

create index lesson_steps_lesson_id_idx on lesson_steps (lesson_id);
create trigger lesson_steps_set_updated_at before update on lesson_steps
  for each row execute function set_updated_at();

create table lesson_troubleshooting (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons (id) on delete cascade,
  slug text not null,
  prompt_key text not null,
  guidance_key text not null,
  -- Required on every row, never nullable — an escalation case can never ship without a category (brief §10, §34).
  safety_category text not null check (
    safety_category in ('NORMAL', 'PROFESSIONAL_TRAINER_RECOMMENDED', 'VET_RECOMMENDED', 'URGENT_SAFETY')
  ),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, slug)
);

create index lesson_troubleshooting_lesson_id_idx on lesson_troubleshooting (lesson_id);
create trigger lesson_troubleshooting_set_updated_at before update on lesson_troubleshooting
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- plan_engine_versions / training_plans / plan_days / plan_activities
-- ---------------------------------------------------------------------------
create table plan_engine_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  released_at timestamptz not null default now(),
  changelog_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plan_engine_versions_set_updated_at before update on plan_engine_versions
  for each row execute function set_updated_at();

create table training_plans (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references dogs (id) on delete cascade,
  plan_engine_version_id uuid not null references plan_engine_versions (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'superseded', 'abandoned')),
  daily_minutes smallint not null check (daily_minutes in (5, 10, 15, 20)),
  start_date date not null,
  length_days smallint not null check (length_days between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index training_plans_dog_id_idx on training_plans (dog_id);
-- Only one active plan per dog at a time.
create unique index training_plans_one_active_per_dog on training_plans (dog_id) where (status = 'active');
create trigger training_plans_set_updated_at before update on training_plans
  for each row execute function set_updated_at();

create table plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references training_plans (id) on delete cascade,
  day_index smallint not null check (day_index >= 0),
  date date not null,
  total_minutes smallint not null check (total_minutes >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, day_index)
);

create index plan_days_plan_id_idx on plan_days (plan_id);
create trigger plan_days_set_updated_at before update on plan_days
  for each row execute function set_updated_at();

create table plan_activities (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references plan_days (id) on delete cascade,
  lesson_id uuid not null references lessons (id) on delete restrict,
  sort_order integer not null check (sort_order >= 0),
  estimated_minutes smallint not null check (estimated_minutes >= 1),
  is_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_day_id, sort_order)
);

create index plan_activities_plan_day_id_idx on plan_activities (plan_day_id);
create index plan_activities_lesson_id_idx on plan_activities (lesson_id);
create trigger plan_activities_set_updated_at before update on plan_activities
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- training_sessions / session_events
-- ---------------------------------------------------------------------------
create table training_sessions (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references dogs (id) on delete cascade,
  lesson_id uuid not null references lessons (id) on delete restrict,
  plan_activity_id uuid references plan_activities (id) on delete set null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index training_sessions_dog_id_idx on training_sessions (dog_id);
create index training_sessions_lesson_id_idx on training_sessions (lesson_id);
create trigger training_sessions_set_updated_at before update on training_sessions
  for each row execute function set_updated_at();

-- Append-only. `id` is client-generated and is the idempotency key for offline replay (ARCHITECTURE.md §8) —
-- inserting the same event twice is a harmless no-op via `on conflict do nothing` at the API layer, never a new row.
create table session_events (
  id uuid primary key,
  session_id uuid not null references training_sessions (id) on delete cascade,
  type text not null check (
    type in (
      'step_advanced', 'clicker_pressed', 'troubleshooting_opened', 'troubleshooting_resolved',
      'repetition_logged', 'session_completed', 'session_abandoned'
    )
  ),
  lesson_step_id uuid references lesson_steps (id) on delete set null,
  troubleshooting_option_id uuid references lesson_troubleshooting (id) on delete set null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index session_events_session_id_idx on session_events (session_id);
create trigger session_events_set_updated_at before update on session_events
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- progress / streaks / reminders / notification_preferences
-- ---------------------------------------------------------------------------
create table progress (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null unique references dogs (id) on delete cascade,
  sessions_completed integer not null default 0,
  training_minutes_total integer not null default 0,
  skills_mastered_count integer not null default 0,
  skills_in_progress_count integer not null default 0,
  last_recalculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger progress_set_updated_at before update on progress
  for each row execute function set_updated_at();

create table streaks (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null unique references dogs (id) on delete cascade,
  current_streak_days integer not null default 0,
  longest_streak_days integer not null default 0,
  last_trained_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger streaks_set_updated_at before update on streaks
  for each row execute function set_updated_at();

create table reminders (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references dogs (id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reminders_dog_id_idx on reminders (dog_id);
create trigger reminders_set_updated_at before update on reminders
  for each row execute function set_updated_at();

create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles (id) on delete cascade,
  training_reminders_enabled boolean not null default false,
  os_permission_granted boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at before update on notification_preferences
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- subscriptions / entitlements / purchase_events
--
-- On account deletion: entitlements are hard-deleted with the profile (pure derived state). subscriptions and
-- purchase_events are billing/audit records — the row is retained but `user_id` is nulled (ON DELETE SET NULL),
-- so no personally-identifying link survives while legally-relevant billing history is preserved (brief §14, §31).
-- ---------------------------------------------------------------------------
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete set null,
  product_id text not null check (product_id in ('premium_monthly', 'premium_annual')),
  store text not null check (store in ('app_store', 'play_store')),
  status text not null check (
    status in ('trialing', 'active', 'grace_period', 'billing_retry', 'cancelled', 'expired', 'refunded', 'revoked')
  ),
  -- Idempotency key for webhook replay (brief §36).
  store_transaction_id text not null unique,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on subscriptions (user_id);
create trigger subscriptions_set_updated_at before update on subscriptions
  for each row execute function set_updated_at();

create table entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles (id) on delete cascade,
  is_premium_active boolean not null default false,
  source text check (
    source in ('trialing', 'active', 'grace_period', 'billing_retry', 'cancelled', 'expired', 'refunded', 'revoked')
  ),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger entitlements_set_updated_at before update on entitlements
  for each row execute function set_updated_at();

create table purchase_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete set null,
  subscription_id uuid references subscriptions (id) on delete set null,
  type text not null check (
    type in (
      'purchase_verified', 'renewal', 'cancellation', 'grace_period_entered', 'billing_retry',
      'expiration', 'refund', 'revoked', 'restore'
    )
  ),
  store text not null check (store in ('app_store', 'play_store')),
  -- Idempotency key so store webhook/notification replay can't double-apply an event (brief §36).
  store_event_id text not null unique,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchase_events_user_id_idx on purchase_events (user_id);
create index purchase_events_subscription_id_idx on purchase_events (subscription_id);
create trigger purchase_events_set_updated_at before update on purchase_events
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- app_events (first-party analytics, brief §29 — no free-text properties, closed event-name enum)
-- ---------------------------------------------------------------------------
create table app_events (
  id uuid primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null check (
    name in (
      'app_opened', 'clicker_pressed', 'first_lesson_started', 'first_lesson_completed', 'plan_started',
      'plan_generated', 'day1_started', 'day1_completed', 'paywall_viewed', 'trial_started', 'purchase_completed',
      'lesson_started', 'lesson_completed', 'troubleshooting_opened', 'reminder_enabled'
    )
  ),
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index app_events_user_id_idx on app_events (user_id);
create index app_events_name_idx on app_events (name);

-- ---------------------------------------------------------------------------
-- Foreign-key covering indexes
--
-- Postgres does not create an index for the referencing side of a foreign key. Beyond ordinary join/filter cost,
-- an unindexed FK forces a sequential scan of the child table on every cascading DELETE — and account deletion
-- (brief §14) cascades across most of this schema. These are the FKs not already covered by an index created
-- alongside their table above.
-- ---------------------------------------------------------------------------
create index anonymous_sessions_merged_into_user_id_idx on anonymous_sessions (merged_into_user_id);
create index dog_goals_goal_id_idx on dog_goals (goal_id);
create index dog_skills_skill_id_idx on dog_skills (skill_id);
create index lessons_content_version_id_idx on lessons (content_version_id);
create index session_events_lesson_step_id_idx on session_events (lesson_step_id);
create index session_events_troubleshooting_option_id_idx on session_events (troubleshooting_option_id);
create index training_plans_plan_engine_version_id_idx on training_plans (plan_engine_version_id);
create index training_sessions_plan_activity_id_idx on training_sessions (plan_activity_id);

-- ---------------------------------------------------------------------------
-- merge_guest_session — transactional, idempotent guest → account merge (DATABASE.md, brief §12)
-- ---------------------------------------------------------------------------
-- SECURITY: this function re-parents one account's data onto another, so it must never be reachable by a client.
-- It is SECURITY DEFINER and PostgREST exposes every public function as /rest/v1/rpc/<name>, which means the
-- default PUBLIC/anon/authenticated EXECUTE grants would let ANY caller holding the (publicly shipped) anon key
-- move an arbitrary victim's dogs, subscriptions and entitlements onto their own account. The REVOKEs at the
-- bottom of this file close that hole; the guards below are defense in depth for the service-role callers that
-- remain, so a bug in the Edge Function can't merge nonsense either.
--
-- Authorization lives in the /v1/auth/merge-guest Edge Function, which must verify BOTH the caller's new
-- authenticated JWT and the guest's anonymous-session JWT before invoking this with the service role. Possession
-- of the anonymous session's token is the proof of ownership — these UUID arguments are not.
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
  update subscriptions set user_id = p_target_user_id where user_id = p_anonymous_user_id;
  update entitlements set user_id = p_target_user_id where user_id = p_anonymous_user_id;
  update app_events set user_id = p_target_user_id where user_id = p_anonymous_user_id;

  insert into anonymous_sessions (id, merged_into_user_id, merged_at)
  values (p_anonymous_user_id, p_target_user_id, now())
  on conflict (id) do update set merged_into_user_id = excluded.merged_into_user_id, merged_at = excluded.merged_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table anonymous_sessions enable row level security;
alter table dogs enable row level security;
alter table training_goals enable row level security;
alter table dog_goals enable row level security;
alter table skills enable row level security;
alter table dog_skills enable row level security;
alter table content_versions enable row level security;
alter table lessons enable row level security;
alter table lesson_steps enable row level security;
alter table lesson_troubleshooting enable row level security;
alter table plan_engine_versions enable row level security;
alter table training_plans enable row level security;
alter table plan_days enable row level security;
alter table plan_activities enable row level security;
alter table training_sessions enable row level security;
alter table session_events enable row level security;
alter table progress enable row level security;
alter table streaks enable row level security;
alter table reminders enable row level security;
alter table notification_preferences enable row level security;
alter table subscriptions enable row level security;
alter table entitlements enable row level security;
alter table purchase_events enable row level security;
alter table app_events enable row level security;

-- Owner-scoped: profiles
create policy "profiles_select_own" on profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_update_own" on profiles for update to authenticated using ((select auth.uid()) = id);

-- Owner-scoped: anonymous_sessions (a guest may read its own merge status)
create policy "anonymous_sessions_select_own" on anonymous_sessions for select to authenticated using ((select auth.uid()) = id);

-- Owner-scoped: dogs
create policy "dogs_all_own" on dogs for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);

-- Public catalog: readable by anyone (including anon), writes are service-role only (no policy = no client write)
create policy "training_goals_public_read" on training_goals for select to anon, authenticated using (true);
create policy "skills_public_read" on skills for select to anon, authenticated using (true);
create policy "content_versions_public_read" on content_versions for select to anon, authenticated using (true);
create policy "lessons_public_read" on lessons for select to anon, authenticated using (true);
create policy "lesson_steps_public_read" on lesson_steps for select to anon, authenticated using (true);
create policy "lesson_troubleshooting_public_read" on lesson_troubleshooting for select to anon, authenticated using (true);
create policy "plan_engine_versions_public_read" on plan_engine_versions for select to anon, authenticated using (true);

-- Owner-scoped via dog_id join
create policy "dog_goals_all_own" on dog_goals for all to authenticated
  using (exists (select 1 from dogs where dogs.id = dog_goals.dog_id and dogs.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from dogs where dogs.id = dog_goals.dog_id and dogs.owner_user_id = (select auth.uid())));

create policy "dog_skills_all_own" on dog_skills for all to authenticated
  using (exists (select 1 from dogs where dogs.id = dog_skills.dog_id and dogs.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from dogs where dogs.id = dog_skills.dog_id and dogs.owner_user_id = (select auth.uid())));

create policy "training_plans_all_own" on training_plans for all to authenticated
  using (exists (select 1 from dogs where dogs.id = training_plans.dog_id and dogs.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from dogs where dogs.id = training_plans.dog_id and dogs.owner_user_id = (select auth.uid())));

create policy "plan_days_all_own" on plan_days for all to authenticated
  using (exists (
    select 1 from training_plans join dogs on dogs.id = training_plans.dog_id
    where training_plans.id = plan_days.plan_id and dogs.owner_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from training_plans join dogs on dogs.id = training_plans.dog_id
    where training_plans.id = plan_days.plan_id and dogs.owner_user_id = (select auth.uid())
  ));

create policy "plan_activities_all_own" on plan_activities for all to authenticated
  using (exists (
    select 1 from plan_days join training_plans on training_plans.id = plan_days.plan_id
    join dogs on dogs.id = training_plans.dog_id
    where plan_days.id = plan_activities.plan_day_id and dogs.owner_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from plan_days join training_plans on training_plans.id = plan_days.plan_id
    join dogs on dogs.id = training_plans.dog_id
    where plan_days.id = plan_activities.plan_day_id and dogs.owner_user_id = (select auth.uid())
  ));

create policy "training_sessions_all_own" on training_sessions for all to authenticated
  using (exists (select 1 from dogs where dogs.id = training_sessions.dog_id and dogs.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from dogs where dogs.id = training_sessions.dog_id and dogs.owner_user_id = (select auth.uid())));

create policy "session_events_all_own" on session_events for all to authenticated
  using (exists (
    select 1 from training_sessions join dogs on dogs.id = training_sessions.dog_id
    where training_sessions.id = session_events.session_id and dogs.owner_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from training_sessions join dogs on dogs.id = training_sessions.dog_id
    where training_sessions.id = session_events.session_id and dogs.owner_user_id = (select auth.uid())
  ));

create policy "progress_all_own" on progress for all to authenticated
  using (exists (select 1 from dogs where dogs.id = progress.dog_id and dogs.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from dogs where dogs.id = progress.dog_id and dogs.owner_user_id = (select auth.uid())));

create policy "streaks_all_own" on streaks for all to authenticated
  using (exists (select 1 from dogs where dogs.id = streaks.dog_id and dogs.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from dogs where dogs.id = streaks.dog_id and dogs.owner_user_id = (select auth.uid())));

create policy "reminders_all_own" on reminders for all to authenticated
  using (exists (select 1 from dogs where dogs.id = reminders.dog_id and dogs.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from dogs where dogs.id = reminders.dog_id and dogs.owner_user_id = (select auth.uid())));

-- Owner-scoped, directly on user_id
create policy "notification_preferences_all_own" on notification_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "subscriptions_select_own" on subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "entitlements_select_own" on entitlements for select to authenticated using ((select auth.uid()) = user_id);
-- purchase_events: no client policy at all (service-role only — brief DATABASE table inventory).

create policy "app_events_insert_own" on app_events for insert to authenticated with check ((select auth.uid()) = user_id);
-- app_events has no select policy for clients — write-only from the client, read via service role for analytics.

-- ---------------------------------------------------------------------------
-- Function EXECUTE privileges
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and Supabase additionally grants anon/
-- authenticated on the public schema. PostgREST then exposes each one at /rest/v1/rpc/<name>. Neither of these
-- functions is meant to be called by a client — one is a trigger body, the other performs a privileged data
-- merge — so both grants are revoked explicitly. Verified by the RLS/security suite in supabase/tests/.
-- ---------------------------------------------------------------------------
revoke all on function merge_guest_session(uuid, uuid) from public, anon, authenticated;
revoke all on function handle_new_auth_user() from public, anon, authenticated;
revoke all on function set_updated_at() from public, anon, authenticated;
