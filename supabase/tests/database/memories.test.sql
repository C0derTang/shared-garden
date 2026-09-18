begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();
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

alter sequence public.flower_entries_id_seq restart with 1;
alter sequence public.peony_contributions_id_seq restart with 1;
-- Synthetic retained records only. Every kind, both authors, repeated songs,
-- and separate identity sequences with equal/microsecond original timestamps.
insert into public.flowers(type_key,spot,planted_at,planted_day,planted_by,shared_wish)
select type_key, row_number() over(order by type_key)+1, '2026-08-01 17:00Z','2026-08-01',1,
 case when type_key='dandelion' then 'A shared synthetic wish' end
from public.flower_catalog where type_key<>'cactus';
insert into public.flowers(type_key,spot,planted_at,planted_day,planted_by,shared_wish)
values ('dandelion',20,'2026-08-01 17:00Z','2026-08-01',2,'An unwatered wish');
insert into public.daisy_assignments values ('2026-08-02',1,'light-001','light','Retained old question?', '2026-08-02 11:00Z'),('2026-08-03',2,'deeper-001','deeper','A different retained question?', '2026-08-03 11:00Z');
insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload,daisy_assignment_day)
select f.id,a,'2026-08-02', '2026-08-02 17:00:00.000001Z','2026-08-02 17:00:00.000002Z',
 case f.type_key when 'cactus' then '{}'::jsonb when 'tulip' then '{"title":"Repeated song","artist":"Synthetic","url":"https://example.test/song"}'::jsonb
 when 'hydrangea' then '{"mood":"calm"}'::jsonb when 'daisy' then '{"text":"Old answer","question_id":"light-001"}'::jsonb
 when 'sunflower' then '{"media_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb
 when 'bluebell' then '{"media_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}'::jsonb
 else '{"text":"Synthetic memory"}'::jsonb end,
 case when f.type_key='daisy' then '2026-08-02'::date end
