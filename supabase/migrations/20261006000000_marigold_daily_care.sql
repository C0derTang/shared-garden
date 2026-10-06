-- Marigold keeps daily care after bloom (decision 0062, issue #155).
-- A bloomed Marigold accepts one compliment per member per garden day and its
-- paired days are qualifying activity, like the Cactus. Growth never changes
-- after bloom. Everything else, including before-noon snapshots, is unchanged.
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
  if v_flower.first_bloom_at is not null and v_flower.type_key not in ('cactus','hydrangea','marigold') then
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
  perform private.evaluate_achievements(v_now);
  return v_entry;
end;
$$;

create or replace function private.settle_garden_at(p_now timestamptz)
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
        and (f.first_bloom_at is null or f.type_key in ('cactus','marigold')) order by f.spot loop
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
