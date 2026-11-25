-- New-garden Peony (issue #177): ordered shared milestones, +1 growth per
-- completed milestone, bloom at 4, qualifying days, legacy isolation and grants.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();
select has_table('public','v2_peony_contributions','v2 Peony contributions');
select has_table('public','v2_peony_plans','v2 Peony plans');
select has_table('public','v2_peony_acceptances','v2 Peony acceptances');
select has_table('public','v2_peony_activity','v2 Peony completed milestones');
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
create function pg_temp.flower() returns uuid language sql as $$select id from public.v2_flowers where type_key='peony' order by spot desc limit 1$$;
create function pg_temp.entry(p_milestone integer,p_actor integer) returns bigint language sql as $$
 select id from public.v2_peony_contributions where flower_id=pg_temp.flower() and milestone=p_milestone and author_id=p_actor;
$$;
create function pg_temp.stage() returns integer language sql as $$select (public.v2_current_peony_state(pg_temp.flower())->>'stage')::integer$$;

-- Garden day 2026-09-18 (PDT). Peony is plantable from the start, next to a Cactus.
select pg_temp.actor(1);
select pg_temp.at('2026-09-18 12:00+00');
set local role authenticated;
select lives_ok($$select public.v2_plant_flower_at('cactus',1)$$,'Cactus planted');
select lives_ok($$select public.v2_plant_flower_at('peony',2)$$,'Peony is available immediately');

select is(pg_temp.stage(),0,'new Peony starts at stage zero');
select is((public.v2_current_peony_state(pg_temp.flower())->>'next_milestone')::integer,1,'ideas are first');
select is(jsonb_array_length(public.v2_current_peony_state(pg_temp.flower())->'contributions'),0,'empty contributions are an array');
select is(public.v2_current_peony_state(pg_temp.flower())->'plan','null'::jsonb,'no plan before negotiation');
select is(jsonb_array_length(public.v2_current_peony_state(pg_temp.flower())->'completed_milestones'),0,'empty milestone history');
select is((public.v2_current_peony_state(pg_temp.flower())->>'server_now')::timestamptz,'2026-09-18 12:00+00'::timestamptz,'one trusted post-lock instant');
select is((public.v2_current_peony_state(pg_temp.flower())->>'member_id')::integer,1,'actor comes from identity');
select throws_ok($$select public.v2_current_peony_state(null)$$,'22023','Unknown Peony','null flower rejected');
select throws_ok($$select public.v2_current_peony_state((select id from public.v2_flowers where type_key='cactus'))$$,'22023','Unknown Peony','non-Peony rejected');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower(),'{"text":"Bypass"}')$$,'22023','This flower requires its dedicated workflow','ordinary v2 entry API cannot bypass milestones');
select throws_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),3,'{}')$$,'22023','Milestones must complete in order','confirmation cannot skip ideas');
select throws_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),4,'{"text":"Skipped"}')$$,'22023','Milestones must complete in order','favorite cannot skip');
select throws_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),null,'{}')$$,'22023','Milestones must complete in order','null milestone rejected');
select throws_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),0,'{}')$$,'22023','Milestones must complete in order','invalid milestone rejected');
select throws_ok($$select public.v2_set_peony_plan(pg_temp.flower(),0,'Remote activity','2026-09-19T19:00:00-07:00')$$,'22023','Milestones must complete in order','plan cannot skip ideas');
select throws_ok($$select public.v2_accept_peony_plan(pg_temp.flower(),1)$$,'22023','Milestones must complete in order','acceptance cannot skip ideas');
select throws_ok('select public.v2_submit_peony_contribution(pg_temp.flower(),1,'||quote_nullable(p)||'::jsonb)','22023','Invalid Peony content','invalid payload rejected')
 from (values(null::text),('null'),('[]'),('"text"'),('1')) v(p);
select throws_ok('select public.v2_submit_peony_contribution(pg_temp.flower(),1,'||quote_literal(p)||'::jsonb)','22023','Peony requires a text field','wrong or forged field rejected')
 from (values('{}'),('{"text":null}'),('{"text":1}'),('{"text":"Idea","author_id":2}'),('{"text":"Idea","original_posted_at":"2026-09-18T12:00:00Z"}')) v(p);