from public.flowers f cross join generate_series(1,2) a where f.type_key not in ('peony','sunflower','bluebell') and f.spot<>20;
-- SQL fixture simulates trusted finalized metadata; actual bytes/expiry are
-- independently checked by the existing opt-in media HTTP suite.
do $$ declare f public.flowers; a smallint; mid uuid; begin
 for f in select * from public.flowers where type_key in ('sunflower','bluebell') loop
  for a in 1..2 loop
   perform set_config('request.jwt.claims',jsonb_build_object('sub',case a when 1 then '11111111-1111-4111-8111-111111111111' else '22222222-2222-4222-8222-222222222222' end,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
   insert into private.media_uploads(owner_id,request_id,flower_id,intended_day,mime_type,input_bytes,created_at,expires_at,status,output_bytes,width,height,sha256,samples,channels)
   values(a,gen_random_uuid(),f.id,'2026-08-02',case f.type_key when 'sunflower' then 'image/png' else 'audio/webm' end,100,'2026-08-02 17:00Z','2026-08-02 17:15Z','ready',case f.type_key when 'sunflower' then 100 else 96044 end,case f.type_key when 'sunflower' then 10 end,case f.type_key when 'sunflower' then 10 end,repeat('a',64),case f.type_key when 'bluebell' then 48000 end,case f.type_key when 'bluebell' then 1 end) returning id into mid;
   insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
   values(f.id,a,'2026-08-02','2026-08-02 17:00:00.000001Z','2026-08-02 17:00:00.000002Z',jsonb_build_object('media_id',mid));
  end loop;
 end loop;
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);
insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload,daisy_assignment_day)
select id,1,'2026-08-03','2026-08-03 17:00Z','2026-08-03 17:00Z','{"text":"Newer answer","question_id":"deeper-001"}','2026-08-03' from public.flowers where type_key='daisy';
insert into public.peony_contributions(flower_id,milestone,author_id,garden_day,original_posted_at,updated_at,payload)
select id,1,a,'2026-08-02','2026-08-02 17:00:00.000001Z','2026-08-02 17:00:00.000002Z','{"text":"A date idea"}' from public.flowers cross join generate_series(1,2) a where type_key='peony';
insert into public.peony_plans select id,1,'Synthetic picnic','2026-08-05 18:00Z',2,'2026-08-03 18:00Z' from public.flowers where type_key='peony';
insert into public.peony_acceptances select id,1,1,'2026-08-03','2026-08-03 18:01Z' from public.flowers where type_key='peony';
update public.flowers set planted_at='2026-08-02 17:00:00.000001Z',planted_day='2026-08-02' where type_key in ('peony','dandelion');
update public.flower_entries set original_posted_at='2026-08-02 17:00:00.000002Z' where id=9;
update public.garden set last_settled_day='2026-08-01';
create temporary table before_read as select jsonb_build_object('garden',(select jsonb_agg(to_jsonb(g)) from public.garden g),'flowers',(select jsonb_agg(to_jsonb(f) order by id) from public.flowers f),'entries',(select jsonb_agg(to_jsonb(e) order by id) from public.flower_entries e),'days',(select jsonb_agg(to_jsonb(d)) from public.garden_days d),'awards',(select jsonb_agg(to_jsonb(a)) from public.achievement_awards a)) data;
create temporary table pages(n int, data jsonb);
grant all on pages to authenticated;
set local role authenticated;
insert into pages values(1,public.memories_page());
select is(jsonb_array_length((select data->'items' from pages where n=1)),20,'first page bounded at twenty');
select is((select data->>'more' from pages where n=1),'true','lookahead reports more');
insert into pages select 2,public.memories_page(p_mode=>'older',p_cursor=>jsonb_build_object('at',data#>>'{items,19,at}','kind',data#>>'{items,19,kind}','id',data#>>'{items,19,source_id}')) from pages where n=1;
select is((select count(*) from pages,jsonb_array_elements(data->'items') i),28::bigint,'all contributions plus standalone wishes and one Peony returned');
select is((select count(distinct i->>'key') from pages,jsonb_array_elements(data->'items') i),28::bigint,'no duplicate cross-source identities');
select is((select count(distinct i#>>'{flower,type_key}') from pages,jsonb_array_elements(data->'items') i),13::bigint,'all thirteen flower types retained');
select is((select count(distinct i#>>'{entry,author_id}') from pages,jsonb_array_elements(data->'items') i),2::bigint,'both authors visible without reciprocal lock');
select is((select i#>>'{entry,question}' from pages,jsonb_array_elements(data->'items') i where i#>>'{entry,payload,text}'='Old answer' limit 1),'Retained old question?','historical assignment prompt preserved');
select is((select i#>>'{entry,question}' from pages,jsonb_array_elements(data->'items') i where i#>>'{entry,payload,text}'='Newer answer'),'A different retained question?','later assignment does not replace old prompt');
select is((select count(*) from pages,jsonb_array_elements(data->'items') i where i#>>'{flower,spot}'='20'),1::bigint,'unwatered wish independently discoverable');
select is((select count(*) from pages,jsonb_array_elements(data->'items') i where i#>>'{flower,type_key}'='tulip'),2::bigint,'legitimate repeated partner songs stay distinct');
select is(jsonb_array_length(public.memories_page(p_type=>'peony')->'items'),1,'type filter selects bundle');
select is(jsonb_array_length(public.memories_page(p_spot=>20)->'items'),1,'flower spot filter finds unwatered wish');
select is(jsonb_array_length(public.memories_page(p_from=>'2026-08-03',p_to=>'2026-08-03')->'items'),1,'garden-day range filters original record day');
select is(public.memories_page(p_type=>'peony')#>>'{items,0,peony,plan,acceptances,0,author_id}','1','current plan acceptance included');
select is(jsonb_array_length(public.memories_page(p_type=>'peony')#>'{items,0,peony,contributions}'),2,'both date ideas retain original authored rows');
select throws_ok($$select public.memories_page(p_mode=>'updates',p_keys=>array_fill('entry:1'::text,array[21]))$$,'22023',null,'update key batch bounded');
select throws_ok($$select public.memories_page(p_type=>'admin')$$,'22023',null,'unknown content type rejected');
select throws_ok($$select public.memories_page(p_mode=>'older')$$,'22023',null,'cursor required');
select throws_ok($$select public.memories_page(p_from=>'2026-09-01',p_to=>'2026-08-01')$$,'22023',null,'invalid date range rejected');
select is((select provolatile::text from pg_proc where oid='public.memories_page(text,jsonb,text[],text,integer,date,date)'::regprocedure),'s','query declares stable read-only contract');
select is((select prosecdef from pg_proc where oid='public.memories_page(text,jsonb,text[],text,integer,date,date)'::regprocedure),false,'query preserves caller RLS');
reset role;
select is((select data from before_read),jsonb_build_object('garden',(select jsonb_agg(to_jsonb(g)) from public.garden g),'flowers',(select jsonb_agg(to_jsonb(f) order by id) from public.flowers f),'entries',(select jsonb_agg(to_jsonb(e) order by id) from public.flower_entries e),'days',(select jsonb_agg(to_jsonb(d)) from public.garden_days d),'awards',(select jsonb_agg(to_jsonb(a)) from public.achievement_awards a)),'Memories reads leave growth, credit, timestamps and content unchanged');
delete from public.peony_acceptances;
update public.peony_plans set version=2,activity='Updated plan',updated_at='2026-08-03 18:02Z';
set local role authenticated;
select is(jsonb_array_length(public.memories_page(p_type=>'peony')#>'{items,0,peony,plan,acceptances}'),0,'plan replacement removes obsolete acceptance snapshot');
-- The exact source-qualified order agrees across immutable timestamp ties,
-- lexical numeric IDs (9/10), and microsecond cursor boundaries.
select is((select jsonb_agg(i->>'key' order by n,ord) from pages,jsonb_array_elements(data->'items') with ordinality a(i,ord)),
 (select jsonb_agg(k order by at desc,kind collate "C" desc,id collate "C" desc) from (
 select original_posted_at at,'entry'::text kind,id::text id,'entry:'||id k from public.flower_entries
 union all select planted_at,case type_key when 'peony' then 'peony' else 'wish' end,id::text,(case type_key when 'peony' then 'peony:' else 'wish:' end)||id from public.flowers where type_key in ('peony','dandelion')) all_rows),'all pages match the full precise source-qualified order');
select is((select jsonb_agg(i-'read_at') from jsonb_array_elements(public.memories_page(p_mode=>'older',p_cursor=>(select jsonb_build_object('at',data#>>'{items,19,at}','kind',data#>>'{items,19,kind}','id',data#>>'{items,19,source_id}') from pages where n=1))->'items') i),
 (select jsonb_agg(i-'read_at') from pages,jsonb_array_elements(data->'items') i where n=2),'repeated older cursor returns identical identities and content within snapshot');
reset role;
create temporary table newest_cursor as select jsonb_build_object('at',data#>>'{items,0,at}','kind',data#>>'{items,0,kind}','id',data#>>'{items,0,source_id}') cursor from pages where n=1;
grant select on newest_cursor to authenticated;
insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
select id,1,'2026-08-04'::date+n,'2026-08-04 17:00Z'::timestamptz+n*interval '1 day','2026-08-04 17:00Z'::timestamptz+n*interval '1 day','{"text":"Newly arrived memory"}' from public.flowers cross join generate_series(0,44) n where type_key='rose';
set local role authenticated;
insert into pages select 3,public.memories_page(p_mode=>'newer',p_cursor=>cursor) from newest_cursor;
insert into pages select 4,public.memories_page(p_mode=>'newer',p_cursor=>jsonb_build_object('at',data#>>'{items,19,at}','kind',data#>>'{items,19,kind}','id',data#>>'{items,19,source_id}')) from pages where n=3;
insert into pages select 5,public.memories_page(p_mode=>'newer',p_cursor=>jsonb_build_object('at',data#>>'{items,19,at}','kind',data#>>'{items,19,kind}','id',data#>>'{items,19,source_id}')) from pages where n=4;
select is((select count(distinct i->>'key') from pages,jsonb_array_elements(data->'items') i where n>=3),45::bigint,'three newer pages retain every arrival without duplicates or lookahead gaps');
select is((select data->>'more' from pages where n=5),'false','third newer page ends truthfully');
select is((select data#>>'{items,0,garden_day}' from pages where n=3),'2026-08-04','newer pages begin with nearest arrival');
select is(jsonb_array_length(public.memories_page(p_mode=>'older',p_cursor=>(select jsonb_build_object('at',data#>>'{items,19,at}','kind',data#>>'{items,19,kind}','id',data#>>'{items,19,source_id}') from pages where n=1))->'items'),8,'new arrivals never shift original older cursor');
select is(jsonb_array_length(public.memories_page(p_mode=>'updates',p_keys=>array['entry:9','entry:10'])->'items'),2,'bounded source keys refresh old loaded entries');
select is((select count(*) from jsonb_object_keys(public.memories_page())),2::bigint,'top-level DTO exposes only items and more');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select is(jsonb_array_length(public.memories_page()->'items'),20,'second member can read bounded shared feed');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth"}]}',true);
select throws_ok($$select public.memories_page()$$,'42501',null,'outsider denied');
reset role;
update private.garden_members set revoked_at=now() where member_id=1;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}',true);
set local role authenticated;
select throws_ok($$select public.memories_page(p_mode=>'updates',p_keys=>array['entry:1'])$$,'42501',null,'revoked member denied on later refresh');
reset role;
set local role anon;
select throws_ok($$select public.memories_page()$$,'42501',null,'anonymous denied');
reset role;
select * from finish();
rollback;
