-- Freeze the legacy garden as a read-only archive (decision 0067, issue #176).
-- A private singleton marker freezes existing and fresh databases alike. While
-- it exists, reads no longer create, unlock, settle, decay or evaluate anything,
-- and every legacy write refuses with SQLSTATE 55000 and one clear message.
-- Member settings and the private interaction stay writable. Function bodies
-- below are the current definitions verbatim plus the marked guard lines.
-- Pending settlement at freeze time stays unsettled: nothing changes afterwards.

create table private.legacy_garden_freeze (
  id smallint primary key default 1 check (id = 1),
  frozen_at timestamptz not null default statement_timestamp()
);
alter table private.legacy_garden_freeze enable row level security;
revoke all on private.legacy_garden_freeze from public, anon, authenticated, service_role, supabase_auth_admin;
insert into private.legacy_garden_freeze default values;

create function private.legacy_garden_frozen()
returns boolean language sql stable security invoker set search_path = pg_catalog as $$
  select exists(select 1 from private.legacy_garden_freeze);
$$;

create function private.require_legacy_writable()
returns void language plpgsql stable security invoker set search_path = pg_catalog as $$
begin
  if private.legacy_garden_frozen() then
    raise exception using errcode = '55000', message = 'The legacy garden is archived and read-only';
  end if;
end $$;

revoke all on function private.legacy_garden_frozen(), private.require_legacy_writable()
  from public, anon, authenticated, service_role, supabase_auth_admin;

-- Every domain operation enters here; archived, it only authorizes.
create or replace function private.begin_garden_operation()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare v_now timestamptz; v_day date;
begin
  perform private.require_member();
  if private.legacy_garden_frozen() then
    -- Archived: keep the membership/revocation serialization, but create,
    -- unlock, settle and evaluate nothing. Reads see the frozen state.
    perform 1 from public.garden where id=1 for update;
    perform private.require_member();
    return clock_timestamp();
  end if;
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
  perform private.evaluate_achievements(v_now);
  return v_now;
end $function$;

-- No settlement, rollover, decay or achievement evaluation while archived.
create or replace function private.settle_garden_at(p_now timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_today date; v_day date; v_starts timestamptz; v_ends timestamptz; v_noon timestamptz;
  v_flower record; v_one public.flower_entries; v_two public.flower_entries;
  v_paired boolean; v_after smallint; v_bloom boolean; v_active boolean;
  v_streak integer; v_eligible integer; v_noon_complete boolean;
begin
  perform private.require_member();
  if private.legacy_garden_frozen() then return; end if;
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
end $function$;

create or replace function private.evaluate_achievements(p_now timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
 perform private.require_member();
 if private.legacy_garden_frozen() then return; end if;
 perform 1 from public.garden where id=1 for update;
 perform private.require_member();
 if p_now is null or not isfinite(p_now) then raise exception 'Missing achievement time'; end if;
 with flower_counts as (
  select count(*) filter(where not is_initial) seeds,
   count(*) filter(where first_bloom_at is not null) blooms,
   count(distinct type_key) planted_types,
   count(distinct type_key) filter(where first_bloom_at is not null) bloomed_types,
   count(*) filter(where type_key='rose' and first_bloom_at is not null) roses,
   count(*) filter(where type_key='marigold' and first_bloom_at is not null) marigolds,
   count(*) filter(where type_key='tulip' and first_bloom_at is not null) tulips,
   count(*) filter(where type_key='forget-me-not' and first_bloom_at is not null) forget_me_nots,
   count(*) filter(where type_key='dandelion') wishes,
   count(*) filter(where type_key='moonflower' and first_bloom_at is not null) moonflowers,
   count(*) filter(where type_key='snapdragon' and first_bloom_at is not null) snapdragons,
   count(*) filter(where type_key='bluebell' and first_bloom_at is not null) bluebells,
   count(*) filter(where type_key='peony' and first_bloom_at is not null) peonies,
   count(*) filter(where type_key='dandelion' and fulfilled_at is not null) fulfilled
  from public.flowers
 ), pairs as (
  select a.flower_id,a.garden_day,a.original_posted_at one_at,b.original_posted_at two_at
  from public.flower_entries a join public.flower_entries b
   on a.flower_id=b.flower_id and a.garden_day=b.garden_day and b.author_id=2
  join public.flowers f on f.id=a.flower_id
  where a.author_id=1 and (f.type_key<>'hydrangea' or f.first_bloom_day is null or a.garden_day<=f.first_bloom_day)
 ), questions as (
  select daisy_question_id question_id from public.flower_day_facts where type_key='daisy' and paired
  union
  select a.question_id from pairs p join public.flowers f on f.id=p.flower_id and f.type_key='daisy'
   join public.daisy_assignments a on a.garden_day=p.garden_day
 ), evidence as (
  select f.*,
   (select longest_streak from public.garden where id=1) streak,
   (select count(distinct question_id) from questions) questions,
   (select count(distinct d.garden_day) from public.flower_day_facts d
     left join public.flower_entries x on x.flower_id=d.flower_id and x.garden_day=d.garden_day and x.author_id=1
     left join public.flower_entries y on y.flower_id=d.flower_id and y.garden_day=d.garden_day and y.author_id=2
     where d.type_key='hydrangea' and d.paired and d.member1_mood<>'other'
      and ((d.member1_mood=d.member2_mood and (x.payload->>'mood2') is not distinct from (y.payload->>'mood2'))
        or (d.member1_mood=(y.payload->>'mood2') and (x.payload->>'mood2')=d.member2_mood))) moods,
   exists(select 1 from public.flowers b join public.flower_day_facts x on x.flower_id=b.id
    where x.growth_before>0 and x.growth_after<x.growth_before and x.garden_day<b.first_bloom_day) recovery,
   exists(select 1 from public.garden_days where before_noon_complete and before_noon_eligible_count>0) noon,
   (exists(select 1 from pairs where abs(extract(epoch from (two_at-one_at)))<=600)
    or exists(select 1 from public.flower_day_facts where paired and abs(extract(epoch from(member2_posted_at-member1_posted_at)))<=600)
    or exists(select 1 from public.peony_activity p where abs(extract(epoch from(p.member2_posted_at-p.member1_posted_at)))<=600
     and (select garden_day from private.garden_clock_at(p.member1_posted_at))=(select garden_day from private.garden_clock_at(p.member2_posted_at)))) timing
  from flower_counts f
 ), metrics as (
  select v.* from evidence e cross join lateral (values
   ('first-seed',e.seeds),('first-bloom',e.blooms),('all-planted',e.planted_types),('all-bloomed',e.bloomed_types),
   ('streak-3',e.streak),('streak-7',e.streak),('streak-14',e.streak),('streak-21',e.streak),
   ('recovery',e.recovery::integer),('roses-5',e.roses),('marigolds-10',e.marigolds),('tulips-3',e.tulips),
   ('daisy-20',e.questions),('forget-me-nots-3',e.forget_me_nots),('wishes-5',e.wishes),
   ('ten-minutes',e.timing::integer),('before-noon',e.noon::integer),('moonflower',e.moonflowers),
   ('snapdragon',e.snapdragons),('bluebell',e.bluebells),('mood-match-3',e.moods),('peony',e.peonies),
   ('first-wish-blown',e.fulfilled),('coexisting-5',e.blooms),('blooms-10',e.blooms),('blooms-20',e.blooms)
  ) v(achievement_id,amount)
 )
 insert into public.achievement_progress as p
 select c.achievement_id,least(c.target,coalesce(m.amount,0))::integer
 from public.achievement_catalog c join metrics m using(achievement_id)
 on conflict(achievement_id) do update set progress=excluded.progress
 where p.progress is distinct from excluded.progress;
 insert into public.achievement_awards(achievement_id,earned_at)
 select c.achievement_id,p_now from public.achievement_catalog c join public.achievement_progress p using(achievement_id)
 where p.progress>=c.target on conflict(achievement_id) do nothing;
end $function$;

-- Reads never assign a Daisy question while archived.
create or replace function private.assign_daisy_question(p_day date, p_now timestamp with time zone)
 RETURNS public.daisy_assignments
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare v_assignment public.daisy_assignments; v_ordinal bigint;
begin
  select * into v_assignment from public.daisy_assignments where garden_day = p_day;
  if found then return v_assignment; end if;
  -- Archived: never assign a new question; today's lookup stays empty.
  if private.legacy_garden_frozen() then return null; end if;
  select coalesce(max(ordinal),0) + 1 into v_ordinal from public.daisy_assignments;
  insert into public.daisy_assignments(garden_day, ordinal, question_id, category, prompt, assigned_at)
    select p_day, v_ordinal, question_id, category, prompt, p_now from private.daisy_questions
    where delivery_order = (v_ordinal - 1) % 100 + 1 returning * into v_assignment;
  return v_assignment;
end;
$function$;

-- An archive that was never initialized still reads as an empty garden.
create or replace function public.current_garden_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
    'garden',coalesce((select to_jsonb(g) from public.garden g where id=1),
      jsonb_build_object('id',1,'initialized_at',null,'next_spot',1,'spot_capacity',12,'last_settled_day',null,
        'current_streak',0,'longest_streak',0,'qualifying_days',0)),
    'catalog',(select jsonb_agg(to_jsonb(c) order by unlock_after_blooms,type_key) from public.flower_catalog c),
    'unlocks',coalesce((select jsonb_agg(to_jsonb(u) order by type_key) from public.flower_unlocks u),'[]'::jsonb),
    'plants',v_plants,
    'tutorial_facts',jsonb_build_object(
      'cactus_checked_in',exists(select 1 from public.flower_entries e join public.flowers f on f.id=e.flower_id where e.author_id=v_actor and f.type_key='cactus'),
      'rose_noted',exists(select 1 from public.flower_entries e join public.flowers f on f.id=e.flower_id where e.author_id=v_actor and f.type_key='rose')));
end $function$;

create or replace function public.current_achievements()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_now timestamptz;
begin
 v_now:=private.begin_garden_operation();
 return jsonb_build_object('server_now',v_now,'current_streak',coalesce((select current_streak from public.garden where id=1),0),
  'achievements',(select jsonb_agg(to_jsonb(c)||jsonb_build_object('progress',coalesce(p.progress,0),'earned_at',a.earned_at) order by c.position)
   from public.achievement_catalog c left join public.achievement_progress p using(achievement_id)
    left join public.achievement_awards a using(achievement_id)));
end $function$;

-- Every legacy write RPC refuses up front, after the membership check.
create or replace function public.plant_flower(p_type_key text, p_shared_wish text DEFAULT NULL::text)
 RETURNS public.flowers
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select private.require_member();
  select private.require_legacy_writable();
  select private.plant_flower(p_type_key, p_shared_wish, null, true); $function$;

create or replace function public.plant_flower_at(p_type_key text, p_spot numeric, p_shared_wish text DEFAULT NULL::text)
 RETURNS public.flowers
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select private.require_member();
  select private.require_legacy_writable();
  select private.plant_flower(p_type_key, p_shared_wish, p_spot, false); $function$;

create or replace function public.submit_flower_entry(p_flower_id uuid, p_payload jsonb)
 RETURNS public.flower_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor smallint := private.require_member(); v_flower public.flowers;
  v_now timestamptz; v_clock record; v_payload jsonb; v_entry public.flower_entries;
begin
  perform private.require_member();
  perform private.require_legacy_writable();
  v_now := private.begin_garden_operation();
  v_actor := private.require_member();
  select * into v_clock from private.garden_clock_at(v_now);
  select * into v_flower from public.flowers where id = p_flower_id and garden_id = 1;
  if not found then raise exception using errcode = '22023', message = 'Unknown flower'; end if;
  if v_flower.first_bloom_at is not null and v_flower.type_key not in ('cactus','hydrangea') then
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
$function$;

create or replace function public.edit_flower_entry(p_entry_id bigint, p_payload jsonb)
 RETURNS public.flower_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor smallint := private.require_member(); v_now timestamptz; v_day date;
  v_entry public.flower_entries; v_type text; v_payload jsonb;
begin
  perform private.require_member();
  perform private.require_legacy_writable();
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
$function$;

create or replace function public.fulfill_dandelion(p_flower_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_now timestamptz; v_actor smallint; v_flower public.flowers;
begin
  perform private.require_member();
  perform private.require_legacy_writable();
  -- Serializes with settlement/planting/care and rechecks membership after lock.
  v_now := private.begin_garden_operation();
  v_actor := private.require_member();
  select * into v_flower from public.flowers
    where id=p_flower_id and garden_id=1 and type_key='dandelion';
  if not found then raise exception using errcode='22023',message='Unknown Dandelion'; end if;
  if v_flower.first_bloom_at is null then
    raise exception using errcode='22023',message='The wish must bloom before fulfillment';
  end if;
  if v_flower.fulfilled_at is null then
    update public.flowers set fulfilled_at=v_now,fulfilled_by=v_actor
      where id=p_flower_id returning * into v_flower;
  end if;
  perform private.evaluate_achievements(v_now);
  return jsonb_build_object('flower_id',v_flower.id,'fulfilled_at',v_flower.fulfilled_at,'fulfilled_by',v_flower.fulfilled_by);
end $function$;

create or replace function public.reply_to_entry(p_entry_id bigint, p_body text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_actor smallint; v_author smallint; v_body text; v_reply public.entry_replies;
begin
  perform private.require_member();
  perform private.require_legacy_writable();
  perform private.require_member();
  -- Serialize request IDs and parent validation without settling or evaluating
  -- the garden. Replies must not change any care/progression facts.
  perform 1 from public.garden where id=1 for update;
  v_actor := private.require_member();
  select e.author_id into v_author from public.flower_entries e
    join public.flowers f on f.id=e.flower_id
    where e.id=p_entry_id and f.garden_id=1 and f.type_key <> 'peony';
  if not found then raise exception using errcode='22023',message='Unknown entry'; end if;
  if v_author=v_actor then raise exception using errcode='42501',message='Reply to your partner’s entry'; end if;
  v_body := regexp_replace(p_body,'^[[:space:]]+|[[:space:]]+$','','g');
  if v_body is null or char_length(v_body) not between 1 and 4000 then
    raise exception using errcode='22023',message='Reply must contain 1 to 4000 characters';
  end if;
  if p_request_id is null then raise exception using errcode='22023',message='A reply request ID is required'; end if;
  select * into v_reply from public.entry_replies where author_id=v_actor and request_id=p_request_id;
  if found then
    if v_reply.entry_id<>p_entry_id or v_reply.body<>v_body then
      raise exception using errcode='22023',message='Retry must use the original reply';
    end if;
  else
    insert into public.entry_replies(entry_id,author_id,body,request_id,created_at)
      values(p_entry_id,v_actor,v_body,p_request_id,clock_timestamp()) returning * into v_reply;
  end if;
  return to_jsonb(v_reply)-'request_id';
end $function$;

create or replace function public.submit_peony_contribution(p_flower_id uuid, p_milestone integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_now timestamptz; v_actor smallint; v_day date; v_payload jsonb;
begin
  perform private.require_member();
  perform private.require_legacy_writable();
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
end $function$;

create or replace function public.edit_peony_contribution(p_contribution_id bigint, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_now timestamptz; v_actor smallint; v_day date; v_entry public.peony_contributions; v_payload jsonb;
begin
  perform private.require_member();
  perform private.require_legacy_writable();
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
end $function$;

create or replace function public.set_peony_plan(p_flower_id uuid, p_expected_version bigint, p_activity text, p_starts_at text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_now timestamptz; v_actor smallint; v_plan public.peony_plans; v_activity text; v_starts timestamptz; v_version bigint;
begin
  perform private.require_member();
  perform private.require_legacy_writable();
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
end $function$;

create or replace function public.accept_peony_plan(p_flower_id uuid, p_plan_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_now timestamptz; v_actor smallint; v_day date; v_version bigint;
begin
  perform private.require_member();
  perform private.require_legacy_writable();
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
end $function$;

-- No new legacy uploads: intents, claims, storage writes and attestations refuse.
-- Signed reads of existing entry media (media_read_path) are unchanged.
create or replace function public.create_media_upload(p_request_id uuid, p_flower_id uuid, p_mime_type text, p_input_bytes integer, p_replacement_entry_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_now timestamptz; v_day date; v_owner smallint; v private.media_uploads; v_type text;
begin
  perform private.require_member();
  perform private.require_legacy_writable();
 v_now := private.begin_garden_operation(); v_owner := private.require_member();
 select garden_day into v_day from private.garden_clock_at(v_now);
 if p_request_id is null or p_flower_id is null or p_mime_type is null or p_mime_type not in ('image/jpeg','image/png','image/webp','audio/webm') or p_input_bytes is null or p_input_bytes not between 1 and 12582912 then
   raise exception using errcode='22023',message='media_invalid_request'; end if;
 select * into v from private.media_uploads where owner_id=v_owner and request_id=p_request_id;
 if found then
   if v.flower_id<>p_flower_id or v.mime_type<>p_mime_type or v.input_bytes<>p_input_bytes or v.replacement_entry_id is distinct from p_replacement_entry_id then
     raise exception using errcode='22023',message='media_idempotency_conflict'; end if;
   return private.media_upload_json(v);
 end if;
 select type_key into v_type from public.flowers where id=p_flower_id and garden_id=1;
 if v_type is distinct from (case when p_mime_type='audio/webm' then 'bluebell' else 'sunflower' end) then raise exception using errcode='22023',message='media_wrong_flower'; end if;
 if p_replacement_entry_id is not null and not exists(select 1 from public.flower_entries where id=p_replacement_entry_id and flower_id=p_flower_id and author_id=v_owner) then
   raise exception using errcode='42501',message='media_wrong_owner'; end if;
 if (select count(*) from private.media_uploads where owner_id=v_owner and status in ('pending','processing','ready') and expires_at>v_now)>=3
 or (select count(*) from private.media_uploads where owner_id=v_owner and created_at>v_now-interval '1 hour')>=20 then
   raise exception using errcode='22023',message='media_upload_limit'; end if;
 insert into private.media_uploads(owner_id,request_id,flower_id,replacement_entry_id,intended_day,mime_type,input_bytes,created_at,expires_at)
 values(v_owner,p_request_id,p_flower_id,p_replacement_entry_id,v_day,p_mime_type,p_input_bytes,v_now,v_now+interval '15 minutes') returning * into v;
 return private.media_upload_json(v);
end $function$;

create or replace function public.claim_media_upload(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v private.media_uploads; v_now timestamptz; v_owner smallint;
begin
  perform private.require_member();
  perform private.require_legacy_writable();
 v_now:=private.begin_garden_operation(); v_owner:=private.require_member();
 select * into v from private.media_uploads where id=p_id and owner_id=v_owner for update;
 if not found then raise exception using errcode='42501',message='media_not_available'; end if;
 if v.status='submitted' then return private.media_upload_json(v); end if;
 if v.status='expired' or v.expires_at<=v_now then raise exception using errcode='22023',message='media_expired'; end if;
 if v.status='ready' then return private.media_upload_json(v); end if;
 if v.status='processing' and v.processing_at>v_now-interval '2 minutes' then raise exception using errcode='22023',message='media_processing'; end if;
 update private.media_uploads set status='processing',lease_id=gen_random_uuid(),processing_at=v_now where id=v.id returning * into v;
 return private.media_upload_json(v) || jsonb_build_object('lease_id',v.lease_id);
end $function$;

create or replace function public.media_upload_allowed(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 select public.is_garden_member() and not private.legacy_garden_frozen() and exists(select 1 from private.media_uploads where
 owner_id=private.current_member_id() and id::text || '/source'=p_path and status='pending' and expires_at>statement_timestamp());
$function$;

create or replace function public.attest_media_upload(p_id uuid, p_lease_id uuid, p_output_bytes integer, p_width integer, p_height integer, p_sha256 text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v private.media_uploads; v_now timestamptz;
begin
  perform private.require_legacy_writable();
 perform 1 from public.garden where id=1 for update; v_now:=clock_timestamp();
 select * into v from private.media_uploads where id=p_id for update;
 if not found or v.status<>'processing' or v.lease_id is distinct from p_lease_id or v.expires_at<=v_now then
   raise exception using errcode='22023',message='media_expired_or_changed'; end if;
 if not exists(select 1 from private.garden_members m cross join lateral private.google_account(m.user_id,true) a where m.member_id=v.owner_id and m.revoked_at is null and a.email=m.allowed_email and a.google_subject=m.google_subject) then
   raise exception using errcode='42501',message='media_not_available'; end if;
 if not exists(select 1 from storage.objects where bucket_id='garden-media' and name=private.media_upload_json(v)->>'final_path' and (metadata->>'size')::bigint=p_output_bytes and metadata->>'mimetype'=v.mime_type) then
   raise exception using errcode='22023',message='media_object_missing'; end if;
 if p_output_bytes is null or p_width is null or p_height is null or p_sha256 is null then raise exception using errcode='22023',message='media_invalid_metadata'; end if;
 update private.media_uploads set status='ready',output_bytes=p_output_bytes,width=p_width,height=p_height,sha256=p_sha256 where id=v.id;
end $function$;

create or replace function public.attest_audio_upload(p_id uuid, p_lease_id uuid, p_output_bytes integer, p_samples integer, p_channels integer, p_sha256 text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v private.media_uploads; v_now timestamptz;
begin
  perform private.require_legacy_writable();
 perform 1 from public.garden where id=1 for update; v_now:=clock_timestamp();
 select * into v from private.media_uploads where id=p_id for update;
 if not found or v.status<>'processing' or v.lease_id is distinct from p_lease_id or v.expires_at<=v_now then
   raise exception using errcode='22023',message='media_expired_or_changed'; end if;
 if not exists(select 1 from private.garden_members m cross join lateral private.google_account(m.user_id,true) a where m.member_id=v.owner_id and m.revoked_at is null and a.email=m.allowed_email and a.google_subject=m.google_subject) then
   raise exception using errcode='42501',message='media_not_available'; end if;
 if not exists(select 1 from storage.objects where bucket_id='garden-media' and name=private.media_upload_json(v)->>'final_path' and (metadata->>'size')::bigint=p_output_bytes and metadata->>'mimetype'='audio/wav') then
   raise exception using errcode='22023',message='media_object_missing'; end if;
 if p_output_bytes is null or v.mime_type<>'audio/webm' or p_samples is null or p_channels is null or p_sha256 is null then raise exception using errcode='22023',message='media_invalid_metadata'; end if;
 update private.media_uploads set status='ready',output_bytes=p_output_bytes,samples=p_samples,channels=p_channels,sha256=p_sha256 where id=v.id;
end $function$;
