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
 ('11111111-1111-4111-8111-111111111111','settings-owner','google','{"sub":"settings-owner","email":"owner@example.test","email_verified":true}'),
 ('22222222-2222-4222-8222-222222222222','settings-member','google','{"sub":"settings-member","email":"member@example.test","email_verified":true}'),
 ('33333333-3333-4333-8333-333333333333','settings-outsider','google','{"sub":"settings-outsider","email":"outsider@example.test","email_verified":true}');
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',case n when 1 then '11111111-1111-4111-8111-111111111111' when 2 then '22222222-2222-4222-8222-222222222222' else '33333333-3333-4333-8333-333333333333' end,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
$$;
select pg_temp.actor(2);
set local role authenticated;
select is(public.current_member_settings(),'{"revision":0,"guide":"open","gentle_motion":true}'::jsonb,'second slot may arrive first with open guide');
reset role;
select is((select count(*) from public.garden),0::bigint,'settings read does not initialize garden');
select is((select count(*) from private.member_settings),0::bigint,'settings read creates no preference rows');
select ok((select relrowsecurity from pg_class where oid='private.member_settings'::regclass),'preferences have defense-in-depth RLS');
select ok(not exists(select 1 from pg_publication_tables where schemaname='private' and tablename='member_settings'),'private settings never published');
set local role authenticated;
select is(public.save_member_setting('{"guide":"skipped"}')->>'guide','skipped','explicit skip persists');
select is(public.save_member_setting('{"gentle_motion":false}'),'{"revision":2,"guide":"skipped","gentle_motion":false}'::jsonb,'motion update preserves guide');
select is(public.save_member_setting('{"guide":"open"}'),'{"revision":3,"guide":"open","gentle_motion":false}'::jsonb,'reopen preserves motion');
select is(public.save_member_setting('{"guide":"open"}')->>'revision','3','unchanged write does not increment');
select throws_ok($$select * from private.member_settings$$,'42501',null,'direct table reads denied');
select throws_ok($$update private.member_settings set gentle_motion=true$$,'42501',null,'direct writes denied');
select throws_ok($$select public.save_member_setting('{"guide":"finished","member_id":1}')$$,'22023',null,'reject spoofed actor');
select throws_ok($$select public.save_member_setting('{"cactus_checked_in":true}')$$,'22023',null,'reject action fact input');
select throws_ok($$select public.save_member_setting('{"guide":"open","gentle_motion":true}')$$,'22023',null,'reject multi-field stale overwrite');
select throws_ok($$select public.save_member_setting('{"gentle_motion":"false"}')$$,'22023',null,'reject nonboolean');
select throws_ok($$select public.save_member_setting('{"guide":"anything"}')$$,'22023',null,'reject unknown presentation state');
select throws_ok($$select public.save_member_setting('null')$$,'22023',null,'reject null');
select throws_ok($$select public.save_member_setting('[]')$$,'22023',null,'reject arrays');
reset role;
select pg_temp.actor(1);
set local role authenticated;
select is(public.current_member_settings(),'{"revision":0,"guide":"open","gentle_motion":true}'::jsonb,'other member cannot read partner preferences');
select is(public.save_member_setting('{"guide":"finished"}')->>'guide','finished','finish is only presentation');
select is(public.current_garden_state()->'tutorial_facts','{"cactus_checked_in":false,"rose_noted":false}'::jsonb,'finish never fabricates action facts');
select is((select count(*) from public.flower_entries),0::bigint,'finish creates no entries');
select is((select count(*) from public.flowers),1::bigint,'only permanent Cactus initialized');
select public.submit_flower_entry((select id from public.flowers where type_key='cactus'),'{}');
select public.plant_flower('rose');
select public.submit_flower_entry((select id from public.flowers where type_key='rose'),'{"text":"A synthetic note"}');
select is(public.current_garden_state()->'tutorial_facts','{"cactus_checked_in":true,"rose_noted":true}'::jsonb,'real own actions satisfy facts');
reset role;
-- Simulate a later day in a rolled-back fixture; no production clock override.
update public.flower_entries set garden_day=garden_day-1;
set local role authenticated;
select is(public.current_garden_state()->'tutorial_facts','{"cactus_checked_in":true,"rose_noted":true}'::jsonb,'retained earlier-day facts survive without current entries');
reset role;
select pg_temp.actor(2);
set local role authenticated;
select is(public.current_garden_state()->'tutorial_facts','{"cactus_checked_in":false,"rose_noted":false}'::jsonb,'partner actions are not own actions');
select is(public.current_member_settings(),'{"revision":3,"guide":"open","gentle_motion":false}'::jsonb,'member settings remain independent');
reset role;
select pg_temp.actor(3);
set local role authenticated;
select throws_ok($$select public.current_member_settings()$$,'42501',null,'outsider read denied');
select throws_ok($$select public.save_member_setting('{"guide":"open"}')$$,'42501',null,'outsider write denied');
reset role;
select pg_temp.actor(1);
update private.garden_members set revoked_at=now() where member_id=1;
set local role authenticated;
select throws_ok($$select public.current_member_settings()$$,'42501',null,'revoked caller read denied');
select throws_ok($$select public.save_member_setting('{"guide":"open"}')$$,'42501',null,'revoked caller write denied');
reset role;
set local role anon;
select throws_ok($$select public.current_member_settings()$$,'42501',null,'anonymous RPC denied');
select throws_ok($$select public.save_member_setting('{"guide":"open"}')$$,'42501',null,'anonymous setter denied');
reset role;
select * from finish();
rollback;
