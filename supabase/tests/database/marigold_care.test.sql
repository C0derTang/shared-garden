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
 ('11111111-1111-4111-8111-111111111111','planting-owner','google','{"sub":"planting-owner","email":"owner@example.test","email_verified":true}'),
 ('22222222-2222-4222-8222-222222222222','planting-member','google','{"sub":"planting-member","email":"member@example.test","email_verified":true}'),
 ('33333333-3333-4333-8333-333333333333','planting-outsider','google','{"sub":"planting-outsider","email":"outsider@example.test","email_verified":true}');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);

create temporary table marigold_clock as select pg_get_functiondef('private.begin_garden_operation()'::regprocedure) definition;
create function pg_temp.at(t timestamptz) returns void language plpgsql as $$
begin execute replace((select definition from marigold_clock),'clock_timestamp()',quote_literal(t)||'::timestamptz'); end $$;
create function pg_temp.flower(t text) returns uuid language sql stable as $$select id from public.flowers where type_key=t order by spot limit 1$$;
create function pg_temp.pair(p_flower uuid,p_day date,p_one timestamptz,p_two timestamptz,p_payload jsonb default '{"text":"Synthetic compliment"}') returns void language sql as $$
 insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 values (p_flower,1,p_day,p_one,p_one,p_payload),(p_flower,2,p_day,p_two,p_two,p_payload);
$$;
select pg_temp.at('2026-10-01 16:00Z');
select public.initialize_garden();
select public.plant_flower('marigold');
select public.plant_flower('rose');
-- Both bloom through settlement from one unit short of target.
update public.flowers set growth_units=case type_key when 'marigold' then 4 when 'rose' then 4 else growth_units end;
select pg_temp.pair(pg_temp.flower('marigold'),'2026-10-01','2026-10-01 20:00Z','2026-10-01 20:30Z');
select pg_temp.pair(pg_temp.flower('rose'),'2026-10-01','2026-10-01 20:00Z','2026-10-01 20:30Z');
select pg_temp.at('2026-10-02 16:00Z');
select public.current_garden_state();
select is((select first_bloom_day from public.flowers where type_key='marigold'),'2026-10-01'::date,'Marigold bloomed');
select is((select first_bloom_day from public.flowers where type_key='rose'),'2026-10-01'::date,'Rose bloomed');
select is((select current_streak from public.garden),1::integer,'bloom day qualifies');
-- Day 2: only the Marigold keeps taking care. A paired day extends the streak
-- without changing growth; the Rose stays closed and silent.
set local role authenticated;
select lives_ok($$select public.submit_flower_entry(pg_temp.flower('marigold'),'{"text":"Day two"}')$$,'bloomed Marigold accepts member 1');
select throws_ok($$select public.submit_flower_entry(pg_temp.flower('rose'),'{"text":"Day two"}')$$,'22023','This flower has already bloomed','bloomed Rose stays closed');
select is(public.current_entry_state(pg_temp.flower('marigold'))->>'member1_submitted','true','sheet reports today''s Marigold care');
reset role;
insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 values (pg_temp.flower('marigold'),2,'2026-10-02','2026-10-02 17:00Z','2026-10-02 17:00Z','{"text":"Day two back"}');
select pg_temp.at('2026-10-03 16:00Z');
select public.current_garden_state();
select is((select count(*) from public.flower_day_facts where type_key='marigold' and garden_day='2026-10-02'),1::bigint,'bloomed Marigold records a day fact');
select ok((select paired and qualifying_activity from public.flower_day_facts where type_key='marigold' and garden_day='2026-10-02'),'paired bloomed Marigold is qualifying activity');
select is((select growth_after from public.flower_day_facts where type_key='marigold' and garden_day='2026-10-02'),5::smallint,'bloomed Marigold growth stays at target');
select is((select count(*) from public.flower_day_facts where type_key='rose' and garden_day='2026-10-02'),0::bigint,'bloomed Rose records nothing');
select is((select current_streak from public.garden),2::integer,'Marigold pair extends the streak after bloom');
select is((select count(*) from public.before_noon_snapshots where garden_day='2026-10-03' and flower_id=pg_temp.flower('marigold')),0::bigint,'bloomed Marigold stays out of before-noon snapshots like the Cactus');
-- Day 3: a missed Marigold day never reduces growth and does not count.
select pg_temp.at('2026-10-04 16:00Z');
select public.current_garden_state();
select is((select growth_units from public.flowers where type_key='marigold'),5::smallint,'missed day after bloom never decays');
select ok(not (select paired from public.flower_day_facts where type_key='marigold' and garden_day='2026-10-03'),'missed day recorded unpaired');
select is((select current_streak from public.garden),0::integer,'missed day resets streak as for any care flower');
select is((select count(*) from public.flowers where type_key='marigold' and first_bloom_day is not null),1::bigint,'no repeated bloom credit');
select * from finish();
rollback;
