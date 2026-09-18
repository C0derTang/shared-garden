begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();
select has_table('public','garden_days','completed days have a durable ledger');
select has_table('public','flower_day_facts','per-flower evidence survives later changes');
select has_table('public','before_noon_snapshots','historical eligibility is durable');
select has_table('public','peony_activity','trusted milestone activity seam');
select has_function('public','current_garden_state',array[]::text[],'authoritative settled read');
select private.bootstrap_members('owner@example.test','member@example.test');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
 ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('33333333-3333-4333-8333-333333333333','authenticated','authenticated','outsider@example.test',now(),'{"provider":"google","providers":["google"]}');
insert into auth.identities(user_id,provider_id,provider,identity_data) values
 ('11111111-1111-4111-8111-111111111111','planting-owner','google','{"sub":"planting-owner","email":"owner@example.test","email_verified":true}'),
 ('22222222-2222-4222-8222-222222222222','planting-member','google','{"sub":"planting-member","email":"member@example.test","email_verified":true}'),
 ('33333333-3333-4333-8333-333333333333','planting-outsider','google','{"sub":"planting-outsider","email":"outsider@example.test","email_verified":true}');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);

-- Tests replace only the private operation's literal clock expression, within
-- this rolled-back transaction. No deployed clock override is introduced.
create temporary table operation_definition as select pg_get_functiondef('private.begin_garden_operation()'::regprocedure) definition;
create function pg_temp.at(p_now timestamptz) returns void language plpgsql as $$
begin execute replace((select definition from operation_definition),'clock_timestamp()',quote_literal(p_now)||'::timestamptz'); end $$;
create function pg_temp.flower(p_type text) returns uuid language sql as $$select id from public.flowers where type_key=p_type order by spot limit 1$$;
create function pg_temp.pair(p_flower uuid,p_day date,p_one timestamptz,p_two timestamptz,p_payload jsonb default '{"text":"Synthetic note"}') returns void language sql as $$
 insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 values (p_flower,1,p_day,p_one,p_one,p_payload),(p_flower,2,p_day,p_two,p_two,p_payload);
