-- Correct the original automatic-only allocator to support the approved choice
-- of an empty fixed spot. A bed contains twelve stable placement identifiers.
alter table public.garden add column spot_capacity bigint not null default 12
  check (spot_capacity > 0 and spot_capacity % 12 = 0);

-- Earlier plantings are contiguous. Preserve their identifiers and expose the
-- bed containing the next empty spot, including one new bed when already full.
update public.garden set spot_capacity =
  ((coalesce((select max(spot) from public.flowers), 0) / 12) + 1) * 12;
alter table public.garden add constraint garden_next_spot_visible
  check (next_spot <= spot_capacity);

create or replace function private.ensure_garden()
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
  -- A waiting request must still belong to a live member after the shared lock.
  perform private.require_member();
  v_now := clock_timestamp();
  if not exists (select 1 from public.flowers where type_key = 'cactus') then
    select garden_day into v_day from private.garden_clock_at(v_now);
    insert into public.flowers(type_key, spot, planted_at, planted_day, is_initial)
      values ('cactus', 1, v_now, v_day, true);
    update public.garden set next_spot = 2, initialized_at = v_now where id = 1;
  end if;
  insert into public.flower_unlocks(type_key, unlocked_at)
    select type_key, v_now from public.flower_catalog where unlock_after_blooms = 0
    on conflict (type_key) do nothing;
end;
$$;

-- Both public operations use this one guarded transaction. The private boolean
-- distinguishes automatic allocation from an explicitly invalid NULL selection.
create function private.plant_flower(
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
  perform private.ensure_garden();
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
  v_now := clock_timestamp();
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

create or replace function public.plant_flower(p_type_key text, p_shared_wish text default null)
returns public.flowers
language sql security definer set search_path = pg_catalog
as $$ select private.plant_flower(p_type_key, p_shared_wish, null, true); $$;

create function public.plant_flower_at(p_type_key text, p_spot numeric, p_shared_wish text default null)
returns public.flowers
language sql security definer set search_path = pg_catalog
as $$ select private.plant_flower(p_type_key, p_shared_wish, p_spot, false); $$;

-- Preserve explicit table grants/RLS and private helper isolation. No expanded
-- mutation privilege is granted to service API or platform Auth roles.
revoke all on function private.ensure_garden(), private.plant_flower(text,text,numeric,boolean),
  public.plant_flower(text,text), public.plant_flower_at(text,numeric,text)
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant execute on function public.plant_flower(text,text), public.plant_flower_at(text,numeric,text)
  to authenticated;
