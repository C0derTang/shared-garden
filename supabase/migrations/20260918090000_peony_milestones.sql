-- Ordered, immediate Peony progress. Existing daily entry APIs stay unchanged.
create table public.peony_contributions (
  id bigint generated always as identity primary key,
  flower_id uuid not null references public.flowers(id),
  milestone smallint not null check (milestone in (1,3,4)),
  author_id smallint not null check (author_id in (1,2)),
  garden_day date not null,
  original_posted_at timestamptz not null,
  updated_at timestamptz not null check (updated_at >= original_posted_at),
  payload jsonb not null,
  unique (flower_id,milestone,author_id)
);
create table public.peony_plans (
  flower_id uuid primary key references public.flowers(id),
  version bigint not null check (version > 0),
  activity text not null check (char_length(activity) between 1 and 2000),
  starts_at timestamptz not null check (isfinite(starts_at)),
  updated_by smallint not null check (updated_by in (1,2)),
  updated_at timestamptz not null,
  unique (flower_id,version)
);
create table public.peony_acceptances (
  flower_id uuid not null,
  plan_version bigint not null,
  author_id smallint not null check (author_id in (1,2)),
  garden_day date not null,
  original_posted_at timestamptz not null,
  primary key (flower_id,author_id),
  foreign key (flower_id,plan_version) references public.peony_plans(flower_id,version)
);
alter table public.peony_contributions enable row level security;
alter table public.peony_plans enable row level security;
alter table public.peony_acceptances enable row level security;
revoke all on public.peony_contributions,public.peony_plans,public.peony_acceptances
  from public,anon,authenticated,service_role,supabase_auth_admin;
revoke all on sequence public.peony_contributions_id_seq
  from public,anon,authenticated,service_role,supabase_auth_admin;
grant select on public.peony_contributions,public.peony_plans,public.peony_acceptances to authenticated;
create policy members_read_peony_contributions on public.peony_contributions for select to authenticated using ((select public.is_garden_member()));
create policy members_read_peony_plans on public.peony_plans for select to authenticated using ((select public.is_garden_member()));
create policy members_read_peony_acceptances on public.peony_acceptances for select to authenticated using ((select public.is_garden_member()));

create function private.require_peony_milestone(p_flower_id uuid,p_milestone integer)
returns public.flowers language plpgsql security invoker set search_path = pg_catalog as $$
declare v_flower public.flowers;
begin
  select * into v_flower from public.flowers where id=p_flower_id and type_key='peony' and garden_id=1;
  if not found then raise exception using errcode='22023',message='Unknown Peony'; end if;
  if p_milestone is null or p_milestone not between 1 and 4 or v_flower.first_bloom_at is not null
    or v_flower.growth_units<>p_milestone-1 then
    raise exception using errcode='22023',message='Milestones must complete in order';
  end if;
  return v_flower;
end $$;

