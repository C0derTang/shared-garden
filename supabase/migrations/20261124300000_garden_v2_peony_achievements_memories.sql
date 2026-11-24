-- New-garden Peony milestones, achievements and Memories (decision 0067, issue #177).
-- Separate v2_ tables and functions; legacy Peony, achievements and Memories are
-- untouched. Peony keeps the legacy rules (ordered shared milestones, +1 growth
-- per completed milestone, bloom at 4). Achievements reuse the legacy catalog
-- where its meaning holds; adaptations are recorded in decision 0067
-- ("Achievements in the new garden"). Every award records its garden day.

-- Peony ------------------------------------------------------------------------

create table public.v2_peony_contributions (
  id bigint generated always as identity primary key,
  flower_id uuid not null references public.v2_flowers(id),
  milestone smallint not null check (milestone in (1,3,4)),
  author_id smallint not null check (author_id in (1,2)),
  garden_day date not null,
  original_posted_at timestamptz not null,
  updated_at timestamptz not null check (updated_at >= original_posted_at),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  unique (flower_id, milestone, author_id)
);
create table public.v2_peony_plans (
  flower_id uuid primary key references public.v2_flowers(id),
  version bigint not null check (version > 0),
  activity text not null check (char_length(activity) between 1 and 2000),
  starts_at timestamptz not null check (isfinite(starts_at)),
  updated_by smallint not null check (updated_by in (1,2)),
  updated_at timestamptz not null,
  unique (flower_id, version)
);
create table public.v2_peony_acceptances (
  flower_id uuid not null,
  plan_version bigint not null,
  author_id smallint not null check (author_id in (1,2)),
  garden_day date not null,
  original_posted_at timestamptz not null,
  primary key (flower_id, author_id),
  foreign key (flower_id, plan_version) references public.v2_peony_plans(flower_id, version)
);
-- Completed milestones: progression and qualifying-day evidence.
create table public.v2_peony_activity (
  flower_id uuid not null references public.v2_flowers(id),
  milestone smallint not null check (milestone between 1 and 4),
  garden_day date not null,
  completed_at timestamptz not null,
  member1_posted_at timestamptz not null,
  member2_posted_at timestamptz not null,
  primary key (flower_id, milestone),
  check (member1_posted_at <= completed_at and member2_posted_at <= completed_at)
);
create index v2_peony_activity_day on public.v2_peony_activity(garden_day);

alter table public.v2_peony_contributions enable row level security;
alter table public.v2_peony_plans enable row level security;
alter table public.v2_peony_acceptances enable row level security;
alter table public.v2_peony_activity enable row level security;
revoke all on public.v2_peony_contributions, public.v2_peony_plans,
  public.v2_peony_acceptances, public.v2_peony_activity
  from public, anon, authenticated, service_role, supabase_auth_admin;
revoke all on sequence public.v2_peony_contributions_id_seq
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant select on public.v2_peony_contributions, public.v2_peony_plans,
  public.v2_peony_acceptances, public.v2_peony_activity to authenticated;
create policy members_read_v2_peony_contributions on public.v2_peony_contributions for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_v2_peony_plans on public.v2_peony_plans for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_v2_peony_acceptances on public.v2_peony_acceptances for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_v2_peony_activity on public.v2_peony_activity for select to authenticated
  using ((select public.is_garden_member()));

create function private.v2_require_peony_milestone(p_flower_id uuid, p_milestone integer)
returns public.v2_flowers language plpgsql security invoker set search_path = pg_catalog as $$
declare v_flower public.v2_flowers;
begin
  select * into v_flower from public.v2_flowers where id = p_flower_id and type_key = 'peony' and garden_id = 1;
  if not found then raise exception using errcode = '22023', message = 'Unknown Peony'; end if;
  if p_milestone is null or p_milestone not between 1 and 4 or v_flower.first_bloom_at is not null
    or v_flower.growth_units <> p_milestone - 1 then
    raise exception using errcode = '22023', message = 'Milestones must complete in order';
  end if;
  return v_flower;
end $$;

-- Copy of the legacy Peony validator (ideas and favorites are text; the
-- happened confirmation is empty; the plan has its own workflow).
create function private.v2_validate_peony_payload(p_milestone integer, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare v_text text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 20000 then
    raise exception using errcode = '22023', message = 'Invalid Peony content';
  end if;
  if p_milestone = 3 then
    if p_payload <> '{}'::jsonb then raise exception using errcode = '22023', message = 'Confirmation takes no content'; end if;
    return p_payload;
  end if;
  if p_milestone is null or p_milestone not in (1,4) then
    raise exception using errcode = '22023', message = 'Use the shared plan workflow';
  end if;
  if (select count(*) from jsonb_object_keys(p_payload)) <> 1 or not (p_payload ? 'text')
    or jsonb_typeof(p_payload -> 'text') <> 'string' then
    raise exception using errcode = '22023', message = 'Peony requires a text field';
  end if;
  v_text := regexp_replace(p_payload ->> 'text', '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if char_length(v_text) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'Peony text must contain 1 to 4000 characters';
  end if;
  return jsonb_build_object('text', v_text);
end $$;

-- Caller owns the v2 lock and passes its operation instant plus both original
-- times. Records activity once; it never grants growth by itself.
create function private.v2_record_peony_activity(p_flower_id uuid, p_milestone smallint,
  p_member1_posted_at timestamptz, p_member2_posted_at timestamptz, p_now timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_flower public.v2_flowers; v_day date; v_existing public.v2_peony_activity; v_next integer;
begin
  perform private.require_member();
  perform 1 from public.v2_garden where id = 1 for update;
  perform private.require_member();
  select * into v_flower from public.v2_flowers where id = p_flower_id and type_key = 'peony';
  if not found then raise exception using errcode = '22023', message = 'Unknown Peony'; end if;
  select garden_day into v_day from private.garden_clock_at(p_now);
  if p_now is null or p_milestone is null or p_milestone not between 1 and 4
    or p_member1_posted_at is null or p_member2_posted_at is null
    or least(p_member1_posted_at, p_member2_posted_at) < v_flower.planted_at
    or greatest(p_member1_posted_at, p_member2_posted_at) > p_now
    or (select last_settled_day from public.v2_garden where id = 1) is distinct from v_day - 1 then
    raise exception using errcode = '22023', message = 'Invalid milestone activity';
  end if;
  select * into v_existing from public.v2_peony_activity where flower_id = p_flower_id and milestone = p_milestone;
  if found then
    if v_existing.member1_posted_at = p_member1_posted_at and v_existing.member2_posted_at = p_member2_posted_at then return; end if;
    raise exception using errcode = '22023', message = 'Milestone activity is immutable';
  end if;
  select coalesce(max(milestone), 0) + 1 into v_next from public.v2_peony_activity where flower_id = p_flower_id;
  if p_milestone <> v_next or v_flower.first_bloom_at is not null then
    raise exception using errcode = '22023', message = 'Milestones must complete in order';
  end if;
  insert into public.v2_peony_activity values (p_flower_id, p_milestone, v_day, p_now, p_member1_posted_at, p_member2_posted_at);
end $$;

-- Called after the public operation holds the v2 lock and has inserted this
-- milestone's contribution or acceptance. Both originals complete it at once:
-- +1 growth, bloom at stage 4, then achievements are evaluated.
create function private.v2_complete_peony_milestone(p_flower_id uuid, p_milestone integer, p_now timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_one timestamptz; v_two timestamptz; v_day date;
begin
  perform private.v2_require_peony_milestone(p_flower_id, p_milestone);
  if p_milestone = 2 then
    select min(original_posted_at) filter (where author_id = 1), min(original_posted_at) filter (where author_id = 2)
      into v_one, v_two from public.v2_peony_acceptances where flower_id = p_flower_id;
  else
    select min(original_posted_at) filter (where author_id = 1), min(original_posted_at) filter (where author_id = 2)
      into v_one, v_two from public.v2_peony_contributions where flower_id = p_flower_id and milestone = p_milestone;
  end if;
  if v_one is null or v_two is null then return; end if;
  perform private.v2_record_peony_activity(p_flower_id, p_milestone::smallint, v_one, v_two, p_now);
  update public.v2_flowers set growth_units = p_milestone where id = p_flower_id;
  if p_milestone = 4 then
    select garden_day into v_day from private.garden_clock_at(p_now);
    perform private.v2_record_first_bloom_at(p_flower_id, v_day, p_now);
  end if;
  perform private.v2_evaluate_achievements(p_now);
end $$;

create function private.v2_peony_state_at(p_flower_id uuid, p_actor smallint, p_now timestamptz)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare v_flower public.v2_flowers; v_clock record; v_contributions jsonb; v_plan jsonb;
begin
  select * into v_flower from public.v2_flowers where id = p_flower_id and type_key = 'peony' and garden_id = 1;
  if not found then raise exception using errcode = '22023', message = 'Unknown Peony'; end if;
  select * into v_clock from private.garden_clock_at(p_now);
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
    'edit_deadline', least(c.original_posted_at + interval '30 minutes', timezone('America/Los_Angeles', (c.garden_day + 1) + time '04:00')),
    'edit_deadline_inclusive', c.original_posted_at + interval '30 minutes' < timezone('America/Los_Angeles', (c.garden_day + 1) + time '04:00'),
    'can_edit', c.author_id = p_actor and c.milestone in (1,4) and c.milestone = v_flower.growth_units + 1
      and c.garden_day = v_clock.garden_day and p_now between c.original_posted_at and c.original_posted_at + interval '30 minutes'
    ) order by c.milestone, c.author_id), '[]'::jsonb) into v_contributions
    from public.v2_peony_contributions c where c.flower_id = p_flower_id;
  select to_jsonb(p) || jsonb_build_object(
    'display_timezone', 'America/Los_Angeles',
    'can_edit', v_flower.growth_units = 1,
    'can_accept', v_flower.growth_units = 1 and not exists (select 1 from public.v2_peony_acceptances a where a.flower_id = p_flower_id and a.author_id = p_actor),
    'acceptances', (select coalesce(jsonb_agg(to_jsonb(a) order by a.author_id), '[]'::jsonb) from public.v2_peony_acceptances a where a.flower_id = p_flower_id)
    ) into v_plan from public.v2_peony_plans p where p.flower_id = p_flower_id;
  return jsonb_build_object('server_now', p_now, 'garden_day', v_clock.garden_day,
    'day_starts_at', v_clock.day_starts_at, 'next_rollover_at', v_clock.next_rollover_at,
    'member_id', p_actor, 'flower', to_jsonb(v_flower), 'stage', v_flower.growth_units,
    'next_milestone', case when v_flower.growth_units < 4 then v_flower.growth_units + 1 else null end,
    'contributions', v_contributions, 'plan', v_plan,
    'completed_milestones', (select coalesce(jsonb_agg(to_jsonb(a) order by a.milestone), '[]'::jsonb)
      from public.v2_peony_activity a where a.flower_id = p_flower_id));
end $$;

create function public.v2_current_peony_state(p_flower_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz;
begin
  v_now := private.v2_begin_garden_operation();
  return private.v2_peony_state_at(p_flower_id, private.require_member(), v_now);
end $$;

create function public.v2_submit_peony_contribution(p_flower_id uuid, p_milestone integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_actor smallint; v_day date; v_payload jsonb;
begin
  v_now := private.v2_begin_garden_operation();
  v_actor := private.require_member();
  perform private.v2_require_peony_milestone(p_flower_id, p_milestone);
  v_payload := private.v2_validate_peony_payload(p_milestone, p_payload);
  if exists (select 1 from public.v2_peony_contributions where flower_id = p_flower_id and milestone = p_milestone and author_id = v_actor) then
    raise exception using errcode = '22023', message = 'Already contributed to this milestone';
  end if;
  select garden_day into v_day from private.garden_clock_at(v_now);
  insert into public.v2_peony_contributions(flower_id, milestone, author_id, garden_day, original_posted_at, updated_at, payload)
    values (p_flower_id, p_milestone, v_actor, v_day, v_now, v_now, v_payload);
  perform private.v2_complete_peony_milestone(p_flower_id, p_milestone, v_now);
  return private.v2_peony_state_at(p_flower_id, v_actor, v_now);
end $$;

-- Text edits change no achievement evidence, so the evaluation at operation
-- start suffices (same as the legacy Peony edit).
create function public.v2_edit_peony_contribution(p_contribution_id bigint, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_actor smallint; v_day date; v_entry public.v2_peony_contributions; v_payload jsonb;
begin
  v_now := private.v2_begin_garden_operation();
  v_actor := private.require_member();
  select * into v_entry from public.v2_peony_contributions where id = p_contribution_id;
  if not found or v_entry.author_id <> v_actor then
    raise exception using errcode = '42501', message = 'Only the author can edit this contribution';
  end if;
  perform private.v2_require_peony_milestone(v_entry.flower_id, v_entry.milestone);
  if v_entry.milestone not in (1,4) then
    raise exception using errcode = '22023', message = 'Confirmation cannot be edited';
  end if;
  select garden_day into v_day from private.garden_clock_at(v_now);
  if v_entry.garden_day <> v_day or v_now < v_entry.original_posted_at or v_now > v_entry.original_posted_at + interval '30 minutes' then
    raise exception using errcode = '22023', message = 'The edit window has ended';
  end if;
  v_payload := private.v2_validate_peony_payload(v_entry.milestone, p_payload);
  update public.v2_peony_contributions set payload = v_payload, updated_at = v_now where id = p_contribution_id;
  return private.v2_peony_state_at(v_entry.flower_id, v_actor, v_now);
end $$;

create function public.v2_set_peony_plan(p_flower_id uuid, p_expected_version bigint, p_activity text, p_starts_at text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_actor smallint; v_plan public.v2_peony_plans; v_activity text; v_starts timestamptz; v_version bigint;
begin
  v_now := private.v2_begin_garden_operation();
  v_actor := private.require_member();
  perform private.v2_require_peony_milestone(p_flower_id, 2);
  select * into v_plan from public.v2_peony_plans where flower_id = p_flower_id;
  v_version := coalesce(v_plan.version, 0);
  if p_expected_version is null or p_expected_version <> v_version then
    raise exception using errcode = '22023', message = 'The shared plan has changed; refresh first';
  end if;
  v_activity := regexp_replace(p_activity, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if v_activity is null or char_length(v_activity) not between 1 and 2000 or octet_length(v_activity) > 8000 then
    raise exception using errcode = '22023', message = 'Plan activity must contain 1 to 2000 characters';
  end if;
  -- A text parameter permits explicit-offset validation before PostgreSQL's
  -- session timezone can interpret an ambiguous local timestamp.
  if p_starts_at is null or length(p_starts_at) > 32 or p_starts_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception using errcode = '22023', message = 'Plan time requires an ISO timestamp with an explicit offset';
  end if;
  begin v_starts := p_starts_at::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Invalid plan date and time';
  end;
  if v_plan.activity = v_activity and v_plan.starts_at = v_starts then
    return private.v2_peony_state_at(p_flower_id, v_actor, v_now);
  end if;
  delete from public.v2_peony_acceptances where flower_id = p_flower_id;
  insert into public.v2_peony_plans(flower_id, version, activity, starts_at, updated_by, updated_at)
    values (p_flower_id, v_version + 1, v_activity, v_starts, v_actor, v_now)
    on conflict (flower_id) do update set version = excluded.version, activity = excluded.activity,
      starts_at = excluded.starts_at, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  return private.v2_peony_state_at(p_flower_id, v_actor, v_now);
end $$;

create function public.v2_accept_peony_plan(p_flower_id uuid, p_plan_version bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_actor smallint; v_day date; v_version bigint;
begin
  v_now := private.v2_begin_garden_operation();
  v_actor := private.require_member();
  perform private.v2_require_peony_milestone(p_flower_id, 2);
  select version into v_version from public.v2_peony_plans where flower_id = p_flower_id;
  if v_version is null or p_plan_version is null or v_version <> p_plan_version then
    raise exception using errcode = '22023', message = 'The shared plan has changed; refresh first';
  end if;
  if exists (select 1 from public.v2_peony_acceptances where flower_id = p_flower_id and author_id = v_actor) then
    raise exception using errcode = '22023', message = 'Already accepted this plan';
  end if;
  select garden_day into v_day from private.garden_clock_at(v_now);
  insert into public.v2_peony_acceptances values (p_flower_id, v_version, v_actor, v_day, v_now);
  perform private.v2_complete_peony_milestone(p_flower_id, 2, v_now);
  return private.v2_peony_state_at(p_flower_id, v_actor, v_now);
end $$;

-- Settlement: identical to #173 except that a completed Peony milestone makes
-- its garden day a qualifying day (legacy rule). Peony still never decays,
-- never grows daily and never produces generic day facts.
create or replace function private.v2_settle_garden_at(p_now timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare
  v_today date; v_day date; v_starts timestamptz; v_ends timestamptz; v_noon timestamptz;
  v_flower record; v_one public.v2_flower_entries; v_two public.v2_flower_entries;
  v_paired boolean; v_after smallint; v_bloom boolean; v_active boolean;
  v_streak integer; v_eligible integer; v_noon_complete boolean;
begin
  perform private.require_member();
  perform 1 from public.v2_garden where id = 1 for update;
  perform private.require_member();
  if p_now is null then raise exception using errcode = '22023', message = 'Missing operation time'; end if;
  select garden_day into v_today from private.garden_clock_at(p_now);
  select last_settled_day + 1 into v_day from public.v2_garden where id = 1;
  if v_day is null then raise exception using errcode = '22023', message = 'Garden is not initialized'; end if;
  while v_day < v_today loop
    v_starts := timezone('America/Los_Angeles', v_day + time '04:00');
    v_ends := timezone('America/Los_Angeles', (v_day + 1) + time '04:00');
    v_noon := timezone('America/Los_Angeles', v_day + time '12:00');
    perform private.v2_capture_noon_snapshot(v_day);
    for v_flower in select f.*, c.growth_target from public.v2_flowers f
      join public.flower_catalog c using (type_key)
      where f.planted_day <= v_day and f.type_key <> 'peony'
        and (f.first_bloom_at is null or f.type_key = 'cactus') order by f.spot loop
      select * into v_one from public.v2_flower_entries where flower_id = v_flower.id and garden_day = v_day and author_id = 1;
      select * into v_two from public.v2_flower_entries where flower_id = v_flower.id and garden_day = v_day and author_id = 2;
      v_paired := v_one.id is not null and v_two.id is not null;
      v_after := v_flower.growth_units;
      if v_flower.first_bloom_at is null and v_paired then
        v_after := least(v_flower.growth_target, v_after + 1);
      end if;
      v_bloom := v_flower.first_bloom_at is null and v_after = v_flower.growth_target;
      if v_after <> v_flower.growth_units then
        update public.v2_flowers set growth_units = v_after where id = v_flower.id;
      end if;
      if v_bloom then perform private.v2_record_first_bloom_at(v_flower.id, v_day, p_now); end if;
      insert into public.v2_flower_day_facts(flower_id, garden_day, type_key, growth_before, growth_after, paired,
        qualifying_activity, first_bloom, member1_posted_at, member2_posted_at, member1_mood, member2_mood, daisy_question_id)
      values (v_flower.id, v_day, v_flower.type_key, v_flower.growth_units, v_after, v_paired, v_paired, v_bloom,
        v_one.original_posted_at, v_two.original_posted_at,
        case when v_flower.type_key = 'hydrangea' then v_one.payload ->> 'mood' end,
        case when v_flower.type_key = 'hydrangea' then v_two.payload ->> 'mood' end,
        case when v_flower.type_key = 'daisy' and v_paired then
          (select question_id from public.v2_daisy_assignments where garden_day = v_day) end);
    end loop;
    update public.v2_before_noon_snapshots s set
      member1_posted_at = e1.original_posted_at, member2_posted_at = e2.original_posted_at,
      completed = coalesce(e1.original_posted_at < v_noon and e2.original_posted_at < v_noon, false)
    from public.v2_flowers f
      left join public.v2_flower_entries e1 on e1.flower_id = f.id and e1.garden_day = v_day and e1.author_id = 1
      left join public.v2_flower_entries e2 on e2.flower_id = f.id and e2.garden_day = v_day and e2.author_id = 2
    where s.garden_day = v_day and s.flower_id = f.id;
    select count(*)::integer, coalesce(bool_and(completed), false) into v_eligible, v_noon_complete
      from public.v2_before_noon_snapshots where garden_day = v_day;
    v_active := exists (select 1 from public.v2_flower_day_facts where garden_day = v_day and qualifying_activity)
      or exists (select 1 from public.v2_peony_activity where garden_day = v_day);
    update public.v2_garden set current_streak = case when v_active then current_streak + 1 else 0 end,
      longest_streak = greatest(longest_streak, case when v_active then current_streak + 1 else 0 end),
      qualifying_days = qualifying_days + case when v_active then 1 else 0 end, last_settled_day = v_day
      where id = 1 returning current_streak into v_streak;
    insert into public.v2_garden_days values (v_day, v_starts, v_ends, p_now, v_active, v_streak, v_eligible, v_noon_complete);
    v_day := v_day + 1;
  end loop;
  perform private.v2_capture_noon_snapshot(v_today);
end $$;

-- Achievements --------------------------------------------------------------------

-- The new garden's catalog reuses the legacy definitions (same IDs, titles,
-- targets and units) except where the removed unlock, limit, initial-Cactus or
-- decay rules changed their meaning. Recovery is retired: nothing ever loses
-- growth in the new garden, so it could never be earned.
create table public.v2_achievement_catalog (
  achievement_id text primary key references public.achievement_catalog(achievement_id),
  position smallint not null unique check (position between 1 and 25),
  title text not null,
  target integer not null check (target > 0),
  unit text not null,
  requirement text not null
);
insert into public.v2_achievement_catalog(achievement_id, position, title, target, unit, requirement)
select achievement_id, row_number() over (order by position)::smallint, title, target, unit,
  case achievement_id
    when 'first-seed' then 'Plant a flower together.'
    when 'all-planted' then 'Plant every flower type. All 13 types are available from the start.'
    else requirement end
from public.achievement_catalog where achievement_id <> 'recovery';

create table public.v2_achievement_progress (
  achievement_id text primary key references public.v2_achievement_catalog(achievement_id),
  progress integer not null check (progress >= 0)
);
-- earned_day: the garden day (4 a.m. America/Los_Angeles boundary) of the
-- operation that first met the target. Awards are permanent.
create table public.v2_achievement_awards (
  achievement_id text primary key references public.v2_achievement_catalog(achievement_id),
  earned_at timestamptz not null check (isfinite(earned_at)),
  earned_day date not null check (isfinite(earned_day))
);
create index v2_achievement_awards_day on public.v2_achievement_awards(earned_day);

alter table public.v2_achievement_catalog enable row level security;
alter table public.v2_achievement_progress enable row level security;
alter table public.v2_achievement_awards enable row level security;
revoke all on public.v2_achievement_catalog, public.v2_achievement_progress, public.v2_achievement_awards
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant select on public.v2_achievement_catalog, public.v2_achievement_progress, public.v2_achievement_awards to authenticated;
create policy members_read_v2_achievement_catalog on public.v2_achievement_catalog for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_v2_achievement_progress on public.v2_achievement_progress for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_v2_achievement_awards on public.v2_achievement_awards for select to authenticated
  using ((select public.is_garden_member()));

-- Replaces the #173 no-op. Called at every v2 operation start (after
-- settlement) and after planting, submission, fulfilment and Peony milestone
-- completion, always with the operation's single post-lock instant. Evidence is
-- durable, so one evaluation after catch-up retains every earlier win; progress
-- rows are rewritten only when they change. Entry edits change no evidence
-- (original times, settled moods and Daisy assignments are fixed), so
-- v2_edit_flower_entry relies on the evaluation at its operation start.
create or replace function private.v2_evaluate_achievements(p_now timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_day date;
begin
  perform private.require_member();
  perform 1 from public.v2_garden where id = 1 for update;
  perform private.require_member();
  if p_now is null or not isfinite(p_now) then raise exception 'Missing achievement time'; end if;
  select garden_day into v_day from private.garden_clock_at(p_now);
  with flower_counts as (
    select count(*) seeds,
      count(*) filter (where first_bloom_at is not null) blooms,
      count(distinct type_key) planted_types,
      count(distinct type_key) filter (where first_bloom_at is not null) bloomed_types,
      count(*) filter (where type_key = 'rose' and first_bloom_at is not null) roses,
      count(*) filter (where type_key = 'marigold' and first_bloom_at is not null) marigolds,
      count(*) filter (where type_key = 'tulip' and first_bloom_at is not null) tulips,
      count(*) filter (where type_key = 'forget-me-not' and first_bloom_at is not null) forget_me_nots,
      count(*) filter (where type_key = 'dandelion') wishes,
      count(*) filter (where type_key = 'moonflower' and first_bloom_at is not null) moonflowers,
      count(*) filter (where type_key = 'snapdragon' and first_bloom_at is not null) snapdragons,
      count(*) filter (where type_key = 'bluebell' and first_bloom_at is not null) bluebells,
      count(*) filter (where type_key = 'peony' and first_bloom_at is not null) peonies,
      count(*) filter (where type_key = 'dandelion' and fulfilled_at is not null) fulfilled
    from public.v2_flowers
  ), pairs as (
    select a.flower_id, a.garden_day, a.original_posted_at one_at, b.original_posted_at two_at
    from public.v2_flower_entries a join public.v2_flower_entries b
      on a.flower_id = b.flower_id and a.garden_day = b.garden_day and b.author_id = 2
    join public.v2_flowers f on f.id = a.flower_id
    where a.author_id = 1 and (f.type_key <> 'hydrangea' or f.first_bloom_day is null or a.garden_day <= f.first_bloom_day)
  ), questions as (
    select daisy_question_id question_id from public.v2_flower_day_facts where type_key = 'daisy' and paired
    union
    select a.question_id from pairs p join public.v2_flowers f on f.id = p.flower_id and f.type_key = 'daisy'
      join public.v2_daisy_assignments a on a.garden_day = p.garden_day
  ), evidence as (
    select f.*,
      (select longest_streak from public.v2_garden where id = 1) streak,
      (select count(distinct question_id) from questions) questions,
      (select count(distinct d.garden_day) from public.v2_flower_day_facts d
        left join public.v2_flower_entries x on x.flower_id = d.flower_id and x.garden_day = d.garden_day and x.author_id = 1
        left join public.v2_flower_entries y on y.flower_id = d.flower_id and y.garden_day = d.garden_day and y.author_id = 2
        where d.type_key = 'hydrangea' and d.paired and d.member1_mood <> 'other'
          and ((d.member1_mood = d.member2_mood and (x.payload ->> 'mood2') is not distinct from (y.payload ->> 'mood2'))
            or (d.member1_mood = (y.payload ->> 'mood2') and (x.payload ->> 'mood2') = d.member2_mood))) moods,
      exists (select 1 from public.v2_garden_days where before_noon_complete and before_noon_eligible_count > 0) noon,
      (exists (select 1 from pairs where abs(extract(epoch from (two_at - one_at))) <= 600)
        or exists (select 1 from public.v2_flower_day_facts where paired and abs(extract(epoch from (member2_posted_at - member1_posted_at))) <= 600)
        or exists (select 1 from public.v2_peony_activity p where abs(extract(epoch from (p.member2_posted_at - p.member1_posted_at))) <= 600
          and (select garden_day from private.garden_clock_at(p.member1_posted_at)) = (select garden_day from private.garden_clock_at(p.member2_posted_at)))) timing
    from flower_counts f
  ), metrics as (
    select v.* from evidence e cross join lateral (values
      ('first-seed', e.seeds), ('first-bloom', e.blooms), ('all-planted', e.planted_types), ('all-bloomed', e.bloomed_types),
      ('streak-3', e.streak), ('streak-7', e.streak), ('streak-14', e.streak), ('streak-21', e.streak),
      ('roses-5', e.roses), ('marigolds-10', e.marigolds), ('tulips-3', e.tulips),
      ('daisy-20', e.questions), ('forget-me-nots-3', e.forget_me_nots), ('wishes-5', e.wishes),
      ('ten-minutes', e.timing::integer), ('before-noon', e.noon::integer), ('moonflower', e.moonflowers),
      ('snapdragon', e.snapdragons), ('bluebell', e.bluebells), ('mood-match-3', e.moods), ('peony', e.peonies),
      ('first-wish-blown', e.fulfilled), ('coexisting-5', e.blooms), ('blooms-10', e.blooms), ('blooms-20', e.blooms)
    ) v(achievement_id, amount)
  )
  insert into public.v2_achievement_progress as p
  select c.achievement_id, least(c.target, coalesce(m.amount, 0))::integer
  from public.v2_achievement_catalog c join metrics m using (achievement_id)
  on conflict (achievement_id) do update set progress = excluded.progress
  where p.progress is distinct from excluded.progress;
  insert into public.v2_achievement_awards(achievement_id, earned_at, earned_day)
  select c.achievement_id, p_now, v_day from public.v2_achievement_catalog c
    join public.v2_achievement_progress p using (achievement_id)
  where p.progress >= c.target on conflict (achievement_id) do nothing;
end $$;

create function public.v2_current_achievements()
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_day date;
begin
  v_now := private.v2_begin_garden_operation();
  select garden_day into v_day from private.garden_clock_at(v_now);
  return jsonb_build_object('server_now', v_now, 'garden_day', v_day,
    'current_streak', (select current_streak from public.v2_garden where id = 1),
    'achievements', (select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('progress', p.progress,
        'earned_at', a.earned_at, 'earned_day', a.earned_day) order by c.position), '[]'::jsonb)
      from public.v2_achievement_catalog c join public.v2_achievement_progress p using (achievement_id)
      left join public.v2_achievement_awards a using (achievement_id)));
end $$;

-- Whether any achievement was earned during a garden day (default: the current
-- one), for the night fireworks (#184). Runs settlement and evaluation first,
-- so awards confirmed by today's rollover are included.
create function public.v2_awards_for_day(p_day date default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_today date; v_day date; v_awards jsonb;
begin
  v_now := private.v2_begin_garden_operation();
  select garden_day into v_today from private.garden_clock_at(v_now);
  v_day := coalesce(p_day, v_today);
  if not isfinite(v_day) then raise exception using errcode = '22023', message = 'Invalid garden day'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('achievement_id', c.achievement_id, 'title', c.title,
      'earned_at', a.earned_at, 'earned_day', a.earned_day) order by a.earned_at, c.position), '[]'::jsonb)
    into v_awards
    from public.v2_achievement_awards a join public.v2_achievement_catalog c using (achievement_id)
    where a.earned_day = v_day;
  return jsonb_build_object('server_now', v_now, 'garden_day', v_today, 'day', v_day,
    'earned', jsonb_array_length(v_awards) > 0, 'awards', v_awards);
end $$;

-- Memories ------------------------------------------------------------------------

-- Mirrors the latest legacy memories_page over v2 entries, Dandelion wishes and
-- Peony bundles only. Same arguments, cursor, page size and item shape. Legacy
-- content never appears here.
create function public.v2_memories_page(
  p_mode text default 'latest', p_cursor jsonb default null,
  p_keys text[] default null, p_type text default null, p_spot integer default null,
  p_from date default null, p_to date default null, p_author integer default null
) returns jsonb language plpgsql stable security invoker set search_path = pg_catalog as $$
declare v_at timestamptz; v_kind text; v_id text; v_result jsonb;
begin
  if not public.is_garden_member() then
    raise exception using errcode = '42501', message = 'Garden membership required';
  end if;
  if p_mode is null or p_mode not in ('latest','older','newer','updates')
    or (p_type is not null and not exists (select 1 from public.flower_catalog where type_key = p_type))
    or p_spot <= 0 or p_from > p_to or not isfinite(p_from) or not isfinite(p_to)
    or (p_author is not null and p_author not in (1,2)) then
    raise exception using errcode = '22023', message = 'Invalid memories query';
  end if;
  if p_mode in ('older','newer') then
    if p_cursor is null or jsonb_typeof(p_cursor) <> 'object'
      or coalesce(p_cursor ->> 'at', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      or coalesce(p_cursor ->> 'kind', '') not in ('entry','wish','peony')
      or (p_cursor ->> 'kind' = 'entry' and coalesce(p_cursor ->> 'id', '') !~ '^[1-9][0-9]{0,18}$')
      or (p_cursor ->> 'kind' <> 'entry' and coalesce(p_cursor ->> 'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception using errcode = '22023', message = 'Invalid memories cursor';
    end if;
    v_at := (p_cursor ->> 'at')::timestamptz;
    v_kind := p_cursor ->> 'kind'; v_id := p_cursor ->> 'id';
  end if;
  if p_mode = 'updates' and (p_keys is null or cardinality(p_keys) not between 1 and 20
    or exists (select 1 from unnest(p_keys) k where k is null or k !~ '^(entry:[1-9][0-9]{0,18}|(wish|peony):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')) then
    raise exception using errcode = '22023', message = 'Invalid memories update batch';
  end if;
  with sources as (
    select e.original_posted_at as at, 'entry'::text as kind, e.id::text as source_id,
      e.flower_id, e.garden_day, e.author_id::smallint as author_id
    from public.v2_flower_entries e
    union all
    select f.planted_at, case f.type_key when 'dandelion' then 'wish' else 'peony' end,
      f.id::text, f.id, f.planted_day, f.planted_by::smallint
    from public.v2_flowers f where f.type_key in ('dandelion','peony')
  ), candidates as (
    select s.* from sources s join public.v2_flowers f on f.id = s.flower_id
    where (p_type is null or f.type_key = p_type) and (p_spot is null or f.spot = p_spot)
      and (p_from is null or s.garden_day >= p_from) and (p_to is null or s.garden_day <= p_to)
      and (p_author is null or s.author_id = p_author
        or (s.kind = 'peony' and exists (select 1 from public.v2_peony_contributions c where c.flower_id = s.flower_id and c.author_id = p_author)))
      and (p_mode <> 'older' or (s.at, s.kind collate "C", s.source_id collate "C") < (v_at, v_kind collate "C", v_id collate "C"))
      and (p_mode <> 'newer' or (s.at, s.kind collate "C", s.source_id collate "C") > (v_at, v_kind collate "C", v_id collate "C"))
      and (p_mode <> 'updates' or (s.kind || ':' || s.source_id) = any (p_keys))
    order by
      case when p_mode = 'newer' then s.at end asc,
      case when p_mode = 'newer' then s.kind end collate "C" asc,
      case when p_mode = 'newer' then s.source_id end collate "C" asc,
      s.at desc, s.kind collate "C" desc, s.source_id collate "C" desc
    limit 21
  ), numbered as (
    select *, row_number() over (order by
      case when p_mode = 'newer' then at end asc,
      case when p_mode = 'newer' then kind end collate "C" asc,
      case when p_mode = 'newer' then source_id end collate "C" asc,
      at desc, kind collate "C" desc, source_id collate "C" desc) as ordinal
    from candidates
  ), enriched as (
    select n.ordinal, jsonb_build_object(
      'key', n.kind || ':' || n.source_id, 'kind', n.kind, 'source_id', n.source_id,
      'at', n.at, 'garden_day', n.garden_day, 'read_at', statement_timestamp(),
      'flower', jsonb_build_object('id', f.id, 'type_key', f.type_key, 'spot', f.spot,
        'planted_at', f.planted_at, 'planted_day', f.planted_day, 'planted_by', f.planted_by,
        'first_bloom_at', f.first_bloom_at, 'first_bloom_day', f.first_bloom_day,
        'shared_wish', f.shared_wish, 'fulfilled_at', f.fulfilled_at, 'fulfilled_by', f.fulfilled_by),
      'entry', case when n.kind = 'entry' then jsonb_build_object(
        'author_id', e.author_id, 'updated_at', e.updated_at,
        'payload', case f.type_key
          when 'cactus' then '{}'::jsonb
          when 'tulip' then jsonb_build_object('title', e.payload ->> 'title', 'artist', e.payload ->> 'artist', 'url', e.payload ->> 'url')
          when 'hydrangea' then jsonb_strip_nulls(jsonb_build_object('mood', e.payload ->> 'mood', 'mood2', e.payload ->> 'mood2', 'note', e.payload ->> 'note'))
          when 'sunflower' then jsonb_build_object('media_id', e.payload ->> 'media_id')
          when 'bluebell' then jsonb_build_object('media_id', e.payload ->> 'media_id')
          else jsonb_build_object('text', e.payload ->> 'text') end,
        'question', case when f.type_key = 'daisy' then d.prompt end) end,
      'peony', case when n.kind = 'peony' then jsonb_build_object(
        'contributions', (select coalesce(jsonb_agg(jsonb_build_object(
          'milestone', c.milestone, 'author_id', c.author_id, 'original_posted_at', c.original_posted_at,
          'garden_day', c.garden_day, 'text', case when c.milestone <> 3 then c.payload ->> 'text' end)
          order by c.milestone, c.author_id), '[]'::jsonb) from public.v2_peony_contributions c where c.flower_id = f.id),
        'plan', (select jsonb_build_object('version', p.version::text, 'activity', p.activity,
          'starts_at', p.starts_at, 'updated_at', p.updated_at, 'updated_by', p.updated_by,
          'acceptances', (select coalesce(jsonb_agg(jsonb_build_object('author_id', a.author_id,
            'original_posted_at', a.original_posted_at, 'garden_day', a.garden_day) order by a.author_id), '[]'::jsonb)
            from public.v2_peony_acceptances a where a.flower_id = p.flower_id and a.plan_version = p.version))
          from public.v2_peony_plans p where p.flower_id = f.id),
        'completed', (select coalesce(jsonb_agg(jsonb_build_object('milestone', a.milestone,
          'garden_day', a.garden_day, 'completed_at', a.completed_at,
          'member1_posted_at', a.member1_posted_at, 'member2_posted_at', a.member2_posted_at)
          order by a.milestone), '[]'::jsonb) from public.v2_peony_activity a where a.flower_id = f.id)) end
    ) as item
    from numbered n join public.v2_flowers f on f.id = n.flower_id
    left join public.v2_flower_entries e on e.id = case when n.kind = 'entry' then n.source_id::bigint end
    left join public.v2_daisy_assignments d on d.garden_day = e.daisy_assignment_day
    where n.ordinal <= 20
  ) select jsonb_build_object('items', coalesce((select jsonb_agg(item order by ordinal) from enriched), '[]'::jsonb),
    'more', (select count(*) > 20 from candidates)) into v_result;
  return v_result;
end $$;

-- Explicit function grant surface (decision 0028 pattern). The replaced
-- v2_settle_garden_at and v2_evaluate_achievements keep their #173 grants.
revoke all on function
  private.v2_require_peony_milestone(uuid,integer),
  private.v2_validate_peony_payload(integer,jsonb),
  private.v2_record_peony_activity(uuid,smallint,timestamptz,timestamptz,timestamptz),
  private.v2_complete_peony_milestone(uuid,integer,timestamptz),
  private.v2_peony_state_at(uuid,smallint,timestamptz),
  public.v2_current_peony_state(uuid),
  public.v2_submit_peony_contribution(uuid,integer,jsonb),
  public.v2_edit_peony_contribution(bigint,jsonb),
  public.v2_set_peony_plan(uuid,bigint,text,text),
  public.v2_accept_peony_plan(uuid,bigint),
  public.v2_current_achievements(),
  public.v2_awards_for_day(date),
  public.v2_memories_page(text,jsonb,text[],text,integer,date,date,integer)
from public, anon, authenticated, service_role, supabase_auth_admin;
grant execute on function
  public.v2_current_peony_state(uuid),
  public.v2_submit_peony_contribution(uuid,integer,jsonb),
  public.v2_edit_peony_contribution(bigint,jsonb),
  public.v2_set_peony_plan(uuid,bigint,text,text),
  public.v2_accept_peony_plan(uuid,bigint),
  public.v2_current_achievements(),
  public.v2_awards_for_day(date),
  public.v2_memories_page(text,jsonb,text[],text,integer,date,date,integer)
to authenticated;

-- Member RLS authorizes each change; messages only invalidate clients. Plan
-- UPDATE invalidates removed acceptances (DELETE is not published).
alter publication supabase_realtime add table
  public.v2_peony_contributions, public.v2_peony_plans, public.v2_peony_acceptances,
  public.v2_achievement_progress, public.v2_achievement_awards;
