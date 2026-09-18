begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,pg_catalog;
select no_plan();
select private.bootstrap_members('owner@example.test','member@example.test');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
 ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('33333333-3333-4333-8333-333333333333','authenticated','authenticated','outsider@example.test',now(),'{"provider":"google","providers":["google"]}');
insert into auth.identities(user_id,provider_id,provider,identity_data) values
 ('11111111-1111-4111-8111-111111111111','peony-owner','google','{"sub":"peony-owner","email":"owner@example.test","email_verified":true}'),
 ('22222222-2222-4222-8222-222222222222','peony-member','google','{"sub":"peony-member","email":"member@example.test","email_verified":true}'),
 ('33333333-3333-4333-8333-333333333333','peony-outsider','google','{"sub":"peony-outsider","email":"outsider@example.test","email_verified":true}');
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',case n when 1 then '11111111-1111-4111-8111-111111111111' when 2 then '22222222-2222-4222-8222-222222222222' else '33333333-3333-4333-8333-333333333333' end,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
$$;
select pg_temp.actor(1);
-- Only this rolled-back test transaction replaces the real operation clock.
create temporary table operation_definition as select pg_get_functiondef('private.begin_garden_operation()'::regprocedure) definition;
create function pg_temp.at(p_now timestamptz) returns void language plpgsql security definer as $$
begin execute replace((select definition from operation_definition),'clock_timestamp()',quote_literal(p_now)||'::timestamptz'); end $$;
select pg_temp.at('2026-01-01 20:00Z');
select public.initialize_garden();
create function pg_temp.add_flower(t text,b boolean default true) returns uuid language plpgsql as $$
declare f uuid; begin
 insert into public.flowers(type_key,spot,planted_at,planted_day,planted_by,shared_wish,growth_units,first_bloom_at,first_bloom_day)
 select t,(select max(spot)+1 from public.flowers),'2026-01-01 20:00Z','2026-01-01',1,case when t='dandelion' then 'Synthetic wish' end,
 case when b then growth_target else 0 end,case when b then '2026-01-03 20:00Z'::timestamptz end,case when b then '2026-01-03'::date end
 from public.flower_catalog where type_key=t returning id into f; return f; end $$;
create function pg_temp.check_progress(k text,n integer,earned boolean,label text) returns setof text language plpgsql as $$
begin
 perform private.evaluate_achievements('2026-02-01 20:00Z');
 return next is((select progress from public.achievement_progress where achievement_id=k),n,label||' progress');
 return next is(exists(select 1 from public.achievement_awards where achievement_id=k),earned,label||' award');
