create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Internal primitive only. Callers supply one authoritative instant; future
-- authenticated features must define their own API/access boundary.
create function private.garden_clock_at(p_instant timestamptz)
returns table (
  garden_day date,
  day_starts_at timestamptz,
  next_rollover_at timestamptz,
  moonflower_open boolean
)
language sql
stable
strict
security invoker
set search_path = pg_catalog
as $$
  with local_clock as (
    select pg_catalog.timezone('America/Los_Angeles', p_instant) as local_instant
  ), garden_clock as (
    select (local_instant - interval '4 hours')::date as garden_date,
      local_instant::time as local_time
    from local_clock
  )
  select garden_date,
    pg_catalog.timezone('America/Los_Angeles', garden_date + time '04:00'),
    -- Convert the next local calendar boundary independently: DST garden days
    -- can be 23 or 25 hours, so adding 24 hours to the first instant is wrong.
    pg_catalog.timezone('America/Los_Angeles', (garden_date + 1) + time '04:00'),
    local_time >= time '22:00' or local_time < time '04:00'
  from garden_clock;
$$;

revoke all on function private.garden_clock_at(timestamptz)
  from public, anon, authenticated;
