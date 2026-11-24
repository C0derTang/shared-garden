-- New-garden core (issue #173): planting without restrictions, entries, edits,
-- replies, Dandelion fulfilment, member-only access and legacy isolation.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();
select has_table('public','v2_garden','new garden singleton');
select has_table('public','v2_flowers','new garden flowers');
select has_table('public','v2_flower_entries','new garden entries');
select has_table('public','v2_entry_replies','new garden replies');
select has_table('public','v2_daisy_assignments','new garden Daisy assignments');
select has_function('public','v2_current_garden_state',array[]::text[],'authoritative v2 read');
select has_function('public','v2_plant_flower_at',array['text','numeric','text'],'v2 planting');
select has_function('public','v2_submit_flower_entry',array['uuid','jsonb'],'v2 submission');
select has_function('public','v2_edit_flower_entry',array['bigint','jsonb'],'v2 edit');
select has_function('public','v2_fulfill_dandelion',array['uuid'],'v2 Dandelion fulfilment');
select has_function('public','v2_entry_history',array['uuid','integer','bigint'],'v2 history');
select has_function('public','v2_reply_to_entry',array['bigint','text','uuid'],'v2 replies');
select has_function('public','v2_entry_reply_history',array['bigint','integer','bigint'],'v2 reply history');
select is((select count(*) from public.v2_garden),0::bigint,'migration creates no garden activity');

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
-- Only this rolled-back transaction replaces the operation's literal clock.
create temporary table operation_definition as select pg_get_functiondef('private.v2_begin_garden_operation()'::regprocedure) definition;
create function pg_temp.at(p_now timestamptz) returns void language plpgsql security definer as $$
begin execute replace((select definition from operation_definition),'clock_timestamp()',quote_literal(p_now)||'::timestamptz'); end $$;
create function pg_temp.flower(p_type text) returns uuid language sql stable as $$select id from public.v2_flowers where type_key=p_type order by spot limit 1$$;
create function pg_temp.entry(p_type text,p_author integer) returns bigint language sql stable as $$
 select e.id from public.v2_flower_entries e join public.v2_flowers f on f.id=e.flower_id where f.type_key=p_type and e.author_id=p_author order by e.id desc limit 1$$;

-- 2026-11-02 05:00 Pacific (PST), garden day 2026-11-02.
select pg_temp.at('2026-11-02 13:00+00');
select pg_temp.actor(3);
set local role authenticated;
select throws_ok('select public.v2_current_garden_state()','42501','Garden access denied','outsider cannot open the new garden');
select throws_ok($$select public.v2_plant_flower_at('rose',1)$$,'42501','Garden access denied','outsider cannot plant');
reset role;
select is((select count(*) from public.v2_garden),0::bigint,'denied call leaves no garden');

select pg_temp.actor(1);
create temporary table first_state as select public.v2_current_garden_state() value;
grant select on first_state to authenticated;
set local role authenticated;
select is((select jsonb_array_length(value->'plants') from first_state),0,'new garden starts empty with no initial Cactus');
select results_eq($$select next_spot,spot_capacity,last_settled_day,initialized_at from public.v2_garden$$,
 $$values (1::bigint,12::bigint,'2026-11-01'::date,'2026-11-02 13:00+00'::timestamptz)$$,'first operation initializes the singleton under the lock');
select is((select jsonb_array_length(value->'catalog') from first_state),13,'all 13 types are offered');
select ok((select bool_and(not (c ? 'unfinished_limit') and not (c ? 'unlock_after_blooms')) from first_state,jsonb_array_elements(value->'catalog') c),'catalog omits legacy limits and unlock thresholds');
select ok(not ((select value from first_state) ? 'unlocks'),'no unlock state exists');

-- Every type is plantable immediately in catalog order, filling the first bed.
select lives_ok(format('select public.v2_plant_flower_at(%L,%s,%L)',type_key,n,case when type_key='dandelion' then '  A shared wish  ' end),'plant '||type_key||' at spot '||n)
 from (select type_key,row_number() over(order by unlock_after_blooms,type_key) n from public.flower_catalog) c where n<=12;
select results_eq($$select next_spot,spot_capacity from public.v2_garden$$,$$values (13::bigint,24::bigint)$$,'a full bed exposes exactly one more bed');
select throws_ok($$select public.v2_plant_flower_at('rose',25)$$,'22023','Invalid planting spot','spots beyond the visible beds are rejected');
select lives_ok($$select public.v2_plant_flower_at((select type_key from public.flower_catalog order by unlock_after_blooms desc,type_key desc limit 1),13)$$,'thirteenth type planted in the new bed');
select is((select count(distinct type_key) from public.v2_flowers),13::bigint,'all 13 types planted from the start');
select lives_ok($$select public.v2_plant_flower_at('cactus',14)$$,'a second Cactus is allowed');
select lives_ok($$select public.v2_plant_flower_at('cactus',15)$$,'a third Cactus is allowed');
select lives_ok(format('select public.v2_plant_flower_at(%L,%s)','rose',n),'unlimited unfinished Roses '||n) from generate_series(16,20) n;
select is((select count(*) from public.v2_flowers where type_key='cactus'),3::bigint,'many Cacti coexist');
select is((select count(*) from public.v2_flowers where type_key='rose' and first_bloom_at is null),6::bigint,'no per-type unfinished limit');
select is((select shared_wish from public.v2_flowers where type_key='dandelion'),'A shared wish','wish is trimmed');
select lives_ok($$select public.v2_plant_flower_at('tulip',23)$$,'any empty visible spot may be selected');
select is((select next_spot from public.v2_garden),21::bigint,'next spot remains the lowest empty spot');
select throws_ok($$select public.v2_plant_flower_at('rose',2)$$,'22023','Planting spot is occupied','occupied spot rejected');
select throws_ok($$select public.v2_plant_flower_at('rose',0)$$,'22023','Invalid planting spot','zero spot rejected');
select throws_ok($$select public.v2_plant_flower_at('rose',21.5)$$,'22023','Invalid planting spot','fractional spot rejected');
select throws_ok($$select public.v2_plant_flower_at('rose',null)$$,'22023','Invalid planting spot','missing spot rejected');
select throws_ok($$select public.v2_plant_flower_at('unknown',21)$$,'22023','Unknown flower type','unknown type rejected');
select throws_ok($$select public.v2_plant_flower_at(null,21)$$,'22023','Unknown flower type','null type rejected');
select throws_ok($$select public.v2_plant_flower_at('rose',21,'wish')$$,'22023','Only Dandelion accepts a shared wish','ordinary flower cannot carry a wish');
select throws_ok($$select public.v2_plant_flower_at('dandelion',21,'   ')$$,'22023','Dandelion needs a shared wish of 1 to 500 characters','blank wish rejected');
select throws_ok($$select public.v2_plant_flower_at('dandelion',21,repeat('w',501))$$,'22023','Dandelion needs a shared wish of 1 to 500 characters','oversized wish rejected');
select throws_ok($$select public.v2_plant_flower_at(p_type_key=>'rose',p_spot=>21,p_planted_by=>2::smallint)$$,'42883',null,'no client actor argument');
select throws_ok($$select public.v2_plant_flower_at(p_type_key=>'rose',p_spot=>21,p_seed=>1)$$,'42883',null,'no client seed argument');
select results_eq($$select bool_and(planted_by=1 and growth_units=0 and planted_at='2026-11-02 13:00+00' and planted_day='2026-11-02') from public.v2_flowers$$,
 $$values (true)$$,'server derives planter, time, day and zero growth');
select ok((select bool_and(seed between 0 and 9007199254740991) from public.v2_flowers),'every seed is a JavaScript-safe nonnegative integer');
select is((select count(distinct seed) from public.v2_flowers),(select count(*) from public.v2_flowers),'every flower has its own seed');
reset role;
create temporary table seeds as select id,seed from public.v2_flowers;
grant select on seeds to authenticated;
set local role authenticated;
select pg_temp.actor(2);
select lives_ok($$select public.v2_plant_flower_at('marigold',21)$$,'partner can plant');
select is((select planted_by from public.v2_flowers where spot=21),2::smallint,'partner planting derives member two');
select throws_ok($$insert into public.v2_flowers(type_key,spot,seed,planted_at,planted_day,planted_by) values('rose',30,1,now(),current_date,1)$$,'42501',null,'direct planting denied');
select throws_ok($$update public.v2_flowers set seed=1$$,'42501',null,'seed cannot be rewritten by members');
select throws_ok($$update public.v2_garden set next_spot=1$$,'42501',null,'garden state cannot be rewritten');

-- Entries: first submission per member/flower/day counts.
select pg_temp.actor(1);
select lives_ok(format('select public.v2_submit_flower_entry(%L,%L)',pg_temp.flower(t),'{"text":"  A daily thought  "}'),'accepts '||t)
 from (values ('rose'),('marigold'),('snapdragon'),('dandelion'),('forget-me-not')) x(t);
select lives_ok($$select public.v2_submit_flower_entry(pg_temp.flower('cactus'),'{}')$$,'Cactus accepts one tap');
select lives_ok($$select public.v2_submit_flower_entry(pg_temp.flower('tulip'),'{"title":"Song","artist":"Artist","url":"https://music.example.com/track/1"}')$$,'Tulip accepts song metadata');
select lives_ok($$select public.v2_submit_flower_entry(pg_temp.flower('hydrangea'),'{"mood":"calm","mood2":"joyful","note":"Mixed"}')$$,'Hydrangea accepts combined mood');
select is((select count(*) from public.v2_daisy_assignments),0::bigint,'no Daisy question before a Daisy is read');
select lives_ok($$select public.v2_current_garden_state()$$,'read assigns the shared daily question for a live Daisy');
select is((select question_id from public.v2_daisy_assignments where garden_day='2026-11-02'),'light-001','new garden starts its own question cycle');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower('daisy'),'{"text":"Answer","question_id":"deeper-001"}')$$,'22023','Answer the assigned daily question','wrong question rejected');
select lives_ok($$select public.v2_submit_flower_entry(pg_temp.flower('daisy'),'{"text":"Answer","question_id":"light-001"}')$$,'Daisy accepts the assigned question');
select throws_ok(format('select public.v2_submit_flower_entry(%L,%L)',pg_temp.flower(t),'{"media_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'),'22023','This flower requires its dedicated workflow',t||' awaits its dedicated workflow')
 from (values ('sunflower'),('bluebell'),('peony')) x(t);
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower('moonflower'),'{"text":"Too early"}')$$,'22023','Moonflower opens from 10 p.m. to 4 a.m.','Moonflower closed by day');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower('rose'),'{"text":"Retry"}')$$,'22023','Already submitted; edit the original entry','second submission does not overwrite');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower('rose'),'{"text":"x","extra":"y"}')$$,'22023',null,'unexpected fields rejected');
select throws_ok($$select public.v2_submit_flower_entry('ffffffff-ffff-4fff-8fff-ffffffffffff','{}')$$,'22023','Unknown flower','unknown flower rejected');
select is((select payload->>'text' from public.v2_flower_entries where id=pg_temp.entry('rose',1)),'A daily thought','whitespace normalized');
select results_eq($$select original_posted_at,garden_day from public.v2_flower_entries where id=pg_temp.entry('rose',1)$$,
 $$values ('2026-11-02 13:00+00'::timestamptz,'2026-11-02'::date)$$,'server derives time and garden day');
