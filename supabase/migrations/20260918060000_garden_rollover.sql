-- One chronological ledger, serialized by the existing singleton garden lock.
alter table public.garden
  add column last_settled_day date,
  add column current_streak integer not null default 0 check (current_streak >= 0),
  add column longest_streak integer not null default 0 check (longest_streak >= current_streak),
  add column qualifying_days bigint not null default 0 check (qualifying_days >= 0);
update public.garden g set last_settled_day =
  (select garden_day-1 from private.garden_clock_at(g.initialized_at));

create table public.garden_days (
  garden_day date primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  settled_at timestamptz not null check (settled_at >= ends_at),
  qualifying_activity boolean not null,
  streak integer not null check (streak >= 0),
  before_noon_eligible_count integer not null check (before_noon_eligible_count >= 0),
  before_noon_complete boolean not null,
  check (not before_noon_complete or before_noon_eligible_count > 0)
);
create table public.flower_day_facts (
  flower_id uuid not null references public.flowers(id),
  garden_day date not null references public.garden_days(garden_day) deferrable initially deferred,
  type_key text not null references public.flower_catalog(type_key),
  growth_before smallint not null check (growth_before >= 0),
  growth_after smallint not null check (growth_after >= 0),
  paired boolean not null,
  qualifying_activity boolean not null,
  first_bloom boolean not null,
  member1_posted_at timestamptz,
  member2_posted_at timestamptz,
  member1_mood text references public.hydrangea_moods(mood_key),
  member2_mood text references public.hydrangea_moods(mood_key),
  daisy_question_id text,
  primary key (flower_id,garden_day),
  check (paired = (member1_posted_at is not null and member2_posted_at is not null)),
  check (not qualifying_activity or paired)
);
create table public.before_noon_snapshots (
  garden_day date not null,
  flower_id uuid not null references public.flowers(id),
  member1_posted_at timestamptz,
  member2_posted_at timestamptz,
  completed boolean not null default false,
  primary key (garden_day,flower_id),
  check (not completed or (member1_posted_at is not null and member2_posted_at is not null))
);
create table public.peony_activity (
  flower_id uuid not null references public.flowers(id),
  milestone smallint not null check (milestone between 1 and 4),
  garden_day date not null,
  completed_at timestamptz not null,
  member1_posted_at timestamptz not null,
  member2_posted_at timestamptz not null,
  primary key (flower_id,milestone),
  check (member1_posted_at <= completed_at and member2_posted_at <= completed_at)
);
create index peony_activity_day on public.peony_activity(garden_day);
create index flower_day_facts_day on public.flower_day_facts(garden_day);

alter table public.garden_days enable row level security;
alter table public.flower_day_facts enable row level security;
alter table public.before_noon_snapshots enable row level security;
alter table public.peony_activity enable row level security;
revoke all on public.garden_days,public.flower_day_facts,public.before_noon_snapshots,public.peony_activity
  from public,anon,authenticated,service_role,supabase_auth_admin;
grant select on public.garden_days,public.flower_day_facts,public.before_noon_snapshots,public.peony_activity to authenticated;
create policy members_read_days on public.garden_days for select to authenticated using ((select public.is_garden_member()));
create policy members_read_day_facts on public.flower_day_facts for select to authenticated using ((select public.is_garden_member()));
create policy members_read_noon on public.before_noon_snapshots for select to authenticated using ((select public.is_garden_member()));
create policy members_read_peony_activity on public.peony_activity for select to authenticated using ((select public.is_garden_member()));

