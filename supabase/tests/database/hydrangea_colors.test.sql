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

create temporary table hydrangea_clock as select pg_get_functiondef('private.begin_garden_operation()'::regprocedure) definition;
create function pg_temp.at(t timestamptz) returns void language plpgsql as $$
begin execute replace((select definition from hydrangea_clock),'clock_timestamp()',quote_literal(t)||'::timestamptz'); end $$;
select pg_temp.at('2026-10-01 16:00Z');
select public.initialize_garden();
insert into public.flower_unlocks(type_key) values('hydrangea') on conflict do nothing;
select public.plant_flower('hydrangea');
select public.plant_flower('rose');
create function pg_temp.flower(t text) returns uuid language sql stable as $$select id from public.flowers where type_key=t order by spot limit 1$$;
-- A real final pair starts at six and blooms through settlement. Keep original
-- times more than ten minutes apart so later optional pairs cannot hide a leak.
update public.flowers set growth_units=6 where type_key='hydrangea';
set local role authenticated;
select public.submit_flower_entry(pg_temp.flower('hydrangea'),' {"mood":"calm"}');
select is(public.current_entry_state(pg_temp.flower('hydrangea'))->'hydrangea_moods','["calm",null]'::jsonb,'one saved color and neutral missing member');
reset role;
select pg_temp.at('2026-10-01 16:31Z');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth"}]}',true);
set local role authenticated;
select public.submit_flower_entry(pg_temp.flower('hydrangea'),'{"mood":"calm"}');
reset role;
select pg_temp.at('2026-10-02 16:00Z');
select public.current_garden_state();
select is((select growth_units from public.flowers where type_key='hydrangea'),7::smallint,'paired care reaches seven');
select is((select first_bloom_day from public.flowers where type_key='hydrangea'),'2026-10-01'::date,'bloom credit belongs to final growing day');
select is((select progress from public.achievement_progress where achievement_id='mood-match-3'),1,'pre-bloom final matching pair still counts');
select is(public.current_entry_state(pg_temp.flower('hydrangea'))->'hydrangea_moods','["calm","calm"]'::jsonb,'saved colors persist after rollover');
select is(public.current_entry_state(pg_temp.flower('hydrangea'))->>'member1_submitted','false','held color is not today care');
set local role authenticated;
select lives_ok($$select public.submit_flower_entry(pg_temp.flower('hydrangea'),'{"mood":"tense"}')$$,'member two can choose after bloom');
select throws_ok($$select public.submit_flower_entry(pg_temp.flower('hydrangea'),'{"mood":"low"}')$$,'22023','Already submitted; edit the original entry','post-bloom daily uniqueness remains');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select lives_ok($$select public.submit_flower_entry(pg_temp.flower('hydrangea'),'{"mood":"tense"}')$$,'member one can choose after bloom');
select throws_ok($$select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('hydrangea') and garden_day='2026-10-02' and author_id=2),'{"mood":"low"}')$$,'42501','Only the author can edit this entry','partner cannot edit optional original');
select lives_ok($$select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('hydrangea') and garden_day='2026-10-02' and author_id=1),'{"mood":"joyful"}')$$,'optional original editable by author');
select is(public.current_entry_state(pg_temp.flower('hydrangea'))->'hydrangea_moods','["joyful","tense"]'::jsonb,'latest edited choices retain fixed member ordering');
select is((select count(*) from public.entry_history(pg_temp.flower('hydrangea'))),4::bigint,'all pre and post-bloom originals remain in history');
reset role;
select private.evaluate_achievements('2026-10-02 16:00Z');
select is((select progress from public.achievement_progress where achievement_id='ten-minutes'),0,'later evaluation never credits optional pairs');
select pg_temp.at('2026-10-02 16:30:00.001Z');
set local role authenticated;
select throws_ok($$select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('hydrangea') and garden_day='2026-10-02' and author_id=1),'{"mood":"low"}')$$,'22023','The edit window has ended','optional edit window remains thirty minutes');
reset role;
update public.flowers set first_bloom_at='2026-10-02 11:00Z',first_bloom_day='2026-10-01',growth_units=5 where type_key='rose';
set local role authenticated;
select throws_ok($$select public.submit_flower_entry(pg_temp.flower('rose'),'{"text":"No"}')$$,'22023','This flower has already bloomed','other ordinary blooms stay closed');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select throws_ok($$select public.submit_flower_entry(pg_temp.flower('hydrangea'),'{"mood":"low"}')$$,'42501','Garden access denied','outsider cannot submit optional colors');
select throws_ok($$select public.current_entry_state(pg_temp.flower('hydrangea'))$$,'42501','Garden access denied','outsider cannot read saved colors');
reset role;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select pg_temp.at('2026-10-04 16:00Z');
select public.current_garden_state();
select is((select growth_units from public.flowers where type_key='hydrangea'),7::smallint,'optional and skipped days preserve permanent growth');
select is((select count(*) from public.flower_day_facts where type_key='hydrangea'),1::bigint,'optional days never create growth, recovery or matching-mood facts');
select is((select current_streak from public.garden),0,'optional pair does not keep streak alive');
select is((select qualifying_days from public.garden),1::bigint,'only the real growing pair qualifies');
select is((select progress from public.achievement_progress where achievement_id='mood-match-3'),1,'no optional matching-mood credit');
select is((select progress from public.achievement_progress where achievement_id='ten-minutes'),0,'no retroactive optional timing credit');
select is((select count(*) from public.before_noon_snapshots where flower_id=pg_temp.flower('hydrangea') and garden_day>'2026-10-01'),0::bigint,'optional plant excluded from before-noon requirements');
select is(public.current_entry_state(pg_temp.flower('hydrangea'))->'hydrangea_moods','["joyful","tense"]'::jsonb,'both colors survive multiple skipped days');
select * from finish();
rollback;
