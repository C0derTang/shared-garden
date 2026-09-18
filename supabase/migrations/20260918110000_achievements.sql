-- Safe, fixed ordinary catalog. No private final-event data belongs here.
create table public.achievement_catalog (
 achievement_id text primary key,
 position smallint not null unique check(position between 1 and 26),
 title text not null, target integer not null check(target > 0),
 unit text not null, requirement text not null
);
insert into public.achievement_catalog values
('first-seed',1,'First seed planted',1,'seeds','Plant a flower together. The initial Cactus does not count.'),
('first-bloom',2,'First bloom',1,'blooms','Grow any flower to its first permanent bloom.'),
('all-planted',3,'All 13 types planted',13,'types','Plant every flower type, including your initial Cactus. New types unlock through blooms.'),
('all-bloomed',4,'All 13 types bloomed',13,'types','Bloom each of the 13 flower types at least once.'),
('streak-3',5,'Three-day streak',3,'days','Share qualifying care on 3 consecutive completed garden days.'),
('streak-7',6,'Seven-day streak',7,'days','Share qualifying care on 7 consecutive completed garden days.'),
('streak-14',7,'Fourteen-day streak',14,'days','Share qualifying care on 14 consecutive completed garden days.'),
('streak-21',8,'Twenty-one-day streak',21,'days','Share qualifying care on 21 consecutive completed garden days. There is no deadline.'),
('recovery',9,'Recovery',1,'recoveries','After a flower loses a stage from above zero, help that same flower bloom.'),
('roses-5',10,'Five Roses bloomed',5,'blooms','Grow five separate Roses to permanent blooms.'),
('marigolds-10',11,'Ten Marigolds bloomed',10,'blooms','Grow ten separate Marigolds to permanent blooms.'),
('tulips-3',12,'Three Tulips bloomed',3,'blooms','Grow three separate Tulips to permanent blooms.'),
('daisy-20',13,'Twenty paired Daisy questions',20,'questions','Both answer 20 distinct shared Daisy questions, across any Daisy plants.'),
('forget-me-nots-3',14,'Three Forget-me-nots bloomed',3,'blooms','Grow three separate Forget-me-nots to permanent blooms. Take the time you need.'),
('wishes-5',15,'Five Dandelion wishes planted',5,'wishes','Plant five Dandelions, each with a shared wish.'),
('ten-minutes',16,'Both submit within ten minutes',1,'pairs','Both make original submissions to the same flower and garden day within ten minutes, including exactly ten. The same Peony milestone counts.'),
('before-noon',17,'Both water every eligible live flower before noon',1,'days','Both water every plant in a nonempty 4 a.m. snapshot before Pacific noon. Moonflower, Peony and bloomed plants are excluded; new plants join the next day. Confirmed at rollover.'),
('moonflower',18,'Moonflower bloomed',1,'blooms','Grow a Moonflower to its permanent bloom.'),
('snapdragon',19,'Snapdragon bloomed',1,'blooms','Grow a Snapdragon to its permanent bloom.'),
('bluebell',20,'Bluebell bloomed',1,'blooms','Grow a Bluebell to its permanent bloom.'),
('mood-match-3',21,'Hydrangea moods match on three distinct days',3,'days','Finish three garden days with matching final Hydrangea moods. Days need not be consecutive; confirmed at rollover.'),
('peony',22,'Peony bloomed',1,'blooms','Complete all four ordered shared milestones on a Peony.'),
('first-wish-blown',23,'First Dandelion blown',1,'wishes','After a Dandelion blooms, fulfill its wish and blow its seeds.'),
('coexisting-5',24,'Five permanent blooms coexist',5,'blooms','Have five permanent blooms in the garden. They may bloom on different days.'),
('blooms-10',25,'Ten total blooms',10,'blooms','Grow ten unique permanent blooms. Each Cactus counts only once.'),
('blooms-20',26,'Twenty total blooms',20,'blooms','Grow twenty unique permanent blooms. Your garden keeps expanding afterward.');
create table public.achievement_progress (
 achievement_id text primary key references public.achievement_catalog,
 progress integer not null check(progress >= 0)
);
create table public.achievement_awards (
 achievement_id text primary key references public.achievement_catalog,
 earned_at timestamptz not null check(isfinite(earned_at))
);
alter table public.achievement_catalog enable row level security;
alter table public.achievement_progress enable row level security;
alter table public.achievement_awards enable row level security;
revoke all on public.achievement_catalog,public.achievement_progress,public.achievement_awards from public,anon,authenticated,service_role,supabase_auth_admin;
grant select on public.achievement_catalog,public.achievement_progress,public.achievement_awards to authenticated;
create policy members_read_achievement_catalog on public.achievement_catalog for select to authenticated using((select public.is_garden_member()));
create policy members_read_achievement_progress on public.achievement_progress for select to authenticated using((select public.is_garden_member()));
create policy members_read_achievement_awards on public.achievement_awards for select to authenticated using((select public.is_garden_member()));

-- Caller owns the singleton lock and supplies its one post-lock instant. All
-- evidence is durable, so one evaluation after catch-up retains earlier wins.
create function private.evaluate_achievements(p_now timestamptz)
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
  where a.author_id=1
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

-- Internal gate for the later interaction; caller first begins a garden
-- operation. Neither this predicate nor the ordinary read consults final config.
create function private.all_ordinary_achievements_complete()
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
begin
 perform private.require_member();
 return (select count(*)=26 from public.achievement_awards a join public.achievement_catalog c using(achievement_id));
end $$;

create or replace function private.begin_garden_operation()
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
  perform private.evaluate_achievements(v_now);
  return v_now;
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
  perform private.evaluate_achievements(v_now);
  return v_flower;
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
  perform private.evaluate_achievements(v_now);
  return v_entry;
end;
$$;
create or replace function private.complete_peony_milestone(p_flower_id uuid,p_milestone integer,p_now timestamptz)
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
  perform private.evaluate_achievements(p_now);
end $$;
create or replace function public.fulfill_dandelion(p_flower_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_actor smallint; v_flower public.flowers;
begin
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
end $$;
create function public.current_achievements()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_now timestamptz;
begin
 v_now:=private.begin_garden_operation();
 return jsonb_build_object('server_now',v_now,'current_streak',(select current_streak from public.garden where id=1),
  'achievements',(select jsonb_agg(to_jsonb(c)||jsonb_build_object('progress',p.progress,'earned_at',a.earned_at) order by c.position)
   from public.achievement_catalog c join public.achievement_progress p using(achievement_id)
    left join public.achievement_awards a using(achievement_id)));
end $$;
revoke all on function private.evaluate_achievements(timestamptz),private.all_ordinary_achievements_complete(),public.current_achievements()
 from public,anon,authenticated,service_role,supabase_auth_admin;
grant execute on function public.current_achievements() to authenticated;
alter publication supabase_realtime add table public.achievement_progress,public.achievement_awards;