select is((select sum(growth_units)::bigint from public.v2_flowers),0::bigint,'submissions never grow before rollover');
select throws_ok($$insert into public.v2_flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload) values(pg_temp.flower('rose'),2,'2026-11-02',now(),now(),'{"text":"Forged"}')$$,'42501',null,'direct entry insert denied');
select throws_ok($$update public.v2_flower_entries set payload='{"text":"Forged"}'$$,'42501',null,'direct entry update denied');

-- Partner view, edit authority and the 30-minute same-day edit window.
select pg_temp.actor(2);
select is((select count(*) from public.v2_flower_entries),9::bigint,'partner reads every entry');
select is((select count(*) from public.v2_entry_history()),9::bigint,'partner history');
select is((select count(*) from public.v2_entry_history(pg_temp.flower('rose'),1)),1::bigint,'history is bounded');
select throws_ok($$select public.v2_entry_history(null,0)$$,'22023','Invalid history page','invalid page rejected');
select is((select p->'entries'->0->>'can_edit' from jsonb_array_elements(public.v2_current_garden_state()->'plants') p where p->'flower'->>'id'=pg_temp.flower('rose')::text),'false','partner cannot edit original');
select throws_ok($$select public.v2_edit_flower_entry(pg_temp.entry('rose',1),'{"text":"Not mine"}')$$,'42501','Only the author can edit this entry','partner edit denied');
select lives_ok($$select public.v2_submit_flower_entry(pg_temp.flower('rose'),'{"text":"Partner note"}')$$,'partner submits independently');
select pg_temp.actor(1);
select is((select p->>'member2_submitted' from jsonb_array_elements(public.v2_current_garden_state()->'plants') p where p->'flower'->>'id'=pg_temp.flower('rose')::text),'true','submission markers reflect partner');
select pg_temp.at('2026-11-02 13:30+00');
select lives_ok($$select public.v2_edit_flower_entry(pg_temp.entry('rose',1),'{"text":"Edited thought"}')$$,'author edits at exactly 30 minutes');
select results_eq($$select payload->>'text',original_posted_at,updated_at from public.v2_flower_entries where id=pg_temp.entry('rose',1)$$,
 $$values ('Edited thought'::text,'2026-11-02 13:00+00'::timestamptz,'2026-11-02 13:30+00'::timestamptz)$$,'edit keeps the original time');
