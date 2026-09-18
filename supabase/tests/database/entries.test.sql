begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();
select has_table('public','flower_entries','daily entries persist');
select has_table('public','daisy_assignments','daily question snapshots persist');
select has_function('public','submit_flower_entry',array['uuid','jsonb'],'explicit original submission RPC');
select has_function('public','edit_flower_entry',array['bigint','jsonb'],'explicit edit RPC');
select has_function('public','current_entry_state',array['uuid'],'server authoritative current state');
select has_function('public','entry_history',array['uuid','integer','bigint'],'bounded cursor history');
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
insert into public.flower_unlocks(type_key) select type_key from public.flower_catalog on conflict do nothing;
select public.plant_flower(type_key,case when type_key='dandelion' then 'Our original shared wish' end) from public.flower_catalog where type_key<>'cactus';
create function pg_temp.flower(p_type text) returns uuid language sql stable as $$select id from public.flowers where type_key=p_type order by spot limit 1$$;
-- Test-only replacement of clock expressions. ROLLBACK restores all original
-- production definitions; there is no test-clock seam in the shipped migration.
create temporary table entry_function_definitions as select oid,pg_get_functiondef(oid) as definition from pg_proc
 where oid in ('public.submit_flower_entry(uuid,jsonb)'::regprocedure,'public.edit_flower_entry(bigint,jsonb)'::regprocedure,
 'public.current_entry_state(uuid)'::regprocedure,'public.get_daily_daisy_question()'::regprocedure);
create function pg_temp.set_entry_clock(p_now timestamptz) returns void language plpgsql as $$
declare r record;
begin
 for r in select definition from entry_function_definitions loop
  execute replace(r.definition,'clock_timestamp()',quote_literal(p_now)||'::timestamptz');
 end loop;
end $$;
select pg_temp.set_entry_clock('2026-09-19 05:00:00+00');
set local role authenticated;
select lives_ok(format('select public.submit_flower_entry(%L,%L)',pg_temp.flower(t),'{"text":"  A daily thought  "}'),'accepts '||t)
 from (values ('rose'),('marigold'),('snapdragon'),('moonflower'),('dandelion'),('forget-me-not')) x(t);
select lives_ok($$select public.submit_flower_entry(pg_temp.flower('cactus'),'{}')$$,'Cactus accepts one tap');
select lives_ok($$select public.submit_flower_entry(pg_temp.flower('tulip'),'{"title":"Song","artist":"Artist","url":"https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"}')$$,'Tulip accepts song metadata');
select lives_ok($$select public.submit_flower_entry(pg_temp.flower('hydrangea'),'{"mood":"calm"}')$$,'Hydrangea accepts named mood');
select lives_ok('select public.get_daily_daisy_question()','first member assigns daily question');
select lives_ok($$select public.submit_flower_entry(pg_temp.flower('daisy'),jsonb_build_object('text','A daily answer','question_id',(select question_id from public.daisy_assignments where garden_day='2026-09-18')))$$,'Daisy accepts actual assigned question');
select is((select count(*) from public.flower_entries),10::bigint,'one entry per supported type');
select is((select count(*) from public.flower_entries where original_posted_at='2026-09-19 05:00:00+00' and garden_day='2026-09-18' and author_id=1),10::bigint,'server derives author original time and Pacific day');
select is((select payload->>'text' from public.flower_entries where flower_id=pg_temp.flower('rose')),'A daily thought','outside whitespace normalized');
select is((select shared_wish from public.flowers where type_key='dandelion'),'Our original shared wish','daily detail preserves original wish');
select throws_ok($$select public.submit_flower_entry(pg_temp.flower('rose'),'{"text":"Retry"}')$$,'22023','Already submitted; edit the original entry','repeat submission does not overwrite');
select throws_ok($$select public.submit_flower_entry('ffffffff-ffff-4fff-8fff-ffffffffffff','{}')$$,'22023','Unknown flower','unknown or foreign flower rejected');
select throws_ok('select public.submit_flower_entry(null,''{}'')','22023','Unknown flower','null flower rejected');
select throws_ok(format('select public.submit_flower_entry(%L,%L)',pg_temp.flower(t),'{"text":"Bypass","media_id":"invented"}'),'22023','This flower requires its dedicated workflow',t||' generic bypass rejected')
 from (values ('sunflower'),('bluebell'),('peony')) x(t);
