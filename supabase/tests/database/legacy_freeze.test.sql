-- Legacy archive freeze (decision 0067, issue #176): reads never change legacy
-- state, every legacy write refuses with 55000, and shared settings stay writable.
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
 ('11111111-1111-4111-8111-111111111111','freeze-owner','google','{"sub":"freeze-owner","email":"owner@example.test","email_verified":true}'),
 ('22222222-2222-4222-8222-222222222222','freeze-member','google','{"sub":"freeze-member","email":"member@example.test","email_verified":true}'),
 ('33333333-3333-4333-8333-333333333333','freeze-outsider','google','{"sub":"freeze-outsider","email":"outsider@example.test","email_verified":true}');
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',case n when 1 then '11111111-1111-4111-8111-111111111111' when 2 then '22222222-2222-4222-8222-222222222222' else '33333333-3333-4333-8333-333333333333' end,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
$$;
-- Every legacy table, including private upload state.
create function pg_temp.legacy_snapshot() returns jsonb language sql as $$
 select jsonb_build_object(
  'garden',(select jsonb_agg(to_jsonb(x)) from public.garden x),
  'flowers',(select jsonb_agg(to_jsonb(x) order by x.id) from public.flowers x),
  'entries',(select jsonb_agg(to_jsonb(x) order by x.id) from public.flower_entries x),
  'replies',(select jsonb_agg(to_jsonb(x) order by x.id) from public.entry_replies x),
  'unlocks',(select jsonb_agg(to_jsonb(x) order by x.type_key) from public.flower_unlocks x),
  'daisy',(select jsonb_agg(to_jsonb(x) order by x.garden_day) from public.daisy_assignments x),
  'days',(select jsonb_agg(to_jsonb(x) order by x.garden_day) from public.garden_days x),
  'facts',(select jsonb_agg(to_jsonb(x) order by x.flower_id,x.garden_day) from public.flower_day_facts x),
  'noon',(select jsonb_agg(to_jsonb(x) order by x.garden_day,x.flower_id) from public.before_noon_snapshots x),
  'peony_activity',(select jsonb_agg(to_jsonb(x) order by x.flower_id,x.milestone) from public.peony_activity x),
  'peony_contributions',(select jsonb_agg(to_jsonb(x) order by x.id) from public.peony_contributions x),
  'peony_plans',(select jsonb_agg(to_jsonb(x) order by x.flower_id) from public.peony_plans x),
  'peony_acceptances',(select jsonb_agg(to_jsonb(x) order by x.flower_id,x.author_id) from public.peony_acceptances x),
  'progress',(select jsonb_agg(to_jsonb(x) order by x.achievement_id) from public.achievement_progress x),
  'awards',(select jsonb_agg(to_jsonb(x) order by x.achievement_id) from public.achievement_awards x),
  'media',(select jsonb_agg(to_jsonb(x) order by x.id) from private.media_uploads x));
$$;

-- The migration freezes the database itself, before any garden exists.
select is((select count(*) from private.legacy_garden_freeze),1::bigint,'migration installs the freeze marker');
select ok(not has_table_privilege('authenticated','private.legacy_garden_freeze','SELECT'),'members cannot read the marker directly');
select ok(not has_table_privilege('service_role','private.legacy_garden_freeze','DELETE'),'service role cannot lift the freeze');

-- A never-initialized archive reads as an empty garden without creating one.
select pg_temp.actor(1);
set local role authenticated;
select is(public.current_garden_state()->'garden'->>'spot_capacity','12','empty archive reads a default twelve-spot bed');
select is(public.current_garden_state()->'plants','[]'::jsonb,'empty archive has no plants');
select is(public.current_garden_state()->'unlocks','[]'::jsonb,'empty archive has no unlocks');
select is((public.initialize_garden()).id,null,'initialize does not create a frozen garden');
select is(jsonb_array_length(public.current_achievements()->'achievements'),26,'empty archive lists every achievement');
select is((select count(*) from jsonb_array_elements(public.current_achievements()->'achievements') a where (a->>'progress')::integer=0 and a->>'earned_at' is null),26::bigint,'empty archive achievements have no progress');
select is((public.get_daily_daisy_question()).question_id,null,'empty archive assigns no Daisy question');
select throws_ok($$select public.plant_flower_at('rose',2)$$,'55000','The legacy garden is archived and read-only','empty archive refuses planting');
reset role;
select is((select count(*) from public.garden)+(select count(*) from public.flowers)+(select count(*) from public.flower_unlocks)
  +(select count(*) from public.daisy_assignments)+(select count(*) from public.achievement_progress)+(select count(*) from public.garden_days),
  0::bigint,'reads of an empty archive create nothing');

-- Build pre-freeze history with the legacy rules, then freeze again.
delete from private.legacy_garden_freeze;
select pg_temp.actor(1);
select public.initialize_garden();
insert into public.flower_unlocks(type_key) values('sunflower'),('peony'),('dandelion'),('daisy') on conflict do nothing;
select public.plant_flower('rose');
select public.plant_flower('sunflower');
select public.plant_flower('peony');
select public.plant_flower('dandelion','A synthetic wish');
select public.plant_flower('daisy');
create function pg_temp.flower(p_type text) returns uuid language sql as $$ select id from public.flowers where type_key=p_type limit 1 $$;
select public.submit_flower_entry(pg_temp.flower('rose'),'{"text":"Synthetic rose one"}');
select public.submit_peony_contribution(pg_temp.flower('peony'),1,'{"text":"Synthetic idea"}');
create temporary table freeze_values(key text primary key,value jsonb);
insert into freeze_values values('photo',public.create_media_upload(gen_random_uuid(),pg_temp.flower('sunflower'),'image/png',100));
insert into freeze_values select 'claim',public.claim_media_upload((value->>'id')::uuid) from freeze_values where key='photo';
insert into storage.objects(bucket_id,name,metadata) select 'garden-media',value->>'final_path','{"size":100,"mimetype":"image/png"}' from freeze_values where key='claim';
select public.attest_media_upload((value->>'id')::uuid,(value->>'lease_id')::uuid,100,10,10,repeat('a',64)) from freeze_values where key='claim';
select public.submit_flower_entry(pg_temp.flower('sunflower'),jsonb_build_object('media_id',(select value->>'id' from freeze_values where key='photo')));
insert into freeze_values values('pending',public.create_media_upload(gen_random_uuid(),pg_temp.flower('sunflower'),'image/png',100));
insert into freeze_values values('processing',public.create_media_upload(gen_random_uuid(),pg_temp.flower('sunflower'),'image/png',100));
insert into freeze_values select 'lease',public.claim_media_upload((value->>'id')::uuid) from freeze_values where key='processing';
select pg_temp.actor(2);
select public.submit_flower_entry(pg_temp.flower('rose'),'{"text":"Synthetic rose two"}');
select pg_temp.actor(1);
select public.reply_to_entry((select id from public.flower_entries where author_id=2),'Synthetic reply','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
-- Pretend days have passed unsettled, and no Daisy question exists for today.
-- Unfrozen, the next read would settle (with decay) and assign a question.
update public.garden set last_settled_day=last_settled_day-3;
delete from public.daisy_assignments;
insert into private.legacy_garden_freeze default values;
create temporary table frozen_before as select pg_temp.legacy_snapshot() value;
select ok((select value->'entries' is not null and value->'media' is not null and value->'replies' is not null from frozen_before),'fixture holds legacy content');

-- Every read path works for both members and writes nothing.
create function pg_temp.read_everything() returns void language plpgsql as $$
begin
 perform public.current_garden_state();
 perform public.initialize_garden();
 perform public.current_entry_state(pg_temp.flower('rose'));
 perform public.current_entry_state(pg_temp.flower('daisy'));
 perform public.entry_history(null,50,null);
 perform public.current_peony_state(pg_temp.flower('peony'));
 perform public.current_achievements();
 perform public.entry_reply_history((select id from public.flower_entries where author_id=2 and flower_id=pg_temp.flower('rose')));
 perform public.memories_page();
 perform public.get_daily_daisy_question();
 perform public.media_read_path((select (value->>'id')::uuid from freeze_values where key='photo'));
end $$;
grant select on freeze_values to authenticated, service_role;
select pg_temp.actor(1);
set local role authenticated;
select lives_ok($$select pg_temp.read_everything()$$,'member one reads every legacy path');
select is(jsonb_array_length(public.current_garden_state()->'plants'),6,'garden state lists archived flowers');
select is((select count(*) from public.entry_history(null,50,null)),3::bigint,'history lists archived entries');
select is(jsonb_array_length(public.entry_reply_history((select id from public.flower_entries where author_id=2))),1,'replies stay readable');
select is(public.media_read_path((select (value->>'id')::uuid from freeze_values where key='photo'))->>'mime_type','image/png','existing entry media keeps its signed-read path');
select is((public.get_daily_daisy_question()).question_id,null,'no Daisy question is assigned while archived');
select is(public.current_entry_state(pg_temp.flower('daisy'))->'daisy_question','null'::jsonb,'daisy state reads without assigning');
select pg_temp.actor(2);
select lives_ok($$select pg_temp.read_everything()$$,'member two reads every legacy path');
reset role;
select is(pg_temp.legacy_snapshot(),(select value from frozen_before),'reads leave all legacy state unchanged: no settlement, decay, unlocks or awards');

-- Trusted settlement and evaluation are inert even when called directly.
select pg_temp.actor(1);
select lives_ok($$select private.settle_garden_at(clock_timestamp()+interval '5 days')$$,'direct settlement returns');
select lives_ok($$select private.evaluate_achievements(clock_timestamp())$$,'direct evaluation returns');
select lives_ok($$select private.begin_garden_operation()$$,'operation entry returns');
select is(pg_temp.legacy_snapshot(),(select value from frozen_before),'direct settlement and evaluation change nothing');

-- Every legacy write refuses with the read-only error.
set local role authenticated;
select throws_ok($$select public.plant_flower('rose')$$,'55000','The legacy garden is archived and read-only','plant refuses');
select throws_ok($$select public.plant_flower_at('rose',20)$$,'55000','The legacy garden is archived and read-only','plant at spot refuses');
select throws_ok($$select public.submit_flower_entry(pg_temp.flower('daisy'),'{"text":"Late"}')$$,'55000','The legacy garden is archived and read-only','entry refuses');
select throws_ok($$select public.edit_flower_entry((select id from public.flower_entries where author_id=1 and flower_id=pg_temp.flower('rose')),'{"text":"Edited"}')$$,'55000','The legacy garden is archived and read-only','edit refuses inside the old window');
select throws_ok($$select public.fulfill_dandelion(pg_temp.flower('dandelion'))$$,'55000','The legacy garden is archived and read-only','fulfilment refuses');
select throws_ok($$select public.reply_to_entry((select id from public.flower_entries where author_id=2),'Another','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,'55000','The legacy garden is archived and read-only','reply refuses');
select throws_ok($$select public.submit_peony_contribution(pg_temp.flower('peony'),1,'{"text":"Another idea"}')$$,'55000','The legacy garden is archived and read-only','peony contribution refuses');
select throws_ok($$select public.edit_peony_contribution((select id from public.peony_contributions limit 1),'{"text":"Edited idea"}')$$,'55000','The legacy garden is archived and read-only','peony edit refuses');
select throws_ok($$select public.set_peony_plan(pg_temp.flower('peony'),0,'Walk','2026-09-19T19:00:00-07:00')$$,'55000','The legacy garden is archived and read-only','peony plan refuses');
select throws_ok($$select public.accept_peony_plan(pg_temp.flower('peony'),1)$$,'55000','The legacy garden is archived and read-only','peony acceptance refuses');
select throws_ok($$select public.create_media_upload(gen_random_uuid(),pg_temp.flower('sunflower'),'image/png',100)$$,'55000','The legacy garden is archived and read-only','new upload intent refuses');
select ok(not public.media_upload_allowed((select value->>'id' from freeze_values where key='pending')||'/source'),'pending upload path is no longer writable');
select throws_ok($$select public.claim_media_upload((select (value->>'id')::uuid from freeze_values where key='pending'))$$,'55000','The legacy garden is archived and read-only','pending upload claim refuses');
reset role;
set local role service_role;
select throws_ok($$select public.attest_media_upload((select (value->>'id')::uuid from freeze_values where key='lease'),(select (value->>'lease_id')::uuid from freeze_values where key='lease'),100,10,10,repeat('b',64))$$,'55000','The legacy garden is archived and read-only','photo attestation refuses');
select throws_ok($$select public.attest_audio_upload((select (value->>'id')::uuid from freeze_values where key='lease'),(select (value->>'lease_id')::uuid from freeze_values where key='lease'),100,48000,1,repeat('b',64))$$,'55000','The legacy garden is archived and read-only','voice attestation refuses');
reset role;
-- Membership still comes first: outsiders learn nothing new.
select pg_temp.actor(3);
set local role authenticated;
select throws_ok($$select public.plant_flower_at('rose',20)$$,'42501',null,'outsider is denied before the archive check');
select throws_ok($$select public.submit_flower_entry(pg_temp.flower('daisy'),'{"text":"Late"}')$$,'42501',null,'outsider entry is denied before the archive check');
reset role;

-- The private final interaction keeps its legacy gate (all 26 frozen legacy
-- awards) and keeps working while archived, without settling or evaluating.
select private.bootstrap_private_interaction(2::smallint,'Synthetic title','Synthetic frozen marker','[{"key":"a","label":"Option A"},{"key":"b","label":"Option B"}]');
select pg_temp.actor(2);
set local role authenticated;
select is(public.current_private_interaction()->>'status','unavailable','frozen gate stays closed without all 26 legacy awards');
select throws_ok($$select public.answer_private_interaction('a')$$,'22023','Interaction is not available','closed frozen gate refuses an answer');
reset role;
-- Simulate a garden that had earned every ordinary award before the freeze.
insert into public.achievement_awards(achievement_id,earned_at)
  select achievement_id,clock_timestamp() from public.achievement_catalog
  on conflict do nothing;
create temporary table frozen_awarded as select pg_temp.legacy_snapshot() value;
select pg_temp.actor(1);
set local role authenticated;
select is(public.owner_private_interaction('status')->>'status','ready','owner status reads while archived');
select is(public.owner_private_interaction('preview')->'content'->>'title','Synthetic title','owner preview works while archived');
select is(public.owner_private_interaction('arm',false)->>'armed','false','owner can disarm while archived');
select pg_temp.actor(2);
select is(public.current_private_interaction()->>'status','unavailable','disarmed interaction stays hidden');
select pg_temp.actor(1);
select is(public.owner_private_interaction('arm',true)->>'armed','true','owner can rearm while archived');
select pg_temp.actor(2);
select is(public.current_private_interaction()->>'status','pending','frozen 26 legacy awards open the gate and deliver');
select is(public.answer_private_interaction('b')->>'status','answered','recipient can answer while archived');
select pg_temp.actor(1);
select is(public.owner_private_interaction('status')->>'unread','true','owner sees the unread answer');
select is(public.owner_private_interaction('acknowledge')->>'unread','false','owner can acknowledge while archived');
reset role;
select is(pg_temp.legacy_snapshot(),(select value from frozen_awarded),'the interaction lifecycle settles, evaluates and changes no legacy state');

-- Shared member settings stay writable while the garden is archived.
select pg_temp.actor(1);
set local role authenticated;
select is(public.save_member_setting('{"gentle_motion":false}')->>'gentle_motion','false','member settings still save');
reset role;
select is(pg_temp.legacy_snapshot(),(select value from frozen_awarded),'refused writes and shared settings leave legacy state unchanged');
select * from finish();
rollback;
