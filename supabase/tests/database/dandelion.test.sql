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
create function pg_temp.flower() returns uuid language sql as $$select id from public.flowers where type_key='dandelion' order by spot desc limit 1$$;
select public.initialize_garden();
insert into public.flower_unlocks(type_key) values('dandelion');
select public.plant_flower('dandelion','Watch the sunrise');
set local role authenticated;
select throws_ok($$select public.fulfill_dandelion(null)$$,'22023','Unknown Dandelion','null fails closed');
select throws_ok($$select public.fulfill_dandelion('99999999-9999-4999-8999-999999999999')$$,'22023','Unknown Dandelion','unknown fails closed');
select throws_ok($$select public.fulfill_dandelion((select id from public.flowers where type_key='cactus'))$$,'22023','Unknown Dandelion','type guard');
select throws_ok($$select public.fulfill_dandelion(pg_temp.flower())$$,'22023','The wish must bloom before fulfillment','bloom guard');
reset role;
update public.flowers set growth_units=5,first_bloom_at=clock_timestamp(),first_bloom_day=current_date where id=pg_temp.flower();
create temporary table before_fulfillment as select to_jsonb(f) value from public.flowers f;
set local role authenticated;
select pg_temp.actor(2);
select lives_ok($$select public.fulfill_dandelion(pg_temp.flower())$$,'either member may fulfill');
select is((select fulfilled_by from public.flowers where id=pg_temp.flower()),2::smallint,'actual actor retained');
select ok((select fulfilled_at is not null from public.flowers where id=pg_temp.flower()),'trusted timestamp stored');
reset role;
create temporary table first_result as select public.fulfill_dandelion(pg_temp.flower()) value;
grant select on first_result to authenticated;
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.at(clock_timestamp()+interval '2 days');
select is(public.fulfill_dandelion(pg_temp.flower()),(select value from first_result),'repeat from other member returns identical durable fact');
select is((public.current_entry_state(pg_temp.flower())->'flower'->>'fulfilled_by')::integer,2,'partner snapshot includes fulfillment');
select throws_ok($$update public.flowers set fulfilled_at=null where id=pg_temp.flower()$$,'42501',null,'direct write denied');
select pg_temp.actor(3);
select throws_ok($$select public.fulfill_dandelion(pg_temp.flower())$$,'42501',null,'outsider cannot fulfill even completed wish');
reset role;
select is((select count(*) from public.flowers),(select count(*) from before_fulfillment),'no extra plants');
select ok(not exists(select 1 from public.flowers f join before_fulfillment b on b.value->>'id'=f.id::text where to_jsonb(f)-'fulfilled_at'-'fulfilled_by' <> b.value-'fulfilled_at'-'fulfilled_by'),'wish, spot, growth and bloom unchanged');
select throws_ok($$update public.flowers set fulfilled_by=1 where type_key='cactus'$$,'23514',null,'fact constrained to bloomed Dandelion with actor/time pair');
set local role anon;
select throws_ok($$select public.fulfill_dandelion('99999999-9999-4999-8999-999999999999')$$,'42501',null,'anonymous execution denied');
reset role;
select * from finish();
rollback;
