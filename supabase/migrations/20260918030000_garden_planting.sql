-- One fixed shared garden. Public tables expose only safe application state;
-- writes stay inside guarded transactions, never browser-supplied facts.
create table public.flower_catalog (
  type_key text primary key,
  display_name text not null,
  action_label text not null,
  growth_target smallint not null check (growth_target > 0),
  unfinished_limit smallint not null check (unfinished_limit > 0),
  unlock_after_blooms smallint not null check (unlock_after_blooms >= 0)
);
insert into public.flower_catalog values
 ('rose', 'Rose', 'Note about today', 5, 3, 0),
 ('cactus', 'Cactus', 'One-tap check-in', 10, 1, 0),
 ('tulip', 'Tulip', 'Share a song', 7, 1, 0),
 ('marigold', 'Marigold', 'Compliment or appreciation', 5, 2, 0),
 ('daisy', 'Daisy', 'Answer the shared daily question', 7, 1, 1),
 ('hydrangea', 'Hydrangea', 'Choose a mood color', 7, 1, 2),
 ('sunflower', 'Sunflower', 'Share one photo', 7, 1, 3),
 ('snapdragon', 'Snapdragon', 'Honest check-in', 5, 1, 4),
 ('moonflower', 'Moonflower', 'Late-night thought', 5, 1, 5),
 ('bluebell', 'Bluebell', 'Voice memo', 7, 1, 6),
 ('dandelion', 'Dandelion', 'Add a detail to its shared wish', 5, 3, 7),
 ('forget-me-not', 'Forget-me-not', 'Shared memory', 10, 1, 8),
 ('peony', 'Peony', 'Complete four ordered shared milestones', 4, 1, 9);

