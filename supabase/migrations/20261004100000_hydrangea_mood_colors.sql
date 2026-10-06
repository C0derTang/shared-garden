-- Decision 0059 / issue #149: optional permanent-bloom mood choices and durable colors.
-- Replacements preserve existing locks, authorization, search paths and grants.
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
$$;

create or replace function private.evaluate_achievements(p_now timestamptz)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
begin
 perform private.require_member();
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
   (select count(distinct garden_day) from public.flower_day_facts where type_key='hydrangea' and paired and member1_mood=member2_mood) moods,
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
end $$;


create or replace function private.entry_state_at(p_flower_id uuid,v_actor smallint,v_now timestamptz)
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
    'hydrangea_moods',jsonb_build_array(
      (select e.payload->>'mood' from public.flower_entries e where e.flower_id=p_flower_id and v_flower.type_key='hydrangea' and e.author_id=1 order by e.garden_day desc limit 1),
      (select e.payload->>'mood' from public.flower_entries e where e.flower_id=p_flower_id and v_flower.type_key='hydrangea' and e.author_id=2 order by e.garden_day desc limit 1)),
    'entries',v_entries);
end;
$$;