$$;
select pg_temp.at('2026-03-06 11:59:00+00');
select public.initialize_garden();
select public.plant_flower('rose');
select public.plant_flower('marigold');
insert into public.flower_unlocks(type_key) values ('peony');
select public.plant_flower('peony');
update public.flowers set growth_units=case type_key when 'rose' then 4 when 'cactus' then 9 when 'peony' then 2 else 0 end;
select pg_temp.pair(pg_temp.flower('rose'),'2026-03-05','2026-03-06 11:59:01+00','2026-03-06 11:59:02+00');
select pg_temp.pair(pg_temp.flower('cactus'),'2026-03-05','2026-03-06 11:59:01+00','2026-03-06 11:59:02+00','{}');
select pg_temp.at('2026-03-06 11:59:59.999999+00');
select public.current_garden_state();
select is((select count(*) from public.garden_days),0::bigint,'current day never settles before rollover');
select pg_temp.at('2026-03-06 12:00:00+00');
select public.current_garden_state();
select is((select growth_units from public.flowers where type_key='rose'),5::smallint,'near-rollover planting earns its planting-day pair');
select is((select first_bloom_day from public.flowers where type_key='rose'),'2026-03-05'::date,'bloom belongs to qualifying day');
select is((select growth_units from public.flowers where type_key='cactus'),10::smallint,'Cactus reaches target once');
select is((select growth_units from public.flowers where type_key='peony'),2::smallint,'Peony receives no daily decay or growth');
select is((select count(*) from public.flower_day_facts where type_key='peony'),0::bigint,'Peony excluded from generic facts');
select is((select count(*) from public.garden_days),1::bigint,'only completed day settled');
select is((select current_streak from public.garden),1::integer,'multiple activities count one streak day');
select is((select count(*) from public.flower_unlocks where type_key in ('daisy','hydrangea')),2::bigint,'two distinct blooms unlock exact thresholds');
select is((select before_noon_eligible_count from public.garden_days),0::integer,'new plants excluded from planting-day noon snapshot');
select ok(not (select before_noon_complete from public.garden_days),'empty noon snapshot does not qualify');
select is((select count(*) from public.before_noon_snapshots where garden_day='2026-03-06'),1::bigint,'new day excludes both just-bloomed plants and Peony');
select public.current_garden_state();
select is((select count(*) from public.flower_day_facts),3::bigint,'repeated settlement adds no duplicate flower facts');
select is((select count(*) from public.flowers where first_bloom_day is not null),2::bigint,'repeated settlement adds no bloom credit');
select pg_temp.pair(pg_temp.flower('marigold'),'2026-03-06','2026-03-06 19:59:00+00','2026-03-06 20:00:00+00');
select pg_temp.pair(pg_temp.flower('cactus'),'2026-03-06','2026-03-06 19:59:00+00','2026-03-06 19:59:01+00','{}');
select pg_temp.at('2026-03-07 12:00:00+00');
select public.current_garden_state();
select is((select current_streak from public.garden),2::integer,'paired bloomed Cactus still qualifies');
select ok(not (select before_noon_complete from public.garden_days where garden_day='2026-03-06'),'exact local noon excluded');
select is((select growth_after from public.flower_day_facts where type_key='cactus' and garden_day='2026-03-06'),10::smallint,'bloomed Cactus never gains extra growth');
select pg_temp.pair(pg_temp.flower('marigold'),'2026-03-07','2026-03-07 19:00+00','2026-03-07 19:10+00');
select pg_temp.at('2026-03-10 11:00+00');
select public.current_garden_state();
select is((select count(*) from public.garden_days),5::bigint,'long catch-up includes every completed calendar day');
select is((select ends_at-starts_at from public.garden_days where garden_day='2026-03-07'),interval '23 hours','spring DST day lasts 23 elapsed hours');
select is((select growth_units from public.flowers where type_key='marigold'),0::smallint,'missed days decay repeatedly to zero');
select is((select count(*) from public.flower_day_facts where type_key='marigold' and growth_after<growth_before),2::bigint,'actual decreases retained');
select is((select current_streak from public.garden),0::integer,'missing completed day resets streak');
select is((select longest_streak from public.garden),3::integer,'longest prior streak retained');
select is((select qualifying_days from public.garden),3::bigint,'all-time qualifying day count retained');
select ok((select before_noon_complete from public.garden_days where garden_day='2026-03-07'),'nonempty full snapshot strictly before noon qualifies');
select is((select member2_posted_at-member1_posted_at from public.flower_day_facts where type_key='marigold' and garden_day='2026-03-07'),interval '10 minutes','original exact ten-minute pair preserved');
select is((select growth_units from public.flowers where type_key='cactus'),10::smallint,'Cactus never decays during absence');
select is((select growth_units from public.flowers where type_key='rose'),5::smallint,'ordinary bloom permanent through absence');
select is((select growth_units from public.flowers where type_key='peony'),2::smallint,'Peony permanent through absence');
select is((select count(*) from public.flower_unlocks where type_key in ('daisy','hydrangea')),2::bigint,'unlocks never relock');