-- Trusted evaluators pass the operation's single instant. This retains the
-- existing completion seam's contract: its caller must prove earned growth.
create function private.record_first_bloom_at(p_flower_id uuid,p_credit_day date,p_now timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_flower public.flowers; v_today date; v_total bigint;
begin
  perform private.require_member();
  perform 1 from public.garden where id=1 for update;
  perform private.require_member();
  select * into v_flower from public.flowers where id=p_flower_id;
  if not found then raise exception using errcode='22023',message='Unknown flower'; end if;
  select garden_day into v_today from private.garden_clock_at(p_now);
  if p_now is null or p_credit_day is null or p_credit_day<v_flower.planted_day or p_credit_day>v_today then
    raise exception using errcode='22023',message='Invalid bloom credit day';
  end if;
  if v_flower.first_bloom_at is not null then return; end if;
  update public.flowers set first_bloom_at=p_now,first_bloom_day=p_credit_day,
    growth_units=(select growth_target from public.flower_catalog where type_key=v_flower.type_key)
    where id=p_flower_id;
  select count(*) into v_total from public.flowers where first_bloom_at is not null;
  insert into public.flower_unlocks(type_key,unlocked_at)
    select type_key,p_now from public.flower_catalog where unlock_after_blooms<=v_total
    on conflict (type_key) do nothing;
end $$;
create or replace function private.record_first_bloom(p_flower_id uuid,p_credit_day date)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_now timestamptz;
begin
  perform private.require_member();
  perform 1 from public.garden where id=1 for update;
  v_now := clock_timestamp();
  perform private.record_first_bloom_at(p_flower_id,p_credit_day,v_now);
end $$;

-- Historical eligibility is based on qualifying days, never late settlement
-- timestamps. A flower planted during D joins D+1; blooming in D excludes D+1.
create function private.capture_noon_snapshot(p_day date)
returns void language sql security invoker set search_path = pg_catalog as $$
  insert into public.before_noon_snapshots(garden_day,flower_id)
  select p_day,id from public.flowers
  where planted_day<p_day and type_key not in ('moonflower','peony')
    and (first_bloom_day is null or first_bloom_day>=p_day)
  on conflict (garden_day,flower_id) do nothing;
$$;

create function private.settle_garden_at(p_now timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare
  v_today date; v_day date; v_starts timestamptz; v_ends timestamptz; v_noon timestamptz;
  v_flower record; v_one public.flower_entries; v_two public.flower_entries;
  v_paired boolean; v_after smallint; v_bloom boolean; v_active boolean;
  v_streak integer; v_eligible integer; v_noon_complete boolean;
begin
  perform private.require_member();
  perform 1 from public.garden where id=1 for update;
  perform private.require_member();
  if p_now is null then raise exception using errcode='22023',message='Missing operation time'; end if;
  select garden_day into v_today from private.garden_clock_at(p_now);
  select last_settled_day+1 into v_day from public.garden where id=1;
  if v_day is null then raise exception using errcode='22023',message='Garden is not initialized'; end if;
  while v_day<v_today loop
    v_starts := timezone('America/Los_Angeles',v_day+time '04:00');
    v_ends := timezone('America/Los_Angeles',(v_day+1)+time '04:00');
    v_noon := timezone('America/Los_Angeles',v_day+time '12:00');
    perform private.capture_noon_snapshot(v_day);
    for v_flower in select f.*,c.growth_target from public.flowers f
      join public.flower_catalog c using(type_key)
      where f.planted_day<=v_day and f.type_key<>'peony'
        and (f.first_bloom_at is null or f.type_key='cactus') order by f.spot loop
      select * into v_one from public.flower_entries where flower_id=v_flower.id and garden_day=v_day and author_id=1;
      select * into v_two from public.flower_entries where flower_id=v_flower.id and garden_day=v_day and author_id=2;
      v_paired := v_one.id is not null and v_two.id is not null;
      v_after := v_flower.growth_units;
      if v_flower.first_bloom_at is null then
        if v_paired then v_after := least(v_flower.growth_target,v_after+1);
        elsif v_flower.type_key<>'cactus' then v_after := greatest(0,v_after-1); end if;
      end if;
      v_bloom := v_flower.first_bloom_at is null and v_after=v_flower.growth_target;
      update public.flowers set growth_units=v_after where id=v_flower.id;
      if v_bloom then perform private.record_first_bloom_at(v_flower.id,v_day,p_now); end if;
      insert into public.flower_day_facts(flower_id,garden_day,type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom,
        member1_posted_at,member2_posted_at,member1_mood,member2_mood,daisy_question_id)
      values(v_flower.id,v_day,v_flower.type_key,v_flower.growth_units,v_after,v_paired,v_paired,v_bloom,
        v_one.original_posted_at,v_two.original_posted_at,
        case when v_flower.type_key='hydrangea' then v_one.payload->>'mood' end,
        case when v_flower.type_key='hydrangea' then v_two.payload->>'mood' end,
        case when v_flower.type_key='daisy' and v_paired then
          (select question_id from public.daisy_assignments where garden_day=v_day) end);
    end loop;
    update public.before_noon_snapshots s set
      member1_posted_at=e1.original_posted_at,member2_posted_at=e2.original_posted_at,
      completed=coalesce(e1.original_posted_at<v_noon and e2.original_posted_at<v_noon,false)
    from public.flowers f
      left join public.flower_entries e1 on e1.flower_id=f.id and e1.garden_day=v_day and e1.author_id=1
      left join public.flower_entries e2 on e2.flower_id=f.id and e2.garden_day=v_day and e2.author_id=2
    where s.garden_day=v_day and s.flower_id=f.id;
    select count(*)::integer,coalesce(bool_and(completed),false) into v_eligible,v_noon_complete
      from public.before_noon_snapshots where garden_day=v_day;
    v_active := exists(select 1 from public.flower_day_facts where garden_day=v_day and qualifying_activity)
      or exists(select 1 from public.peony_activity where garden_day=v_day);
    update public.garden set current_streak=case when v_active then current_streak+1 else 0 end,
      longest_streak=greatest(longest_streak,case when v_active then current_streak+1 else 0 end),
      qualifying_days=qualifying_days+case when v_active then 1 else 0 end,last_settled_day=v_day
      where id=1 returning current_streak into v_streak;
    insert into public.garden_days values(v_day,v_starts,v_ends,p_now,v_active,v_streak,v_eligible,v_noon_complete);
    v_day := v_day+1;
  end loop;
  perform private.capture_noon_snapshot(v_today);
end $$;

-- All public domain operations enter here once. No user-settable time exists.
create function private.begin_garden_operation()
returns timestamptz language plpgsql security invoker set search_path = pg_catalog as $$
declare v_now timestamptz; v_day date;
begin
  perform private.require_member();
  insert into public.garden(id) values(1) on conflict(id) do nothing;
  perform 1 from public.garden where id=1 for update;
  perform private.require_member();
  v_now := clock_timestamp();
  select garden_day into v_day from private.garden_clock_at(v_now);
  if not exists(select 1 from public.flowers where type_key='cactus') then
    insert into public.flowers(type_key,spot,planted_at,planted_day,is_initial) values('cactus',1,v_now,v_day,true);
    update public.garden set next_spot=2,initialized_at=v_now,last_settled_day=v_day-1 where id=1;
  end if;
  insert into public.flower_unlocks(type_key,unlocked_at)
    select type_key,v_now from public.flower_catalog where unlock_after_blooms=0 on conflict(type_key) do nothing;
  perform private.settle_garden_at(v_now);
  return v_now;
end $$;
create or replace function private.ensure_garden()
returns void language plpgsql security invoker set search_path = pg_catalog as $$
begin perform private.begin_garden_operation(); end $$;

-- Later Peony workflow owns negotiation, contributions and earned growth. It
-- calls this after begin_garden_operation(), passing that same instant and both
-- original timestamps for this milestone. This records activity, not progress.
create function private.record_peony_activity(p_flower_id uuid,p_milestone smallint,
  p_member1_posted_at timestamptz,p_member2_posted_at timestamptz,p_now timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_flower public.flowers; v_day date; v_existing public.peony_activity; v_next integer;
begin
  perform private.require_member();
  perform 1 from public.garden where id=1 for update;
  perform private.require_member();
  select * into v_flower from public.flowers where id=p_flower_id and type_key='peony';
  if not found then raise exception using errcode='22023',message='Unknown Peony'; end if;
  select garden_day into v_day from private.garden_clock_at(p_now);
  if p_now is null or p_milestone is null or p_milestone not between 1 and 4
    or p_member1_posted_at is null or p_member2_posted_at is null
    or least(p_member1_posted_at,p_member2_posted_at)<v_flower.planted_at
    or greatest(p_member1_posted_at,p_member2_posted_at)>p_now
    or (select last_settled_day from public.garden where id=1)<>v_day-1 then
    raise exception using errcode='22023',message='Invalid milestone activity';
  end if;
  select * into v_existing from public.peony_activity where flower_id=p_flower_id and milestone=p_milestone;
  if found then
    if v_existing.member1_posted_at=p_member1_posted_at and v_existing.member2_posted_at=p_member2_posted_at then return; end if;
    raise exception using errcode='22023',message='Milestone activity is immutable';
  end if;
  select coalesce(max(milestone),0)+1 into v_next from public.peony_activity where flower_id=p_flower_id;
  if p_milestone<>v_next or v_flower.first_bloom_at is not null then
    raise exception using errcode='22023',message='Milestones must complete in order';
  end if;
  insert into public.peony_activity values(p_flower_id,p_milestone,v_day,p_now,p_member1_posted_at,p_member2_posted_at);
end $$;

create or replace function private.plant_flower(
  p_type_key text, p_shared_wish text, p_selected_spot numeric, p_automatic boolean
)
returns public.flowers
language plpgsql security invoker set search_path = pg_catalog
as $$
declare
  v_member smallint;
  v_type public.flower_catalog;
  v_garden public.garden;
  v_flower public.flowers;
  v_wish text;
  v_spot bigint;
  v_next_spot bigint;
  v_now timestamptz;
  v_day date;
begin
  v_now := private.begin_garden_operation();
  v_member := private.require_member();
  select * into v_garden from public.garden where id = 1;
  select * into v_type from public.flower_catalog where type_key = p_type_key;
  if not found then
    raise exception using errcode = '22023', message = 'Unknown flower type';
  end if;
  if p_type_key = 'cactus' then
    raise exception using errcode = '22023', message = 'Cactus is already part of this garden';
  end if;
  if not exists (select 1 from public.flower_unlocks where type_key = p_type_key) then
    raise exception using errcode = '22023', message = 'Flower is locked';
  end if;
  if p_type_key = 'dandelion' then
    v_wish := regexp_replace(p_shared_wish, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if v_wish is null or char_length(v_wish) not between 1 and 500 then
      raise exception using errcode = '22023', message = 'Dandelion needs a shared wish of 1 to 500 characters';
    end if;
  elsif p_shared_wish is not null then
    raise exception using errcode = '22023', message = 'Only Dandelion accepts a shared wish';
  end if;
  if p_automatic then
    v_spot := v_garden.next_spot;
  else
    -- Numeric input avoids PostgreSQL rounding a fractional numeric to bigint
    -- before validation. Reject nonfinite, fractional and invisible identifiers.
    if p_selected_spot is null or p_selected_spot < 1
        or p_selected_spot > v_garden.spot_capacity
        or p_selected_spot <> trunc(p_selected_spot) then
      raise exception using errcode = '22023', message = 'Invalid planting spot';
    end if;
    v_spot := p_selected_spot::bigint;
  end if;
  if exists (select 1 from public.flowers where spot = v_spot) then
    raise exception using errcode = '22023', message = 'Planting spot is occupied';
  end if;
  if (select count(*) from public.flowers where type_key = p_type_key and first_bloom_at is null) >= v_type.unfinished_limit then
    raise exception using errcode = '22023', message = 'Unfinished flower limit reached';
  end if;
  select garden_day into v_day from private.garden_clock_at(v_now);
  insert into public.flowers(type_key, spot, planted_at, planted_day, planted_by, shared_wish)
    values (p_type_key, v_spot, v_now, v_day, v_member, v_wish) returning * into v_flower;

  -- The initial Cactus permanently occupies spot 1. Every lowest empty spot is
  -- therefore immediately after an occupied one; no huge range is generated.
  select min(f.spot + 1) into v_next_spot from public.flowers f
    where not exists (select 1 from public.flowers occupied where occupied.spot = f.spot + 1);
  update public.garden set next_spot = v_next_spot,
    spot_capacity = case when v_next_spot > spot_capacity then spot_capacity + 12 else spot_capacity end
    where id = 1;
  return v_flower;
end;
$$;

create or replace function public.get_daily_daisy_question()
returns public.daisy_assignments
language plpgsql security definer set search_path = pg_catalog
as $$
declare v_now timestamptz; v_day date;
begin
  perform private.require_member();
  v_now := private.begin_garden_operation();
  select garden_day into v_day from private.garden_clock_at(v_now);
  return private.assign_daisy_question(v_day,v_now);
end;
$$;

create or replace function public.submit_flower_entry(p_flower_id uuid, p_payload jsonb)
returns public.flower_entries
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor smallint := private.require_member(); v_flower public.flowers;
  v_now timestamptz; v_clock record; v_payload jsonb; v_entry public.flower_entries;
begin
  v_now := private.begin_garden_operation();
  v_actor := private.require_member();
  select * into v_clock from private.garden_clock_at(v_now);
  select * into v_flower from public.flowers where id = p_flower_id and garden_id = 1;
  if not found then raise exception using errcode = '22023', message = 'Unknown flower'; end if;
  if v_flower.first_bloom_at is not null and v_flower.type_key <> 'cactus' then
    raise exception using errcode = '22023', message = 'This flower has already bloomed';
  end if;
  if v_flower.type_key = 'moonflower' and not v_clock.moonflower_open then
    raise exception using errcode = '22023', message = 'Moonflower opens from 10 p.m. to 4 a.m.';
  end if;
  if exists (select 1 from public.flower_entries where flower_id = p_flower_id and garden_day = v_clock.garden_day and author_id = v_actor) then
    raise exception using errcode = '22023', message = 'Already submitted; edit the original entry';
  end if;
  if v_flower.type_key = 'daisy' then perform private.assign_daisy_question(v_clock.garden_day,v_now); end if;
  v_payload := private.validate_entry_payload(v_flower.type_key,p_payload,v_clock.garden_day);
  insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload,daisy_assignment_day)
    values (p_flower_id,v_actor,v_clock.garden_day,v_now,v_now,v_payload,
      case when v_flower.type_key = 'daisy' then v_clock.garden_day end) returning * into v_entry;
  return v_entry;
end;
$$;

create or replace function public.edit_flower_entry(p_entry_id bigint, p_payload jsonb)
returns public.flower_entries
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor smallint := private.require_member(); v_now timestamptz; v_day date;
  v_entry public.flower_entries; v_type text; v_payload jsonb;
begin
  v_now := private.begin_garden_operation();
  v_actor := private.require_member();
  select garden_day into v_day from private.garden_clock_at(v_now);
  select * into v_entry from public.flower_entries where id = p_entry_id;
  if not found or v_entry.author_id <> v_actor then
    raise exception using errcode = '42501', message = 'Only the author can edit this entry';
  end if;
  if v_entry.garden_day <> v_day or v_now < v_entry.original_posted_at or v_now > v_entry.original_posted_at + interval '30 minutes' then
    raise exception using errcode = '22023', message = 'The edit window has ended';
  end if;
  select type_key into v_type from public.flowers where id = v_entry.flower_id;
  v_payload := private.validate_entry_payload(v_type,p_payload,v_entry.garden_day);
  update public.flower_entries set payload = v_payload, updated_at = v_now where id = p_entry_id returning * into v_entry;
  return v_entry;
end;
$$;

create function private.entry_state_at(p_flower_id uuid,v_actor smallint,v_now timestamptz)
returns jsonb
language plpgsql security invoker set search_path = pg_catalog
as $$
declare
  v_clock record;
  v_flower public.flowers; v_question public.daisy_assignments; v_entries jsonb;
begin
  select * into v_clock from private.garden_clock_at(v_now);
  select * into v_flower from public.flowers where id = p_flower_id and garden_id = 1;
  if not found then raise exception using errcode = '22023', message = 'Unknown flower'; end if;
  if v_flower.type_key = 'daisy' and v_flower.first_bloom_at is null then v_question := private.assign_daisy_question(v_clock.garden_day,v_now); end if;
  select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object(
    'edit_deadline',least(e.original_posted_at + interval '30 minutes', v_clock.next_rollover_at),
    'edit_deadline_inclusive',e.original_posted_at + interval '30 minutes' < v_clock.next_rollover_at,
    'can_edit',e.author_id = v_actor and v_now >= e.original_posted_at and v_now <= e.original_posted_at + interval '30 minutes'
    ) order by e.author_id),'[]'::jsonb) into v_entries
    from public.flower_entries e where e.flower_id = p_flower_id and e.garden_day = v_clock.garden_day;
  return jsonb_build_object('server_now',v_now,'garden_day',v_clock.garden_day,
    'day_starts_at',v_clock.day_starts_at,'next_rollover_at',v_clock.next_rollover_at,
    'moonflower_open',v_clock.moonflower_open,'flower',to_jsonb(v_flower),
    'daisy_question',case when v_question.garden_day is not null then to_jsonb(v_question) else null end,
    'member1_submitted',exists(select 1 from public.flower_entries where flower_id=p_flower_id and garden_day=v_clock.garden_day and author_id=1),
    'member2_submitted',exists(select 1 from public.flower_entries where flower_id=p_flower_id and garden_day=v_clock.garden_day and author_id=2),
    'entries',v_entries);
end;
$$;

create or replace function public.current_entry_state(p_flower_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz;
begin
  v_now := private.begin_garden_operation();
  return private.entry_state_at(p_flower_id,private.require_member(),v_now);
end $$;

create function public.current_garden_state()
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_clock record; v_actor smallint; v_plants jsonb;
begin
  v_now := private.begin_garden_operation();
  v_actor := private.require_member();
  select * into v_clock from private.garden_clock_at(v_now);
  select coalesce(jsonb_agg(private.entry_state_at(id,v_actor,v_now) order by spot),'[]'::jsonb)
    into v_plants from public.flowers;
  return jsonb_build_object('server_now',v_now,'garden_day',v_clock.garden_day,
    'day_starts_at',v_clock.day_starts_at,'next_rollover_at',v_clock.next_rollover_at,
    'moonflower_open',v_clock.moonflower_open,'member_id',v_actor,
    'garden',(select to_jsonb(g) from public.garden g where id=1),
    'catalog',(select jsonb_agg(to_jsonb(c) order by unlock_after_blooms,type_key) from public.flower_catalog c),
    'unlocks',(select jsonb_agg(to_jsonb(u) order by type_key) from public.flower_unlocks u),
    'plants',v_plants);
end $$;
create or replace function public.entry_history(p_flower_id uuid default null, p_limit integer default 50, p_before_id bigint default null)
returns setof public.flower_entries
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform private.begin_garden_operation();
  if p_limit is null or p_limit not between 1 and 100 or (p_before_id is not null and p_before_id < 1) then
    raise exception using errcode = '22023', message = 'Invalid history page';
  end if;
  if p_flower_id is not null and not exists (select 1 from public.flowers where id = p_flower_id and garden_id = 1) then
    raise exception using errcode = '22023', message = 'Unknown flower';
  end if;
  return query select e.* from public.flower_entries e
    where (p_flower_id is null or e.flower_id = p_flower_id) and (p_before_id is null or e.id < p_before_id)
    order by e.id desc limit p_limit;
end;
$$;


revoke all on function private.record_first_bloom_at(uuid,date,timestamptz),
  private.record_first_bloom(uuid,date),private.capture_noon_snapshot(date),private.settle_garden_at(timestamptz),
  private.begin_garden_operation(),private.ensure_garden(),private.plant_flower(text,text,numeric,boolean),
  private.record_peony_activity(uuid,smallint,timestamptz,timestamptz,timestamptz),
  private.entry_state_at(uuid,smallint,timestamptz),public.current_garden_state()
  from public,anon,authenticated,service_role,supabase_auth_admin;
grant execute on function public.current_garden_state() to authenticated;
