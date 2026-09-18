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
create function pg_temp.flower() returns uuid language sql as $$select id from public.flowers where type_key='peony' order by spot desc limit 1$$;
create function pg_temp.entry(p_milestone integer,p_actor integer) returns bigint language sql as $$
 select id from public.peony_contributions where flower_id=pg_temp.flower() and milestone=p_milestone and author_id=p_actor;
$$;
select pg_temp.at('2026-09-18 12:00+00');
select public.initialize_garden();
insert into public.flower_unlocks(type_key) values('peony');
select public.plant_flower('peony');
set local role authenticated;

select is((public.current_peony_state(pg_temp.flower())->>'stage')::integer,0,'new Peony starts at stage zero');
select is((public.current_peony_state(pg_temp.flower())->>'next_milestone')::integer,1,'ideas are first');
select is(jsonb_array_length(public.current_peony_state(pg_temp.flower())->'contributions'),0,'empty contributions are an array');
select is(public.current_peony_state(pg_temp.flower())->'plan','null'::jsonb,'no plan before negotiation');
select is(jsonb_array_length(public.current_peony_state(pg_temp.flower())->'completed_milestones'),0,'empty milestone history');
select is((public.current_peony_state(pg_temp.flower())->>'server_now')::timestamptz,'2026-09-18 12:00+00'::timestamptz,'one trusted post-lock instant');
select throws_ok($$select public.current_peony_state(null)$$,'22023','Unknown Peony','null flower rejected');
select throws_ok($$select public.current_peony_state((select id from public.flowers where type_key='cactus'))$$,'22023','Unknown Peony','non-Peony rejected');
select throws_ok($$select public.submit_flower_entry(pg_temp.flower(),'{"text":"Bypass"}')$$,'22023','This flower requires its dedicated workflow','ordinary entry API cannot bypass milestones');
select throws_ok($$select public.submit_peony_contribution(pg_temp.flower(),3,'{}')$$,'22023','Milestones must complete in order','confirmation cannot skip ideas');
select throws_ok($$select public.submit_peony_contribution(pg_temp.flower(),4,'{"text":"Skipped"}')$$,'22023','Milestones must complete in order','favorite cannot skip');
select throws_ok($$select public.submit_peony_contribution(pg_temp.flower(),null,'{}')$$,'22023','Milestones must complete in order','null milestone rejected');
select throws_ok($$select public.submit_peony_contribution(pg_temp.flower(),0,'{}')$$,'22023','Milestones must complete in order','invalid milestone rejected');
select throws_ok($$select public.set_peony_plan(pg_temp.flower(),0,'Remote activity','2026-09-19T19:00:00-07:00')$$,'22023','Milestones must complete in order','plan cannot skip ideas');
select throws_ok($$select public.accept_peony_plan(pg_temp.flower(),1)$$,'22023','Milestones must complete in order','acceptance cannot skip ideas');
select throws_ok('select public.submit_peony_contribution(pg_temp.flower(),1,'||quote_nullable(p)||'::jsonb)','22023','Invalid Peony content','invalid payload rejected')
 from (values(null::text),('null'),('[]'),('"text"'),('1')) v(p);
select throws_ok('select public.submit_peony_contribution(pg_temp.flower(),1,'||quote_literal(p)||'::jsonb)','22023','Peony requires a text field','wrong or forged field rejected')
 from (values('{}'),('{"text":null}'),('{"text":1}'),('{"text":[]}'),('{"text":"Idea","author_id":2}'),('{"text":"Idea","original_posted_at":"2026-09-18T12:00:00Z"}')) v(p);
