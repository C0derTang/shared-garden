-- New-garden settlement (issue #173): paired days add +1 at rollover, unpaired
-- days change nothing, no decay ever, first blooms recorded, ledger retained.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();
select has_table('public','v2_garden_days','completed days ledger');
select has_table('public','v2_flower_day_facts','per-flower day evidence');
select has_table('public','v2_before_noon_snapshots','before-noon eligibility');
select private.bootstrap_members('owner@example.test','member@example.test');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
 ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}');
insert into auth.identities(user_id,provider_id,provider,identity_data) values
 ('11111111-1111-4111-8111-111111111111','v2-owner','google','{"sub":"v2-owner","email":"owner@example.test","email_verified":true}'),
 ('22222222-2222-4222-8222-222222222222','v2-member','google','{"sub":"v2-member","email":"member@example.test","email_verified":true}');
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',case n when 1 then '11111111-1111-4111-8111-111111111111' else '22222222-2222-4222-8222-222222222222' end,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
$$;
create temporary table operation_definition as select pg_get_functiondef('private.v2_begin_garden_operation()'::regprocedure) definition;
create function pg_temp.at(p_now timestamptz) returns void language plpgsql security definer as $$
begin execute replace((select definition from operation_definition),'clock_timestamp()',quote_literal(p_now)||'::timestamptz'); end $$;
create function pg_temp.flower(p_type text) returns uuid language sql as $$select id from public.v2_flowers where type_key=p_type order by spot limit 1$$;
create function pg_temp.pair(p_flower uuid,p_day date,p_one timestamptz,p_two timestamptz,p_payload jsonb default '{"text":"Synthetic note"}') returns void language sql as $$
 insert into public.v2_flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 values (p_flower,1,p_day,p_one,p_one,p_payload),(p_flower,2,p_day,p_two,p_two,p_payload);
$$;
create function pg_temp.one(p_flower uuid,p_day date,p_author smallint,p_at timestamptz,p_payload jsonb default '{"text":"Synthetic note"}') returns void language sql as $$
 insert into public.v2_flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 values (p_flower,p_author,p_day,p_at,p_at,p_payload);
$$;
create function pg_temp.growth(p_type text) returns smallint language sql as $$select growth_units from public.v2_flowers where id=pg_temp.flower(p_type)$$;

-- Day 2026-03-05 (PST). Spring DST starts 2026-03-08.
select pg_temp.actor(1);
select pg_temp.at('2026-03-05 13:00+00');
select public.v2_current_garden_state();
select public.v2_plant_flower_at(t,n,case when t='dandelion' then 'A wish' end)
 from (values ('rose',1),('cactus',2),('marigold',3),('peony',4),('tulip',5),('dandelion',6)) x(t,n);

-- Real RPC pair on the Rose; one member alone on the Marigold and Tulip.
set local role authenticated;
select public.v2_submit_flower_entry(pg_temp.flower('rose'),'{"text":"Mine"}');
select public.v2_submit_flower_entry(pg_temp.flower('marigold'),'{"text":"Alone"}');
select public.v2_submit_flower_entry(pg_temp.flower('cactus'),'{}');
select pg_temp.actor(2);
select pg_temp.at('2026-03-05 13:05+00');
select public.v2_submit_flower_entry(pg_temp.flower('rose'),'{"text":"Yours"}');
select public.v2_submit_flower_entry(pg_temp.flower('tulip'),'{"title":"Song","artist":"Artist","url":"https://music.example.com/t/1"}');
select public.v2_submit_flower_entry(pg_temp.flower('cactus'),'{}');
select pg_temp.at('2026-03-06 11:59:59.999999+00');
select public.v2_current_garden_state();
reset role;
select is((select count(*) from public.v2_garden_days),0::bigint,'current day never settles before rollover');
select is(pg_temp.growth('rose'),0::smallint,'no growth before rollover');

select pg_temp.at('2026-03-06 12:00+00');
set local role authenticated;
select public.v2_current_garden_state();
reset role;
select is(pg_temp.growth('rose'),1::smallint,'paired day adds +1 at rollover');
select is(pg_temp.growth('cactus'),1::smallint,'paired Cactus grows');
select is(pg_temp.growth('marigold'),0::smallint,'one member alone changes nothing');
select is(pg_temp.growth('tulip'),0::smallint,'the other member alone changes nothing');
select is(pg_temp.growth('peony'),0::smallint,'Peony is not settled by daily pairs');
select is((select count(*) from public.v2_flower_day_facts where type_key='peony'),0::bigint,'Peony excluded from generic facts');
select is((select count(*) from public.v2_flower_day_facts where garden_day='2026-03-05'),5::bigint,'every other live flower has a fact');
select results_eq($$select paired,qualifying_activity,growth_before,growth_after,member2_posted_at-member1_posted_at from public.v2_flower_day_facts where flower_id=pg_temp.flower('rose')$$,
 $$values (true,true,0::smallint,1::smallint,interval '5 minutes')$$,'paired fact keeps original timestamps');
select results_eq($$select qualifying_activity,streak from public.v2_garden_days where garden_day='2026-03-05'$$,$$values (true,1)$$,'paired day qualifies once');
select is((select last_settled_day from public.v2_garden),'2026-03-05'::date,'settled through the completed day');
select public.v2_current_garden_state();
select is((select count(*) from public.v2_flower_day_facts),5::bigint,'repeated settlement adds no duplicate facts');
select is(pg_temp.growth('rose'),1::smallint,'repeated settlement adds no growth');