select throws_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),1,'{"text":"  \n\t "}')$$,'22023','Peony text must contain 1 to 4000 characters','whitespace-only idea rejected');
select throws_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),1,jsonb_build_object('text',repeat('a',4001)))$$,'22023','Peony text must contain 1 to 4000 characters','oversize text rejected');
select throws_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),1,jsonb_build_object('text',repeat('a',20001)))$$,'22023','Invalid Peony content','payload byte cap enforced');
select lives_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),1,'{"text":"  First idea  "}')$$,'first idea accepted');
select is((select payload->>'text' from public.v2_peony_contributions),'First idea','text trimmed');
select is((select author_id from public.v2_peony_contributions),1::smallint,'author from identity');
select is((select original_posted_at from public.v2_peony_contributions),'2026-09-18 12:00+00'::timestamptz,'original time is trusted');
select is((select growth_units from public.v2_flowers where id=pg_temp.flower()),0::smallint,'one idea grants no growth');
select throws_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),1,'{"text":"Repeat"}')$$,'22023','Already contributed to this milestone','repeat original rejected');
select throws_ok($$select public.v2_edit_flower_entry(pg_temp.entry(1,1),'{"text":"Bypass"}')$$,'42501','Only the author can edit this entry','ordinary edit cannot reach Peony record');
select ok((public.v2_current_peony_state(pg_temp.flower())->'contributions'->0->>'can_edit')::boolean,'author sees current edit availability');
select pg_temp.actor(2);
select is(public.v2_current_peony_state(pg_temp.flower())->'contributions'->0->'payload'->>'text','First idea','partner sees first idea before contributing');
select ok(not (public.v2_current_peony_state(pg_temp.flower())->'contributions'->0->>'can_edit')::boolean,'partner cannot edit author contribution');
select throws_ok($$select public.v2_edit_peony_contribution(pg_temp.entry(1,1),'{"text":"Replace"}')$$,'42501','Only the author can edit this contribution','author-only mutation enforced');
select throws_ok($$select public.v2_edit_peony_contribution(-1,'{"text":"Replace"}')$$,'42501','Only the author can edit this contribution','unknown contribution denied');
select pg_temp.actor(1);
select pg_temp.at('2026-09-18 12:30:00+00');
select lives_ok($$select public.v2_edit_peony_contribution(pg_temp.entry(1,1),'{"text":" Revised idea "}')$$,'exact 30-minute edit accepted');
select is((select original_posted_at from public.v2_peony_contributions),'2026-09-18 12:00+00'::timestamptz,'edit retains original time');
select is((select updated_at from public.v2_peony_contributions),'2026-09-18 12:30+00'::timestamptz,'edit stores actual update time');
select is((select payload->>'text' from public.v2_peony_contributions),'Revised idea','edit normalizes text');
select pg_temp.at('2026-09-18 12:30:00.000001+00');
select throws_ok($$select public.v2_edit_peony_contribution(pg_temp.entry(1,1),'{"text":"Late"}')$$,'22023','The edit window has ended','edit window never restarts');
select pg_temp.actor(2);
select lives_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),1,'{"text":"Second idea"}')$$,'second idea completes first milestone');
select is(pg_temp.stage(),1,'paired ideas immediately grow one stage');
select is((select growth_units from public.v2_flowers where id=pg_temp.flower()),1::smallint,'flower growth is the stage');
select results_eq($$select milestone,garden_day,completed_at,member1_posted_at,member2_posted_at from public.v2_peony_activity$$,
 $$values (1::smallint,'2026-09-18'::date,'2026-09-18 12:30:00.000001+00'::timestamptz,'2026-09-18 12:00+00'::timestamptz,'2026-09-18 12:30:00.000001+00'::timestamptz)$$,'one activity event keeps both originals');
select throws_ok($$select public.v2_edit_peony_contribution(pg_temp.entry(1,2),'{"text":"After completion"}')$$,'22023','Milestones must complete in order','completed milestone fixed even inside window');
select throws_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),2,'{}')$$,'22023','Use the shared plan workflow','shared plan cannot be forged as a contribution');

-- Shared plan negotiation with versions and explicit acceptances.
select throws_ok($$select public.v2_accept_peony_plan(pg_temp.flower(),1)$$,'22023','The shared plan has changed; refresh first','acceptance requires an existing plan');
select throws_ok($$select public.v2_set_peony_plan(pg_temp.flower(),1,'Activity','2026-09-19T19:00:00-07:00')$$,'22023','The shared plan has changed; refresh first','initial expected version must be zero');
select throws_ok('select public.v2_set_peony_plan(pg_temp.flower(),0,'||quote_nullable(t)||',''2026-09-19T19:00:00-07:00'')','22023','Plan activity must contain 1 to 2000 characters','invalid activity rejected')
 from (values(null::text),('  '),(repeat('a',2001))) v(t);