select throws_ok($$select public.submit_peony_contribution(pg_temp.flower(),1,'{"text":"  \n\t "}')$$,'22023','Peony text must contain 1 to 4000 characters','whitespace-only idea rejected');
select throws_ok($$select public.submit_peony_contribution(pg_temp.flower(),1,jsonb_build_object('text',repeat('a',4001)))$$,'22023','Peony text must contain 1 to 4000 characters','oversize text rejected');
select throws_ok($$select public.submit_peony_contribution(pg_temp.flower(),1,jsonb_build_object('text',repeat('a',20001)))$$,'22023','Invalid Peony content','payload byte cap enforced');
select lives_ok($$select public.submit_peony_contribution(pg_temp.flower(),1,jsonb_build_object('text','  '||repeat('🌱',4000)||'  '))$$,'4000 Unicode characters accepted after trimming');
select is((select char_length(payload->>'text') from public.peony_contributions),4000,'trimmed Unicode text stored');
select is((select author_id from public.peony_contributions),1::smallint,'actor comes from identity');
select is((select original_posted_at from public.peony_contributions),'2026-09-18 12:00+00'::timestamptz,'original time is trusted');
select is((select growth_units from public.flowers where id=pg_temp.flower()),0::smallint,'one idea grants no growth');
select throws_ok($$select public.submit_peony_contribution(pg_temp.flower(),1,'{"text":"Repeat"}')$$,'22023','Already contributed to this milestone','repeat original rejected');
select throws_ok($$select public.edit_flower_entry(pg_temp.entry(1,1),'{"text":"Bypass"}')$$,'42501','Only the author can edit this entry','ordinary edit cannot reach Peony record');
select ok((public.current_peony_state(pg_temp.flower())->'contributions'->0->>'can_edit')::boolean,'author sees current edit availability');
select pg_temp.actor(2);
select is((public.current_peony_state(pg_temp.flower())->'contributions'->0->'payload'->>'text'),repeat('🌱',4000),'partner sees first idea before contributing');
select ok(not (public.current_peony_state(pg_temp.flower())->'contributions'->0->>'can_edit')::boolean,'partner cannot edit author contribution');
select throws_ok($$select public.edit_peony_contribution(pg_temp.entry(1,1),'{"text":"Replace"}')$$,'42501','Only the author can edit this contribution','author-only mutation enforced');
select throws_ok($$select public.edit_peony_contribution(-1,'{"text":"Replace"}')$$,'42501','Only the author can edit this contribution','unknown contribution denied');
select pg_temp.actor(1);
select pg_temp.at('2026-09-18 12:30:00+00');
select lives_ok($$select public.edit_peony_contribution(pg_temp.entry(1,1),'{"text":" Revised idea "}')$$,'exact 30-minute edit accepted');
select is((select original_posted_at from public.peony_contributions),'2026-09-18 12:00+00'::timestamptz,'edit retains original time');
select is((select updated_at from public.peony_contributions),'2026-09-18 12:30+00'::timestamptz,'edit stores actual update time');
select is((select payload->>'text' from public.peony_contributions),'Revised idea','edit normalizes text');
select pg_temp.at('2026-09-18 12:30:00.000001+00');
select throws_ok($$select public.edit_peony_contribution(pg_temp.entry(1,1),'{"text":"Late"}')$$,'22023','The edit window has ended','edit window never restarts');
select ok(not (public.current_peony_state(pg_temp.flower())->'contributions'->0->>'can_edit')::boolean,'expired flag is false');
select pg_temp.actor(2);
select lives_ok($$select public.submit_peony_contribution(pg_temp.flower(),1,'{"text":"Second idea"}')$$,'second idea completes first milestone');
select is((public.current_peony_state(pg_temp.flower())->>'stage')::integer,1,'paired ideas immediately grow one stage');
select is((select count(*) from public.peony_activity),1::bigint,'one activity event for pair');
select throws_ok($$select public.edit_peony_contribution(pg_temp.entry(1,2),'{"text":"After completion"}')$$,'22023','Milestones must complete in order','completed personal milestone fixed even inside window');
select throws_ok($$select public.submit_peony_contribution(pg_temp.flower(),2,'{}')$$,'22023','Use the shared plan workflow','shared plan cannot be forged as a contribution');

select throws_ok($$select public.accept_peony_plan(pg_temp.flower(),1)$$,'22023','The shared plan has changed; refresh first','acceptance requires an existing plan');
select throws_ok($$select public.set_peony_plan(pg_temp.flower(),1,'Activity','2026-09-19T19:00:00-07:00')$$,'22023','The shared plan has changed; refresh first','initial expected version must be zero');
select throws_ok($$select public.set_peony_plan(pg_temp.flower(),null,'Activity','2026-09-19T19:00:00-07:00')$$,'22023','The shared plan has changed; refresh first','missing version rejected');
select throws_ok('select public.set_peony_plan(pg_temp.flower(),0,'||quote_nullable(t)||',''2026-09-19T19:00:00-07:00'')','22023','Plan activity must contain 1 to 2000 characters','invalid activity rejected')
 from (values(null::text),('  '),(repeat('a',2001))) v(t);