select is((select sum(growth_units)::bigint from public.flowers),0::bigint,'submission does not advance growth before rollover');
select is((select count(*) from public.flowers where first_bloom_at is not null),0::bigint,'submission never manufactures blooms');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","member_id":1,"amr":[{"method":"oauth"}]}',true);
select is((select count(*) from public.flower_entries),10::bigint,'partner sees every entry before submitting');
select is((select count(*) from public.entry_history()),10::bigint,'partner history has immediate access');
select is(jsonb_array_length(public.current_entry_state(pg_temp.flower('rose'))->'entries'),1,'partner current state has immediate access');
select is(public.current_entry_state(pg_temp.flower('rose'))->'entries'->0->>'can_edit','false','partner cannot edit owner entry');
select throws_ok($$select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('rose')),'{"text":"Not mine"}')$$,'42501','Only the author can edit this entry','partner edit denied');
select throws_ok($$select public.edit_flower_entry(9223372036854775807,'{}')$$,'42501','Only the author can edit this entry','missing entry indistinguishable from other author');
select lives_ok($$select public.submit_flower_entry(pg_temp.flower('rose'),'{"text":"Partner note"}')$$,'partner contributes independently');
select is((select author_id from public.flower_entries where payload->>'text'='Partner note'),2::smallint,'spoofed member metadata cannot alter actor');
select is((select count(*) from public.flower_entries where flower_id=pg_temp.flower('rose')),2::bigint,'paired fact contains exactly two originals');
select is((select question_id from public.get_daily_daisy_question()),'light-001','both members share persistent question');
select is((select count(*) from public.daisy_assignments),1::bigint,'repeated reads consume one question');
reset role;
update public.flowers set first_bloom_at=clock_timestamp(),first_bloom_day=planted_day where type_key='daisy';
set local role authenticated;
select lives_ok($$select public.plant_flower('daisy')$$,'new Daisy can follow permanent bloom');
select is(public.current_entry_state((select id from public.flowers where type_key='daisy' order by spot desc limit 1))->'daisy_question'->>'question_id','light-001','different Daisy instances share same daily assignment');

select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select lives_ok($$select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('hydrangea')),'{"mood":"tender"}')$$,'author changes final allowed mood');
select is((select payload->>'mood' from public.flower_entries where flower_id=pg_temp.flower('hydrangea')),'tender','final allowed mood retained');
select lives_ok($$select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('tulip')),'{"title":"Another song","artist":"Another artist","url":"https://music.example.test/song?id=42#play"}')$$,'non-Spotify safe HTTPS provider link supported');
select is((select count(*) from public.entry_history(null,3,null)),3::bigint,'bounded history page');
select results_eq('select id from public.entry_history(null,3,(select id from public.flower_entries order by id desc offset 2 limit 1))','select id from public.flower_entries order by id desc offset 3 limit 3','exclusive cursor continues without duplication or skipped entries');
select is((select count(*) from public.entry_history(pg_temp.flower('rose'),100,null)),2::bigint,'flower-specific history');
select throws_ok(q,'22023','Invalid history page',label) from (values ('select public.entry_history(null,101,null)','oversized history page'),('select public.entry_history(null,0,null)','zero history page'),('select public.entry_history(null,null,null)','null size'),('select public.entry_history(null,50,0)','invalid cursor')) x(q,label);
select throws_ok($$select public.entry_history('ffffffff-ffff-4fff-8fff-ffffffffffff')$$,'22023','Unknown flower','history rejects nonexistent flower');
select throws_ok($$select public.current_entry_state('ffffffff-ffff-4fff-8fff-ffffffffffff')$$,'22023','Unknown flower','state rejects nonexistent flower');
reset role;

