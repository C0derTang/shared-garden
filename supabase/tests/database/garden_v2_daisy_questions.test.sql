-- New-garden Daisy custom questions (issue #212, decision 0068): lifecycle,
-- locking after the answer and after rollover, answer binding, stale and forged
-- rejection, RLS and grants, rollover pairing, achievement counting, history,
-- Memories and legacy isolation. Fixture text is generic.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

select has_table('public','v2_daisy_custom_questions','custom question table');
select has_column('public','v2_flower_entries','daisy_custom_question_id','entries record their custom question binding');
select hasnt_column('public','flower_entries','daisy_custom_question_id','legacy entries are unchanged');
select has_function('public','v2_ask_daisy_question',array['uuid','jsonb'],'ask or revise');
select has_function('public','v2_remove_daisy_question',array['uuid'],'withdraw');
select has_function('public','v2_daisy_entry_questions',array['bigint[]'],'history question lookup');
select ok((select relrowsecurity from pg_class where oid='public.v2_daisy_custom_questions'::regclass),'custom questions have RLS');
select ok(has_table_privilege('authenticated','public.v2_daisy_custom_questions','SELECT'),'members may read through RLS');
select ok(not has_table_privilege('authenticated','public.v2_daisy_custom_questions','INSERT,UPDATE,DELETE,TRUNCATE'),'members have no direct write grant');
select ok(not has_table_privilege('anon','public.v2_daisy_custom_questions','SELECT,INSERT,UPDATE,DELETE'),'anonymous callers have no table access');
select ok(not has_table_privilege('service_role','public.v2_daisy_custom_questions','INSERT,UPDATE,DELETE'),'service role has no write grant');
select ok(not has_sequence_privilege('authenticated','public.v2_daisy_custom_questions_id_seq','USAGE'),'no sequence grant');
select is((select count(*) from public.v2_daisy_custom_questions),0::bigint,'migration creates no question');
select ok(not (pg_get_functiondef('private.validate_nonmedia_entry_payload(text,jsonb,date)'::regprocedure) ~ 'custom'),'legacy validator is untouched');

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
create function pg_temp.daisy(p_spot integer) returns uuid language sql stable as $$select id from public.v2_flowers where spot=p_spot$$;
create function pg_temp.ask(p_spot integer,p_prompt text) returns jsonb language sql as $$
 select public.v2_ask_daisy_question(pg_temp.daisy(p_spot),jsonb_build_object('prompt',p_prompt))$$;
create function pg_temp.q(p_spot integer,p_asker integer,p_day date default '2026-11-02') returns public.v2_daisy_custom_questions language sql stable as $$
 select * from public.v2_daisy_custom_questions where flower_id=pg_temp.daisy(p_spot) and asker_id=p_asker and garden_day=p_day$$;
create function pg_temp.key(p_spot integer,p_asker integer,p_day date default '2026-11-02') returns text language sql stable as $$
 select 'custom-'||id||'-r'||revision from public.v2_daisy_custom_questions where flower_id=pg_temp.daisy(p_spot) and asker_id=p_asker and garden_day=p_day$$;
create function pg_temp.daily(p_day date default '2026-11-02') returns text language sql stable as $$select question_id from public.v2_daisy_assignments where garden_day=p_day$$;
create function pg_temp.answer(p_spot integer,p_key text,p_text text default 'A synthetic answer') returns public.v2_flower_entries language sql as $$
 select public.v2_submit_flower_entry(pg_temp.daisy(p_spot),jsonb_build_object('text',p_text,'question_id',p_key))$$;
create function pg_temp.plant(p_spot integer) returns jsonb language sql as $$
 select p from jsonb_array_elements(public.v2_current_garden_state()->'plants') p where p->'flower'->>'id'=pg_temp.daisy(p_spot)::text$$;
create function pg_temp.entry(p_spot integer,p_author integer) returns public.v2_flower_entries language sql stable as $$
 select * from public.v2_flower_entries where flower_id=pg_temp.daisy(p_spot) and author_id=p_author order by id desc limit 1$$;
create function pg_temp.progress() returns integer language sql stable as $$select progress from public.v2_achievement_progress where achievement_id='daisy-20'$$;

-- Day one: 2026-11-02 05:00 Pacific. Daisies at spots 1–5, a Rose at 6, a
-- Daisy at 7 that will bloom.
select pg_temp.at('2026-11-02 13:00+00');
select pg_temp.actor(1);
set local role authenticated;
select lives_ok(format('select public.v2_plant_flower_at(%L,%s)',t,n),'plant '||t||' at '||n)
 from (values ('daisy',1),('daisy',2),('daisy',3),('daisy',4),('daisy',5),('rose',6),('daisy',7)) x(t,n);
select lives_ok('select public.v2_current_garden_state()','read assigns the daily question');
select is(pg_temp.daily(),'light-001','daily assignment unchanged by custom questions');

-- Access: outsiders, the wrong flower and malformed questions are rejected.
select pg_temp.actor(3);
select throws_ok($$select pg_temp.ask(1,'A synthetic question?')$$,'42501','Garden access denied','outsider cannot ask');
select throws_ok($$select public.v2_remove_daisy_question(pg_temp.daisy(1))$$,'42501','Garden access denied','outsider cannot withdraw');
select throws_ok($$select public.v2_daisy_entry_questions(array[1::bigint])$$,'42501','Garden access denied','outsider cannot read questions');
select is((select count(*) from public.v2_daisy_custom_questions),0::bigint,'RLS hides questions from outsiders');
select pg_temp.actor(1);
select throws_ok($$select pg_temp.ask(6,'A synthetic question?')$$,'22023','Unknown Daisy','only a Daisy takes a custom question');
select throws_ok($$select public.v2_ask_daisy_question('ffffffff-ffff-4fff-8fff-ffffffffffff','{"prompt":"A synthetic question?"}')$$,'22023','Unknown Daisy','unknown flower rejected');
select throws_ok($$select pg_temp.ask(1,'   ')$$,'22023','Ask a question of 1 to 300 characters','blank question rejected');
select throws_ok($$select pg_temp.ask(1,repeat('q',301))$$,'22023','Ask a question of 1 to 300 characters','oversize question rejected');
select throws_ok($$select public.v2_ask_daisy_question(pg_temp.daisy(1),'{"prompt":"A synthetic question?","to":1}')$$,'22023','Invalid question fields','unknown fields rejected');
select throws_ok($$select public.v2_ask_daisy_question(pg_temp.daisy(1),'{"prompt":7}')$$,'22023','Invalid question fields','non-text question rejected');
select throws_ok($$select public.v2_ask_daisy_question(pg_temp.daisy(1),'{}')$$,'22023','Invalid question fields','missing question rejected');
select throws_ok($$select public.v2_ask_daisy_question(pg_temp.daisy(1),'"A synthetic question?"')$$,'22023','Invalid question fields','non-object question rejected');
select throws_ok($$select public.v2_ask_daisy_question(pg_temp.daisy(1),null)$$,'22023','Invalid question fields','null question rejected');
select throws_ok($$select public.v2_ask_daisy_question(p_flower_id=>pg_temp.daisy(1),p_question=>'{"prompt":"x"}',p_addressee=>1::smallint)$$,'42883',null,'no client addressee argument');
select throws_ok($$select public.v2_ask_daisy_question(p_flower_id=>pg_temp.daisy(1),p_question=>'{"prompt":"x"}',p_day=>'2026-11-01'::date)$$,'42883',null,'no client day argument');
select is((select count(*) from public.v2_daisy_custom_questions),0::bigint,'rejected asks leave nothing');
select throws_ok($$insert into public.v2_daisy_custom_questions(flower_id,garden_day,asker_id,addressee_id,prompt,created_at,updated_at)
 values (pg_temp.daisy(1),'2026-11-02',1,2,'Forged',now(),now())$$,'42501',null,'direct insert denied');

-- Ask: the server derives the asker, the addressee, the day and the time.
select lives_ok($$select pg_temp.ask(1,'  What made you smile today?  ')$$,'member one asks member two');
select results_eq($$select asker_id,addressee_id,garden_day,prompt,revision,created_at,updated_at from pg_temp.q(1,1)$$,
 $$values (1::smallint,2::smallint,'2026-11-02'::date,'What made you smile today?',1,'2026-11-02 13:00+00'::timestamptz,'2026-11-02 13:00+00'::timestamptz)$$,
 'trimmed question stored for the partner with server facts');
select throws_ok($$update public.v2_daisy_custom_questions set prompt='Forged'$$,'42501',null,'direct update denied');
select throws_ok($$delete from public.v2_daisy_custom_questions$$,'42501',null,'direct delete denied');
select lives_ok($$select pg_temp.ask(3,repeat('🌼',300))$$,'300 Unicode characters accepted');
select is((select char_length(prompt) from pg_temp.q(3,1)),300,'length counts characters');

-- The partner sees it in place of the daily question.
select pg_temp.actor(2);
select results_eq($$select (q->>'asker_id')::int,(q->>'addressee_id')::int,q->>'prompt',q->>'question_key',(q->>'locked')::boolean
  from jsonb_array_elements(pg_temp.plant(1)->'daisy_custom_questions') q$$,
 $$values (1,2,'What made you smile today?',pg_temp.key(1,1),false)$$,'snapshot lists the live question with its answer key');
select is((pg_temp.plant(1)->'daisy_question'->>'question_id'),'light-001','the daily question is still assigned');
select is(jsonb_array_length(pg_temp.plant(6)->'daisy_custom_questions'),0,'other flowers have no custom questions');
select is((select count(*) from public.v2_daisy_custom_questions),2::bigint,'members read questions through RLS');

-- Revision: editing keeps the identity and bumps the revision; the same text does not.
select pg_temp.actor(1);
select pg_temp.at('2026-11-02 13:10+00');
create temporary table first_key as select pg_temp.key(1,1) value;
grant select on first_key to authenticated;
select lives_ok($$select pg_temp.ask(1,'What made you laugh today?')$$,'asker revises');
select results_eq($$select prompt,revision,created_at,updated_at from pg_temp.q(1,1)$$,
 $$values ('What made you laugh today?',2,'2026-11-02 13:00+00'::timestamptz,'2026-11-02 13:10+00'::timestamptz)$$,'revision bumped, creation kept');
select lives_ok($$select pg_temp.ask(1,'What made you laugh today?')$$,'repeating the same text');
select is((pg_temp.q(1,1)).revision,2,'unchanged text keeps the revision');

-- Stale and forged answers are rejected; nothing is attached to unseen text.
select pg_temp.actor(2);
select lives_ok($$select pg_temp.ask(1,'What are you looking forward to?')$$,'member two asks member one back');
select throws_ok($$select pg_temp.answer(1,(select value from first_key))$$,'22023','Your question changed; refresh and answer again','an earlier revision is stale');
select throws_ok($$select pg_temp.answer(1,pg_temp.daily())$$,'22023','Your question changed; refresh and answer again','the daily question is stale while a custom one is live');
select throws_ok($$select pg_temp.answer(1,pg_temp.key(1,2))$$,'22023','Answer the question asked of you','your own question cannot be answered as yours');
select throws_ok($$select pg_temp.answer(1,pg_temp.key(3,1))$$,'22023','Answer the question asked of you','another Daisy''s question is forged');
select throws_ok($$select pg_temp.answer(1,'custom-999999-r1')$$,'22023','Answer the question asked of you','an unknown question is forged');
select throws_ok($$select pg_temp.answer(1,'deeper-001')$$,'22023','Answer the assigned daily question','another bank question is rejected');
select throws_ok($$select pg_temp.answer(1,'custom-x-r1')$$,'22023','Answer the assigned daily question','a malformed key is rejected');
select is((select count(*) from public.v2_flower_entries),0::bigint,'no rejected answer was stored');

-- Withdraw returns the partner to the daily question; asking again reuses the row.
select pg_temp.actor(1);
select lives_ok($$select public.v2_remove_daisy_question(pg_temp.daisy(1))$$,'asker withdraws');
select results_eq($$select prompt,revision from pg_temp.q(1,1)$$,$$values (null::text,3)$$,'withdrawn: text cleared, revision bumped');
select lives_ok($$select public.v2_remove_daisy_question(pg_temp.daisy(1))$$,'withdrawing again is harmless');
select is((pg_temp.q(1,1)).revision,3,'idempotent withdraw changes nothing');
select pg_temp.actor(2);
select is((select count(*) from jsonb_array_elements(pg_temp.plant(1)->'daisy_custom_questions') q where (q->>'addressee_id')::int=2),0::bigint,'partner no longer sees a question addressed to them');
select pg_temp.actor(1);
select lives_ok($$select pg_temp.ask(1,'What made you laugh today?')$$,'asker asks again');
select results_eq($$select prompt,revision from pg_temp.q(1,1)$$,$$values ('What made you laugh today?',4)$$,'same row, new revision');

-- Binding: the answer is bound to exactly the question displayed.
select pg_temp.actor(2);
select pg_temp.at('2026-11-02 13:20+00');
select lives_ok($$select pg_temp.answer(1,pg_temp.key(1,1),'  A synthetic custom answer  ')$$,'member two answers the custom question');
select results_eq($$select daisy_custom_question_id,daisy_assignment_day,payload->>'question_id',payload->>'text' from pg_temp.entry(1,2)$$,
 $$select id,'2026-11-02'::date,'custom-'||id||'-r4','A synthetic custom answer' from pg_temp.q(1,1)$$,'entry bound to the custom question; daily assignment day still recorded');
select is((select count(*) from public.v2_daisy_assignments),1::bigint,'answering consumes no extra bank question');

-- Locked once answered: no revise, no withdraw, not even directly.
select pg_temp.actor(1);
select throws_ok($$select pg_temp.ask(1,'A different question?')$$,'22023','The question is locked','answered question cannot be revised');
select throws_ok($$select public.v2_remove_daisy_question(pg_temp.daisy(1))$$,'22023','The question is locked','answered question cannot be withdrawn');
reset role;
select throws_ok($$update public.v2_daisy_custom_questions set prompt='Changed', revision=revision+1 where id=(pg_temp.q(1,1)).id$$,'22023','The question is locked','the guard locks it beneath the RPCs');
select throws_ok($$update public.v2_daisy_custom_questions set asker_id=2,addressee_id=1 where id=(pg_temp.q(3,1)).id$$,'22023','A question keeps its flower, day and members','identity columns never move');
select throws_ok($$update public.v2_flower_entries set daisy_custom_question_id=(pg_temp.q(1,2)).id where id=(pg_temp.entry(1,2)).id$$,'23503',null,'an entry cannot be bound to a question addressed to someone else');
set local role authenticated;
select pg_temp.actor(1);
select is((select (q->>'locked')::boolean from jsonb_array_elements(pg_temp.plant(1)->'daisy_custom_questions') q where (q->>'asker_id')::int=1),true,'snapshot shows the question as locked');

-- Edits keep the original binding.
select pg_temp.actor(2);
select lives_ok($$select public.v2_edit_flower_entry((pg_temp.entry(1,2)).id,jsonb_build_object('text','An edited answer','question_id',pg_temp.key(1,1)))$$,'edit with the bound question');
select is((pg_temp.entry(1,2)).daisy_custom_question_id,(pg_temp.q(1,1)).id,'binding kept after edit');
select throws_ok($$select public.v2_edit_flower_entry((pg_temp.entry(1,2)).id,jsonb_build_object('text','Moved','question_id',pg_temp.daily()))$$,'22023','An edit keeps its original question','an edit cannot move to the daily question');
select throws_ok($$select public.v2_edit_flower_entry((pg_temp.entry(1,2)).id,jsonb_build_object('text','Moved','question_id',pg_temp.key(3,1)))$$,'22023','An edit keeps its original question','an edit cannot move to another custom question');

-- The daily path is unchanged for a member with no live question addressed to them.
select pg_temp.actor(1);
select throws_ok($$select pg_temp.answer(1,pg_temp.daily())$$,'22023','Your question changed; refresh and answer again','member one has a live question from member two');
select pg_temp.actor(2);
select lives_ok($$select public.v2_remove_daisy_question(pg_temp.daisy(1))$$,'member two withdraws their question');
select pg_temp.actor(1);
select pg_temp.at('2026-11-02 13:25+00');
select lives_ok($$select pg_temp.answer(1,pg_temp.daily(),'A synthetic daily answer')$$,'member one answers the daily question');
select results_eq($$select daisy_custom_question_id,payload->>'question_id' from pg_temp.entry(1,1)$$,$$values (null::bigint,'light-001')$$,'daily answer has no custom binding');
select pg_temp.actor(2);
select throws_ok($$select pg_temp.ask(1,'Too late?')$$,'22023','The question is locked','no question can be added after the daily answer');
select lives_ok($$select public.v2_edit_flower_entry((pg_temp.entry(1,2)).id,jsonb_build_object('text','Still bound','question_id',pg_temp.key(1,1)))$$,'edits still work');

-- Each answer exposes the question it answered.
select results_eq($$select e->>'author_id',e->'question'->>'kind',e->'question'->>'prompt',e->'question'->>'asked_by',e->'question'->>'category'
  from jsonb_array_elements(pg_temp.plant(1)->'entries') e order by 1$$,
 $$values ('1','daily',(select prompt from public.v2_daisy_assignments where garden_day='2026-11-02'),null::text,'light'),
   ('2','custom','What made you laugh today?','1',null::text)$$,'snapshot entries carry their questions');
select results_eq($$select (x->>'entry_id')::bigint,x->'question'->>'kind' from jsonb_array_elements(public.v2_daisy_entry_questions(array[(pg_temp.entry(1,1)).id,(pg_temp.entry(1,2)).id])) x order by 1$$,
 $$select * from (values ((pg_temp.entry(1,1)).id,'daily'),((pg_temp.entry(1,2)).id,'custom')) v order by 1$$,'history lookup resolves both questions');
select throws_ok($$select public.v2_daisy_entry_questions(array[]::bigint[])$$,'22023','Invalid entry list','empty lookup rejected');
select throws_ok($$select public.v2_daisy_entry_questions(array_fill(1::bigint,array[101]))$$,'22023','Invalid entry list','oversize lookup rejected');
select throws_ok($$select public.v2_daisy_entry_questions(array[null::bigint])$$,'22023','Invalid entry list','null IDs rejected');

-- A bloomed Daisy takes no new question; the partner must be a live member.
reset role;
update public.v2_flowers set growth_units=7, first_bloom_at='2026-11-02 13:00+00', first_bloom_day='2026-11-02' where spot=7;
set local role authenticated;
select pg_temp.actor(1);
select throws_ok($$select pg_temp.ask(7,'A synthetic question?')$$,'22023','This flower has already bloomed','bloomed Daisy rejects new questions');
reset role;
update private.garden_members set revoked_at=now() where member_id=2;
set local role authenticated;
select throws_ok($$select pg_temp.ask(2,'A synthetic question?')$$,'42501','Your partner is not a garden member','a revoked partner cannot be addressed');
reset role;
update private.garden_members set revoked_at=null where member_id=2;
set local role authenticated;

-- Achievement evidence on day one (before rollover). Daisy 1: custom pair.
-- Daisies 4 and 5: daily pairs on the same bank question (counts once).
select pg_temp.actor(1);
select lives_ok($$select pg_temp.answer(4,pg_temp.daily())$$,'daily answer on Daisy 4');
select lives_ok($$select pg_temp.answer(5,pg_temp.daily())$$,'daily answer on Daisy 5');
select lives_ok($$select pg_temp.ask(2,'A question that will go unanswered?')$$,'unanswered question on Daisy 2');
select pg_temp.actor(2);
select lives_ok($$select pg_temp.answer(4,pg_temp.daily())$$,'paired daily answer on Daisy 4');
select lives_ok($$select pg_temp.answer(5,pg_temp.daily())$$,'paired daily answer on Daisy 5');
select is(pg_temp.progress(),2,'today: one custom pair and one daily question');

-- Rollover: pairing, growth and settled facts treat custom answers as Daisy care.
select pg_temp.at('2026-11-03 13:00+00');
select lives_ok('select public.v2_current_garden_state()','rollover settles day one');
select results_eq($$select paired,growth_before,growth_after,daisy_question_id from public.v2_flower_day_facts where flower_id=pg_temp.daisy(1) and garden_day='2026-11-02'$$,
 $$values (true,0::smallint,1::smallint,'custom:'||pg_temp.daisy(1)::text||':2026-11-02')$$,'custom pair grows and settles under its flower/day key');
select results_eq($$select daisy_question_id from public.v2_flower_day_facts where flower_id in (pg_temp.daisy(4),pg_temp.daisy(5)) and garden_day='2026-11-02'$$,
 $$values ('light-001'),('light-001')$$,'daily pairs keep the bank question ID');
select results_eq($$select paired,growth_after from public.v2_flower_day_facts where flower_id=pg_temp.daisy(2) and garden_day='2026-11-02'$$,
 $$values (false,0::smallint)$$,'an unanswered question is not care');
select ok((select qualifying_activity from public.v2_garden_days where garden_day='2026-11-02'),'custom-question pairs make a qualifying day');
select is(pg_temp.progress(),2,'settled progress equals pre-rollover progress');

-- After rollover, yesterday's questions are permanent and today starts fresh.
select pg_temp.actor(1);
select is(jsonb_array_length(pg_temp.plant(2)->'daisy_custom_questions'),0,'yesterday''s question does not carry over');
select lives_ok($$select public.v2_remove_daisy_question(pg_temp.daisy(2))$$,'withdrawing today touches nothing from yesterday');
select results_eq($$select prompt,revision from pg_temp.q(2,1)$$,$$values ('A question that will go unanswered?',1)$$,'yesterday''s unanswered question is unchanged');
select lives_ok($$select pg_temp.ask(2,'A new question for today?')$$,'a new day takes a new question');
select isnt((pg_temp.q(2,1,'2026-11-03')).id,(pg_temp.q(2,1)).id,'a separate row per garden day');
select pg_temp.actor(2);
select throws_ok($$select pg_temp.answer(2,pg_temp.key(2,1))$$,'22023','Answer the question asked of you','yesterday''s question cannot be answered today');
select lives_ok($$select pg_temp.answer(2,pg_temp.key(2,1,'2026-11-03'))$$,'today''s question can');
select throws_ok($$select public.v2_edit_flower_entry((pg_temp.entry(1,2)).id,jsonb_build_object('text','Late','question_id',pg_temp.key(1,1)))$$,'22023','The edit window has ended','past answers are read-only');

-- Day two: a custom pair on Daisy 4 and a daily pair on Daisy 5 add two more.
select lives_ok($$select pg_temp.ask(4,'Which song suits today?')$$,'member two asks on Daisy 4');
select pg_temp.actor(1);
select lives_ok($$select pg_temp.answer(4,pg_temp.key(4,2,'2026-11-03'))$$,'member one answers it');
select lives_ok($$select pg_temp.answer(5,pg_temp.daily('2026-11-03'))$$,'member one answers the daily question on Daisy 5');
select pg_temp.actor(2);
select lives_ok($$select pg_temp.answer(4,pg_temp.daily('2026-11-03'))$$,'member two answers the daily question on Daisy 4');
select lives_ok($$select pg_temp.answer(5,pg_temp.daily('2026-11-03'))$$,'member two answers the daily question on Daisy 5');
select is(pg_temp.daily('2026-11-03'),'deeper-001','bank order unchanged');
select is(pg_temp.progress(),4,'a pair with either answer custom counts once, distinct from the daily ID');

-- Existing daily evidence keeps counting, so progress never drops.
reset role;
insert into public.v2_garden_days values ('2026-10-01','2026-10-01 11:00Z','2026-10-02 11:00Z','2026-10-02 11:00Z',true,1,0,false);
insert into public.v2_flower_day_facts(flower_id,garden_day,type_key,growth_before,growth_after,paired,qualifying_activity,first_bloom,member1_posted_at,member2_posted_at,daisy_question_id)
 values (pg_temp.daisy(3),'2026-10-01','daisy',0,0,true,true,false,'2026-10-01 20:00Z','2026-10-01 20:30Z','light-009');
set local role authenticated;
select pg_temp.actor(1);
select lives_ok('select public.v2_current_garden_state()','re-evaluate');
select is(pg_temp.progress(),5,'earlier daily facts still count by bank ID');

-- Memories show each answer with its question and, for custom questions, the asker.
create temporary table memories as select public.v2_memories_page('latest',null,null,'daisy') value;
grant select on memories to authenticated;
select results_eq($$select i->'entry'->>'question',i->'entry'->>'question_asked_by' from memories,jsonb_array_elements(value->'items') i
  where i->'flower'->>'id'=pg_temp.daisy(1)::text order by i->'entry'->>'author_id'$$,
 $$values ((select prompt from public.v2_daisy_assignments where garden_day='2026-11-02'),null::text),('What made you laugh today?','1')$$,
 'Memories pair each Daisy answer with its own question');
select pg_temp.actor(3);
select throws_ok($$select public.v2_memories_page()$$,'42501','Garden membership required','outsiders still cannot read Memories');

select * from finish();
rollback;