select throws_ok('select public.set_peony_plan(pg_temp.flower(),0,''Activity'','||quote_nullable(t)||')','22023','Plan time requires an ISO timestamp with an explicit offset','ambiguous or invalid time shape rejected')
 from (values(null::text),('2026-11-01T01:30:00'),('2026-11-01 01:30:00-07:00'),('infinity'),('now'),('2026-09-19'),('2026-09-19T12:00:00 America/Los_Angeles')) v(t);
select throws_ok($$select public.set_peony_plan(pg_temp.flower(),0,'Activity','2026-02-30T19:00:00-07:00')$$,'22023','Invalid plan date and time','invalid calendar date rejected');
select lives_ok($$select public.set_peony_plan(pg_temp.flower(),0,' Remote call and a shared film ','2026-11-01T01:30:00-07:00')$$,'either member may create a remote plan');
select is((select version from public.peony_plans),1::bigint,'first version is one');
select is((select starts_at from public.peony_plans),'2026-11-01 08:30+00'::timestamptz,'fall-back first 1:30 is an unambiguous instant');
select is(public.current_peony_state(pg_temp.flower())->'plan'->>'display_timezone','America/Los_Angeles','Pacific display zone is explicit');
select is(jsonb_array_length(public.current_peony_state(pg_temp.flower())->'plan'->'acceptances'),0,'plan author has not implicitly accepted');
select lives_ok($$select public.accept_peony_plan(pg_temp.flower(),1)$$,'first explicit acceptance recorded');
select throws_ok($$select public.accept_peony_plan(pg_temp.flower(),1)$$,'22023','Already accepted this plan','duplicate acceptance cannot add credit');
select is((public.current_peony_state(pg_temp.flower())->>'stage')::integer,1,'one acceptance grants no growth');
select ok(not (public.current_peony_state(pg_temp.flower())->'plan'->>'can_accept')::boolean,'accepted member cannot accept twice');
select pg_temp.actor(1);
select ok((public.current_peony_state(pg_temp.flower())->'plan'->>'can_accept')::boolean,'other member can accept current version');
select pg_temp.at('2026-09-18 13:00+00');
select lives_ok($$select public.set_peony_plan(pg_temp.flower(),1,'Remote call and a shared film','2026-11-01T08:30:00Z')$$,'same normalized activity and instant is a no-op');
select is((select version from public.peony_plans),1::bigint,'no-op preserves version');
select is((select count(*) from public.peony_acceptances),1::bigint,'no-op preserves acceptance');
select is((select updated_at from public.peony_plans),'2026-09-18 12:30:00.000001+00'::timestamptz,'no-op preserves plan timestamp');
select lives_ok($$select public.set_peony_plan(pg_temp.flower(),1,'Remote call and a shared film','2026-11-01T01:30:00-08:00')$$,'time-only negotiation is allowed beyond personal edit window');
select is((select version from public.peony_plans),2::bigint,'material edit increments version');
select is((select starts_at from public.peony_plans),'2026-11-01 09:30+00'::timestamptz,'fall-back second 1:30 is a different instant');
select is((select count(*) from public.peony_acceptances),0::bigint,'material edit clears prior acceptance');
select throws_ok($$select public.accept_peony_plan(pg_temp.flower(),1)$$,'22023','The shared plan has changed; refresh first','stale acceptance rejected');
select throws_ok($$select public.set_peony_plan(pg_temp.flower(),1,'Stale edit','2026-11-01T09:30:00Z')$$,'22023','The shared plan has changed; refresh first','stale edit rejected');
select lives_ok($$select public.accept_peony_plan(pg_temp.flower(),2)$$,'current version acceptance accepted');
select pg_temp.actor(2);
select lives_ok($$select public.set_peony_plan(pg_temp.flower(),2,'Walk in person','2026-11-01T09:30:00Z')$$,'activity-only edit also creates a new version');
select is((select version from public.peony_plans),3::bigint,'activity-only edit increments version');
select is((select count(*) from public.peony_acceptances),0::bigint,'activity-only edit clears the other member acceptance');
select throws_ok($$select public.accept_peony_plan(pg_temp.flower(),2)$$,'22023','The shared plan has changed; refresh first','previous time version now stale');
select lives_ok($$select public.accept_peony_plan(pg_temp.flower(),3)$$,'new activity acceptance recorded');
select pg_temp.actor(1);
select lives_ok($$select public.accept_peony_plan(pg_temp.flower(),3)$$,'matching second acceptance completes agreement');
select pg_temp.actor(2);
select is((public.current_peony_state(pg_temp.flower())->>'stage')::integer,2,'plan agreement immediately advances exactly one stage');
select is((select count(*) from public.peony_activity),2::bigint,'agreement recorded once');
select is((select count(*) from public.peony_acceptances where plan_version=3),2::bigint,'both agree on exact same version');
select ok(not (public.current_peony_state(pg_temp.flower())->'plan'->>'can_edit')::boolean,'completed agreement cannot be edited');
select throws_ok($$select public.set_peony_plan(pg_temp.flower(),3,'Changed','2026-11-01T09:30:00Z')$$,'22023','Milestones must complete in order','completed plan mutation rejected');
select throws_ok($$select public.accept_peony_plan(pg_temp.flower(),3)$$,'22023','Milestones must complete in order','completed acceptance retry rejected');
select throws_ok($$select public.submit_peony_contribution(pg_temp.flower(),3,'{"happened":true}')$$,'22023','Confirmation takes no content','confirmation payload cannot forge metadata');
select lives_ok($$select public.submit_peony_contribution(pg_temp.flower(),3,'{}')$$,'first happened confirmation accepted');
select throws_ok($$select public.edit_peony_contribution(pg_temp.entry(3,2),'{}')$$,'22023','Confirmation cannot be edited','empty confirmation is not editable');
select is((public.current_peony_state(pg_temp.flower())->>'stage')::integer,2,'single confirmation grants no growth');
select pg_temp.actor(1);
select lives_ok($$select public.submit_peony_contribution(pg_temp.flower(),3,'{}')$$,'second happened confirmation completes milestone');
select is((public.current_peony_state(pg_temp.flower())->>'stage')::integer,3,'confirmation pair advances exactly once');
select lives_ok($$select public.submit_peony_contribution(pg_temp.flower(),4,'{"text":"Favorite moment"}')$$,'first favorite accepted');
select lives_ok($$select public.edit_peony_contribution(pg_temp.entry(4,1),'{"text":"Favorite moment revised"}')$$,'unfinished favorite uses personal edit rules');
select pg_temp.actor(2);
select lives_ok($$select public.submit_peony_contribution(pg_temp.flower(),4,'{"text":"Second favorite"}')$$,'second favorite completes bloom');
select is((public.current_peony_state(pg_temp.flower())->>'stage')::integer,4,'all four pairs can complete in the same garden day');
select is(public.current_peony_state(pg_temp.flower())->'next_milestone','null'::jsonb,'bloom has no next milestone');
select is(jsonb_array_length(public.current_peony_state(pg_temp.flower())->'completed_milestones'),4,'bounded history retains all four completed milestones');
select is(jsonb_array_length(public.current_peony_state(pg_temp.flower())->'contributions'),6,'both ideas confirmations and favorites retained');
select is((select first_bloom_at from public.flowers where id=pg_temp.flower()),'2026-09-18 13:00+00'::timestamptz,'bloom uses operation instant');
select is((select first_bloom_day from public.flowers where id=pg_temp.flower()),'2026-09-18'::date,'bloom uses completion garden day');
select is((select count(*) from public.flowers where first_bloom_at is not null),1::bigint,'exactly one total bloom credit');
select ok(exists(select 1 from public.flower_unlocks where type_key='daisy'),'Peony first bloom reaches existing permanent unlock seam');
select throws_ok($$select public.submit_peony_contribution(pg_temp.flower(),4,'{"text":"Repeat"}')$$,'22023','Milestones must complete in order','replay cannot bloom again');
select throws_ok($$select public.edit_peony_contribution(pg_temp.entry(4,2),'{"text":"Changed"}')$$,'22023','Milestones must complete in order','completed favorite fixed');
select is((select current_streak from public.garden),0,'current-day streak is not prematurely settled');
select ok(not exists(select 1 from jsonb_array_elements(public.current_peony_state(pg_temp.flower())->'contributions') c where (c->>'can_edit')::boolean),'all completed contributions read-only');
select ok(public.current_peony_state(pg_temp.flower())::text !~ 'example.test|11111111|22222222|google','read state has no identity configuration');