-- The before-noon snapshot includes every eligible plant, not merely ones that
-- received entries; after-midnight entries belong to yesterday but miss noon.
select pg_temp.pair(pg_temp.flower('marigold'),'2026-03-10','2026-03-11 08:00+00','2026-03-11 08:05+00');
select pg_temp.at('2026-03-11 11:00+00');
select public.current_garden_state();
select ok((select qualifying_activity from public.garden_days where garden_day='2026-03-10'),'post-midnight paired entries grow normally');
select ok(not (select before_noon_complete from public.garden_days where garden_day='2026-03-10'),'after-midnight is after the qualifying garden day noon');
select public.plant_flower('hydrangea');
select public.plant_flower('daisy');
insert into public.flower_unlocks(type_key) values('moonflower');
select public.plant_flower('moonflower');
select pg_temp.at('2026-03-12 18:50+00');
set local role authenticated;
select public.submit_flower_entry(pg_temp.flower('hydrangea'),'{"mood":"calm"}'::jsonb);
select public.get_daily_daisy_question();
select public.submit_flower_entry(pg_temp.flower('daisy'),jsonb_build_object('text','Answer one','question_id',(select question_id from public.daisy_assignments where garden_day='2026-03-12')));
select is(public.current_entry_state(pg_temp.flower('hydrangea'))->>'member1_submitted','true','current marker reflects member one');
select is(public.current_entry_state(pg_temp.flower('hydrangea'))->>'member2_submitted','false','current marker reflects absent member two');
select is(public.current_entry_state(pg_temp.flower('hydrangea'))->'entries'->0->>'can_edit','true','author can edit current visible entry');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select is(jsonb_array_length(public.current_entry_state(pg_temp.flower('hydrangea'))->'entries'),1,'partner sees original without posting');
select is(public.current_entry_state(pg_temp.flower('hydrangea'))->'entries'->0->>'can_edit','false','partner cannot edit original');
reset role;
select pg_temp.at('2026-03-12 18:59+00');
select public.submit_flower_entry(pg_temp.flower('hydrangea'),'{"mood":"joyful"}'::jsonb);
select public.submit_flower_entry(pg_temp.flower('daisy'),jsonb_build_object('text','Answer two','question_id',(select question_id from public.daisy_assignments where garden_day='2026-03-12')));
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select pg_temp.at('2026-03-12 19:20+00');
select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('hydrangea') and author_id=1),'{"mood":"joyful"}'::jsonb);
select pg_temp.at('2026-03-13 11:00+00');
select public.current_garden_state();
select results_eq($$select member1_mood,member2_mood,member1_posted_at,member2_posted_at from public.flower_day_facts where type_key='hydrangea' and garden_day='2026-03-12'$$,
 $$values('joyful'::text,'joyful'::text,'2026-03-12 18:50+00'::timestamptz,'2026-03-12 18:59+00'::timestamptz)$$,'final allowed mood with immutable original timestamps');
select ok((select completed from public.before_noon_snapshots where flower_id=pg_temp.flower('hydrangea') and garden_day='2026-03-12'),'post-noon edit does not invalidate original before-noon submissions');
select ok(not exists(select 1 from public.before_noon_snapshots s join public.flowers f on f.id=s.flower_id where type_key in ('moonflower','peony')),'Moonflower and Peony never enter noon snapshot');
select is((select daisy_question_id from public.flower_day_facts where type_key='daisy' and garden_day='2026-03-12'),(select question_id from public.daisy_assignments where garden_day='2026-03-12'),'paired Daisy evidence keeps shared stable question ID');
select is((select count(*) from public.daisy_assignments),2::bigint,'no automatic Daisy questions for unrequested days before live Daisy');

-- Same shared question in a later cycle is still one distinct question, while
-- final matching moods count distinct days, across permanently retained facts.
insert into public.daisy_assignments(garden_day,ordinal,question_id,category,prompt,assigned_at)
 select '2026-03-14',102,question_id,category,prompt,'2026-03-14 12:00+00' from public.daisy_assignments where garden_day='2026-03-12';
select pg_temp.pair(pg_temp.flower('daisy'),'2026-03-14','2026-03-14 13:00+00','2026-03-14 13:01+00',jsonb_build_object('text','Same question next cycle','question_id',(select question_id from public.daisy_assignments where garden_day='2026-03-14')));
update public.flower_entries set daisy_assignment_day=garden_day where flower_id=pg_temp.flower('daisy') and garden_day='2026-03-14';
select pg_temp.pair(pg_temp.flower('hydrangea'),'2026-03-14','2026-03-14 13:00+00','2026-03-14 13:01+00','{"mood":"calm"}');
select pg_temp.at('2026-03-15 11:00+00');
select public.current_garden_state();
select is((select count(distinct daisy_question_id) from public.flower_day_facts where paired and type_key='daisy'),1::bigint,'repeated Daisy question across cycles remains one distinct identity');
select is((select count(distinct garden_day) from public.flower_day_facts where paired and type_key='hydrangea' and member1_mood=member2_mood),2::bigint,'Hydrangea evidence counts distinct matching days');