create table public.garden (
  id smallint primary key default 1 check (id = 1),
  initialized_at timestamptz not null default statement_timestamp(),
  next_spot bigint not null default 1 check (next_spot > 0)
);
create table public.flowers (
  id uuid primary key default gen_random_uuid(),
  garden_id smallint not null default 1 references public.garden(id) check (garden_id = 1),
  type_key text not null references public.flower_catalog(type_key),
  spot bigint not null unique check (spot > 0),
  planted_at timestamptz not null,
  planted_day date not null,
  planted_by smallint check (planted_by in (1, 2)),
  is_initial boolean not null default false,
  shared_wish text,
  growth_units smallint not null default 0 check (growth_units >= 0),
  first_bloom_at timestamptz,
  first_bloom_day date,
  check ((first_bloom_at is null) = (first_bloom_day is null)),
  check (first_bloom_at is null or first_bloom_at >= planted_at),
  check (first_bloom_day is null or first_bloom_day >= planted_day),
  check ((type_key = 'cactus' and is_initial and planted_by is null)
    or (type_key <> 'cactus' and not is_initial and planted_by is not null)),
  check ((type_key = 'dandelion' and shared_wish is not null
      and char_length(shared_wish) between 1 and 500
      and shared_wish = regexp_replace(shared_wish, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    or (type_key <> 'dandelion' and shared_wish is null))
);
create unique index one_permanent_cactus on public.flowers(garden_id) where type_key = 'cactus';
create index unfinished_flowers_by_type on public.flowers(type_key) where first_bloom_at is null;
create table public.flower_unlocks (
  type_key text primary key references public.flower_catalog(type_key),
  unlocked_at timestamptz not null default statement_timestamp()
);

alter table public.flower_catalog enable row level security;
alter table public.garden enable row level security;
alter table public.flowers enable row level security;
alter table public.flower_unlocks enable row level security;
revoke all on public.flower_catalog, public.garden, public.flowers, public.flower_unlocks
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant select on public.flower_catalog, public.garden, public.flowers, public.flower_unlocks to authenticated;
create policy members_read_catalog on public.flower_catalog for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_garden on public.garden for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_flowers on public.flowers for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_unlocks on public.flower_unlocks for select to authenticated
  using ((select public.is_garden_member()));

-- This row lock is the single ordering point for initialization, planting, and
-- bloom credit. Acquire it before reading capacity or choosing a spot. Upsert
-- waits for another initializer, then the next statement sees committed state.
create function private.ensure_garden()
returns void
language plpgsql security invoker set search_path = pg_catalog
as $$
declare
  v_now timestamptz;
  v_day date;
begin
  perform private.require_member();
  insert into public.garden(id) values (1) on conflict (id) do nothing;
  perform 1 from public.garden where id = 1 for update;
  if not exists (select 1 from public.flowers where type_key = 'cactus') then
    v_now := clock_timestamp();
    select garden_day into v_day from private.garden_clock_at(v_now);
    insert into public.flowers(type_key, spot, planted_at, planted_day, is_initial)
      values ('cactus', 1, v_now, v_day, true);
    update public.garden set next_spot = 2 where id = 1;
  end if;
  insert into public.flower_unlocks(type_key)
    select type_key from public.flower_catalog where unlock_after_blooms = 0
    on conflict (type_key) do nothing;
end;
$$;

create function public.initialize_garden()
returns public.garden
language plpgsql security definer set search_path = pg_catalog
as $$
declare v_garden public.garden;
begin
  perform private.require_member();
  perform private.ensure_garden();
  select * into v_garden from public.garden where id = 1;
  return v_garden;
end;
$$;

create function public.plant_flower(p_type_key text, p_shared_wish text default null)
returns public.flowers
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_member smallint := private.require_member();
  v_type public.flower_catalog;
  v_flower public.flowers;
  v_wish text;
  v_spot bigint;
  v_now timestamptz;
  v_day date;
begin
  select * into v_type from public.flower_catalog where type_key = p_type_key;
  if not found then
    raise exception using errcode = '22023', message = 'Unknown flower type';
  end if;
  if p_type_key = 'cactus' then
    raise exception using errcode = '22023', message = 'Cactus is already part of this garden';
  end if;
  perform private.ensure_garden();
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
  if (select count(*) from public.flowers where type_key = p_type_key and first_bloom_at is null) >= v_type.unfinished_limit then
    raise exception using errcode = '22023', message = 'Unfinished flower limit reached';
  end if;
  -- Capture authoritative time after waiting for the lock, so a rollover while
  -- queued cannot backdate this planting into the preceding garden day.
  v_now := clock_timestamp();
  select garden_day into v_day from private.garden_clock_at(v_now);
  update public.garden set next_spot = next_spot + 1 where id = 1 returning next_spot - 1 into v_spot;
  insert into public.flowers(type_key, spot, planted_at, planted_day, planted_by, shared_wish)
    values (p_type_key, v_spot, v_now, v_day, v_member, v_wish) returning * into v_flower;
  return v_flower;
end;
$$;

-- Trusted future evaluator seam, deliberately absent from the Data API.
-- The evaluator supplies the qualifying garden day (e.g. the just-ended day
-- at rollover). It must establish earned growth before invoking this routine.
-- Current clients have no way to advance growth, credit a bloom or unlock types.
create function private.record_first_bloom(p_flower_id uuid, p_credit_day date)
returns void
language plpgsql security invoker set search_path = pg_catalog
as $$
declare
  v_flower public.flowers;
  v_now timestamptz;
  v_today date;
  v_total bigint;
begin
  perform private.require_member();
  perform 1 from public.garden where id = 1 for update;
  select * into v_flower from public.flowers where id = p_flower_id;
  if not found then
    raise exception using errcode = '22023', message = 'Unknown flower';
  end if;
  v_now := clock_timestamp();
  select garden_day into v_today from private.garden_clock_at(v_now);
  if p_credit_day is null or p_credit_day < v_flower.planted_day or p_credit_day > v_today then
    raise exception using errcode = '22023', message = 'Invalid bloom credit day';
  end if;
  if v_flower.first_bloom_at is not null then
    return;
  end if;
  update public.flowers set first_bloom_at = v_now, first_bloom_day = p_credit_day,
    growth_units = (select growth_target from public.flower_catalog where type_key = v_flower.type_key)
    where id = p_flower_id;
  select count(*) into v_total from public.flowers where first_bloom_at is not null;
  insert into public.flower_unlocks(type_key, unlocked_at)
    select type_key, v_now from public.flower_catalog where unlock_after_blooms <= v_total
    on conflict (type_key) do nothing;
end;
$$;

revoke all on function private.ensure_garden(), public.initialize_garden(),
  public.plant_flower(text,text), private.record_first_bloom(uuid,date)
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant execute on function public.initialize_garden(), public.plant_flower(text,text) to authenticated;