-- A second Peony starts after bloom; cross-day originals remain attached to the
-- milestone while credit belongs to the actual completion day.
select pg_temp.at('2026-09-19 10:30+00');
select lives_ok($$select public.plant_flower('peony')$$,'bloom frees unfinished Peony capacity');
select pg_temp.actor(1);
select public.submit_peony_contribution(pg_temp.flower(),1,'{"text":"Across rollover"}');
select is((public.current_peony_state(pg_temp.flower())->'contributions'->0->>'edit_deadline')::timestamptz,'2026-09-19 11:00+00'::timestamptz,'deadline truncates at garden day boundary');
select ok(not (public.current_peony_state(pg_temp.flower())->'contributions'->0->>'edit_deadline_inclusive')::boolean,'rollover deadline is exclusive');
select pg_temp.at('2026-09-19 10:59:59.999999+00');
select lives_ok($$select public.edit_peony_contribution(pg_temp.entry(1,1),'{"text":"Last allowed moment"}')$$,'edit one microsecond before rollover allowed');
select pg_temp.at('2026-09-19 11:00+00');
select throws_ok($$select public.edit_peony_contribution(pg_temp.entry(1,1),'{"text":"New day"}')$$,'22023','The edit window has ended','rollover excludes an edit even at exactly 30 minutes');
select public.current_peony_state(pg_temp.flower());
select is((select current_streak from public.garden),1,'first Peony-only completion day settles one streak day');
select is((select qualifying_days from public.garden),1::bigint,'four milestone completions count one qualifying day');
select is((select growth_units from public.flowers where id=pg_temp.flower()),0::smallint,'unfinished Peony never decays or grows daily');
select ok(not (public.current_peony_state(pg_temp.flower())->'contributions'->0->>'can_edit')::boolean,'prior-day contribution has no edit availability');
select pg_temp.actor(2);
select pg_temp.at('2026-09-19 11:05+00');
select public.submit_peony_contribution(pg_temp.flower(),1,'{"text":"Next day idea"}');
select is((select member1_posted_at from public.peony_activity where flower_id=pg_temp.flower() and milestone=1),'2026-09-19 10:30+00'::timestamptz,'activity preserves original before rollover despite edit');
select is((select member2_posted_at from public.peony_activity where flower_id=pg_temp.flower() and milestone=1),'2026-09-19 11:05+00'::timestamptz,'activity preserves second original after rollover');
select is((select garden_day from public.peony_activity where flower_id=pg_temp.flower() and milestone=1),'2026-09-19'::date,'cross-day pair credits actual completion day');
select public.set_peony_plan(pg_temp.flower(),0,'Remote conversation','2026-09-20T00:00:00Z');
select public.accept_peony_plan(pg_temp.flower(),1);
select pg_temp.at('2026-09-20 11:00+00');
select pg_temp.actor(1);
select public.accept_peony_plan(pg_temp.flower(),1);
select is((select current_streak from public.garden),2,'consecutive Peony-only day extends streak');
select is((select member2_posted_at from public.peony_activity where flower_id=pg_temp.flower() and milestone=2),'2026-09-19 11:05+00'::timestamptz,'acceptance original persists across days');
select is((select member1_posted_at from public.peony_activity where flower_id=pg_temp.flower() and milestone=2),'2026-09-20 11:00+00'::timestamptz,'second acceptance original is completion instant');
select is((select garden_day from public.peony_activity where flower_id=pg_temp.flower() and milestone=2),'2026-09-20'::date,'agreement credited when finally paired');
select pg_temp.at('2026-09-23 11:00+00');
select public.current_peony_state(pg_temp.flower());
select is((select current_streak from public.garden),0,'missing completion days reset streak');
select is((select longest_streak from public.garden),3,'three completion days retained as longest streak');
select is((select growth_units from public.flowers where id=pg_temp.flower()),2::smallint,'days without action never decay Peony');
select is((select count(*) from public.flower_day_facts where type_key='peony'),0::bigint,'ordinary rollover facts never include Peony');
select is((select count(*) from public.flowers where first_bloom_at is not null),1::bigint,'catch-up cannot grant extra Peony bloom');
select ok(exists(select 1 from public.flower_unlocks where type_key='daisy'),'unlock persists after empty days');