create function private.validate_peony_payload(p_milestone integer,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare v_text text;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>20000 then
    raise exception using errcode='22023',message='Invalid Peony content';
  end if;
  if p_milestone=3 then
    if p_payload<>'{}'::jsonb then raise exception using errcode='22023',message='Confirmation takes no content'; end if;
    return p_payload;
  end if;
  if p_milestone is null or p_milestone not in (1,4) then
    raise exception using errcode='22023',message='Use the shared plan workflow';
  end if;
  if (select count(*) from jsonb_object_keys(p_payload))<>1 or not (p_payload ? 'text')
    or jsonb_typeof(p_payload->'text')<>'string' then
    raise exception using errcode='22023',message='Peony requires a text field';
  end if;
  v_text := regexp_replace(p_payload->>'text','^[[:space:]]+|[[:space:]]+$','','g');
  if char_length(v_text) not between 1 and 4000 then
    raise exception using errcode='22023',message='Peony text must contain 1 to 4000 characters';
  end if;
  return jsonb_build_object('text',v_text);
end $$;

-- Called only after the public operation owns the garden lock and has inserted
-- this milestone's contribution/acceptance. Original times are never replaced.
create function private.complete_peony_milestone(p_flower_id uuid,p_milestone integer,p_now timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_one timestamptz; v_two timestamptz; v_day date;
begin
  perform private.require_peony_milestone(p_flower_id,p_milestone);
  if p_milestone=2 then
    select min(original_posted_at) filter(where author_id=1),min(original_posted_at) filter(where author_id=2)
      into v_one,v_two from public.peony_acceptances where flower_id=p_flower_id;
  else
    select min(original_posted_at) filter(where author_id=1),min(original_posted_at) filter(where author_id=2)
      into v_one,v_two from public.peony_contributions where flower_id=p_flower_id and milestone=p_milestone;
  end if;
  if v_one is null or v_two is null then return; end if;
  perform private.record_peony_activity(p_flower_id,p_milestone::smallint,v_one,v_two,p_now);
  update public.flowers set growth_units=p_milestone where id=p_flower_id;
  if p_milestone=4 then
    select garden_day into v_day from private.garden_clock_at(p_now);
    perform private.record_first_bloom_at(p_flower_id,v_day,p_now);
  end if;
end $$;

create function private.peony_state_at(p_flower_id uuid,p_actor smallint,p_now timestamptz)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare v_flower public.flowers; v_clock record; v_contributions jsonb; v_plan jsonb;
begin
  select * into v_flower from public.flowers where id=p_flower_id and type_key='peony' and garden_id=1;
  if not found then raise exception using errcode='22023',message='Unknown Peony'; end if;
  select * into v_clock from private.garden_clock_at(p_now);
  select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object(
    'edit_deadline',least(c.original_posted_at+interval '30 minutes',timezone('America/Los_Angeles',(c.garden_day+1)+time '04:00')),
    'edit_deadline_inclusive',c.original_posted_at+interval '30 minutes'<timezone('America/Los_Angeles',(c.garden_day+1)+time '04:00'),
    'can_edit',c.author_id=p_actor and c.milestone in (1,4) and c.milestone=v_flower.growth_units+1
      and c.garden_day=v_clock.garden_day and p_now between c.original_posted_at and c.original_posted_at+interval '30 minutes'
    ) order by c.milestone,c.author_id),'[]'::jsonb) into v_contributions
    from public.peony_contributions c where c.flower_id=p_flower_id;
  select to_jsonb(p)||jsonb_build_object(
    'display_timezone','America/Los_Angeles',
    'can_edit',v_flower.growth_units=1,
    'can_accept',v_flower.growth_units=1 and not exists(select 1 from public.peony_acceptances a where a.flower_id=p_flower_id and a.author_id=p_actor),
    'acceptances',(select coalesce(jsonb_agg(to_jsonb(a) order by a.author_id),'[]'::jsonb) from public.peony_acceptances a where a.flower_id=p_flower_id)
    ) into v_plan from public.peony_plans p where p.flower_id=p_flower_id;
  return jsonb_build_object('server_now',p_now,'garden_day',v_clock.garden_day,
    'day_starts_at',v_clock.day_starts_at,'next_rollover_at',v_clock.next_rollover_at,
    'member_id',p_actor,'flower',to_jsonb(v_flower),'stage',v_flower.growth_units,
    'next_milestone',case when v_flower.growth_units<4 then v_flower.growth_units+1 else null end,
    'contributions',v_contributions,'plan',v_plan,
    'completed_milestones',(select coalesce(jsonb_agg(to_jsonb(a) order by a.milestone),'[]'::jsonb) from public.peony_activity a where a.flower_id=p_flower_id));
end $$;