-- Milestone seam immediately retains same-milestone timing; it is not a growth
-- or negotiation API. Future trusted Peony implementation proves completion.
select throws_ok($$select private.record_peony_activity(pg_temp.flower('peony'),2::smallint,'2026-03-15 11:00+00','2026-03-15 11:00+00','2026-03-15 11:00+00')$$,'22023','Milestones must complete in order','cannot skip milestone');
select throws_ok($$select private.record_peony_activity(pg_temp.flower('rose'),1::smallint,'2026-03-15 11:00+00','2026-03-15 11:00+00','2026-03-15 11:00+00')$$,'22023','Unknown Peony','ordinary flower cannot forge milestone activity');
select throws_ok($$select private.record_peony_activity(pg_temp.flower('peony'),1::smallint,null,'2026-03-15 11:00+00','2026-03-15 11:00+00')$$,'22023','Invalid milestone activity','one member alone is not milestone activity');
select throws_ok($$select private.record_peony_activity(pg_temp.flower('peony'),1::smallint,'2026-03-15 11:01+00','2026-03-15 11:00+00','2026-03-15 11:00+00')$$,'22023','Invalid milestone activity','future original timestamp denied');
select lives_ok($$select private.record_peony_activity(pg_temp.flower('peony'),1::smallint,'2026-03-15 10:50+00','2026-03-15 11:00+00','2026-03-15 11:00+00')$$,'ordered milestone records immediate activity using completion day');
select lives_ok($$select private.record_peony_activity(pg_temp.flower('peony'),1::smallint,'2026-03-15 10:50+00','2026-03-15 11:00+00','2026-03-15 11:00+00')$$,'same milestone retry harmless');
select throws_ok($$select private.record_peony_activity(pg_temp.flower('peony'),1::smallint,'2026-03-15 10:51+00','2026-03-15 11:00+00','2026-03-15 11:00+00')$$,'22023','Milestone activity is immutable','retry cannot rewrite original pair');
select private.record_peony_activity(pg_temp.flower('peony'),2::smallint,'2026-03-15 11:00+00','2026-03-15 11:00+00','2026-03-15 11:00+00');
select is((select count(*) from public.peony_activity),2::bigint,'two milestones on one day remain two durable events');
select is((select growth_units from public.flowers where type_key='peony'),2::smallint,'activity seam does not invent progress');
select is((select member2_posted_at-member1_posted_at from public.peony_activity where milestone=1),interval '10 minutes','same milestone original pair retained for timing achievement');
select is((select garden_day from public.peony_activity where milestone=1),'2026-03-15'::date,'milestone credited to completion day even when first original precedes rollover');
select pg_temp.at('2026-03-16 11:00+00');
select public.current_garden_state();
select is((select streak from public.garden_days where garden_day='2026-03-15'),2::integer,'two milestones keep one shared streak day following paired day');
select ok((select qualifying_activity from public.garden_days where garden_day='2026-03-15'),'Peony-only day qualifies');

-- Recovery facts survive eventual bloom after repeated missed days. Generate
-- historical originals as privileged fixtures, with no backdating browser API.
select pg_temp.pair(pg_temp.flower('marigold'),d::date,timezone('America/Los_Angeles',d::date+time '10:00'),timezone('America/Los_Angeles',d::date+time '10:01'))
 from generate_series('2026-03-16'::date,'2026-03-20'::date,interval '1 day') d;
select pg_temp.at('2026-03-25 11:00+00');
select public.current_garden_state();
select is((select first_bloom_day from public.flowers where type_key='marigold'),'2026-03-20'::date,'eventual bloom preserves actual qualifying day across catch-up');
select is((select growth_units from public.flowers where type_key='marigold'),5::smallint,'intermediate bloom remains permanent across later missed days');
select ok(exists(select 1 from public.flower_day_facts where type_key='marigold' and growth_after<growth_before),'same recovered flower retains actual past loss facts');
select is((select count(*) from public.flower_day_facts where type_key='marigold' and first_bloom),1::bigint,'exactly one durable recovered bloom');
select ok(exists(select 1 from public.before_noon_snapshots where flower_id=pg_temp.flower('marigold') and garden_day='2026-03-20'),'blooming day retains eligible snapshot');
select ok(not exists(select 1 from public.before_noon_snapshots where flower_id=pg_temp.flower('marigold') and garden_day>'2026-03-20'),'late catch-up bloom excludes subsequent snapshots based on credit day');