-- Long absence: nothing decays, ever.
update public.v2_flowers set growth_units=3 where id=pg_temp.flower('marigold');
select pg_temp.at('2026-03-12 13:00+00');
select public.v2_current_garden_state();
select is((select count(*) from public.v2_garden_days),7::bigint,'catch-up settles every completed day');
select is((select ends_at-starts_at from public.v2_garden_days where garden_day='2026-03-07'),interval '23 hours','spring DST garden day lasts 23 hours');
select is(pg_temp.growth('rose'),1::smallint,'Rose keeps growth through absence');
select is(pg_temp.growth('marigold'),3::smallint,'Marigold keeps growth through absence');
select is((select count(*) from public.v2_flower_day_facts where growth_after<growth_before),0::bigint,'no fact ever records a decrease');
select is((select current_streak from public.v2_garden),0::integer,'missed days reset the streak');
select is((select longest_streak from public.v2_garden),1::integer,'longest streak retained');
select is((select qualifying_days from public.v2_garden),1::bigint,'qualifying day count retained');

-- Bloom at target on the qualifying day; bloomed non-Cactus flowers leave settlement.
update public.v2_flowers set growth_units=4 where id=pg_temp.flower('rose');
update public.v2_flowers set growth_units=9 where id=pg_temp.flower('cactus');
update public.v2_flowers set growth_units=4 where id=pg_temp.flower('dandelion');
select pg_temp.pair(pg_temp.flower('rose'),'2026-03-12','2026-03-12 18:00+00','2026-03-12 18:10+00');
select pg_temp.pair(pg_temp.flower('cactus'),'2026-03-12','2026-03-12 18:00+00','2026-03-12 18:01+00','{}');
select pg_temp.pair(pg_temp.flower('dandelion'),'2026-03-12','2026-03-12 18:00+00','2026-03-12 18:01+00');
select pg_temp.one(pg_temp.flower('marigold'),'2026-03-12',2::smallint,'2026-03-12 18:00+00');
select pg_temp.at('2026-03-13 12:00+00');
select public.v2_current_garden_state();
select results_eq($$select growth_units,first_bloom_day,first_bloom_at from public.v2_flowers where id=pg_temp.flower('rose')$$,
 $$values (5::smallint,'2026-03-12'::date,'2026-03-13 12:00+00'::timestamptz)$$,'first bloom recorded for its qualifying day');
select is((select first_bloom_day from public.v2_flowers where id=pg_temp.flower('cactus')),'2026-03-12'::date,'Cactus blooms at its target');
select ok((select first_bloom from public.v2_flower_day_facts where flower_id=pg_temp.flower('rose') and garden_day='2026-03-12'),'bloom fact retained');
select is(pg_temp.growth('marigold'),3::smallint,'single-member day still changes nothing');
select is((select current_streak from public.v2_garden),1::integer,'paired day restarts the streak');

-- After bloom: Rose leaves settlement; bloomed Cactus keeps qualifying facts.
select pg_temp.pair(pg_temp.flower('cactus'),'2026-03-13','2026-03-13 18:00+00','2026-03-13 18:01+00','{}');
select pg_temp.pair(pg_temp.flower('rose'),'2026-03-13','2026-03-13 18:00+00','2026-03-13 18:01+00');
select pg_temp.at('2026-03-14 12:00+00');
select public.v2_current_garden_state();
select is(pg_temp.growth('cactus'),10::smallint,'bloomed Cactus never exceeds its target');
select ok((select qualifying_activity from public.v2_flower_day_facts where flower_id=pg_temp.flower('cactus') and garden_day='2026-03-13'),'bloomed Cactus pair still qualifies');
select is((select count(*) from public.v2_flower_day_facts where flower_id=pg_temp.flower('rose') and garden_day='2026-03-13'),0::bigint,'bloomed Rose leaves settlement');
select is((select first_bloom_day from public.v2_flowers where id=pg_temp.flower('rose')),'2026-03-12'::date,'first bloom is permanent');
select is((select current_streak from public.v2_garden),2::integer,'Cactus care extends the streak');

-- Planted-day pairs count; planted flowers join the next before-noon snapshot.
select pg_temp.at('2026-03-14 13:00+00');
select public.v2_plant_flower_at('rose',7);
select is((select count(*) from public.v2_before_noon_snapshots where garden_day='2026-03-14' and flower_id=(select id from public.v2_flowers where spot=7)),0::bigint,'new plant excluded from planting-day snapshot');
select pg_temp.pair((select id from public.v2_flowers where spot=7),'2026-03-14','2026-03-14 18:00+00','2026-03-14 18:01+00');
select pg_temp.at('2026-03-15 12:00+00');
select public.v2_current_garden_state();
select is((select growth_units from public.v2_flowers where spot=7),1::smallint,'planting-day pair grows');
select ok(not exists(select 1 from public.v2_before_noon_snapshots s join public.v2_flowers f on f.id=s.flower_id where f.type_key in ('moonflower','peony')),'Peony never enters a noon snapshot');
select is((select count(*) from public.v2_before_noon_snapshots where garden_day='2026-03-15' and flower_id=(select id from public.v2_flowers where spot=7)),1::bigint,'new plant joins the next day snapshot');

-- The legacy ledger is untouched.
select is((select count(*) from public.garden_days),0::bigint,'no legacy days settled');
select is((select count(*) from public.flower_day_facts),0::bigint,'no legacy facts');
select is((select count(*) from public.garden),0::bigint,'no legacy garden');
select * from finish();
rollback;
