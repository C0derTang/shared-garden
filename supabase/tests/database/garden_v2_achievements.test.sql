-- New-garden achievements (issue #177): reused catalog with documented
-- adaptations, v2-only evidence, earned garden day, awards-for-day and grants.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();
select has_table('public','v2_achievement_catalog','v2 achievement catalog');
select has_table('public','v2_achievement_progress','v2 achievement progress');
select has_table('public','v2_achievement_awards','v2 achievement awards');
select has_function('public','v2_current_achievements',array[]::text[],'v2 achievements read');
select has_function('public','v2_awards_for_day',array['date'],'v2 awards for a garden day');

-- Catalog: legacy definitions reused, Recovery retired, unlock/initial-Cactus wording adapted.
select is((select count(*) from public.v2_achievement_catalog),25::bigint,'25 achievements in the new garden');
select results_eq('select position from public.v2_achievement_catalog order by position','select generate_series(1,25)::smallint','dense positions');
select ok(not exists(select 1 from public.v2_achievement_catalog where achievement_id='recovery'),'Recovery is retired (no decay exists)');
select is_empty($$select v.achievement_id from public.v2_achievement_catalog v join public.achievement_catalog l using(achievement_id)
 where (v.title,v.target,v.unit) is distinct from (l.title,l.target,l.unit)$$,'titles, targets and units are reused unchanged');
select results_eq($$select achievement_id from public.v2_achievement_catalog v join public.achievement_catalog l using(achievement_id) where v.requirement<>l.requirement order by 1$$,
 $$values ('all-planted'),('first-seed')$$,'only unlock and initial-Cactus wording changes');
select is_empty($$select achievement_id from public.v2_achievement_catalog where requirement ~* 'initial|unlock'$$,'no requirement mentions unlocks or an initial Cactus');
select is_empty($$select achievement_id from public.v2_achievement_catalog v where (select array_agg(achievement_id order by position) from public.v2_achievement_catalog)
 <> (select array_agg(achievement_id order by position) from public.achievement_catalog where achievement_id<>'recovery')$$,'legacy order is kept');
select is((select count(*) from public.v2_achievement_awards),0::bigint,'migration awards nothing');

select private.bootstrap_members('owner@example.test','member@example.test');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
 ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('33333333-3333-4333-8333-333333333333','authenticated','authenticated','outsider@example.test',now(),'{"provider":"google","providers":["google"]}');
insert into auth.identities(user_id,provider_id,provider,identity_data) values
 ('11111111-1111-4111-8111-111111111111','v2-owner','google','{"sub":"v2-owner","email":"owner@example.test","email_verified":true}'),
 ('22222222-2222-4222-8222-222222222222','v2-member','google','{"sub":"v2-member","email":"member@example.test","email_verified":true}'),
 ('33333333-3333-4333-8333-333333333333','v2-outsider','google','{"sub":"v2-outsider","email":"outsider@example.test","email_verified":true}');
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',case n when 1 then '11111111-1111-4111-8111-111111111111' when 2 then '22222222-2222-4222-8222-222222222222' else '33333333-3333-4333-8333-333333333333' end,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
$$;
create temporary table operation_definition as select pg_get_functiondef('private.v2_begin_garden_operation()'::regprocedure) definition;
create function pg_temp.at(p_now timestamptz) returns void language plpgsql security definer as $$
begin execute replace((select definition from operation_definition),'clock_timestamp()',quote_literal(p_now)||'::timestamptz'); end $$;
create function pg_temp.add_flower(t text,b boolean default true) returns uuid language plpgsql as $$
declare f uuid; begin
 insert into public.v2_flowers(type_key,spot,seed,planted_at,planted_day,planted_by,shared_wish,growth_units,first_bloom_at,first_bloom_day)
 select t,(select coalesce(max(spot),0)+1 from public.v2_flowers),1,'2026-01-01 20:00Z','2026-01-01',1,case when t='dandelion' then 'Synthetic wish' end,
 case when b then growth_target else 0 end,case when b then '2026-01-03 20:00Z'::timestamptz end,case when b then '2026-01-03'::date end
 from public.flower_catalog where type_key=t returning id into f; return f; end $$;
create function pg_temp.check_progress(k text,n integer,earned boolean,label text) returns setof text language plpgsql as $$
begin
 perform private.v2_evaluate_achievements('2026-02-01 20:00Z');
 return next is((select progress from public.v2_achievement_progress where achievement_id=k),n,label||' progress');
 return next is(exists(select 1 from public.v2_achievement_awards where achievement_id=k),earned,label||' award');
end $$;

-- 2026-01-01 12:00 PST, garden day 2026-01-01. The garden starts empty.
select pg_temp.actor(1);
select pg_temp.at('2026-01-01 20:00Z');
set local role authenticated;
create temporary table first_read as select public.v2_current_achievements() value;
reset role;
select is((select jsonb_array_length(value->'achievements') from first_read),25,'read lists every v2 achievement');
select ok((select bool_and((a->>'progress')::integer=0 and a->'earned_at'='null'::jsonb and a->'earned_day'='null'::jsonb) from first_read,jsonb_array_elements(value->'achievements') a),'empty garden starts with no progress and no awards');
select results_eq($$select (value->>'garden_day')::date,(value->>'current_streak')::integer,(value->>'server_now')::timestamptz from first_read$$,
 $$values ('2026-01-01'::date,0,'2026-01-01 20:00Z'::timestamptz)$$,'read carries the operation instant and garden day');
select is((select array_agg(a->>'achievement_id' order by ord) from first_read,jsonb_array_elements(value->'achievements') with ordinality x(a,ord)),
 (select array_agg(achievement_id order by position) from public.v2_achievement_catalog),'read is in catalog order');
select is((select count(*) from public.v2_achievement_progress),25::bigint,'progress row per achievement');
select * from pg_temp.check_progress('first-seed',0,false,'no initial Cactus, no seed');

savepoint scenario;
set local role authenticated;
select public.v2_plant_flower_at('cactus',1);
reset role;
select results_eq($$select earned_at,earned_day from public.v2_achievement_awards where achievement_id='first-seed'$$,
 $$values ('2026-01-01 20:00Z'::timestamptz,'2026-01-01'::date)$$,'planting a Cactus awards first seed immediately with its garden day');
rollback to scenario;

-- Thresholds that reuse legacy meaning over v2 flowers.
savepoint scenario;
select pg_temp.add_flower('rose',true) from generate_series(1,4);
select * from pg_temp.check_progress('roses-5',4,false,'roses-5 below');
select * from pg_temp.check_progress('coexisting-5',4,false,'coexisting-5 below');
select pg_temp.add_flower('rose',true);
select * from pg_temp.check_progress('roses-5',5,true,'roses-5 exact');
select * from pg_temp.check_progress('coexisting-5',5,true,'coexisting-5 exact');
select * from pg_temp.check_progress('first-bloom',1,true,'first bloom');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('cactus',true) from generate_series(1,9);
select * from pg_temp.check_progress('blooms-10',9,false,'blooms-10 below with many Cacti');
select pg_temp.add_flower('cactus',true);
select * from pg_temp.check_progress('blooms-10',10,true,'each bloomed Cactus counts once');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('dandelion',false) from generate_series(1,4);
select * from pg_temp.check_progress('wishes-5',4,false,'wishes-5 below');
select pg_temp.add_flower('dandelion',false);
select * from pg_temp.check_progress('wishes-5',5,true,'wishes-5 exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower(type_key,false) from public.flower_catalog where type_key<>'peony';
select * from pg_temp.check_progress('all-planted',12,false,'all planted below, no initial Cactus counted');
select pg_temp.add_flower('peony',false);
select * from pg_temp.check_progress('all-planted',13,true,'all 13 types planted from the start');
select * from pg_temp.check_progress('all-bloomed',0,false,'unbloomed types');
update public.v2_flowers f set growth_units=c.growth_target,first_bloom_at='2026-01-03 20:00Z',first_bloom_day='2026-01-03' from public.flower_catalog c where c.type_key=f.type_key;
select * from pg_temp.check_progress('all-bloomed',13,true,'all 13 types bloomed');
select pg_temp.check_progress(k,1,true,k||' bloomed') from unnest(array['moonflower','snapdragon','bluebell','peony']) k;
rollback to scenario;
savepoint scenario;
update public.v2_garden set longest_streak=20;
select * from pg_temp.check_progress('streak-21',20,false,'streak 21 below');
select * from pg_temp.check_progress('streak-14',14,true,'streak 14 retained');
update public.v2_garden set longest_streak=21,current_streak=0;
select * from pg_temp.check_progress('streak-21',21,true,'streak 21 retained after reset');
rollback to scenario;
savepoint scenario;
insert into public.v2_garden_days values('2025-12-31','2025-12-31 12:00Z','2026-01-01 12:00Z','2026-01-01 12:00Z',true,1,1,false);
select * from pg_temp.check_progress('before-noon',0,false,'nonempty incomplete noon');
update public.v2_garden_days set before_noon_complete=true;
select * from pg_temp.check_progress('before-noon',1,true,'nonempty completed noon');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('hydrangea',false);
insert into public.v2_garden_days select '2025-12-01'::date+i,'2025-12-01 12:00Z','2025-12-02 12:00Z','2025-12-02 12:00Z',true,1,0,false from generate_series(1,3) i;
insert into public.v2_flower_day_facts(flower_id,garden_day,type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom,member1_posted_at,member2_posted_at,member1_mood,member2_mood)
 select f.id,'2025-12-01'::date+i,'hydrangea',0,1,true,true,false,'2025-12-02 20:00Z','2025-12-02 20:20Z','calm','calm' from public.v2_flowers f cross join generate_series(1,2) i where f.type_key='hydrangea';
select * from pg_temp.check_progress('mood-match-3',2,false,'two matching settled days');
insert into public.v2_flower_day_facts(flower_id,garden_day,type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom,member1_posted_at,member2_posted_at,member1_mood,member2_mood)
 select f.id,'2025-12-04','hydrangea',0,1,true,true,false,'2025-12-04 20:00Z','2025-12-04 20:20Z','other','other' from public.v2_flowers f where f.type_key='hydrangea';
select * from pg_temp.check_progress('mood-match-3',2,false,'Other never matches');
update public.v2_flower_day_facts set member1_mood='tense',member2_mood='tense' where garden_day='2025-12-04';
select * from pg_temp.check_progress('mood-match-3',3,true,'three matching settled days');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('daisy',false);
insert into public.v2_garden_days select '2025-11-01'::date+i,'2025-11-01 12:00Z','2025-11-02 12:00Z','2025-11-02 12:00Z',true,1,0,false from generate_series(1,20) i;
insert into public.v2_flower_day_facts(flower_id,garden_day,type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom,member1_posted_at,member2_posted_at,daisy_question_id)
 select f.id,'2025-11-01'::date+i,'daisy',0,1,true,true,false,'2025-11-02 20:00Z','2025-11-02 20:20Z','synthetic-'||least(i,19) from public.v2_flowers f cross join generate_series(1,20) i where f.type_key='daisy';
select * from pg_temp.check_progress('daisy-20',19,false,'repeated question not counted');
update public.v2_flower_day_facts set daisy_question_id='synthetic-20' where garden_day='2025-11-21';
select * from pg_temp.check_progress('daisy-20',20,true,'20 distinct questions');
rollback to scenario;

-- Live operations: ten minutes, Dandelion fulfilment and award idempotence.
savepoint scenario;
set local role authenticated;
select public.v2_plant_flower_at('cactus',1);
select public.v2_submit_flower_entry((select id from public.v2_flowers where type_key='cactus'),'{}');
select pg_temp.actor(2);
select pg_temp.at('2026-01-01 20:10:00.000001Z');
select public.v2_submit_flower_entry((select id from public.v2_flowers where type_key='cactus'),'{}');
reset role;
select is((select progress from public.v2_achievement_progress where achievement_id='ten-minutes'),0,'over ten minutes does not count');
update public.v2_flower_entries set original_posted_at='2026-01-01 20:10Z' where author_id=2;
select * from pg_temp.check_progress('ten-minutes',1,true,'inclusive ten minutes');
create temporary table earned_before as select * from public.v2_achievement_awards;
select private.v2_evaluate_achievements('2026-03-01 20:00Z');
select results_eq('select * from public.v2_achievement_awards order by achievement_id','select * from earned_before order by achievement_id','re-evaluation keeps earned time and day');
create temporary table progress_before as select achievement_id,ctid::text tuple_id from public.v2_achievement_progress;
select private.v2_evaluate_achievements('2026-03-02 20:00Z');
select results_eq('select achievement_id,ctid::text from public.v2_achievement_progress order by achievement_id','select achievement_id,tuple_id from progress_before order by achievement_id','unchanged evaluation does not rewrite progress (no Realtime noise)');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('dandelion',true);
select * from pg_temp.check_progress('first-wish-blown',0,false,'bloomed wish alone');
select pg_temp.at('2026-01-04 20:00Z');
set local role authenticated;
select public.v2_fulfill_dandelion((select id from public.v2_flowers where type_key='dandelion'));
reset role;
select results_eq($$select earned_at,earned_day from public.v2_achievement_awards where achievement_id='first-wish-blown'$$,
 $$values ('2026-01-04 20:00Z'::timestamptz,'2026-01-04'::date)$$,'fulfilment awards immediately');
rollback to scenario;

-- Earned day follows the 4 a.m. Pacific garden-day boundary, and settlement
-- awards are confirmed on the day of the operation that settles them.
savepoint scenario;
select pg_temp.add_flower('cactus',false);
insert into public.v2_flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 select f.id,a,'2026-01-01'::date+d,'2026-01-01 20:00Z'::timestamptz+make_interval(days=>d,mins=>a*20),'2026-01-01 20:00Z'::timestamptz+make_interval(days=>d,mins=>a*20),'{}'
 from public.v2_flowers f cross join generate_series(0,2) d cross join generate_series(1,2) a where type_key='cactus';
update public.v2_achievement_progress set progress=0;
delete from public.v2_achievement_awards;
-- 2026-01-04 03:59 PST is still garden day 2026-01-03: days 1..2 settle.
select pg_temp.at('2026-01-04 11:59Z');
set local role authenticated;
create temporary table before_rollover as select public.v2_awards_for_day() value;
reset role;
select is((select longest_streak from public.v2_garden),2,'two days settled before rollover');
select ok(not exists(select 1 from public.v2_achievement_awards where achievement_id='streak-3'),'no streak award before its day settles');
select results_eq($$select (value->>'day')::date,(value->>'garden_day')::date,(value->>'earned')::boolean from before_rollover$$,
 $$values ('2026-01-03'::date,'2026-01-03'::date,true)$$,'default day is the current garden day');
select ok((select bool_and((a->>'earned_day')::date='2026-01-03') from before_rollover,jsonb_array_elements(value->'awards') a),'listed awards belong to that day');
select ok((select value->'awards' @> '[{"achievement_id":"first-seed"}]' from before_rollover),'first seed counted on the day it was evaluated');
select pg_temp.at('2026-01-04 12:00Z');
set local role authenticated;
create temporary table after_rollover as select public.v2_awards_for_day() value;
create temporary table previous_day as select public.v2_awards_for_day('2026-01-03') value;
create temporary table empty_day as select public.v2_awards_for_day('2025-12-25') value;
reset role;
select results_eq($$select earned_at,earned_day from public.v2_achievement_awards where achievement_id='streak-3'$$,
 $$values ('2026-01-04 12:00Z'::timestamptz,'2026-01-04'::date)$$,'rollover award records the settling operation garden day');
select results_eq($$select (value->>'day')::date,(value->>'earned')::boolean,(select array_agg(a->>'achievement_id') from jsonb_array_elements(value->'awards') a) from after_rollover$$,
 $$values ('2026-01-04'::date,true,array['streak-3'])$$,'today lists only today''s award');
select is((select (value->>'earned')::boolean from previous_day),true,'an earlier day remains queryable');
select ok(not (select value->'awards' @> '[{"achievement_id":"streak-3"}]' from previous_day),'an earlier day excludes later awards');
select results_eq($$select (value->>'earned')::boolean,value->'awards' from empty_day$$,$$values (false,'[]'::jsonb)$$,'a day without awards is empty');
select ok((select (a->>'earned_day')::date='2026-01-04' and a->>'title'='Three-day streak' from after_rollover,jsonb_array_elements(value->'awards') a),'award lists title and earned day');
set local role authenticated;
select throws_ok($$select public.v2_awards_for_day('infinity')$$,'22023','Invalid garden day','infinite day rejected');
select results_eq($$select a->>'earned_day' from jsonb_array_elements(public.v2_current_achievements()->'achievements') a where a->>'achievement_id'='streak-3'$$,
 $$values ('2026-01-04')$$,'achievement read includes the earned day');
reset role;
rollback to scenario;

-- Peony evidence: same-milestone originals across a garden-day boundary never pair.
savepoint scenario;
select pg_temp.add_flower('peony',false);
insert into public.v2_peony_activity select id,1,'2026-01-02','2026-01-02 12:01Z','2026-01-02 11:59Z','2026-01-02 12:01Z' from public.v2_flowers where type_key='peony';
select * from pg_temp.check_progress('ten-minutes',0,false,'Peony originals across the boundary');
update public.v2_peony_activity set member1_posted_at='2026-01-02 12:00Z';
select * from pg_temp.check_progress('ten-minutes',1,true,'same Peony milestone same day');
rollback to scenario;

-- v2 awards never touch legacy achievements, and legacy evidence never counts.
savepoint scenario;
insert into public.achievement_awards values ('roses-5','2025-12-01 20:00Z'),('recovery','2025-12-01 20:00Z');
select * from pg_temp.check_progress('roses-5',0,false,'a legacy award never counts in v2');
select pg_temp.add_flower('rose',true);
select * from pg_temp.check_progress('first-bloom',1,true,'v2 bloom counts');
select results_eq('select achievement_id,earned_at from public.achievement_awards order by 1',
 $$values ('recovery','2025-12-01 20:00Z'::timestamptz),('roses-5','2025-12-01 20:00Z'::timestamptz)$$,'legacy awards untouched');
select is((select count(*) from public.achievement_progress),0::bigint,'no legacy progress written');
rollback to scenario;

-- Access.
set local role authenticated;
select throws_ok($$insert into public.v2_achievement_awards values('first-seed',now(),current_date)$$,'42501',null,'member cannot award');
select throws_ok($$update public.v2_achievement_progress set progress=100$$,'42501',null,'member cannot forge progress');
select throws_ok($$select private.v2_evaluate_achievements(now())$$,'42501',null,'member cannot evaluate arbitrary time');
select throws_ok($$select public.v2_awards_for_day(current_date,1)$$,'42883',null,'no extra arguments');
select pg_temp.actor(3);
select throws_ok('select public.v2_current_achievements()','42501','Garden access denied','outsider read denied');
select throws_ok('select public.v2_awards_for_day()','42501','Garden access denied','outsider awards-for-day denied');
select is_empty('select * from public.'||t,'outsider cannot read '||t)
 from (values('v2_achievement_catalog'),('v2_achievement_progress'),('v2_achievement_awards')) x(t);
reset role;
set local role anon;
select throws_ok('select public.v2_current_achievements()','42501',null,'anonymous read denied');
select throws_ok('select public.v2_awards_for_day()','42501',null,'anonymous awards-for-day denied');
reset role;
select ok(c.relrowsecurity,c.relname||' enables RLS') from pg_class c
 where c.oid in ('public.v2_achievement_catalog'::regclass,'public.v2_achievement_progress'::regclass,'public.v2_achievement_awards'::regclass);
select pg_temp.actor(1);
select throws_ok($$insert into public.v2_achievement_awards values('recovery',now(),current_date)$$,'23503',null,'retired achievement cannot be awarded even internally');
select * from finish();
rollback;