select throws_ok(format('select private.validate_entry_payload(%L,%L::jsonb,%L)',t,p,'2026-09-18'),'22023',msg,label)
from (values
 ('rose',null,'Invalid entry content','SQL null'),('rose','null','Invalid entry content','JSON null'),('rose','[]','Invalid entry content','array'),('rose','"text"','Invalid entry content','scalar'),
 ('rose','{}','Invalid entry fields','missing text'),('rose','{"text":"ok","author_id":2}','Invalid entry fields','actor spoof'),('rose','{"text":"ok","garden_day":"2026-01-01"}','Invalid entry fields','day spoof'),
 ('rose','{"text":null}','Entry fields must be strings','null text'),('rose','{"text":2}','Entry fields must be strings','numeric text'),('rose','{"text":true}','Entry fields must be strings','boolean text'),('rose','{"text":{}}','Entry fields must be strings','object text'),('rose','{"text":"   "}','Entry field length is invalid','blank text'),
 ('cactus','{"text":"check in"}','Invalid entry fields','Cactus extra content'),('dandelion','{"text":"detail","wish":"replacement"}','Invalid entry fields','wish replacement'),
 ('daisy','{"question_id":"deeper-050","text":"answer"}','Answer the assigned daily question','wrong Daisy question'),('hydrangea','{"mood":"purple"}','Unknown mood','arbitrary mood'),('tulip','{"title":"Song","artist":"Artist"}','Invalid entry fields','missing link'),
 ('sunflower','{}','This flower requires its dedicated workflow','photo bypass'),('bluebell','{}','This flower requires its dedicated workflow','voice bypass'),('peony','{}','This flower requires its dedicated workflow','milestone bypass'),('unknown','{}','This flower requires its dedicated workflow','unknown type')
) x(t,p,msg,label);
select throws_ok($$select private.validate_entry_payload('rose',jsonb_build_object('text',repeat('x',4001)),'2026-09-18')$$,'22023','Entry field length is invalid','4001 characters denied');
select lives_ok($$select private.validate_entry_payload('rose',jsonb_build_object('text',repeat('🌱',4000)),'2026-09-18')$$,'4000 Unicode characters accepted');
select throws_ok($$select private.validate_entry_payload('rose',jsonb_build_object('text',repeat('x',20001)),'2026-09-18')$$,'22023','Invalid entry content','oversized object denied');
select throws_ok(format('select private.validate_entry_payload(%L,%L::jsonb,%L)','tulip',jsonb_build_object('title',case when f='title' then repeat('x',201) else 'Song' end,'artist',case when f='artist' then repeat('x',201) else 'Artist' end,'url','https://music.example.test/'||case when f='url' then repeat('x',512) else 'song' end),'2026-09-18'),'22023','Entry field length is invalid','song '||f||' bound') from (values ('title'),('artist'),('url')) x(f);
select lives_ok(format('select private.validate_entry_payload(%L,%L::jsonb,%L)','hydrangea',jsonb_build_object('mood',mood_key),'2026-09-18'),mood_key||' allowed') from public.hydrangea_moods;
select throws_ok(format('select private.validate_entry_payload(%L,%L::jsonb,%L)','tulip',jsonb_build_object('title','Song','artist','Artist','url',u),'2026-09-18'),'22023','Use a valid HTTPS song link without credentials or control characters','reject URL '||label)
from (values ('http://music.example.test/song','http'),('javascript:alert(1)','script scheme'),('https://user:pass@music.example.test/song','credentials'),('https://good.test@evil.test/','at authority'),('https://music.example.test/'||chr(92)||'evil','backslash'),('https://music.example.test/a b','space'),('https://music.example.test/a'||chr(10),'newline'),('https://music.example.test/%0a','encoded control'),('https://music.example.test/%zz','bad escape'),('https://music.example.test:99999/song','port range'),('https://-music.example.test/song','bad host'),('https://music..test/song','empty host label'),('https:///song','missing host')) x(u,label);

-- Every label is individually legal; the total ASCII DNS hostname still has
-- a 253-character limit. Ports, paths, queries, and fragments do not count.
select lives_ok(format('select private.validate_entry_payload(%L,%L::jsonb,%L)','tulip',jsonb_build_object('title','Song','artist','Artist','url','https://'||repeat('a',63)||'.'||repeat('b',63)||'.'||repeat('c',63)||'.'||repeat('d',61)||':443/song?id=1#play'),'2026-09-18'),'253-character host accepted independently of port and path');
select throws_ok(format('select private.validate_entry_payload(%L,%L::jsonb,%L)','tulip',jsonb_build_object('title','Song','artist','Artist','url','https://'||repeat('a',63)||'.'||repeat('b',63)||'.'||repeat('c',63)||'.'||repeat('d',n-192)||'/song'),'2026-09-18'),'22023','Use a valid HTTPS song link without credentials or control characters',n||'-character host rejected despite legal labels') from (values (254),(255)) x(n);