-- Every browser entry point has only its declared arguments and minimum grants.
select throws_ok('select public.submit_peony_contribution(pg_temp.flower(),3,''{}'',2)','42883',null,'no forged actor argument');
select throws_ok('select public.current_peony_state(pg_temp.flower(),now())','42883',null,'no forged clock argument');
select throws_ok('select private.complete_peony_milestone(pg_temp.flower(),4,now())','42501','permission denied for schema private','growth seam not browser-executable');
select throws_ok('update public.'||t||' set flower_id=flower_id','42501','permission denied for table '||t,'direct update denied for '||t)
 from (values('peony_contributions'),('peony_plans'),('peony_acceptances')) x(t);
select throws_ok('delete from public.'||t,'42501','permission denied for table '||t,'direct delete denied for '||t)
 from (values('peony_contributions'),('peony_plans'),('peony_acceptances')) x(t);
select throws_ok($$insert into public.peony_contributions(flower_id,milestone,author_id,garden_day,original_posted_at,updated_at,payload) values(pg_temp.flower(),3,2,current_date,now(),now(),'{}')$$,'42501','permission denied for table peony_contributions','direct insert denied');
select throws_ok($$select nextval('public.peony_contributions_id_seq')$$,'42501','permission denied for sequence peony_contributions_id_seq','sequence not browser writable');
select pg_temp.actor(3);
select is_empty('select * from public.'||t,'outsider cannot read '||t) from (values('peony_contributions'),('peony_plans'),('peony_acceptances')) x(t);
select throws_ok('select public.'||call,'42501','Garden access denied','outsider denied '||call)
 from (values('current_peony_state(null)'),('submit_peony_contribution(null,1,''{}'')'),('edit_peony_contribution(null,''{}'')'),('set_peony_plan(null,0,''Activity'',''2026-09-20T00:00:00Z'')'),('accept_peony_plan(null,1)')) x(call);