select throws_ok('select public.v2_set_peony_plan(pg_temp.flower(),0,''Activity'','||quote_nullable(t)||')','22023','Plan time requires an ISO timestamp with an explicit offset','ambiguous or invalid time shape rejected')
 from (values(null::text),('2026-11-01T01:30:00'),('infinity'),('now'),('2026-09-19')) v(t);
select throws_ok($$select public.v2_set_peony_plan(pg_temp.flower(),0,'Activity','2026-02-30T19:00:00-07:00')$$,'22023','Invalid plan date and time','invalid calendar date rejected');
select lives_ok($$select public.v2_set_peony_plan(pg_temp.flower(),0,' Remote call and a shared film ','2026-11-01T01:30:00-07:00')$$,'either member may create a plan');
select results_eq($$select version,activity,starts_at,updated_by from public.v2_peony_plans$$,
 $$values (1::bigint,'Remote call and a shared film','2026-11-01 08:30+00'::timestamptz,2::smallint)$$,'first plan version stored');
select lives_ok($$select public.v2_accept_peony_plan(pg_temp.flower(),1)$$,'first explicit acceptance recorded');
select throws_ok($$select public.v2_accept_peony_plan(pg_temp.flower(),1)$$,'22023','Already accepted this plan','duplicate acceptance cannot add credit');
select is(pg_temp.stage(),1,'one acceptance grants no growth');
select pg_temp.actor(1);
select ok((public.v2_current_peony_state(pg_temp.flower())->'plan'->>'can_accept')::boolean,'other member can accept current version');
select pg_temp.at('2026-09-18 13:00+00');
select lives_ok($$select public.v2_set_peony_plan(pg_temp.flower(),1,'Remote call and a shared film','2026-11-01T08:30:00Z')$$,'same activity and instant is a no-op');
select is((select count(*) from public.v2_peony_acceptances),1::bigint,'no-op preserves acceptance');
select lives_ok($$select public.v2_set_peony_plan(pg_temp.flower(),1,'Walk in person','2026-11-01T08:30:00Z')$$,'material edit');
select is((select version from public.v2_peony_plans),2::bigint,'material edit increments version');
select is((select count(*) from public.v2_peony_acceptances),0::bigint,'material edit clears prior acceptance');
select throws_ok($$select public.v2_accept_peony_plan(pg_temp.flower(),1)$$,'22023','The shared plan has changed; refresh first','stale acceptance rejected');
select lives_ok($$select public.v2_accept_peony_plan(pg_temp.flower(),2)$$,'current version accepted');
select pg_temp.actor(2);
select lives_ok($$select public.v2_accept_peony_plan(pg_temp.flower(),2)$$,'matching second acceptance completes agreement');
select is(pg_temp.stage(),2,'agreement advances exactly one stage');
select is((select count(*) from public.v2_peony_activity),2::bigint,'agreement recorded once');
select throws_ok($$select public.v2_set_peony_plan(pg_temp.flower(),2,'Changed','2026-11-01T09:30:00Z')$$,'22023','Milestones must complete in order','completed plan mutation rejected');

-- Confirmation and favorites complete the bloom on the same garden day.
select throws_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),3,'{"happened":true}')$$,'22023','Confirmation takes no content','confirmation payload cannot forge metadata');
select lives_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),3,'{}')$$,'first happened confirmation accepted');
select throws_ok($$select public.v2_edit_peony_contribution(pg_temp.entry(3,2),'{}')$$,'22023','Confirmation cannot be edited','confirmation is not editable');
select pg_temp.actor(1);
select lives_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),3,'{}')$$,'second confirmation completes milestone');
select is(pg_temp.stage(),3,'confirmation pair advances exactly once');
select lives_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),4,'{"text":"Favorite moment"}')$$,'first favorite accepted');
reset role;
select is((select count(*) from public.v2_achievement_awards where achievement_id in ('peony','first-bloom')),0::bigint,'no bloom award before the pair completes');
set local role authenticated;
select pg_temp.actor(2);
select lives_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),4,'{"text":"Second favorite"}')$$,'second favorite completes bloom');
select is(pg_temp.stage(),4,'all four milestones can complete in one garden day');
select is(public.v2_current_peony_state(pg_temp.flower())->'next_milestone','null'::jsonb,'bloom has no next milestone');
select is(jsonb_array_length(public.v2_current_peony_state(pg_temp.flower())->'completed_milestones'),4,'all four completed milestones retained');
select is(jsonb_array_length(public.v2_current_peony_state(pg_temp.flower())->'contributions'),6,'ideas, confirmations and favorites retained');
select results_eq($$select growth_units,first_bloom_at,first_bloom_day from public.v2_flowers where id=pg_temp.flower()$$,
 $$values (4::smallint,'2026-09-18 13:00+00'::timestamptz,'2026-09-18'::date)$$,'bloom uses the operation instant and its garden day');