select pg_temp.at('2026-11-02 13:30:00.000001+00');
select throws_ok($$select public.v2_edit_flower_entry(pg_temp.entry('rose',1),'{"text":"Too late"}')$$,'22023','The edit window has ended','edit after 30 minutes denied');

-- Replies.
select pg_temp.actor(2);
select lives_ok($$select public.v2_reply_to_entry(pg_temp.entry('rose',1),'Thanks','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,'partner replies');
select lives_ok($$select public.v2_reply_to_entry(pg_temp.entry('rose',1),'Thanks','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,'ambiguous retry succeeds');
select is((select count(*) from public.v2_entry_replies),1::bigint,'retry does not duplicate');
select is((select author_id from public.v2_entry_replies),2::smallint,'server derives reply author');
select throws_ok($$select public.v2_reply_to_entry(pg_temp.entry('rose',1),'Changed','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,'22023','Retry must use the original reply','token cannot replace content');
select throws_ok($$select public.v2_reply_to_entry(pg_temp.entry('rose',2),'Own','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,'42501','Reply to your partner’s entry','own entry denied');
select throws_ok($$select public.v2_reply_to_entry(null,'Unknown','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,'22023','Unknown entry','missing parent denied');
select throws_ok($$select public.v2_reply_to_entry(pg_temp.entry('rose',1),E' \n ','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,'22023','Reply must contain 1 to 4000 characters','blank reply denied');
select throws_ok($$select public.v2_reply_to_entry(pg_temp.entry('rose',1),'Hi',null)$$,'22023','A reply request ID is required','request ID required');
select throws_ok($$insert into public.v2_entry_replies(entry_id,author_id,body,request_id,created_at) values(pg_temp.entry('rose',1),2,'Forged','cccccccc-cccc-4ccc-8ccc-cccccccccccc',now())$$,'42501',null,'direct reply insert denied');
select pg_temp.actor(1);
select is(jsonb_array_length(public.v2_entry_reply_history(pg_temp.entry('rose',1))),1,'author reads the reply');
select ok(not (public.v2_entry_reply_history(pg_temp.entry('rose',1))->0 ? 'request_id'),'request IDs stay private');
select throws_ok($$select public.v2_entry_reply_history(pg_temp.entry('rose',1),0)$$,'22023','Invalid reply page','invalid reply page rejected');

-- Moonflower opens at 10 p.m. Pacific; edits need the same garden day.
select pg_temp.at('2026-11-03 05:59:59+00');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower('moonflower'),'{"text":"Almost"}')$$,'22023','Moonflower opens from 10 p.m. to 4 a.m.','closed just before 10 p.m.');
select pg_temp.at('2026-11-03 11:50+00');
select lives_ok($$select public.v2_submit_flower_entry(pg_temp.flower('moonflower'),'{"text":"Late thought"}')$$,'Moonflower accepts after 10 p.m.');
select is((select garden_day from public.v2_flower_entries where id=pg_temp.entry('moonflower',1)),'2026-11-02'::date,'after-midnight entry belongs to the prior garden day');
select pg_temp.at('2026-11-03 12:05+00');
select throws_ok($$select public.v2_edit_flower_entry(pg_temp.entry('moonflower',1),'{"text":"New day"}')$$,'22023','The edit window has ended','rollover ends the edit window early');

-- Bloomed flowers: Cactus and Hydrangea keep accepting care; others complete.
reset role;
update public.v2_flowers set growth_units=c.growth_target,first_bloom_at='2026-11-03 12:00+00',first_bloom_day='2026-11-02'
 from public.flower_catalog c where c.type_key=v2_flowers.type_key and v2_flowers.spot in (
  (select min(spot) from public.v2_flowers where type_key='cactus'),(select min(spot) from public.v2_flowers where type_key='hydrangea'),
  (select min(spot) from public.v2_flowers where type_key='marigold'),(select min(spot) from public.v2_flowers where type_key='rose'),
  (select min(spot) from public.v2_flowers where type_key='dandelion'));
set local role authenticated;
select lives_ok($$select public.v2_submit_flower_entry(pg_temp.flower('cactus'),'{}')$$,'bloomed Cactus accepts care');
select lives_ok($$select public.v2_submit_flower_entry(pg_temp.flower('hydrangea'),'{"mood":"other","note":"Quiet"}')$$,'bloomed Hydrangea accepts a mood');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower('marigold'),'{"text":"Done"}')$$,'22023','This flower has already bloomed','bloomed Marigold is complete (decision 0064)');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower('rose'),'{"text":"Done"}')$$,'22023','This flower has already bloomed','bloomed Rose is complete');

-- Dandelion wish fulfilment.
select throws_ok($$select public.v2_fulfill_dandelion(null)$$,'22023','Unknown Dandelion','null fails closed');
select throws_ok($$select public.v2_fulfill_dandelion(pg_temp.flower('cactus'))$$,'22023','Unknown Dandelion','type guard');
select lives_ok($$select public.v2_plant_flower_at('dandelion',22,'Another wish')$$,'second Dandelion planted');
select throws_ok($$select public.v2_fulfill_dandelion((select id from public.v2_flowers where spot=22))$$,'22023','The wish must bloom before fulfillment','bloom guard');
select pg_temp.actor(2);
select lives_ok($$select public.v2_fulfill_dandelion(pg_temp.flower('dandelion'))$$,'either member fulfils a bloomed wish');
reset role;
create temporary table fulfilled as select public.v2_fulfill_dandelion(pg_temp.flower('dandelion')) value;
grant select on fulfilled to authenticated;
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.at('2026-11-04 13:00+00');
select is(public.v2_fulfill_dandelion(pg_temp.flower('dandelion')),(select value from fulfilled),'repeat returns the durable fact');
select is((select fulfilled_by from public.v2_flowers where id=pg_temp.flower('dandelion')),2::smallint,'actual actor retained');

-- Seeds never change after planting.
select is((select count(*) from public.v2_flowers f join seeds s using(id) where f.seed<>s.seed),0::bigint,'seeds are stable across operations');

-- Outsider and anonymous access.
select pg_temp.actor(3);
select is((select count(*) from public.v2_flowers),0::bigint,'outsider reads no flowers');
select is((select count(*) from public.v2_flower_entries),0::bigint,'outsider reads no entries');
select is((select count(*) from public.v2_entry_replies),0::bigint,'outsider reads no replies');
select is((select count(*) from public.v2_garden),0::bigint,'outsider reads no garden');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower('rose'),'{"text":"x"}')$$,'42501',null,'outsider cannot submit');
select throws_ok($$select public.v2_entry_reply_history(1)$$,'42501',null,'outsider cannot read replies');
reset role;
set local role anon;
select throws_ok($$select public.v2_current_garden_state()$$,'42501',null,'anonymous execution denied');
select throws_ok($$select count(*) from public.v2_flowers$$,'42501',null,'anonymous table read denied');
reset role;

-- Legacy garden untouched by every v2 operation.
select is((select count(*) from public.garden),0::bigint,'legacy garden not created');
select is((select count(*) from public.flowers),0::bigint,'no legacy flowers (no legacy initial Cactus)');
select is((select count(*) from public.flower_entries),0::bigint,'no legacy entries');
select is((select count(*) from public.daisy_assignments),0::bigint,'no legacy Daisy assignments');
select is((select count(*) from public.achievement_progress),0::bigint,'no legacy achievement evaluation');
select * from finish();
rollback;