select pg_temp.set_entry_clock('2026-09-19 05:29:59.999999+00');
set local role authenticated;
select lives_ok($$select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('rose') and author_id=1),'{"text":"First correction"}')$$,'edit just before 30 minutes accepted');
reset role;
select pg_temp.set_entry_clock('2026-09-19 05:30:00+00');
set local role authenticated;
select lives_ok($$select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('rose') and author_id=1),'{"text":"Final correction"}')$$,'exactly 30 minutes accepted');
select is((select original_posted_at from public.flower_entries where flower_id=pg_temp.flower('rose') and author_id=1),'2026-09-19 05:00:00+00'::timestamptz,'multiple edits preserve original timestamp');
select is(public.current_entry_state(pg_temp.flower('rose'))->'entries'->0->>'can_edit','true','state includes exact 30-minute boundary');
select is(public.current_entry_state(pg_temp.flower('rose'))->'entries'->0->>'edit_deadline_inclusive','true','time-only deadline inclusive');
select lives_ok($$select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('moonflower')),'{"text":"Corrected late thought"}')$$,'Moonflower allowed edits use general window');

reset role;
select pg_temp.set_entry_clock('2026-09-19 05:30:00.000001+00');
set local role authenticated;
select throws_ok($$select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('rose') and author_id=1),'{"text":"Too late"}')$$,'22023','The edit window has ended','microsecond after ORIGINAL deadline denied');
select is(public.current_entry_state(pg_temp.flower('rose'))->'entries'->0->>'can_edit','false','state expires same boundary');
select throws_ok($$select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('hydrangea')),'{"mood":"low"}')$$,'22023','The edit window has ended','late mood change rejected');
select is((select payload->>'mood' from public.flower_entries where flower_id=pg_temp.flower('hydrangea')),'tender','late attempt preserves final allowed mood');

reset role;

-- Fixture positioning and timestamp substitution exist only inside this test.
create function pg_temp.boundary_case(p_post timestamptz,p_edit timestamptz,p_allowed boolean,p_label text)
returns setof text language plpgsql as $$
declare v_id bigint; v_day date; v_sql text;
begin
 delete from public.flower_entries where flower_id=pg_temp.flower('marigold');
 select garden_day into v_day from private.garden_clock_at(p_post);
 insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
 values(pg_temp.flower('marigold'),1,v_day,p_post,p_post,'{"text":"Boundary note"}') returning id into v_id;
 perform pg_temp.set_entry_clock(p_edit);
 execute 'set local role authenticated';
 v_sql := format('select public.edit_flower_entry(%s,%L)',v_id,'{"text":"Correction"}');
 if p_allowed then return next extensions.lives_ok(v_sql,p_label);
 else return next extensions.throws_ok(v_sql,'22023','The edit window has ended',p_label); end if;
 execute 'reset role';
end $$;
select * from pg_temp.boundary_case('2026-09-19 10:50+00','2026-09-19 10:59:59.999999+00',true,'same day just before rollover allowed');
set local role authenticated;
select is(public.current_entry_state(pg_temp.flower('marigold'))->'entries'->0->>'edit_deadline_inclusive','false','rollover-truncated deadline explicitly exclusive');
select is((public.current_entry_state(pg_temp.flower('marigold'))->'entries'->0->>'edit_deadline')::timestamptz,'2026-09-19 11:00+00'::timestamptz,'deadline stops at server rollover');
reset role;

select * from pg_temp.boundary_case('2026-09-19 10:50+00','2026-09-19 11:00+00',false,'4 a.m. rollover denied under 30 minutes');
select * from pg_temp.boundary_case('2026-09-19 10:30+00','2026-09-19 11:00+00',false,'rollover wins at exactly 30 minutes');
select * from pg_temp.boundary_case('2026-03-08 10:50+00','2026-03-08 11:00+00',false,'spring DST rollover at 4 PDT denied');
select * from pg_temp.boundary_case('2026-11-01 11:50+00','2026-11-01 12:00+00',false,'fall DST rollover at 4 PST denied');
select * from pg_temp.boundary_case('2026-11-01 08:50+00','2026-11-01 09:20+00',true,'fall repeated hour elapsed 30 minutes');
select * from pg_temp.boundary_case('2026-03-08 09:50+00','2026-03-08 10:20+00',true,'spring skipped hour elapsed 30 minutes');
select * from pg_temp.boundary_case('2026-09-19 10:50+00','2026-09-20 10:50+00',false,'past entry read-only');