-- Reset only disposable garden fixtures for independent DST and stale-action
-- cases. Auth identity stays synthetic and all changes roll back at file end.
create function pg_temp.fresh(p_now timestamptz) returns void language plpgsql as $$
begin
 delete from public.flower_day_facts;
 delete from public.before_noon_snapshots;
 delete from public.peony_activity;
 delete from public.garden_days;
 delete from public.flower_entries;
 delete from public.daisy_assignments;
 delete from public.flowers;
 delete from public.flower_unlocks;
 delete from public.garden;
 perform pg_temp.at(p_now);
 perform public.initialize_garden();
end $$;
select pg_temp.fresh('2026-10-30 11:00+00');
select public.plant_flower('rose');
select pg_temp.pair(pg_temp.flower('rose'),d::date,timezone('America/Los_Angeles',d::date+time '10:00'),timezone('America/Los_Angeles',d::date+time '10:01'))
 from generate_series('2026-10-30'::date,'2026-11-01'::date,interval '1 day') d;
select pg_temp.at('2026-11-02 12:00+00');
select public.current_garden_state();
select is((select count(*) from public.garden_days),3::bigint,'fall catch-up settles exactly three calendar days');
select is((select ends_at-starts_at from public.garden_days where garden_day='2026-10-31'),interval '25 hours','fall DST day lasts 25 elapsed hours');
select is((select growth_units from public.flowers where type_key='rose'),3::smallint,'fall repeated hour does not duplicate day growth');
select is((select current_streak from public.garden),3::integer,'fall calendar-day streak');
select ok(not exists(select 1 from public.garden_days where garden_day='2026-11-02'),'fall current day remains unsettled');

select pg_temp.fresh('2026-09-17 12:00+00');
select public.plant_flower_at('rose',12);
select public.plant_flower('rose');
select public.plant_flower('rose');
update public.flowers set growth_units=4 where spot=12;
select pg_temp.pair((select id from public.flowers where spot=12),'2026-09-17','2026-09-17 13:00+00','2026-09-17 13:01+00');
select pg_temp.at('2026-09-18 11:00+00');
set local role authenticated;
select throws_ok($$select public.submit_flower_entry((select id from public.flowers where spot=12),'{"text":"Too late"}')$$,'22023','This flower has already bloomed','submission settles overdue bloom before checking eligibility');
reset role;
select is((select count(*) from public.garden_days),0::bigint,'rejected transaction rolls its settlement back');
set local role authenticated;
select lives_ok($$select public.plant_flower_at('rose',8)$$,'planting settles first and releases unfinished capacity');
select is((select count(*) from public.flowers where type_key='rose' and first_bloom_at is null),3::bigint,'new planting preserves exact per-type unfinished cap');
select is((select spot from public.flowers where first_bloom_at is not null),12::bigint,'bloom retains selected permanent spot');
select throws_ok($$select public.plant_flower('rose')$$,'22023','Unfinished flower limit reached','settlement does not bypass caps');
select lives_ok($$select public.plant_flower('daisy')$$,'settlement first bloom makes newly unlocked type available');
reset role;
select is((select count(*) from public.garden_days),1::bigint,'successful mutation commits settlement exactly once');
select is((select count(*) from public.flower_entries where garden_day='2026-09-18'),0::bigint,'failed stale entry inserted no current-day content');
select is((select count(*) from public.daisy_assignments),0::bigint,'planting Daisy does not consume question before a request');
select public.current_garden_state();
select is((select count(*) from public.daisy_assignments),1::bigint,'garden read with live Daisy requests one shared question');
select is((public.current_garden_state()->>'server_now')::timestamptz,'2026-09-18 11:00+00'::timestamptz,'read model reports one authoritative operation instant');
select is((public.current_garden_state()->>'next_rollover_at')::timestamptz,'2026-09-19 11:00+00'::timestamptz,'read model next rollover correct');
select is(public.current_garden_state()->>'moonflower_open','false','read model has authoritative Moonflower availability');
select is((public.current_garden_state()->'garden'->>'current_streak')::integer,1,'read model exposes completed-day streak');
select is(jsonb_array_length(public.current_garden_state()->'plants'),6,'read model includes persistent plants and blooms');
select is(jsonb_array_length(public.current_garden_state()->'unlocks'),5,'read model includes permanent unlocks');
select ok(not exists(select 1 from jsonb_array_elements(public.current_garden_state()->'plants') p where p->>'server_now'<>public.current_garden_state()->>'server_now'),'all flower states share the same captured time');
select ok(public.current_garden_state()::text !~ 'example.test|11111111|22222222|google','read model contains no private identity configuration');
select pg_temp.at('2026-09-19 11:00+00');
select public.entry_history();
select is((select last_settled_day from public.garden),'2026-09-18'::date,'history path settles overdue days too');
select pg_temp.at('2026-09-20 11:00+00');
select public.get_daily_daisy_question();
select is((select last_settled_day from public.garden),'2026-09-19'::date,'question path settles overdue days too');
select pg_temp.at('2026-09-21 11:00+00');
select public.current_entry_state(pg_temp.flower('cactus'));
select is((select last_settled_day from public.garden),'2026-09-20'::date,'entry-state path settles overdue days too');
select pg_temp.at('2026-09-22 11:00+00');
select public.initialize_garden();
select is((select last_settled_day from public.garden),'2026-09-21'::date,'initialization path settles overdue days too');