select results_eq($$select achievement_id,earned_at,earned_day from public.v2_achievement_awards where achievement_id in ('peony','first-bloom') order by 1$$,
 $$values ('first-bloom','2026-09-18 13:00+00'::timestamptz,'2026-09-18'::date),('peony','2026-09-18 13:00+00'::timestamptz,'2026-09-18'::date)$$,'Peony bloom awards immediately in v2 with its garden day');
select ok(exists(select 1 from public.v2_achievement_awards where achievement_id='ten-minutes'),'same-milestone originals within ten minutes award');
select throws_ok($$select public.v2_submit_peony_contribution(pg_temp.flower(),4,'{"text":"Repeat"}')$$,'22023','Milestones must complete in order','replay cannot bloom again');
select ok(not exists(select 1 from jsonb_array_elements(public.v2_current_peony_state(pg_temp.flower())->'contributions') c where (c->>'can_edit')::boolean),'completed contributions read-only');
select ok(public.v2_current_peony_state(pg_temp.flower())::text !~ 'example.test|11111111|22222222|google','read state has no identity configuration');
select is((select current_streak from public.v2_garden),0,'current-day streak is not prematurely settled');

-- No limits: two unfinished Peonies coexist. Cross-day originals stay attached
-- to the milestone; credit belongs to the completion day.
select pg_temp.at('2026-09-19 10:30+00');
select lives_ok($$select public.v2_plant_flower_at('peony',3)$$,'another Peony may be planted');
select lives_ok($$select public.v2_plant_flower_at('peony',4)$$,'and another unfinished Peony alongside it');
select pg_temp.actor(1);
select public.v2_submit_peony_contribution(pg_temp.flower(),1,'{"text":"Across rollover"}');
select is((public.v2_current_peony_state(pg_temp.flower())->'contributions'->0->>'edit_deadline')::timestamptz,'2026-09-19 11:00+00'::timestamptz,'deadline truncates at the garden day boundary');
select pg_temp.at('2026-09-19 11:00+00');
select throws_ok($$select public.v2_edit_peony_contribution(pg_temp.entry(1,1),'{"text":"New day"}')$$,'22023','The edit window has ended','rollover ends the edit window');
select public.v2_current_peony_state(pg_temp.flower());
reset role;
select results_eq($$select qualifying_activity,streak from public.v2_garden_days where garden_day='2026-09-18'$$,$$values (true,1)$$,'a Peony-only completion day qualifies');
select is((select qualifying_days from public.v2_garden),1::bigint,'four milestone completions count one qualifying day');
select is((select count(*) from public.v2_flower_day_facts where type_key='peony'),0::bigint,'Peony never produces generic day facts');
set local role authenticated;
select pg_temp.actor(2);
select pg_temp.at('2026-09-19 11:05+00');
select public.v2_submit_peony_contribution(pg_temp.flower(),1,'{"text":"Next day idea"}');
select results_eq($$select garden_day,member1_posted_at,member2_posted_at from public.v2_peony_activity where flower_id=pg_temp.flower()$$,
 $$values ('2026-09-19'::date,'2026-09-19 10:30+00'::timestamptz,'2026-09-19 11:05+00'::timestamptz)$$,'cross-day pair keeps originals and credits the completion day');