create function pg_temp.moon_case(p_now timestamptz,p_allowed boolean,p_label text)
returns setof text language plpgsql as $$
begin
 delete from public.flower_entries where flower_id=pg_temp.flower('moonflower');
 perform pg_temp.set_entry_clock(p_now);
 execute 'set local role authenticated';
 if p_allowed then return next extensions.lives_ok($q$select public.submit_flower_entry(pg_temp.flower('moonflower'),'{"text":"Night thought"}')$q$,p_label);
 else return next extensions.throws_ok($q$select public.submit_flower_entry(pg_temp.flower('moonflower'),'{"text":"Night thought"}')$q$,'22023','Moonflower opens from 10 p.m. to 4 a.m.',p_label); end if;
 execute 'reset role';
end $$;
select * from pg_temp.moon_case('2026-09-19 04:59:59.999999+00',false,'Moonflower before 10 p.m. denied');
select * from pg_temp.moon_case('2026-09-19 05:00+00',true,'Moonflower exactly 10 p.m. accepted');
select * from pg_temp.moon_case('2026-09-19 10:59:59.999999+00',true,'Moonflower just before 4 a.m. accepted');
select pg_temp.set_entry_clock('2026-09-19 11:00+00');
set local role authenticated;
select throws_ok($$select public.edit_flower_entry((select id from public.flower_entries where flower_id=pg_temp.flower('moonflower')),'{"text":"After rollover"}')$$,'22023','The edit window has ended','Moonflower edits obey same-day rule');
reset role;
select * from pg_temp.moon_case('2026-09-19 11:00+00',false,'Moonflower exactly 4 a.m. denied');
select * from pg_temp.moon_case('2026-11-01 09:30+00',true,'Moonflower repeated DST hour accepted');

select pg_temp.set_entry_clock('2026-09-20 05:00+00');
update public.flowers set first_bloom_at=greatest(planted_at,'2026-09-19 05:00+00'::timestamptz),first_bloom_day=greatest(planted_day,'2026-09-18'::date) where type_key in ('rose','cactus');
set local role authenticated;
select throws_ok($$select public.submit_flower_entry(pg_temp.flower('rose'),'{"text":"More care"}')$$,'22023','This flower has already bloomed','ordinary bloom rejects care');
select lives_ok($$select public.submit_flower_entry(pg_temp.flower('cactus'),'{}')$$,'permanent Cactus accepts care after bloom');
select throws_ok($$select public.submit_flower_entry(pg_temp.flower('cactus'),'{}')$$,'22023','Already submitted; edit the original entry','bloomed Cactus still once per day');
select ok((select count(*)>0 from public.entry_history(pg_temp.flower('rose'))),'bloom preserves history');
reset role;

create function pg_temp.daisy_cycle() returns setof text language plpgsql as $$
declare i integer; q public.daisy_assignments;
begin
 for i in 1..100 loop
  perform pg_temp.set_entry_clock('2026-09-19 05:00+00'::timestamptz + i * interval '1 day');
  execute 'set local role authenticated';
  select * into q from public.get_daily_daisy_question();
  execute 'reset role';
 end loop;
 return next extensions.is((select count(distinct question_id) from public.daisy_assignments where ordinal<=100),100::bigint,'no repeats until all 100 consumed');
 return next extensions.is((select count(*) from public.daisy_assignments where ordinal<=100 and category='light'),50::bigint,'all 50 light questions');
 return next extensions.is((select count(*) from public.daisy_assignments where ordinal<=100 and category='deeper'),50::bigint,'all 50 deeper questions');
 return next extensions.is(q.question_id,'light-001','101st begins next cycle');
 return next extensions.is((select question_id from public.daisy_assignments where ordinal=2),'deeper-001','categories alternate');
 return next extensions.is((select count(*) from public.daisy_assignments a join private.daisy_questions bank using(question_id) where a.prompt=bank.prompt and a.category=bank.category),101::bigint,'exact snapshots retained');
end $$;
select * from pg_temp.daisy_cycle();
select is((select daisy_assignment_day from public.flower_entries where flower_id=pg_temp.flower('daisy')),'2026-09-18'::date,'historical Daisy references original assignment');
select pg_temp.set_entry_clock('2027-02-01 20:00+00');
set local role authenticated;
select lives_ok('select public.get_daily_daisy_question()','missed days need no backfill');
select is((select count(*) from public.daisy_assignments),102::bigint,'missed days consume no questions');