-- Newly created at exactly 4 a.m. still joins tomorrow's snapshot. Neither
-- same-type/different-instance care nor one-person care makes a qualifying day.
select pg_temp.fresh('2026-09-17 11:00+00');
select public.plant_flower('rose');
select public.plant_flower('rose');
select is((select count(*) from public.before_noon_snapshots),0::bigint,'plants created exactly at 4 a.m. excluded from that start snapshot');
insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 select id,case when spot=3 then 2 else 1 end,planted_day,'2026-09-17 12:00+00','2026-09-17 12:00+00',case when type_key='cactus' then '{}'::jsonb else '{"text":"One member"}'::jsonb end from public.flowers;
select pg_temp.at('2026-09-18 11:00+00');
select public.current_garden_state();
select is((select current_streak from public.garden),0::integer,'unpaired care across different instances does not maintain streak');
select is((select sum(growth_units) from public.flowers),0::bigint,'same-type different-instance submissions do not pair');
select is((select count(*) from public.flower_day_facts where growth_after<growth_before),0::bigint,'staying at zero emits no recovery-relevant loss');
select is((select count(*) from public.before_noon_snapshots where garden_day='2026-09-18'),3::bigint,'following snapshot includes unbloomed Cactus and both Roses');
select pg_temp.pair(id,'2026-09-18','2026-09-18 18:59:59.999998+00','2026-09-18 18:59:59.999999+00',case when type_key='cactus' then '{}'::jsonb else '{"text":"Before noon"}'::jsonb end) from public.flowers;
select pg_temp.at('2026-09-19 11:00+00');
select public.current_garden_state();
select ok((select before_noon_complete from public.garden_days where garden_day='2026-09-18'),'all snapshot plants paired one microsecond before noon qualify');
select is((select current_streak from public.garden),1::integer,'next actual paired day restarts streak at one');
select is((select count(*) from public.daisy_assignments),0::bigint,'garden reads without a live Daisy never consume assignments');

-- Isolate Cactus activity from all ordinary growth so this detects losing
-- post-bloom streak credit, rather than being rescued by another paired flower.
select pg_temp.fresh('2026-09-17 11:00+00');
select private.record_first_bloom_at(pg_temp.flower('cactus'),'2026-09-17','2026-09-17 11:00+00');
select pg_temp.pair(pg_temp.flower('cactus'),'2026-09-17','2026-09-17 12:00+00','2026-09-17 12:10+00','{}');
select pg_temp.at('2026-09-18 11:00+00');
select public.current_garden_state();
select is((select current_streak from public.garden),1::integer,'post-bloom Cactus-only paired day qualifies');
select is((select growth_units from public.flowers),10::smallint,'post-bloom Cactus pair cannot grow beyond ten');
select is((select count(*) from public.flower_day_facts where first_bloom),0::bigint,'post-bloom Cactus pair does not emit another bloom');
select is((select count(*) from public.before_noon_snapshots),0::bigint,'bloomed Cactus excluded from next-day noon snapshot');
select public.submit_flower_entry(pg_temp.flower('cactus'),'{}');
select pg_temp.at('2026-09-19 11:00+00');
select public.current_garden_state();
select is((select current_streak from public.garden),0::integer,'single-person post-bloom Cactus check-in resets completed-day streak');
select is((select count(*) from public.flowers where first_bloom_at is not null),1::bigint,'Cactus retains exactly one total bloom credit');
select is((select count(*) from public.daisy_assignments),0::bigint,'unlocked Daisy without a plant does not consume questions');