select is((select count(*) from public.v2_achievement_awards where achievement_id='ten-minutes'),1::bigint,'awards are permanent and single');
select pg_temp.at('2026-09-20 11:00+00');
select public.v2_current_peony_state(pg_temp.flower());
reset role;
select is((select current_streak from public.v2_garden),2,'consecutive Peony-only day extends the streak');
set local role authenticated;
select pg_temp.at('2026-09-24 11:00+00');
select public.v2_current_peony_state(pg_temp.flower());
reset role;
select is((select current_streak from public.v2_garden),0,'missed days reset the streak');
select is((select growth_units from public.v2_flowers where id=pg_temp.flower()),1::smallint,'Peony never decays');
select is((select growth_units from public.v2_flowers where spot=3),0::smallint,'idle Peony never grows daily');
select is((select count(*) from public.v2_flowers where first_bloom_at is not null),1::bigint,'catch-up grants no extra bloom');

-- Legacy Peony and achievements are untouched.
select is((select count(*) from public.peony_contributions),0::bigint,'no legacy Peony contributions');
select is((select count(*) from public.peony_activity),0::bigint,'no legacy Peony activity');
select is((select count(*) from public.achievement_awards),0::bigint,'no legacy awards');
select is((select count(*) from public.flowers),0::bigint,'no legacy flowers');

-- Browser entry points have only declared arguments and minimum grants.
set local role authenticated;
select pg_temp.actor(1);
select throws_ok('select public.v2_submit_peony_contribution(pg_temp.flower(),3,''{}'',2)','42883',null,'no forged actor argument');
select throws_ok('select public.v2_current_peony_state(pg_temp.flower(),now())','42883',null,'no forged clock argument');
select throws_ok('select private.v2_complete_peony_milestone(pg_temp.flower(),4,now())','42501','permission denied for schema private','growth seam not browser-executable');
select throws_ok('update public.'||t||' set flower_id=flower_id','42501','permission denied for table '||t,'direct update denied for '||t)
 from (values('v2_peony_contributions'),('v2_peony_plans'),('v2_peony_acceptances'),('v2_peony_activity')) x(t);
select throws_ok('delete from public.'||t,'42501','permission denied for table '||t,'direct delete denied for '||t)
 from (values('v2_peony_contributions'),('v2_peony_plans'),('v2_peony_acceptances'),('v2_peony_activity')) x(t);
select throws_ok($$select nextval('public.v2_peony_contributions_id_seq')$$,'42501','permission denied for sequence v2_peony_contributions_id_seq','sequence not browser writable');
select pg_temp.actor(3);
select is_empty('select * from public.'||t,'outsider cannot read '||t)
 from (values('v2_peony_contributions'),('v2_peony_plans'),('v2_peony_acceptances'),('v2_peony_activity')) x(t);
select throws_ok('select public.'||call,'42501','Garden access denied','outsider denied '||call)
 from (values('v2_current_peony_state(null)'),('v2_submit_peony_contribution(null,1,''{}'')'),('v2_edit_peony_contribution(null,''{}'')'),('v2_set_peony_plan(null,0,''Activity'',''2026-09-20T00:00:00Z'')'),('v2_accept_peony_plan(null,1)')) x(call);
reset role;
set local role anon;
select throws_ok('select public.v2_current_peony_state(null)','42501','permission denied for function v2_current_peony_state','anonymous RPC denied');
select throws_ok('select * from public.v2_peony_plans','42501','permission denied for table v2_peony_plans','anonymous content denied');
reset role;
set local role service_role;
select throws_ok('select public.v2_current_peony_state(null)','42501','permission denied for function v2_current_peony_state','service API denied');
select throws_ok('select * from public.v2_peony_contributions','42501','permission denied for table v2_peony_contributions','service role cannot bypass table privilege');
reset role;
select ok(c.relrowsecurity,c.relname||' enables RLS') from pg_class c
 where c.oid in ('public.v2_peony_contributions'::regclass,'public.v2_peony_plans'::regclass,'public.v2_peony_acceptances'::regclass,'public.v2_peony_activity'::regclass);
select is_empty($$select p.oid from pg_proc p where p.proname like 'v2\_%peony%' and not(p.proconfig @> array['search_path=pg_catalog'])$$,'all v2 Peony routines have fixed safe search paths');
select is_empty($$select t,priv from (values('v2_peony_contributions'),('v2_peony_plans'),('v2_peony_acceptances'),('v2_peony_activity')) x(t) cross join (values('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) y(priv) where has_table_privilege('authenticated','public.'||t,priv)$$,'member grants are read-only');
select * from finish();
rollback;