create function public.current_peony_state(p_flower_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz;
begin
  v_now := private.begin_garden_operation();
  return private.peony_state_at(p_flower_id,private.require_member(),v_now);
end $$;

create function public.submit_peony_contribution(p_flower_id uuid,p_milestone integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_actor smallint; v_day date; v_payload jsonb;
begin
  v_now := private.begin_garden_operation();
  v_actor := private.require_member();
  perform private.require_peony_milestone(p_flower_id,p_milestone);
  v_payload := private.validate_peony_payload(p_milestone,p_payload);
  if exists(select 1 from public.peony_contributions where flower_id=p_flower_id and milestone=p_milestone and author_id=v_actor) then
    raise exception using errcode='22023',message='Already contributed to this milestone';
  end if;
  select garden_day into v_day from private.garden_clock_at(v_now);
  insert into public.peony_contributions(flower_id,milestone,author_id,garden_day,original_posted_at,updated_at,payload)
    values(p_flower_id,p_milestone,v_actor,v_day,v_now,v_now,v_payload);
  perform private.complete_peony_milestone(p_flower_id,p_milestone,v_now);
  return private.peony_state_at(p_flower_id,v_actor,v_now);
end $$;

create function public.edit_peony_contribution(p_contribution_id bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_actor smallint; v_day date; v_entry public.peony_contributions; v_payload jsonb;
begin
  v_now := private.begin_garden_operation();
  v_actor := private.require_member();
  select * into v_entry from public.peony_contributions where id=p_contribution_id;
  if not found or v_entry.author_id<>v_actor then
    raise exception using errcode='42501',message='Only the author can edit this contribution';
  end if;
  perform private.require_peony_milestone(v_entry.flower_id,v_entry.milestone);
  if v_entry.milestone not in (1,4) then
    raise exception using errcode='22023',message='Confirmation cannot be edited';
  end if;
  select garden_day into v_day from private.garden_clock_at(v_now);
  if v_entry.garden_day<>v_day or v_now<v_entry.original_posted_at or v_now>v_entry.original_posted_at+interval '30 minutes' then
    raise exception using errcode='22023',message='The edit window has ended';
  end if;
  v_payload := private.validate_peony_payload(v_entry.milestone,p_payload);
  update public.peony_contributions set payload=v_payload,updated_at=v_now where id=p_contribution_id;
  return private.peony_state_at(v_entry.flower_id,v_actor,v_now);
end $$;

create function public.set_peony_plan(p_flower_id uuid,p_expected_version bigint,p_activity text,p_starts_at text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_actor smallint; v_plan public.peony_plans; v_activity text; v_starts timestamptz; v_version bigint;
begin
  v_now := private.begin_garden_operation();
  v_actor := private.require_member();
  perform private.require_peony_milestone(p_flower_id,2);
  select * into v_plan from public.peony_plans where flower_id=p_flower_id;
  v_version := coalesce(v_plan.version,0);
  if p_expected_version is null or p_expected_version<>v_version then
    raise exception using errcode='22023',message='The shared plan has changed; refresh first';
  end if;
  v_activity := regexp_replace(p_activity,'^[[:space:]]+|[[:space:]]+$','','g');
  if v_activity is null or char_length(v_activity) not between 1 and 2000 or octet_length(v_activity)>8000 then
    raise exception using errcode='22023',message='Plan activity must contain 1 to 2000 characters';
  end if;
  -- A text parameter permits explicit-offset validation before PostgreSQL's
  -- session timezone can interpret an ambiguous local timestamp.
  if p_starts_at is null or length(p_starts_at)>32 or p_starts_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception using errcode='22023',message='Plan time requires an ISO timestamp with an explicit offset';
  end if;
  begin v_starts := p_starts_at::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode='22023',message='Invalid plan date and time';
  end;
  if v_plan.activity=v_activity and v_plan.starts_at=v_starts then
    return private.peony_state_at(p_flower_id,v_actor,v_now);
  end if;
  delete from public.peony_acceptances where flower_id=p_flower_id;
  insert into public.peony_plans(flower_id,version,activity,starts_at,updated_by,updated_at)
    values(p_flower_id,v_version+1,v_activity,v_starts,v_actor,v_now)
    on conflict(flower_id) do update set version=excluded.version,activity=excluded.activity,
      starts_at=excluded.starts_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  return private.peony_state_at(p_flower_id,v_actor,v_now);
end $$;

create function public.accept_peony_plan(p_flower_id uuid,p_plan_version bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_actor smallint; v_day date; v_version bigint;
begin
  v_now := private.begin_garden_operation();
  v_actor := private.require_member();
  perform private.require_peony_milestone(p_flower_id,2);
  select version into v_version from public.peony_plans where flower_id=p_flower_id;
  if v_version is null or p_plan_version is null or v_version<>p_plan_version then
    raise exception using errcode='22023',message='The shared plan has changed; refresh first';
  end if;
  if exists(select 1 from public.peony_acceptances where flower_id=p_flower_id and author_id=v_actor) then
    raise exception using errcode='22023',message='Already accepted this plan';
  end if;
  select garden_day into v_day from private.garden_clock_at(v_now);
  insert into public.peony_acceptances values(p_flower_id,v_version,v_actor,v_day,v_now);
  perform private.complete_peony_milestone(p_flower_id,2,v_now);
  return private.peony_state_at(p_flower_id,v_actor,v_now);
end $$;

revoke all on function private.require_peony_milestone(uuid,integer),private.validate_peony_payload(integer,jsonb),
  private.complete_peony_milestone(uuid,integer,timestamptz),private.peony_state_at(uuid,smallint,timestamptz),
  public.current_peony_state(uuid),public.submit_peony_contribution(uuid,integer,jsonb),
  public.edit_peony_contribution(bigint,jsonb),public.set_peony_plan(uuid,bigint,text,text),public.accept_peony_plan(uuid,bigint)
  from public,anon,authenticated,service_role,supabase_auth_admin;
grant execute on function public.current_peony_state(uuid),public.submit_peony_contribution(uuid,integer,jsonb),
  public.edit_peony_contribution(bigint,jsonb),public.set_peony_plan(uuid,bigint,text,text),public.accept_peony_plan(uuid,bigint) to authenticated;