select throws_ok($$select public.submit_flower_entry(p_flower_id=>pg_temp.flower('rose'),p_payload=>'{}',p_actor=>2)$$,'42883',null,'no actor parameter');
select throws_ok($$select public.submit_flower_entry(p_flower_id=>pg_temp.flower('rose'),p_payload=>'{}',p_now=>now())$$,'42883',null,'no clock parameter');
select throws_ok($$select public.submit_flower_entry(p_flower_id=>pg_temp.flower('rose'),p_payload=>'{}',p_garden_day=>current_date)$$,'42883',null,'no day parameter');
select throws_ok('insert into public.flower_entries default values','42501','permission denied for table flower_entries','direct insert denied');
select throws_ok('update public.flower_entries set author_id=2','42501','permission denied for table flower_entries','direct overwrite denied');
select throws_ok('delete from public.flower_entries','42501','permission denied for table flower_entries','history deletion denied');
select throws_ok('update public.daisy_assignments set prompt=''spoof''','42501','permission denied for table daisy_assignments','question mutation denied');
select throws_ok('update public.hydrangea_moods set mood_key=''spoof''','42501','permission denied for table hydrangea_moods','mood mutation denied');
select throws_ok('select private.assign_daisy_question(current_date,now())','42501','permission denied for schema private','private assignment denied');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select is_empty('select * from public.'||t,'stranger cannot read '||t) from (values ('flower_entries'),('daisy_assignments'),('hydrangea_moods')) x(t);
select throws_ok(q,'42501','Garden access denied','stranger denied '||q) from (values ('select public.submit_flower_entry(null,''{}'')'),('select public.edit_flower_entry(1,''{}'')'),('select public.current_entry_state(null)'),('select public.entry_history()'),('select public.get_daily_daisy_question()')) x(q);
reset role;
set local role anon;
select throws_ok('select * from public.'||t,'42501','permission denied for table '||t,'anonymous denied '||t) from (values ('flower_entries'),('daisy_assignments'),('hydrangea_moods')) x(t);
select throws_ok(q,'42501','permission denied for function '||f,'anonymous denied '||f) from (values ('select public.submit_flower_entry(null,''{}'')','submit_flower_entry'),('select public.edit_flower_entry(1,''{}'')','edit_flower_entry'),('select public.current_entry_state(null)','current_entry_state'),('select public.entry_history()','entry_history'),('select public.get_daily_daisy_question()','get_daily_daisy_question')) x(q,f);
reset role;
set local role service_role;
select throws_ok('select * from public.flower_entries','42501','permission denied for table flower_entries','service role table denied');
select throws_ok('select public.entry_history()','42501','permission denied for function entry_history','service role RPC denied');
reset role;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);
update private.garden_members set revoked_at=now() where member_id=1;
set local role authenticated;
select is_empty('select * from public.flower_entries','revoked member loses reads');
select throws_ok('select public.entry_history()','42501','Garden access denied','revoked member loses RPC');
reset role;
select ok(c.relrowsecurity,c.relname||' enables RLS') from pg_class c where c.oid in ('public.flower_entries'::regclass,'public.daisy_assignments'::regclass,'public.hydrangea_moods'::regclass);
select is_empty($$select p.oid from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid in ('public.submit_flower_entry(uuid,jsonb)'::regprocedure,'public.edit_flower_entry(bigint,jsonb)'::regprocedure,'public.current_entry_state(uuid)'::regprocedure,'public.entry_history(uuid,integer,bigint)'::regprocedure,'public.get_daily_daisy_question()'::regprocedure,'private.assign_daisy_question(date,timestamptz)'::regprocedure,'private.validate_entry_payload(text,jsonb,date)'::regprocedure) and acl.grantee=0 and acl.privilege_type='EXECUTE'$$,'no PUBLIC execution');
select is_empty($$select p.oid from pg_proc p where p.oid in ('public.submit_flower_entry(uuid,jsonb)'::regprocedure,'public.edit_flower_entry(bigint,jsonb)'::regprocedure,'public.current_entry_state(uuid)'::regprocedure,'public.entry_history(uuid,integer,bigint)'::regprocedure,'public.get_daily_daisy_question()'::regprocedure,'private.assign_daisy_question(date,timestamptz)'::regprocedure,'private.validate_entry_payload(text,jsonb,date)'::regprocedure) and not(p.proconfig @> array['search_path=pg_catalog'])$$,'safe search paths');
select * from finish();
rollback;