select pg_temp.fresh('2025-01-01 12:00+00');
select public.plant_flower('rose');
update public.flowers set growth_units=2 where type_key='rose';
select pg_temp.at('2026-02-05 12:00+00');
select public.current_garden_state();
select is((select count(*) from public.garden_days),400::bigint,'400-day absence settles every calendar day once');
select is((select count(*) from public.flower_day_facts where growth_after<growth_before),2::bigint,'400-day absence produces only two actual decrements from stage two');
select is((select growth_units from public.flowers where type_key='rose'),0::smallint,'long absence never underflows stage zero');
select is((select qualifying_days from public.garden),0::bigint,'long empty absence invents no qualifying activity');
select public.current_garden_state();
select is((select count(*) from public.garden_days),400::bigint,'400-day replay idempotent');
select is((select count(*) from public.flower_day_facts),800::bigint,'long replay never duplicates instance/day facts');

-- Every authority remains server-only, protected by fixed-path guarded RPCs.
set local role authenticated;
select throws_ok('select public.current_garden_state(now())','42883',null,'no public clock argument');
select throws_ok('select public.current_garden_state(2)','42883',null,'no public actor argument');
select throws_ok('select private.settle_garden_at(now())','42501','permission denied for schema private','browser cannot settle invented history');
select throws_ok($$select private.record_peony_activity(null,1::smallint,now(),now(),now())$$,'42501','permission denied for schema private','browser cannot invent Peony activity');
select throws_ok('update public.'||t||' set '||c||'='||c,'42501','permission denied for table '||t,'browser cannot forge '||t)
 from (values ('garden_days','streak'),('flower_day_facts','growth_after'),('before_noon_snapshots','completed'),('peony_activity','milestone')) x(t,c);
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select throws_ok('select public.current_garden_state()','42501','Garden access denied','unrelated identity denied current garden');
select is_empty('select * from public.'||t,'outsider cannot read '||t) from (values ('garden_days'),('flower_day_facts'),('before_noon_snapshots'),('peony_activity')) x(t);
reset role;
set local role anon;
select throws_ok('select public.current_garden_state()','42501','permission denied for function current_garden_state','anonymous read denied');
reset role;
set local role service_role;
select throws_ok('select public.current_garden_state()','42501','permission denied for function current_garden_state','service API read denied');
select throws_ok('select * from public.garden_days','42501','permission denied for table garden_days','service API ledger denied');
reset role;
select ok(c.relrowsecurity,c.relname||' enables RLS') from pg_class c where c.oid in ('public.garden_days'::regclass,'public.flower_day_facts'::regclass,'public.before_noon_snapshots'::regclass,'public.peony_activity'::regclass);
select is_empty($$select p.oid from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid in ('private.begin_garden_operation()'::regprocedure,'private.settle_garden_at(timestamptz)'::regprocedure,'private.record_first_bloom_at(uuid,date,timestamptz)'::regprocedure,'private.capture_noon_snapshot(date)'::regprocedure,'private.entry_state_at(uuid,smallint,timestamptz)'::regprocedure,'private.record_peony_activity(uuid,smallint,timestamptz,timestamptz,timestamptz)'::regprocedure,'public.current_garden_state()'::regprocedure) and acl.grantee=0 and acl.privilege_type='EXECUTE'$$,'no PUBLIC execution grants');
select is_empty($$select p.oid from pg_proc p where p.oid in ('private.begin_garden_operation()'::regprocedure,'private.settle_garden_at(timestamptz)'::regprocedure,'private.record_first_bloom_at(uuid,date,timestamptz)'::regprocedure,'private.capture_noon_snapshot(date)'::regprocedure,'private.entry_state_at(uuid,smallint,timestamptz)'::regprocedure,'private.record_peony_activity(uuid,smallint,timestamptz,timestamptz,timestamptz)'::regprocedure,'public.current_garden_state()'::regprocedure) and not(p.proconfig @> array['search_path=pg_catalog'])$$,'all new routines have fixed safe search path');
select * from finish();
rollback;
