-- New-garden Memories (issue #177): the legacy memories_page contract over v2
-- entries, wishes and Peony bundles only; legacy content never appears.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();
select has_function('public','v2_memories_page',array['text','jsonb','text[]','text','integer','date','date','integer'],'v2 memories page');
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
create function pg_temp.flower(p_type text) returns uuid language sql stable as $$select id from public.v2_flowers where type_key=p_type order by spot limit 1$$;
create function pg_temp.page(p_mode text default 'latest',p_cursor jsonb default null,p_keys text[] default null,p_type text default null,
 p_spot integer default null,p_from date default null,p_to date default null,p_author integer default null) returns jsonb language sql as $$
 select public.v2_memories_page(p_mode,p_cursor,p_keys,p_type,p_spot,p_from,p_to,p_author) $$;
create function pg_temp.keys(p jsonb) returns text[] language sql as $$select coalesce(array_agg(i->>'key' order by o),'{}') from jsonb_array_elements(p->'items') with ordinality x(i,o)$$;

-- Legacy content exists but must never appear in the new garden's Memories.
select pg_temp.actor(1);
select public.initialize_garden();
select public.submit_flower_entry((select id from public.flowers where type_key='cactus'),'{}');

-- Garden day 2026-11-02 (PST): real v2 operations by both members.
select pg_temp.at('2026-11-02 18:00+00');
set local role authenticated;
select public.v2_plant_flower_at('rose',1);
select public.v2_plant_flower_at('dandelion',2,'A shared synthetic wish');
select public.v2_plant_flower_at('peony',3);
select public.v2_plant_flower_at('daisy',4);
select public.v2_plant_flower_at('hydrangea',5);
select public.v2_current_garden_state(); -- assigns today's Daisy question
select public.v2_submit_flower_entry(pg_temp.flower('rose'),'{"text":"Owner note"}');
select public.v2_submit_flower_entry(pg_temp.flower('hydrangea'),'{"mood":"calm","mood2":"tense","note":"mixed"}');
select public.v2_submit_flower_entry(pg_temp.flower('daisy'),jsonb_build_object('text','Owner answer','question_id',(select question_id from public.v2_daisy_assignments where garden_day='2026-11-02')));
select public.v2_submit_peony_contribution(pg_temp.flower('peony'),1,'{"text":"Owner idea"}');
select pg_temp.actor(2);
select pg_temp.at('2026-11-02 18:05+00');
select public.v2_submit_flower_entry(pg_temp.flower('rose'),'{"text":"Member note"}');
select public.v2_submit_peony_contribution(pg_temp.flower('peony'),1,'{"text":"Member idea"}');
select public.v2_set_peony_plan(pg_temp.flower('peony'),0,'Synthetic picnic','2026-11-08T12:00:00-08:00');

create temporary table latest as select pg_temp.page() value;
grant select on latest to authenticated;
select is((select jsonb_array_length(value->'items') from latest),6,'entries, wish and Peony bundle listed');
select is((select value->>'more' from latest),'false','single page');
select ok((select bool_and((i->'flower'->>'id')::uuid in (select id from public.v2_flowers)) from latest,jsonb_array_elements(value->'items') i),'every item belongs to a v2 flower');
select ok(not exists(select 1 from latest,jsonb_array_elements(value->'items') i where (i->'flower'->>'id')::uuid in (select id from public.flowers)),'no legacy flower appears');
select is((select count(*) from latest,jsonb_array_elements(value->'items') i where i->>'kind'='entry'),4::bigint,'four v2 entries');
select results_eq($$select i->'entry'->'payload' from latest,jsonb_array_elements(value->'items') i where i->'flower'->>'type_key'='hydrangea'$$,
 $$values ('{"mood":"calm","mood2":"tense","note":"mixed"}'::jsonb)$$,'Hydrangea pick shape kept');
select is((select i->'entry'->>'question' from latest,jsonb_array_elements(value->'items') i where i->'flower'->>'type_key'='daisy'),
 (select prompt from public.v2_daisy_assignments where garden_day='2026-11-02'),'Daisy prompt from the v2 assignment');
select results_eq($$select i->>'kind',i->'flower'->>'shared_wish' from latest,jsonb_array_elements(value->'items') i where i->'flower'->>'type_key'='dandelion'$$,
 $$values ('wish','A shared synthetic wish')$$,'wish item');
select results_eq($$select jsonb_array_length(i->'peony'->'contributions'),jsonb_array_length(i->'peony'->'completed'),i->'peony'->'plan'->>'activity',i->'peony'->'plan'->>'version'
 from latest,jsonb_array_elements(value->'items') i where i->>'kind'='peony'$$,
 $$values (2,1,'Synthetic picnic','1')$$,'Peony bundle has contributions, completed milestones and plan');
select ok((select bool_and(i->>'key'=(i->>'kind')||':'||(i->>'source_id')) from latest,jsonb_array_elements(value->'items') i),'stable keys');

-- Filters.
select is(jsonb_array_length(pg_temp.page(p_type=>'rose')->'items'),2,'type filter');
select is(jsonb_array_length(pg_temp.page(p_spot=>2)->'items'),1,'spot filter');
select is(jsonb_array_length(pg_temp.page(p_author=>2)->'items'),2,'member filter: entry and Peony contributor');
select is(jsonb_array_length(pg_temp.page(p_author=>1)->'items'),5,'owner filter: entries, wish planter and Peony contributor');
select is(jsonb_array_length(pg_temp.page(p_from=>'2026-11-03')->'items'),0,'date range filter');
select is(jsonb_array_length(pg_temp.page(p_type=>'cactus')->'items'),0,'v2 has no Cactus entries though legacy does');
select throws_ok($$select pg_temp.page(p_type=>'lily')$$,'22023','Invalid memories query','unknown type rejected');
select throws_ok($$select pg_temp.page(p_mode=>'sideways')$$,'22023','Invalid memories query','unknown mode rejected');
select throws_ok($$select pg_temp.page(p_from=>'2026-11-03',p_to=>'2026-11-02')$$,'22023','Invalid memories query','inverted range rejected');
select throws_ok($$select pg_temp.page(p_author=>3)$$,'22023','Invalid memories query','unknown member rejected');
select throws_ok($$select pg_temp.page('older','{"at":"bad","kind":"entry","id":"1"}')$$,'22023','Invalid memories cursor','invalid cursor rejected');
select throws_ok($$select pg_temp.page('updates',null,array['entry:0'])$$,'22023','Invalid memories update batch','invalid update key rejected');

-- Updates refresh only the requested v2 bundles.
select is(pg_temp.keys(pg_temp.page('updates',null,array['peony:'||pg_temp.flower('peony'),'wish:'||pg_temp.flower('dandelion')])),
 array['wish:'||pg_temp.flower('dandelion'),'peony:'||pg_temp.flower('peony')],'updates mode returns requested bundles in page order');
select is(jsonb_array_length(pg_temp.page('updates',null,array['entry:'||(select max(id) from public.flower_entries)+1000])->'items'),0,'unknown keys return nothing');

-- Cursor pagination over more than one page.
reset role;
insert into public.v2_flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 select pg_temp.flower('rose'),1,'2026-10-01'::date+d,'2026-10-01 20:00Z'::timestamptz+make_interval(days=>d),'2026-10-01 20:00Z'::timestamptz+make_interval(days=>d),'{"text":"Older note"}'
 from generate_series(0,19) d;
set local role authenticated;
create temporary table first_page as select pg_temp.page() value;
select is((select jsonb_array_length(value->'items') from first_page),20,'page size is 20');
select is((select value->>'more' from first_page),'true','more items exist');
create temporary table second_page as select pg_temp.page('older',
 (select jsonb_build_object('at',i->>'at','kind',i->>'kind','id',i->>'source_id') from first_page,jsonb_array_elements(value->'items') with ordinality x(i,o) where o=20)) value;
select is((select jsonb_array_length(value->'items') from second_page),6,'older page continues');
select is((select value->>'more' from second_page),'false','older page ends');
select is((select count(distinct k) from (select unnest(pg_temp.keys(value)) k from first_page union all select unnest(pg_temp.keys(value)) from second_page) x),26::bigint,'pages neither overlap nor skip');
select is(jsonb_array_length(pg_temp.page('newer',
 (select jsonb_build_object('at',i->>'at','kind',i->>'kind','id',i->>'source_id') from second_page,jsonb_array_elements(value->'items') with ordinality x(i,o) where o=1))->'items'),20,'newer pages ascend from a cursor');

-- The legacy Memories page never shows v2 content.
select ok(not exists(select 1 from jsonb_array_elements(public.memories_page()->'items') i where (i->'flower'->>'id')::uuid in (select id from public.v2_flowers)),'legacy memories exclude v2 content');

-- Access.
select pg_temp.actor(3);
select throws_ok($$select public.v2_memories_page()$$,'42501','Garden membership required','outsider denied');
select is_empty('select * from public.v2_flower_entries','outsider reads no v2 entries');
reset role;
set local role anon;
select throws_ok($$select public.v2_memories_page()$$,'42501',null,'anonymous denied');
reset role;
set local role service_role;
select throws_ok($$select public.v2_memories_page()$$,'42501',null,'service role denied');
reset role;
select is((select provolatile from pg_proc where oid='public.v2_memories_page(text,jsonb,text[],text,integer,date,date,integer)'::regprocedure),'s','read-only stable function');
select is((select prosecdef from pg_proc where oid='public.v2_memories_page(text,jsonb,text[],text,integer,date,date,integer)'::regprocedure),false,'runs as the caller under RLS');
select * from finish();
rollback;
