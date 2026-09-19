-- Personal presentation state only; no client-supplied garden achievements.
create table private.member_settings (
  member_id smallint primary key references private.garden_members(member_id),
  guide text not null default 'open' check (guide in ('open','skipped','finished')),
  gentle_motion boolean not null default true,
  revision bigint not null default 0 check (revision >= 0)
);
alter table private.member_settings enable row level security;
revoke all on private.member_settings from public, anon, authenticated, service_role, supabase_auth_admin;

create function public.current_member_settings()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor smallint := private.require_member(); v_result jsonb;
begin
  select jsonb_build_object('guide',guide,'gentle_motion',gentle_motion,'revision',revision)
    into v_result from private.member_settings where member_id=v_actor;
  return coalesce(v_result,'{"guide":"open","gentle_motion":true,"revision":0}'::jsonb);
end $$;

create function public.save_member_setting(p_change jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor smallint := private.require_member(); v_count integer;
begin
  if p_change is null or jsonb_typeof(p_change) <> 'object' then
    raise exception 'Invalid setting' using errcode='22023';
  end if;
  select count(*) into v_count from jsonb_object_keys(p_change);
  if v_count <> 1 or not (
    (p_change ? 'guide' and jsonb_typeof(p_change->'guide')='string' and p_change->>'guide' in ('open','skipped','finished'))
    or (p_change ? 'gentle_motion' and jsonb_typeof(p_change->'gentle_motion')='boolean')
  ) then raise exception 'Invalid setting' using errcode='22023'; end if;
  -- Serialize each caller without initializing/settling the shared garden.
  perform pg_advisory_xact_lock(1936028775, v_actor::integer);
  v_actor := private.require_member();
  insert into private.member_settings(member_id) values(v_actor) on conflict do nothing;
  perform 1 from private.member_settings where member_id=v_actor for update;
  v_actor := private.require_member();
  if p_change ? 'guide' then
    update private.member_settings set guide=p_change->>'guide', revision=revision+1
      where member_id=v_actor and guide is distinct from p_change->>'guide';
  else
    update private.member_settings set gentle_motion=(p_change->>'gentle_motion')::boolean, revision=revision+1
      where member_id=v_actor and gentle_motion is distinct from (p_change->>'gentle_motion')::boolean;
  end if;
  return public.current_member_settings();
end $$;
revoke all on function public.current_member_settings(),public.save_member_setting(jsonb) from public,anon,authenticated;
grant execute on function public.current_member_settings(),public.save_member_setting(jsonb) to authenticated;

create or replace function public.current_garden_state()
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
    'plants',v_plants,
    'tutorial_facts',jsonb_build_object(
      'cactus_checked_in',exists(select 1 from public.flower_entries e join public.flowers f on f.id=e.flower_id where e.author_id=v_actor and f.type_key='cactus'),
      'rose_noted',exists(select 1 from public.flower_entries e join public.flowers f on f.id=e.flower_id where e.author_id=v_actor and f.type_key='rose')));
end $$;
