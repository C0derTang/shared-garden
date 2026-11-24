-- New-garden backend core (decision 0067, issue #173).
-- Separate v2_ tables and functions in the existing public/private schemas.
-- Legacy tables, functions and behavior are untouched. Identity-level pieces
-- are reused: private.garden_members/require_member, garden_clock_at, the Daisy
-- question bank, flower_catalog (type and growth target only) and the Hydrangea
-- mood catalog. Rules: paired submissions add +1 at rollover, nothing ever
-- decays, all 13 types are plantable from the start with no per-type limits, no
-- initial Cactus, fixed spots in beds of twelve that expand as they fill.
-- Peony workflow, achievements, memories and media are later issues; their
-- extension points are marked "Extension point" below.

-- One fixed new garden. initialized_at/last_settled_day are set by the first
-- guarded operation under the row lock, never by a client.
create table public.v2_garden (
  id smallint primary key default 1 check (id = 1),
  initialized_at timestamptz,
  next_spot bigint not null default 1 check (next_spot > 0),
  spot_capacity bigint not null default 12 check (spot_capacity > 0 and spot_capacity % 12 = 0),
  last_settled_day date,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= current_streak),
  qualifying_days bigint not null default 0 check (qualifying_days >= 0),
  check ((initialized_at is null) = (last_settled_day is null)),
  check (next_spot <= spot_capacity)
);