select pg_temp.actor(1);
reset role;
update private.garden_members set revoked_at=now() where member_id=1;
set local role authenticated;
select is_empty('select * from public.'||t,'revoked member cannot read '||t) from (values('peony_contributions'),('peony_plans'),('peony_acceptances')) x(t);
select throws_ok('select public.'||call,'42501','Garden access denied','revoked member denied '||call)
 from (values('current_peony_state(null)'),('submit_peony_contribution(null,1,''{}'')'),('edit_peony_contribution(null,''{}'')'),('set_peony_plan(null,0,''Activity'',''2026-09-20T00:00:00Z'')'),('accept_peony_plan(null,1)')) x(call);
reset role;
set local role anon;
select throws_ok('select public.current_peony_state(null)','42501','permission denied for function current_peony_state','anonymous RPC denied');
select throws_ok('select * from public.peony_plans','42501','permission denied for table peony_plans','anonymous content denied');
reset role;
set local role service_role;
select throws_ok('select public.current_peony_state(null)','42501','permission denied for function current_peony_state','service API denied');
select throws_ok('select * from public.peony_contributions','42501','permission denied for table peony_contributions','service role cannot bypass table privilege');
reset role;
select ok(c.relrowsecurity,c.relname||' enables RLS') from pg_class c where c.oid in ('public.peony_contributions'::regclass,'public.peony_plans'::regclass,'public.peony_acceptances'::regclass);
select is_empty($$select p.oid from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.proname in ('require_peony_milestone','validate_peony_payload','complete_peony_milestone','peony_state_at','current_peony_state','submit_peony_contribution','edit_peony_contribution','set_peony_plan','accept_peony_plan') and acl.grantee=0 and acl.privilege_type='EXECUTE'$$,'no PUBLIC execution grants');
select is_empty($$select p.oid from pg_proc p where p.proname in ('require_peony_milestone','validate_peony_payload','complete_peony_milestone','peony_state_at','current_peony_state','submit_peony_contribution','edit_peony_contribution','set_peony_plan','accept_peony_plan') and not(p.proconfig @> array['search_path=pg_catalog'])$$,'all routines have fixed safe search paths');
select is_empty($$select t,priv from (values('peony_contributions'),('peony_plans'),('peony_acceptances')) x(t) cross join (values('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) y(priv) where has_table_privilege('authenticated','public.'||t,priv)$$,'member grants are read-only');
select is_empty($$select p.oid from pg_proc p where p.proname in ('require_peony_milestone','validate_peony_payload','complete_peony_milestone','peony_state_at') and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'))$$,'private routines have no browser or service execution');
select * from finish();
rollback;
