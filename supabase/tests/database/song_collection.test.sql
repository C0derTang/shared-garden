begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
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
select public.initialize_garden();

-- Synthetic historical evidence: three permanent Tulips, seven pairs each.
insert into public.flowers(type_key,spot,planted_at,planted_day,planted_by,growth_units,first_bloom_at,first_bloom_day)
select 'tulip',n+1,'2026-08-01'::timestamptz,'2026-08-01'::date,1,7,'2026-08-09'::timestamptz,'2026-08-09'::date from generate_series(1,3) n;
insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
select f.id,a, '2026-08-01'::date+d, '2026-08-01 17:00Z'::timestamptz+d*interval '1 day', '2026-08-01 17:00Z'::timestamptz+d*interval '1 day',
 '{"title":"Repeat song","artist":"Synthetic artist","url":"https://example.test/song"}'::jsonb
from public.flowers f cross join generate_series(1,2) a cross join generate_series(0,6) d where f.type_key='tulip';
create temporary table song_cursor as select id from public.flower_entries order by id desc offset 19 limit 1;
grant select on song_cursor to authenticated;
set local role authenticated;
select is((select count(*) from public.flower_entries e join public.flowers f on f.id=e.flower_id where f.type_key='tulip'),42::bigint,'owner sees 42 repeated contributions across three permanent blooms');
select is((select count(distinct e.author_id) from public.flower_entries e join public.flowers f on f.id=e.flower_id where f.type_key='tulip'),2::bigint,'both author markers retained');
select is((select count(*) from (select e.id from public.flower_entries e join public.flowers f on f.id=e.flower_id where f.type_key='tulip' and e.id<(select id from song_cursor) order by e.id desc limit 20) page),20::bigint,'exclusive cursor returns next bounded page');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select is((select count(*) from public.flower_entries e join public.flowers f on f.id=e.flower_id where f.type_key='tulip'),42::bigint,'partner immediately sees all songs');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select is((select count(*) from public.flower_entries e join public.flowers f on f.id=e.flower_id where f.type_key='tulip'),0::bigint,'outsider cannot read collection');
reset role;
update private.garden_members set revoked_at=now() where member_id=1;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);
set local role authenticated;
select is((select count(*) from public.flower_entries e join public.flowers f on f.id=e.flower_id where f.type_key='tulip'),0::bigint,'revoked member cannot read collection with existing JWT');
reset role;
set local role anon;
select throws_ok($$select e.id from public.flower_entries e join public.flowers f on f.id=e.flower_id where f.type_key='tulip'$$,'42501',null,'anonymous collection read denied');
reset role;
select * from finish();
rollback;