-- seed: stable random appearance seed fixed at planting. Bounded to the
-- JavaScript safe-integer range so JSON consumers never round it.
create table public.v2_flowers (
  id uuid primary key default gen_random_uuid(),
  garden_id smallint not null default 1 references public.v2_garden(id) check (garden_id = 1),
  type_key text not null references public.flower_catalog(type_key),
  spot bigint not null unique check (spot > 0),
  seed bigint not null check (seed between 0 and 9007199254740991),
  planted_at timestamptz not null,
  planted_day date not null,
  planted_by smallint not null check (planted_by in (1, 2)),
  shared_wish text,
  growth_units smallint not null default 0 check (growth_units >= 0),
  first_bloom_at timestamptz,
  first_bloom_day date,
  fulfilled_at timestamptz,
  fulfilled_by smallint,
  check ((first_bloom_at is null) = (first_bloom_day is null)),
  check (first_bloom_at is null or first_bloom_at >= planted_at),
  check (first_bloom_day is null or first_bloom_day >= planted_day),
  check ((type_key = 'dandelion' and shared_wish is not null
      and char_length(shared_wish) between 1 and 500
      and shared_wish = regexp_replace(shared_wish, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    or (type_key <> 'dandelion' and shared_wish is null)),
  constraint v2_dandelion_fulfillment_valid check (
    (fulfilled_at is null and fulfilled_by is null) or
    (fulfilled_at is not null and fulfilled_by is not null and fulfilled_by in (1,2)
      and type_key = 'dandelion' and first_bloom_at is not null
      and isfinite(fulfilled_at) and fulfilled_at >= first_bloom_at))
);
create index v2_flowers_by_type on public.v2_flowers(type_key);

create table public.v2_daisy_assignments (
  garden_day date primary key,
  ordinal bigint not null unique check (ordinal > 0),
  question_id text not null references private.daisy_questions(question_id),
  category text not null check (category in ('light','deeper')),
  prompt text not null,
  assigned_at timestamptz not null
);

create table public.v2_flower_entries (
  id bigint generated always as identity primary key,
  flower_id uuid not null references public.v2_flowers(id),
  author_id smallint not null check (author_id in (1,2)),
  garden_day date not null,
  original_posted_at timestamptz not null,
  updated_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  daisy_assignment_day date references public.v2_daisy_assignments(garden_day),
  unique (flower_id, garden_day, author_id),
  check (updated_at >= original_posted_at),
  check (daisy_assignment_day is null or daisy_assignment_day = garden_day)
);
create index v2_entries_flower_history on public.v2_flower_entries(flower_id, id desc);
create index v2_entries_rollover_day on public.v2_flower_entries(garden_day, flower_id);

-- Replies are conversation, never daily care or progression inputs.
create table public.v2_entry_replies (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.v2_flower_entries(id),
  author_id smallint not null check (author_id in (1,2)),
  body text not null check (char_length(body) between 1 and 4000 and body ~ '[^[:space:]]'),
  request_id uuid not null,
  created_at timestamptz not null check (isfinite(created_at)),
  unique (author_id, request_id)
);
create index v2_entry_replies_history on public.v2_entry_replies(entry_id, id desc);

-- Settlement ledger, serialized by the v2 singleton lock.
create table public.v2_garden_days (
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
create table public.v2_flower_day_facts (
  flower_id uuid not null references public.v2_flowers(id),
  garden_day date not null references public.v2_garden_days(garden_day) deferrable initially deferred,
  type_key text not null references public.flower_catalog(type_key),
  growth_before smallint not null check (growth_before >= 0),
  growth_after smallint not null check (growth_after >= growth_before),
  paired boolean not null,
  qualifying_activity boolean not null,
  first_bloom boolean not null,
  member1_posted_at timestamptz,
  member2_posted_at timestamptz,
  member1_mood text references public.hydrangea_moods(mood_key),
  member2_mood text references public.hydrangea_moods(mood_key),
  daisy_question_id text,
  primary key (flower_id, garden_day),
  check (paired = (member1_posted_at is not null and member2_posted_at is not null)),
  check (not qualifying_activity or paired)
);
create index v2_flower_day_facts_day on public.v2_flower_day_facts(garden_day);
create table public.v2_before_noon_snapshots (
  garden_day date not null,
  flower_id uuid not null references public.v2_flowers(id),
  member1_posted_at timestamptz,
  member2_posted_at timestamptz,
  completed boolean not null default false,
  primary key (garden_day, flower_id),
  check (not completed or (member1_posted_at is not null and member2_posted_at is not null))
);

alter table public.v2_garden enable row level security;
alter table public.v2_flowers enable row level security;
alter table public.v2_daisy_assignments enable row level security;
alter table public.v2_flower_entries enable row level security;
alter table public.v2_entry_replies enable row level security;
alter table public.v2_garden_days enable row level security;
alter table public.v2_flower_day_facts enable row level security;
alter table public.v2_before_noon_snapshots enable row level security;
revoke all on public.v2_garden, public.v2_flowers, public.v2_daisy_assignments,
  public.v2_flower_entries, public.v2_entry_replies, public.v2_garden_days,
  public.v2_flower_day_facts, public.v2_before_noon_snapshots
  from public, anon, authenticated, service_role, supabase_auth_admin;
revoke all on sequence public.v2_flower_entries_id_seq, public.v2_entry_replies_id_seq
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant select on public.v2_garden, public.v2_flowers, public.v2_daisy_assignments,
  public.v2_flower_entries, public.v2_entry_replies, public.v2_garden_days,
  public.v2_flower_day_facts, public.v2_before_noon_snapshots to authenticated;
create policy members_read_v2_garden on public.v2_garden for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_v2_flowers on public.v2_flowers for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_v2_daisy_assignments on public.v2_daisy_assignments for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_v2_entries on public.v2_flower_entries for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_v2_replies on public.v2_entry_replies for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_v2_days on public.v2_garden_days for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_v2_day_facts on public.v2_flower_day_facts for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_v2_noon on public.v2_before_noon_snapshots for select to authenticated
  using ((select public.is_garden_member()));

-- Caller holds v2 garden row 1 and supplies its post-lock authoritative clock.
-- The new garden starts its own ordinal cycle through the shared question bank.
create function private.v2_assign_daisy_question(p_day date, p_now timestamptz)
returns public.v2_daisy_assignments
language plpgsql security invoker set search_path = pg_catalog
as $$
declare v_assignment public.v2_daisy_assignments; v_ordinal bigint;
begin
  select * into v_assignment from public.v2_daisy_assignments where garden_day = p_day;
  if found then return v_assignment; end if;
  select coalesce(max(ordinal),0) + 1 into v_ordinal from public.v2_daisy_assignments;
  insert into public.v2_daisy_assignments(garden_day, ordinal, question_id, category, prompt, assigned_at)
    select p_day, v_ordinal, question_id, category, prompt, p_now from private.daisy_questions
    where delivery_order = (v_ordinal - 1) % 100 + 1 returning * into v_assignment;
  return v_assignment;
end;
$$;

-- Copy of the latest legacy non-media validator, checking v2 Daisy assignments.
-- Extension point: Sunflower/Bluebell media (#178) and Peony (#177) keep
-- raising "dedicated workflow" here until their issues extend this validator.
create function private.v2_validate_entry_payload(p_type text, p_payload jsonb, p_day date)
returns jsonb
language plpgsql security invoker set search_path = pg_catalog
as $$
declare v_keys text[]; v_expected text[]; v_field text; v_value text; v_url text; v_port text; v_result jsonb := p_payload;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 20000 then
    raise exception using errcode = '22023', message = 'Invalid entry content';
  end if;
  case p_type
    when 'cactus' then v_expected := array[]::text[];
    when 'tulip' then v_expected := array['artist','title','url'];
    when 'hydrangea' then v_expected := array['mood'];
    when 'daisy' then v_expected := array['question_id','text'];
    when 'rose','marigold','snapdragon','moonflower','dandelion','forget-me-not' then v_expected := array['text'];
    else raise exception using errcode = '22023', message = 'This flower requires its dedicated workflow';
  end case;
  select coalesce(array_agg(k order by k),array[]::text[]) into v_keys from jsonb_object_keys(p_payload) k;
  -- Hydrangea: mood is required; a second color and a short note are optional.
  if p_type = 'hydrangea' then
    if not (v_keys @> array['mood']) or not (array['mood','mood2','note'] @> v_keys) then
      raise exception using errcode = '22023', message = 'Invalid entry fields';
    end if;
    v_expected := v_keys;
  elsif v_keys <> v_expected then
    raise exception using errcode = '22023', message = 'Invalid entry fields';
  end if;
  foreach v_field in array v_expected loop
    if jsonb_typeof(p_payload -> v_field) <> 'string' then
      raise exception using errcode = '22023', message = 'Entry fields must be strings';
    end if;
    v_value := regexp_replace(p_payload ->> v_field, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if char_length(v_value) < 1 or char_length(v_value) > (case when v_field = 'text' then 4000 when v_field = 'url' then 512 when v_field = 'note' then 140 else 200 end) then
      raise exception using errcode = '22023', message = 'Entry field length is invalid';
    end if;
    v_result := jsonb_set(v_result, array[v_field], to_jsonb(v_value));
  end loop;
  if p_type = 'tulip' then
    v_url := p_payload ->> 'url';
    -- Accept links, never fetch them (same rule as the legacy garden).
    if v_url !~ '^https://([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?[.])+[A-Za-z]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$'
      or char_length(substring(v_url from '^https://([^/:?#]+)')) > 253
      or v_url ~ '[[:space:][:cntrl:]]' or position(chr(92) in v_url) > 0
      or v_url ~* '%(0[0-9a-f]|1[0-9a-f]|7f)'
      or position('%' in regexp_replace(v_url, '%[0-9A-Fa-f]{2}', '', 'g')) > 0 then
      raise exception using errcode = '22023', message = 'Use a valid HTTPS song link without credentials or control characters';
    end if;
    v_port := substring(v_url from '^https://[^/:?#]+:([0-9]+)');
    if v_port is not null and v_port::integer not between 1 and 65535 then
      raise exception using errcode = '22023', message = 'Use a valid HTTPS song link without credentials or control characters';
    end if;
  end if;
  if p_type = 'hydrangea' then
    if not exists (select 1 from public.hydrangea_moods where mood_key = v_result ->> 'mood') then
      raise exception using errcode = '22023', message = 'Unknown mood';
    end if;
    if v_result ->> 'mood' = 'other' then
      if v_result ? 'mood2' then
        raise exception using errcode = '22023', message = 'Other stands alone; choose colors or Other';
      end if;
      if not (v_result ? 'note') then
        raise exception using errcode = '22023', message = 'Say briefly why when choosing Other';
      end if;
    elsif v_result ? 'mood2' then
      if v_result ->> 'mood2' = 'other' or not exists (select 1 from public.hydrangea_moods where mood_key = v_result ->> 'mood2') then
        raise exception using errcode = '22023', message = 'Unknown mood';
      end if;
      if v_result ->> 'mood2' = v_result ->> 'mood' then
        raise exception using errcode = '22023', message = 'Choose two different colors';
      end if;
    end if;
  end if;
  if p_type = 'daisy' and not exists (select 1 from public.v2_daisy_assignments where garden_day = p_day and question_id = v_result ->> 'question_id') then
    raise exception using errcode = '22023', message = 'Answer the assigned daily question';
  end if;
  return v_result;
end;
$$;

-- Extension point: achievements (#177) replace this body. Every v2 operation
-- calls it after settlement and after each mutation, with the operation instant.
create function private.v2_evaluate_achievements(p_now timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
begin
  perform private.require_member();
  if p_now is null or not isfinite(p_now) then raise exception 'Missing achievement time'; end if;
end $$;

-- Trusted bloom seam. The caller proves earned growth (settlement, or later a
-- Peony milestone). No unlocks exist in the new garden.
create function private.v2_record_first_bloom_at(p_flower_id uuid, p_credit_day date, p_now timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_flower public.v2_flowers; v_today date;
begin
  perform private.require_member();
  perform 1 from public.v2_garden where id = 1 for update;
  perform private.require_member();
  select * into v_flower from public.v2_flowers where id = p_flower_id;
  if not found then raise exception using errcode = '22023', message = 'Unknown flower'; end if;
  select garden_day into v_today from private.garden_clock_at(p_now);
  if p_now is null or p_credit_day is null or p_credit_day < v_flower.planted_day or p_credit_day > v_today then
    raise exception using errcode = '22023', message = 'Invalid bloom credit day';
  end if;
  if v_flower.first_bloom_at is not null then return; end if;
  update public.v2_flowers set first_bloom_at = p_now, first_bloom_day = p_credit_day,
    growth_units = (select growth_target from public.flower_catalog where type_key = v_flower.type_key)
    where id = p_flower_id;
end $$;

-- A flower planted during D joins D+1; blooming in D excludes D+1.
create function private.v2_capture_noon_snapshot(p_day date)
returns void language sql security invoker set search_path = pg_catalog as $$
  insert into public.v2_before_noon_snapshots(garden_day, flower_id)
  select p_day, id from public.v2_flowers
  where planted_day < p_day and type_key not in ('moonflower','peony')
    and (first_bloom_day is null or first_bloom_day >= p_day)
  on conflict (garden_day, flower_id) do nothing;
$$;

-- Settles every completed garden day once. Paired days add +1 up to the target
-- and bloom on reaching it; unpaired days change nothing (no decay ever).
-- Bloomed Cacti keep producing qualifying facts; other bloomed flowers do not.
-- Extension point: Peony (#177) adds its milestone activity to v_active.
create function private.v2_settle_garden_at(p_now timestamptz)
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
    v_active := exists (select 1 from public.v2_flower_day_facts where garden_day = v_day and qualifying_activity);
    update public.v2_garden set current_streak = case when v_active then current_streak + 1 else 0 end,
      longest_streak = greatest(longest_streak, case when v_active then current_streak + 1 else 0 end),
      qualifying_days = qualifying_days + case when v_active then 1 else 0 end, last_settled_day = v_day
      where id = 1 returning current_streak into v_streak;
    insert into public.v2_garden_days values (v_day, v_starts, v_ends, p_now, v_active, v_streak, v_eligible, v_noon_complete);
    v_day := v_day + 1;
  end loop;
  perform private.v2_capture_noon_snapshot(v_today);
end $$;

-- Every public v2 domain operation enters here once: membership, the single v2
-- row lock, one post-lock instant, settlement, then achievement evaluation.
-- No user-settable time exists. The garden starts empty (no initial Cactus).
create function private.v2_begin_garden_operation()
returns timestamptz language plpgsql security invoker set search_path = pg_catalog as $$
declare v_now timestamptz; v_day date;
begin
  perform private.require_member();
  insert into public.v2_garden(id) values (1) on conflict (id) do nothing;
  perform 1 from public.v2_garden where id = 1 for update;
  perform private.require_member();
  v_now := clock_timestamp();
  select garden_day into v_day from private.garden_clock_at(v_now);
  update public.v2_garden set initialized_at = v_now, last_settled_day = v_day - 1
    where id = 1 and last_settled_day is null;
  perform private.v2_settle_garden_at(v_now);
  perform private.v2_evaluate_achievements(v_now);
  return v_now;
end $$;

-- Any catalog type, any number, any selected empty visible spot.
create function private.v2_plant_flower(
  p_type_key text, p_shared_wish text, p_selected_spot numeric
)
returns public.v2_flowers
language plpgsql security invoker set search_path = pg_catalog
as $$
declare
  v_member smallint;
  v_garden public.v2_garden;
  v_flower public.v2_flowers;
  v_wish text;
  v_spot bigint;
  v_next_spot bigint;
  v_now timestamptz;
  v_day date;
begin
  v_now := private.v2_begin_garden_operation();
  v_member := private.require_member();
  select * into v_garden from public.v2_garden where id = 1;
  if p_type_key is null or not exists (select 1 from public.flower_catalog where type_key = p_type_key) then
    raise exception using errcode = '22023', message = 'Unknown flower type';
  end if;
  if p_type_key = 'dandelion' then
    v_wish := regexp_replace(p_shared_wish, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if v_wish is null or char_length(v_wish) not between 1 and 500 then
      raise exception using errcode = '22023', message = 'Dandelion needs a shared wish of 1 to 500 characters';
    end if;
  elsif p_shared_wish is not null then
    raise exception using errcode = '22023', message = 'Only Dandelion accepts a shared wish';
  end if;
  -- Numeric input avoids PostgreSQL rounding a fractional numeric to bigint
  -- before validation. Reject nonfinite, fractional and invisible identifiers.
  if p_selected_spot is null or p_selected_spot < 1
      or p_selected_spot > v_garden.spot_capacity
      or p_selected_spot <> trunc(p_selected_spot) then
    raise exception using errcode = '22023', message = 'Invalid planting spot';
  end if;
  v_spot := p_selected_spot::bigint;
  if exists (select 1 from public.v2_flowers where spot = v_spot) then
    raise exception using errcode = '22023', message = 'Planting spot is occupied';
  end if;
  select garden_day into v_day from private.garden_clock_at(v_now);
  insert into public.v2_flowers(type_key, spot, seed, planted_at, planted_day, planted_by, shared_wish)
    values (p_type_key, v_spot,
      -- 52 uniformly random bits from a fresh random UUID's digest.
      ('x' || substr(md5(gen_random_uuid()::text), 1, 13))::bit(52)::bigint,
      v_now, v_day, v_member, v_wish) returning * into v_flower;

  -- The lowest empty spot is 1 or immediately follows an occupied spot, so no
  -- large range is generated. A full bed exposes exactly one more bed.
  select min(c.spot) into v_next_spot from (
      select 1::bigint as spot union all select f.spot + 1 from public.v2_flowers f
    ) c
    where not exists (select 1 from public.v2_flowers occupied where occupied.spot = c.spot);
  update public.v2_garden set next_spot = v_next_spot,
    spot_capacity = case when v_next_spot > spot_capacity then spot_capacity + 12 else spot_capacity end
    where id = 1;
  perform private.v2_evaluate_achievements(v_now);
  return v_flower;
end;
$$;

create function private.v2_entry_state_at(p_flower_id uuid, p_actor smallint, p_now timestamptz)
returns jsonb
language plpgsql security invoker set search_path = pg_catalog
as $$
declare
  v_clock record;
  v_flower public.v2_flowers; v_question public.v2_daisy_assignments; v_entries jsonb;
begin
  select * into v_clock from private.garden_clock_at(p_now);
  select * into v_flower from public.v2_flowers where id = p_flower_id and garden_id = 1;
  if not found then raise exception using errcode = '22023', message = 'Unknown flower'; end if;
  if v_flower.type_key = 'daisy' and v_flower.first_bloom_at is null then
    v_question := private.v2_assign_daisy_question(v_clock.garden_day, p_now);
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object(
    'edit_deadline', least(e.original_posted_at + interval '30 minutes', v_clock.next_rollover_at),
    'edit_deadline_inclusive', e.original_posted_at + interval '30 minutes' < v_clock.next_rollover_at,
    'can_edit', e.author_id = p_actor and p_now >= e.original_posted_at and p_now <= e.original_posted_at + interval '30 minutes'
    ) order by e.author_id), '[]'::jsonb) into v_entries
    from public.v2_flower_entries e where e.flower_id = p_flower_id and e.garden_day = v_clock.garden_day;
  return jsonb_build_object('server_now', p_now, 'garden_day', v_clock.garden_day,
    'day_starts_at', v_clock.day_starts_at, 'next_rollover_at', v_clock.next_rollover_at,
    'moonflower_open', v_clock.moonflower_open, 'flower', to_jsonb(v_flower),
    'daisy_question', case when v_question.garden_day is not null then to_jsonb(v_question) else null end,
    'member1_submitted', exists (select 1 from public.v2_flower_entries where flower_id = p_flower_id and garden_day = v_clock.garden_day and author_id = 1),
    'member2_submitted', exists (select 1 from public.v2_flower_entries where flower_id = p_flower_id and garden_day = v_clock.garden_day and author_id = 2),
    'hydrangea_picks', jsonb_build_array(
      (select e.payload from public.v2_flower_entries e where e.flower_id = p_flower_id and v_flower.type_key = 'hydrangea' and e.author_id = 1 order by e.garden_day desc limit 1),
      (select e.payload from public.v2_flower_entries e where e.flower_id = p_flower_id and v_flower.type_key = 'hydrangea' and e.author_id = 2 order by e.garden_day desc limit 1)),
    'entries', v_entries);
end;
$$;

create function public.v2_current_garden_state()
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_clock record; v_actor smallint; v_plants jsonb;
begin
  v_now := private.v2_begin_garden_operation();
  v_actor := private.require_member();
  select * into v_clock from private.garden_clock_at(v_now);
  select coalesce(jsonb_agg(private.v2_entry_state_at(id, v_actor, v_now) order by spot), '[]'::jsonb)
    into v_plants from public.v2_flowers;
  return jsonb_build_object('server_now', v_now, 'garden_day', v_clock.garden_day,
    'day_starts_at', v_clock.day_starts_at, 'next_rollover_at', v_clock.next_rollover_at,
    'moonflower_open', v_clock.moonflower_open, 'member_id', v_actor,
    'garden', (select to_jsonb(g) from public.v2_garden g where id = 1),
    -- Only type identity and growth target apply; legacy limits/unlocks do not.
    'catalog', (select jsonb_agg(jsonb_build_object('type_key', c.type_key, 'display_name', c.display_name,
        'action_label', c.action_label, 'growth_target', c.growth_target) order by c.unlock_after_blooms, c.type_key)
      from public.flower_catalog c),
    'plants', v_plants);
end $$;

create function public.v2_plant_flower_at(p_type_key text, p_spot numeric, p_shared_wish text default null)
returns public.v2_flowers
language sql security definer set search_path = pg_catalog
as $$ select private.v2_plant_flower(p_type_key, p_shared_wish, p_spot); $$;

-- First submission per member, flower and garden day counts; retries do not
-- overwrite. Bloomed Cactus/Hydrangea keep accepting care (legacy behavior);
-- every other bloomed flower, including Marigold (decision 0064), is complete.
create function public.v2_submit_flower_entry(p_flower_id uuid, p_payload jsonb)
returns public.v2_flower_entries
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor smallint; v_flower public.v2_flowers;
  v_now timestamptz; v_clock record; v_payload jsonb; v_entry public.v2_flower_entries;
begin
  v_now := private.v2_begin_garden_operation();
  v_actor := private.require_member();
  select * into v_clock from private.garden_clock_at(v_now);
  select * into v_flower from public.v2_flowers where id = p_flower_id and garden_id = 1;
  if not found then raise exception using errcode = '22023', message = 'Unknown flower'; end if;
  if v_flower.first_bloom_at is not null and v_flower.type_key not in ('cactus','hydrangea') then
    raise exception using errcode = '22023', message = 'This flower has already bloomed';
  end if;
  if v_flower.type_key = 'moonflower' and not v_clock.moonflower_open then
    raise exception using errcode = '22023', message = 'Moonflower opens from 10 p.m. to 4 a.m.';
  end if;
  if exists (select 1 from public.v2_flower_entries where flower_id = p_flower_id and garden_day = v_clock.garden_day and author_id = v_actor) then
    raise exception using errcode = '22023', message = 'Already submitted; edit the original entry';
  end if;
  if v_flower.type_key = 'daisy' then perform private.v2_assign_daisy_question(v_clock.garden_day, v_now); end if;
  v_payload := private.v2_validate_entry_payload(v_flower.type_key, p_payload, v_clock.garden_day);
  insert into public.v2_flower_entries(flower_id, author_id, garden_day, original_posted_at, updated_at, payload, daisy_assignment_day)
    values (p_flower_id, v_actor, v_clock.garden_day, v_now, v_now, v_payload,
      case when v_flower.type_key = 'daisy' then v_clock.garden_day end) returning * into v_entry;
  perform private.v2_evaluate_achievements(v_now);
  return v_entry;
end;
$$;

-- The author may edit within 30 minutes of the original and before rollover.
create function public.v2_edit_flower_entry(p_entry_id bigint, p_payload jsonb)
returns public.v2_flower_entries
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor smallint; v_now timestamptz; v_day date;
  v_entry public.v2_flower_entries; v_type text; v_payload jsonb;
begin
  v_now := private.v2_begin_garden_operation();
  v_actor := private.require_member();
  select garden_day into v_day from private.garden_clock_at(v_now);
  select * into v_entry from public.v2_flower_entries where id = p_entry_id;
  if not found or v_entry.author_id <> v_actor then
    raise exception using errcode = '42501', message = 'Only the author can edit this entry';
  end if;
  if v_entry.garden_day <> v_day or v_now < v_entry.original_posted_at or v_now > v_entry.original_posted_at + interval '30 minutes' then
    raise exception using errcode = '22023', message = 'The edit window has ended';
  end if;
  select type_key into v_type from public.v2_flowers where id = v_entry.flower_id;
  v_payload := private.v2_validate_entry_payload(v_type, p_payload, v_entry.garden_day);
  update public.v2_flower_entries set payload = v_payload, updated_at = v_now where id = p_entry_id returning * into v_entry;
  return v_entry;
end;
$$;

create function public.v2_fulfill_dandelion(p_flower_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_actor smallint; v_flower public.v2_flowers;
begin
  v_now := private.v2_begin_garden_operation();
  v_actor := private.require_member();
  select * into v_flower from public.v2_flowers
    where id = p_flower_id and garden_id = 1 and type_key = 'dandelion';
  if not found then raise exception using errcode = '22023', message = 'Unknown Dandelion'; end if;
  if v_flower.first_bloom_at is null then
    raise exception using errcode = '22023', message = 'The wish must bloom before fulfillment';
  end if;
  if v_flower.fulfilled_at is null then
    update public.v2_flowers set fulfilled_at = v_now, fulfilled_by = v_actor
      where id = p_flower_id returning * into v_flower;
  end if;
  perform private.v2_evaluate_achievements(v_now);
  return jsonb_build_object('flower_id', v_flower.id, 'fulfilled_at', v_flower.fulfilled_at, 'fulfilled_by', v_flower.fulfilled_by);
end $$;

create function public.v2_entry_history(p_flower_id uuid default null, p_limit integer default 50, p_before_id bigint default null)
returns setof public.v2_flower_entries
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform private.v2_begin_garden_operation();
  if p_limit is null or p_limit not between 1 and 100 or (p_before_id is not null and p_before_id < 1) then
    raise exception using errcode = '22023', message = 'Invalid history page';
  end if;
  if p_flower_id is not null and not exists (select 1 from public.v2_flowers where id = p_flower_id and garden_id = 1) then
    raise exception using errcode = '22023', message = 'Unknown flower';
  end if;
  return query select e.* from public.v2_flower_entries e
    where (p_flower_id is null or e.flower_id = p_flower_id) and (p_before_id is null or e.id < p_before_id)
    order by e.id desc limit p_limit;
end;
$$;

-- Replies serialize on the v2 lock without settling or evaluating the garden;
-- they never change care or progression facts.
create function public.v2_reply_to_entry(p_entry_id bigint, p_body text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_actor smallint; v_author smallint; v_body text; v_reply public.v2_entry_replies;
begin
  perform private.require_member();
  perform 1 from public.v2_garden where id = 1 for update;
  v_actor := private.require_member();
  select e.author_id into v_author from public.v2_flower_entries e
    join public.v2_flowers f on f.id = e.flower_id
    where e.id = p_entry_id and f.garden_id = 1 and f.type_key <> 'peony';
  if not found then raise exception using errcode = '22023', message = 'Unknown entry'; end if;
  if v_author = v_actor then raise exception using errcode = '42501', message = 'Reply to your partner’s entry'; end if;
  v_body := regexp_replace(p_body, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if v_body is null or char_length(v_body) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'Reply must contain 1 to 4000 characters';
  end if;
  if p_request_id is null then raise exception using errcode = '22023', message = 'A reply request ID is required'; end if;
  select * into v_reply from public.v2_entry_replies where author_id = v_actor and request_id = p_request_id;
  if found then
    if v_reply.entry_id <> p_entry_id or v_reply.body <> v_body then
      raise exception using errcode = '22023', message = 'Retry must use the original reply';
    end if;
  else
    insert into public.v2_entry_replies(entry_id, author_id, body, request_id, created_at)
      values (p_entry_id, v_actor, v_body, p_request_id, clock_timestamp()) returning * into v_reply;
  end if;
  return to_jsonb(v_reply) - 'request_id';
end $$;

create function public.v2_entry_reply_history(p_entry_id bigint, p_limit integer default 50, p_before_id bigint default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform private.require_member();
  if p_limit is null or p_limit not between 1 and 50 or p_entry_id is null then
    raise exception using errcode = '22023', message = 'Invalid reply page';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(r) - 'request_id' order by r.id) from (
    select * from public.v2_entry_replies where entry_id = p_entry_id and (p_before_id is null or id < p_before_id)
    order by id desc limit p_limit
  ) r), '[]'::jsonb);
end $$;

-- Explicit function grant surface (decision 0028 pattern).
revoke all on function
  private.v2_assign_daisy_question(date,timestamptz),
  private.v2_validate_entry_payload(text,jsonb,date),
  private.v2_evaluate_achievements(timestamptz),
  private.v2_record_first_bloom_at(uuid,date,timestamptz),
  private.v2_capture_noon_snapshot(date),
  private.v2_settle_garden_at(timestamptz),
  private.v2_begin_garden_operation(),
  private.v2_plant_flower(text,text,numeric),
  private.v2_entry_state_at(uuid,smallint,timestamptz),
  public.v2_current_garden_state(),
  public.v2_plant_flower_at(text,numeric,text),
  public.v2_submit_flower_entry(uuid,jsonb),
  public.v2_edit_flower_entry(bigint,jsonb),
  public.v2_fulfill_dandelion(uuid),
  public.v2_entry_history(uuid,integer,bigint),
  public.v2_reply_to_entry(bigint,text,uuid),
  public.v2_entry_reply_history(bigint,integer,bigint)
from public, anon, authenticated, service_role, supabase_auth_admin;
grant execute on function
  public.v2_current_garden_state(),
  public.v2_plant_flower_at(text,numeric,text),
  public.v2_submit_flower_entry(uuid,jsonb),
  public.v2_edit_flower_entry(bigint,jsonb),
  public.v2_fulfill_dandelion(uuid),
  public.v2_entry_history(uuid,integer,bigint),
  public.v2_reply_to_entry(bigint,text,uuid),
  public.v2_entry_reply_history(bigint,integer,bigint)
to authenticated;

-- Member RLS authorizes each Postgres change; messages only invalidate the
-- client, and v2_current_garden_state stays authoritative. The publication
-- already excludes DELETE and TRUNCATE.
alter publication supabase_realtime
  add table public.v2_flowers, public.v2_flower_entries, public.v2_entry_replies;
