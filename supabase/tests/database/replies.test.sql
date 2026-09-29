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
select public.initialize_garden();
select public.plant_flower('rose');
select public.plant_flower('marigold');
select public.submit_flower_entry((select id from public.flowers where type_key='rose'), '{"text":"Synthetic rose"}');
select pg_temp.actor(2);
select public.submit_flower_entry((select id from public.flowers where type_key='marigold'), '{"text":"Synthetic marigold"}');
create function pg_temp.entry(p_type text) returns bigint language sql as $$select e.id from public.flower_entries e join public.flowers f on f.id=e.flower_id where f.type_key=p_type$$;
-- Freeze exact facts before replying, including original edit timestamps and all
-- growth/achievement/streak inputs. A reply must not settle the garden either.
create temporary table before_replies as select jsonb_build_object(
  'entries',(select jsonb_agg(to_jsonb(e) order by id) from public.flower_entries e),
  'flowers',(select jsonb_agg(to_jsonb(f) order by id) from public.flowers f),
  'garden',(select jsonb_agg(to_jsonb(g)) from public.garden g),
  'progress',(select jsonb_agg(to_jsonb(p)) from public.achievement_progress p),
  'awards',(select jsonb_agg(to_jsonb(a)) from public.achievement_awards a)
) value;
set local role authenticated;
select lives_ok($$select public.reply_to_entry(pg_temp.entry('rose'),'Thanks','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,'partner can reply without daily response');
select is((select author_id from public.entry_replies limit 1),2::smallint,'server derives member two');
select ok((select created_at between now() and clock_timestamp() from public.entry_replies limit 1),'server derives time');
select is(jsonb_array_length(public.entry_reply_history(pg_temp.entry('rose'))),1,'partner reads immediately');
select lives_ok($$select public.reply_to_entry(pg_temp.entry('rose'),'Thanks','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,'ambiguous retry succeeds');
select is((select count(*) from public.entry_replies),1::bigint,'retry does not duplicate');
select throws_ok($$select public.reply_to_entry(pg_temp.entry('rose'),'Changed','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,'22023','Retry must use the original reply','token cannot replace content');
select throws_ok($$select public.reply_to_entry(pg_temp.entry('marigold'),'Own entry','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,'42501','Reply to your partner’s entry','own parent denied');
select throws_ok($$select public.reply_to_entry(null,'Unknown','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,'22023','Unknown entry','missing parent denied');
select throws_ok($$select public.reply_to_entry(pg_temp.entry('rose'),E' \n\t ','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,'22023','Reply must contain 1 to 4000 characters','whitespace rejected');
select throws_ok($$select public.reply_to_entry(pg_temp.entry('rose'),repeat('x',4001),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,'22023','Reply must contain 1 to 4000 characters','oversized rejected');
select throws_ok($$select public.reply_to_entry(pg_temp.entry('rose'),'Hello',null)$$,'22023','A reply request ID is required','null token rejected');
select throws_ok($$insert into public.entry_replies(entry_id,author_id,body,request_id,created_at) values(pg_temp.entry('rose'),1,'Forged','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now())$$,'42501',null,'direct insertion denied');
select throws_ok($$update public.entry_replies set body='Forged'$$,'42501',null,'direct edit denied');
select throws_ok($$delete from public.entry_replies$$,'42501',null,'direct delete denied');
select pg_temp.actor(1);
select lives_ok($$select public.reply_to_entry(pg_temp.entry('marigold'),'Appreciated','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,'other member can reply, token scoped to author');
select is(jsonb_array_length(public.entry_reply_history(pg_temp.entry('rose'))),1,'original author reads reply without care');
reset role;
select is(jsonb_build_object(
  'entries',(select jsonb_agg(to_jsonb(e) order by id) from public.flower_entries e),
  'flowers',(select jsonb_agg(to_jsonb(f) order by id) from public.flowers f),
  'garden',(select jsonb_agg(to_jsonb(g)) from public.garden g),
  'progress',(select jsonb_agg(to_jsonb(p)) from public.achievement_progress p),
  'awards',(select jsonb_agg(to_jsonb(a)) from public.achievement_awards a)
),(select value from before_replies),'replies change no care, quota, original edit window, growth, streak, or achievement facts');
-- Rollover still sees one real submission per flower, despite partner replies.
select private.settle_garden_at(clock_timestamp()+interval '1 day');
select private.evaluate_achievements(clock_timestamp()+interval '1 day');
select is((select count(*) from public.flower_day_facts where paired),0::bigint,'replies never create a qualifying response pair at rollover');
select is((select sum(growth_units)::bigint from public.flowers),0::bigint,'replies earn no rollover growth');
select is((select current_streak from public.garden),0,'replies do not maintain streak');
select ok(not exists(select 1 from public.garden_days where qualifying_activity),'reply days do not qualify');
update public.flowers set growth_units=5,first_bloom_at=clock_timestamp(),first_bloom_day=current_date where type_key='rose';
update public.flower_entries set garden_day=garden_day-1,original_posted_at=original_posted_at-interval '1 day',updated_at=updated_at-interval '1 day' where id=pg_temp.entry('rose');
set local role authenticated;
select pg_temp.actor(2);
select lives_ok($$select public.reply_to_entry(pg_temp.entry('rose'),'Still here','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,'historical entry on permanent bloom accepts reply');
select is(jsonb_array_length(public.entry_reply_history(pg_temp.entry('rose'),1)),1,'page limit respected');
select is(public.entry_reply_history(pg_temp.entry('rose'),1)->0->>'body','Still here','latest page first');
select is(public.entry_reply_history(pg_temp.entry('rose'),1,(select max(id) from public.entry_replies))->0->>'body','Thanks','exclusive history cursor');
select pg_temp.actor(3);
select throws_ok($$select public.reply_to_entry(pg_temp.entry('rose'),'Intruder','cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$,'42501',null,'outsider write denied');
select throws_ok($$select public.entry_reply_history(pg_temp.entry('rose'))$$,'42501',null,'outsider RPC read denied');
select is((select count(*) from public.entry_replies),0::bigint,'outsider direct read hidden');
reset role;
update private.garden_members set revoked_at=clock_timestamp() where member_id=2;
set local role authenticated;
select pg_temp.actor(2);
select throws_ok($$select public.reply_to_entry(pg_temp.entry('rose'),'Thanks','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,'42501',null,'revocation denies even known retry token');
select throws_ok($$select public.entry_reply_history(pg_temp.entry('rose'))$$,'42501',null,'revoked read denied');
select is((select count(*) from public.entry_replies),0::bigint,'revoked direct read hidden');
set local role anon;
select throws_ok($$select public.entry_reply_history(1)$$,'42501',null,'anonymous RPC denied');
reset role;
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='entry_replies'),'authorized realtime publication');
select * from finish();
rollback;