end $$;
select is((select count(*) from public.achievement_catalog),26::bigint,'exact ordinary denominator');
select * from pg_temp.check_progress('first-seed',0,false,'initial Cactus excluded');
select * from pg_temp.check_progress('all-planted',1,false,'initial Cactus included in types');
select is(private.all_ordinary_achievements_complete(),false,'internal gate starts closed');
savepoint scenario;
select public.plant_flower('rose');
select is((select count(*) from public.achievement_awards where achievement_id='first-seed'),1::bigint,'plant awards immediately without another read');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('rose',true) from generate_series(1,0);
select * from pg_temp.check_progress('first-bloom',0,false,'first-bloom below');
select pg_temp.add_flower('rose',true);
select * from pg_temp.check_progress('first-bloom',1,true,'first-bloom exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('rose',true) from generate_series(1,4);
select * from pg_temp.check_progress('roses-5',4,false,'roses-5 below');
select pg_temp.add_flower('rose',true);
select * from pg_temp.check_progress('roses-5',5,true,'roses-5 exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('marigold',true) from generate_series(1,9);
select * from pg_temp.check_progress('marigolds-10',9,false,'marigolds-10 below');
select pg_temp.add_flower('marigold',true);
select * from pg_temp.check_progress('marigolds-10',10,true,'marigolds-10 exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('tulip',true) from generate_series(1,2);
select * from pg_temp.check_progress('tulips-3',2,false,'tulips-3 below');
select pg_temp.add_flower('tulip',true);
select * from pg_temp.check_progress('tulips-3',3,true,'tulips-3 exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('forget-me-not',true) from generate_series(1,2);
select * from pg_temp.check_progress('forget-me-nots-3',2,false,'forget-me-nots-3 below');
select pg_temp.add_flower('forget-me-not',true);
select * from pg_temp.check_progress('forget-me-nots-3',3,true,'forget-me-nots-3 exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('dandelion',false) from generate_series(1,4);
select * from pg_temp.check_progress('wishes-5',4,false,'wishes-5 below');
select pg_temp.add_flower('dandelion',false);
select * from pg_temp.check_progress('wishes-5',5,true,'wishes-5 exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('moonflower',true) from generate_series(1,0);
select * from pg_temp.check_progress('moonflower',0,false,'moonflower below');
select pg_temp.add_flower('moonflower',true);
select * from pg_temp.check_progress('moonflower',1,true,'moonflower exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('snapdragon',true) from generate_series(1,0);
select * from pg_temp.check_progress('snapdragon',0,false,'snapdragon below');
select pg_temp.add_flower('snapdragon',true);
select * from pg_temp.check_progress('snapdragon',1,true,'snapdragon exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('bluebell',true) from generate_series(1,0);
select * from pg_temp.check_progress('bluebell',0,false,'bluebell below');
select pg_temp.add_flower('bluebell',true);
select * from pg_temp.check_progress('bluebell',1,true,'bluebell exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('peony',true) from generate_series(1,0);
select * from pg_temp.check_progress('peony',0,false,'peony below');
select pg_temp.add_flower('peony',true);
select * from pg_temp.check_progress('peony',1,true,'peony exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('rose',true) from generate_series(1,4);
select * from pg_temp.check_progress('coexisting-5',4,false,'coexisting-5 below');
select pg_temp.add_flower('rose',true);
select * from pg_temp.check_progress('coexisting-5',5,true,'coexisting-5 exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('rose',true) from generate_series(1,9);
select * from pg_temp.check_progress('blooms-10',9,false,'blooms-10 below');
select pg_temp.add_flower('rose',true);
select * from pg_temp.check_progress('blooms-10',10,true,'blooms-10 exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('rose',true) from generate_series(1,19);
select * from pg_temp.check_progress('blooms-20',19,false,'blooms-20 below');
select pg_temp.add_flower('rose',true);
select * from pg_temp.check_progress('blooms-20',20,true,'blooms-20 exact');
rollback to scenario;
savepoint scenario;
update public.garden set longest_streak=2;
select * from pg_temp.check_progress('streak-3',2,false,'streak 3 below');
update public.garden set longest_streak=3,current_streak=0;
select * from pg_temp.check_progress('streak-3',3,true,'streak 3 retained after reset');
rollback to scenario;
savepoint scenario;
update public.garden set longest_streak=6;
select * from pg_temp.check_progress('streak-7',6,false,'streak 7 below');
update public.garden set longest_streak=7,current_streak=0;
select * from pg_temp.check_progress('streak-7',7,true,'streak 7 retained after reset');
rollback to scenario;
savepoint scenario;
update public.garden set longest_streak=13;
select * from pg_temp.check_progress('streak-14',13,false,'streak 14 below');
update public.garden set longest_streak=14,current_streak=0;
select * from pg_temp.check_progress('streak-14',14,true,'streak 14 retained after reset');
rollback to scenario;
savepoint scenario;
update public.garden set longest_streak=20;
select * from pg_temp.check_progress('streak-21',20,false,'streak 21 below');
update public.garden set longest_streak=21,current_streak=0;
select * from pg_temp.check_progress('streak-21',21,true,'streak 21 retained after reset');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower(type_key) from public.flower_catalog where type_key not in ('cactus','peony');
update public.flowers set growth_units=10,first_bloom_at='2026-01-03 20:00Z',first_bloom_day='2026-01-03' where type_key='cactus';
select * from pg_temp.check_progress('all-planted',12,false,'all planted below');
select * from pg_temp.check_progress('all-bloomed',12,false,'all bloomed below');
select pg_temp.add_flower('peony');
select * from pg_temp.check_progress('all-planted',13,true,'all planted exact');
select * from pg_temp.check_progress('all-bloomed',13,true,'all bloomed exact');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('rose');
insert into public.flower_day_facts(flower_id,garden_day,type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom)
 select id,'2026-01-02','rose',0,0,false,false,false from public.flowers where type_key='rose';
select * from pg_temp.check_progress('recovery',0,false,'zero to zero is not recovery');
update public.flower_day_facts set growth_before=1,growth_after=0;
update public.flowers set first_bloom_at=null,first_bloom_day=null where type_key='rose';
select pg_temp.add_flower('marigold');
select * from pg_temp.check_progress('recovery',0,false,'different instance bloom fails');
update public.flowers set first_bloom_at='2026-01-03 20:00Z',first_bloom_day='2026-01-03' where type_key='rose';
select * from pg_temp.check_progress('recovery',1,true,'same instance later bloom');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('dandelion');
select * from pg_temp.check_progress('first-wish-blown',0,false,'wish bloom alone');
select pg_temp.at('2026-01-03 20:01Z');
select public.fulfill_dandelion((select id from public.flowers where type_key='dandelion'));
select is((select count(*) from public.achievement_awards where achievement_id='first-wish-blown'),1::bigint,'fulfillment awards immediately');
select * from pg_temp.check_progress('first-wish-blown',1,true,'wish fulfilled');
rollback to scenario;
savepoint scenario;
insert into public.garden_days values('2026-01-02','2026-01-02 12:00Z','2026-01-03 12:00Z','2026-01-03 12:00Z',true,1,1,false);
select * from pg_temp.check_progress('before-noon',0,false,'nonempty incomplete noon');
update public.garden_days set before_noon_complete=true;
select * from pg_temp.check_progress('before-noon',1,true,'nonempty completed noon');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('hydrangea',false);
insert into public.flower_day_facts(flower_id,garden_day,type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom,member1_posted_at,member2_posted_at,member1_mood,member2_mood)
 select f.id,'2026-01-01'::date+i,'hydrangea',0,1,true,true,false,'2026-01-02 20:00Z','2026-01-02 20:20Z',m.mood_key,m.mood_key from public.flowers f cross join generate_series(1,2)i cross join (select mood_key from public.hydrangea_moods limit 1)m where f.type_key='hydrangea';
select * from pg_temp.check_progress('mood-match-3',2,false,'two matching settled days');
insert into public.flower_day_facts select flower_id,'2026-01-04',type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom,member1_posted_at,member2_posted_at,member1_mood,member2_mood,daisy_question_id from public.flower_day_facts limit 1;
select * from pg_temp.check_progress('mood-match-3',3,true,'three matching settled days');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('daisy',false);
insert into public.flower_day_facts(flower_id,garden_day,type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom,member1_posted_at,member2_posted_at,daisy_question_id)
 select f.id,'2026-01-01'::date+i,'daisy',0,1,true,true,false,'2026-01-02 20:00Z','2026-01-02 20:20Z','synthetic-'||i from public.flowers f cross join generate_series(1,19)i where f.type_key='daisy';
select * from pg_temp.check_progress('daisy-20',19,false,'19 distinct questions');
insert into public.flower_day_facts select flower_id,'2026-01-25',type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom,member1_posted_at,member2_posted_at,member1_mood,member2_mood,daisy_question_id from public.flower_day_facts limit 1;
select * from pg_temp.check_progress('daisy-20',19,false,'repeated question on later day not counted');
update public.flower_day_facts set daisy_question_id='synthetic-20' where garden_day='2026-01-25';
select * from pg_temp.check_progress('daisy-20',20,true,'20 distinct questions');
rollback to scenario;
savepoint scenario;
insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 select id,1,'2026-01-01','2026-01-01 20:00Z','2026-01-01 20:00Z','{}' from public.flowers where type_key='cactus';
insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 select id,2,'2026-01-01','2026-01-01 20:10:00.001Z','2026-01-01 20:10:00.001Z','{}' from public.flowers where type_key='cactus';
select * from pg_temp.check_progress('ten-minutes',0,false,'over ten minutes');
update public.flower_entries set original_posted_at='2026-01-01 20:10Z',updated_at='2026-01-01 20:25Z' where author_id=2;
select * from pg_temp.check_progress('ten-minutes',1,true,'inclusive original ten minutes ignores edit');
create temporary table earned_before as select * from public.achievement_awards;
select private.evaluate_achievements('2026-03-01 20:00Z');
select results_eq('select * from public.achievement_awards order by achievement_id','select * from earned_before order by achievement_id','idempotent earned timestamps');
create temporary table progress_before as select achievement_id,ctid::text tuple_id from public.achievement_progress;
select private.evaluate_achievements('2026-03-02 20:00Z');
select results_eq('select achievement_id,ctid::text from public.achievement_progress order by achievement_id','select achievement_id,tuple_id from progress_before order by achievement_id','unchanged reads do not invalidate Realtime');
rollback to scenario;
savepoint scenario;
select pg_temp.add_flower('peony',false);
insert into public.peony_activity select id,1,'2026-01-02','2026-01-02 12:01Z','2026-01-02 11:59Z','2026-01-02 12:01Z' from public.flowers where type_key='peony';
select * from pg_temp.check_progress('ten-minutes',0,false,'Peony originals cross garden-day boundary');
update public.peony_activity set member1_posted_at='2026-01-02 12:00Z';
select * from pg_temp.check_progress('ten-minutes',1,true,'same milestone same day');
rollback to scenario;
-- End-to-end settlement: 21 paired Cactus days followed by three missed days.
savepoint scenario;
insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 select f.id,a,'2026-01-01'::date+d,'2026-01-01 20:00Z'::timestamptz+make_interval(days=>d,mins=>a*20),'2026-01-01 20:00Z'::timestamptz+make_interval(days=>d,mins=>a*20),'{}'
 from public.flowers f cross join generate_series(0,20)d cross join generate_series(1,2)a where type_key='cactus';
select pg_temp.at('2026-01-25 20:00Z');
select public.current_achievements();
select is((select current_streak from public.garden),0,'late catch-up current streak reset');
select is((select count(*) from public.achievement_awards where achievement_id like 'streak-%'),4::bigint,'catch-up preserves all four crossed thresholds');
select is((select count(*) from public.flowers where first_bloom_at is not null),1::bigint,'post-bloom Cactus pairs never add blooms');
select is((select progress from public.achievement_progress where achievement_id='blooms-20'),1,'one unique bloom counted');
select is((select count(*) from public.garden_days where streak>0),21::bigint,'actual consecutive completed-day evidence');
rollback to scenario;
-- Public submission hook, without a following read.
savepoint scenario;
select public.submit_flower_entry((select id from public.flowers where type_key='cactus'),'{}');
select pg_temp.actor(2);
select public.submit_flower_entry((select id from public.flowers where type_key='cactus'),'{}');
select is((select count(*) from public.achievement_awards where achievement_id='ten-minutes'),1::bigint,'second original submission awards immediately');
select pg_temp.actor(1);
rollback to scenario;
-- Historical noon snapshot uses absolute noon, not the following calendar day.
savepoint scenario;
select public.plant_flower('rose');
select pg_temp.at('2026-01-02 12:00Z');
select public.current_achievements();
insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 select f.id,a,'2026-01-02','2026-01-03 08:10Z','2026-01-03 08:10Z',case when type_key='cactus' then '{}'::jsonb else '{"text":"Synthetic"}'::jsonb end
 from public.flowers f cross join generate_series(1,2)a;
select pg_temp.at('2026-01-03 12:00Z');
select public.current_achievements();
select is((select progress from public.achievement_progress where achievement_id='before-noon'),0,'00:10 next date is after previous day noon');
select is((select before_noon_eligible_count from public.garden_days where garden_day='2026-01-02'),2,'prior-day plants are retained in snapshot');
insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 select f.id,a,'2026-01-03','2026-01-03 19:59Z','2026-01-03 19:59Z',case when type_key='cactus' then '{}'::jsonb else '{"text":"Synthetic"}'::jsonb end
 from public.flowers f cross join generate_series(1,2)a;
select pg_temp.at('2026-01-04 12:00Z');
select public.current_achievements();
select is((select progress from public.achievement_progress where achievement_id='before-noon'),1,'nonempty snapshot both completed strictly before Pacific noon awards');
rollback to scenario;
-- Today's Hydrangea pair is editable and cannot supply a third finalized match.
savepoint scenario;
select pg_temp.add_flower('hydrangea',false);
insert into public.flower_day_facts(flower_id,garden_day,type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom,member1_posted_at,member2_posted_at,member1_mood,member2_mood)
 select f.id,'2025-12-28'::date+i,'hydrangea',0,1,true,true,false,'2025-12-29 20:00Z','2025-12-29 20:20Z',m.mood_key,m.mood_key from public.flowers f cross join generate_series(1,2)i cross join (select mood_key from public.hydrangea_moods limit 1)m where f.type_key='hydrangea';
insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 select f.id,a,'2026-01-01','2026-01-01 20:00Z','2026-01-01 20:00Z',jsonb_build_object('mood',m.mood_key)
 from public.flowers f cross join generate_series(1,2)a cross join (select mood_key from public.hydrangea_moods limit 1)m where type_key='hydrangea';
select * from pg_temp.check_progress('mood-match-3',2,false,'editable current-day match excluded');
update public.flower_entries set payload=jsonb_build_object('mood',(select mood_key from public.hydrangea_moods order by mood_key desc limit 1)) where author_id=2;
select pg_temp.at('2026-01-02 12:00Z');
select public.current_achievements();
select is((select progress from public.achievement_progress where achievement_id='mood-match-3'),2,'final mismatching edit does not award');
rollback to scenario;
-- Immediate Peony bloom hook sees stage four after activity insertion.
savepoint scenario;
select pg_temp.add_flower('peony',false);
update public.flowers set growth_units=3 where type_key='peony';
insert into public.peony_activity select f.id,m,'2026-01-01','2026-01-01 20:00Z','2026-01-01 20:00Z','2026-01-01 20:00Z' from public.flowers f cross join generate_series(1,3)m where type_key='peony';
select public.submit_peony_contribution((select id from public.flowers where type_key='peony'),4,'{"text":"Synthetic favorite"}');
select pg_temp.actor(2);
select public.submit_peony_contribution((select id from public.flowers where type_key='peony'),4,'{"text":"Another synthetic favorite"}');
select is((select count(*) from public.achievement_awards where achievement_id='peony'),1::bigint,'Peony stage-four mutation immediately awards bloom');
select pg_temp.actor(1);
rollback to scenario;
-- Daisy's twentieth distinct immutable assignment counts on the second original.
savepoint scenario;
select pg_temp.add_flower('daisy',false);
select private.assign_daisy_question('2026-01-01','2026-01-01 20:00Z');
insert into public.flower_day_facts(flower_id,garden_day,type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom,member1_posted_at,member2_posted_at,daisy_question_id)
 select f.id,'2025-12-01'::date+i,'daisy',0,1,true,true,false,'2025-12-02 20:00Z','2025-12-02 20:20Z','synthetic-'||i from public.flowers f cross join generate_series(1,19)i where type_key='daisy';
select public.submit_flower_entry((select id from public.flowers where type_key='daisy'),jsonb_build_object('text','Synthetic answer','question_id',(select question_id from public.daisy_assignments where garden_day='2026-01-01')));
select is((select progress from public.achievement_progress where achievement_id='daisy-20'),19,'one current Daisy answer is not paired');
select pg_temp.actor(2);
select public.submit_flower_entry((select id from public.flowers where type_key='daisy'),jsonb_build_object('text','Second synthetic answer','question_id',(select question_id from public.daisy_assignments where garden_day='2026-01-01')));
select is((select progress from public.achievement_progress where achievement_id='daisy-20'),20,'second answer immediately supplies distinct question');
select ok(exists(select 1 from public.achievement_awards where achievement_id='daisy-20'),'twentieth question immediately awards');
select pg_temp.actor(1);
rollback to scenario;
-- The same finalized mood date across two instances still contributes one day.
savepoint scenario;
select pg_temp.add_flower('hydrangea',false) from generate_series(1,2);
insert into public.flower_day_facts(flower_id,garden_day,type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom,member1_posted_at,member2_posted_at,member1_mood,member2_mood)
 select f.id,'2026-01-02','hydrangea',0,1,true,true,false,'2026-01-02 20:00Z','2026-01-02 20:20Z',m.mood_key,m.mood_key from public.flowers f cross join (select mood_key from public.hydrangea_moods limit 1)m where f.type_key='hydrangea';
select * from pg_temp.check_progress('mood-match-3',1,false,'duplicate matching day across instances');
rollback to scenario;
-- Completion requires every catalog item; durable award gate has no final config.
savepoint scenario;
insert into public.achievement_awards select achievement_id,'2026-01-01 20:00Z' from public.achievement_catalog where position<26;
select is(private.all_ordinary_achievements_complete(),false,'25 is incomplete');
insert into public.achievement_awards select achievement_id,'2026-01-01 20:00Z' from public.achievement_catalog where position=26;
select is(private.all_ordinary_achievements_complete(),true,'exactly 26 is complete');
rollback to scenario;
set local role authenticated;
select lives_ok('select public.current_achievements()','member reads');
select throws_ok($$insert into public.achievement_awards values('first-seed',now())$$,'42501',null,'member cannot award');
select throws_ok($$select private.evaluate_achievements(now())$$,'42501',null,'member cannot evaluate arbitrary time');
select throws_ok($$update public.achievement_progress set progress=100$$,'42501',null,'member cannot forge progress');
select pg_temp.actor(3);
select throws_ok('select public.current_achievements()','42501',null,'stranger read denied');
select is((select count(*) from public.achievement_awards),0::bigint,'stranger RLS hides awards');
select is((select count(*) from public.achievement_catalog),0::bigint,'stranger RLS hides catalog');
reset role;
select pg_temp.actor(1);
select throws_ok($$insert into public.achievement_awards values('unknown',now())$$,'23503',null,'unknown awards rejected even internally');
set local role anon;
select throws_ok('select public.current_achievements()','42501',null,'anonymous read denied');
reset role;
select * from finish();
rollback;
