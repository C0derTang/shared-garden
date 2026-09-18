begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();
select has_table('private','media_uploads','private upload registry exists');
select has_function('public','create_media_upload',array['uuid','uuid','text','integer','bigint'],'member upload intent RPC');
select has_function('public','claim_media_upload',array['uuid'],'member validation claim RPC');
select has_function('public','attest_media_upload',array['uuid','uuid','integer','integer','integer','text'],'trusted validation attestation');


select ok(not has_table_privilege('authenticated','private.media_uploads','SELECT'),'registry is not directly readable');
select ok(not has_function_privilege('authenticated','public.attest_media_upload(uuid,uuid,integer,integer,integer,text)','EXECUTE'),'browser cannot attest');
select ok(not has_function_privilege('anon','public.create_media_upload(uuid,uuid,text,integer,bigint)','EXECUTE'),'anonymous cannot create intents');
select ok(not has_function_privilege('authenticated','public.media_cleanup_candidates()','EXECUTE'),'browser cannot select cleanup paths');
select ok(has_function_privilege('service_role','public.attest_media_upload(uuid,uuid,integer,integer,integer,text)','EXECUTE'),'trusted server can attest');
select is((select count(*)::integer from storage.buckets where id in ('garden-staging','garden-media') and not public),2,'both buckets are private');
select private.bootstrap_members('owner@example.test','member@example.test');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
 ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('33333333-3333-4333-8333-333333333333','authenticated','authenticated','outsider@example.test',now(),'{"provider":"google","providers":["google"]}');
insert into auth.identities(user_id,provider_id,provider,identity_data) values
 ('11111111-1111-4111-8111-111111111111','media-owner','google','{"sub":"media-owner","email":"owner@example.test","email_verified":true}'),
 ('22222222-2222-4222-8222-222222222222','media-member','google','{"sub":"media-member","email":"member@example.test","email_verified":true}'),
 ('33333333-3333-4333-8333-333333333333','media-outsider','google','{"sub":"media-outsider","email":"outsider@example.test","email_verified":true}');
create function pg_temp.actor(n integer) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',case n when 1 then '11111111-1111-4111-8111-111111111111' when 2 then '22222222-2222-4222-8222-222222222222' else '33333333-3333-4333-8333-333333333333' end,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
end $$;
select pg_temp.actor(1);
select public.initialize_garden();
insert into public.flower_unlocks(type_key) values('sunflower');
select public.plant_flower('sunflower');
create temporary table media_test_values(key text primary key,value jsonb);
grant all on media_test_values to authenticated;
create function pg_temp.flower() returns uuid language sql as $$ select id from public.flowers where type_key='sunflower' limit 1 $$;
create function pg_temp.media(k text) returns uuid language sql as $$ select (value->>'id')::uuid from media_test_values where key=k $$;
create function pg_temp.prepare(k text, replacement bigint default null) returns uuid language plpgsql as $$
declare v jsonb;
begin
 v:=public.create_media_upload(gen_random_uuid(),pg_temp.flower(),'image/png',100,replacement);
 insert into media_test_values values(k,v); return (v->>'id')::uuid;
end $$;
-- Simulated trusted Storage metadata in this SQL-only boundary test. The separate
-- opt-in integration suite independently tests actual files and Storage APIs.
create function pg_temp.attest(k text) returns void language plpgsql as $$
declare v jsonb;
begin
 v:=public.claim_media_upload(pg_temp.media(k));
 insert into storage.objects(bucket_id,name,metadata) values('garden-media',v->>'final_path','{"size":100,"mimetype":"image/png"}');
 perform public.attest_media_upload((v->>'id')::uuid,(v->>'lease_id')::uuid,100,10,10,repeat('a',64));
end $$;
set local role authenticated;
select throws_ok($$select public.create_media_upload(gen_random_uuid(),(select id from public.flowers where type_key='cactus'),'image/png',100)$$,'22023','media_wrong_flower','wrong flower rejected');
select throws_ok($$select public.create_media_upload(gen_random_uuid(),pg_temp.flower(),'audio/webm',100)$$,'22023','media_invalid_request','audio is not silently admitted');
select throws_ok($$select public.create_media_upload(gen_random_uuid(),pg_temp.flower(),'image/png',12582913)$$,'22023','media_invalid_request','byte limit enforced');
select pg_temp.prepare('original');
select is((public.media_upload_state(pg_temp.media('original'))->>'status'),'pending','intent starts untrusted');
select ok(public.media_upload_allowed(pg_temp.media('original')::text||'/source'),'own pending path is insertable');
select ok(not public.media_upload_allowed(gen_random_uuid()::text||'/source'),'arbitrary path is not insertable');
select throws_ok($$select public.submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id',pg_temp.media('original')))$$,'42501','media_invalid_reference','unvalidated media cannot count as care');
select throws_ok($$select public.submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id',pg_temp.media('original'),'width',10))$$,'22023','This flower requires its dedicated workflow','browser metadata is rejected');
select throws_ok($$select public.attest_media_upload(pg_temp.media('original'),gen_random_uuid(),100,10,10,repeat('a',64))$$,'42501',null,'member cannot invoke attestation');
select throws_ok($$insert into storage.objects(bucket_id,name) values('garden-staging',pg_temp.media('original')::text||'/source')$$,'42501',null,'non-Storage INSERT without an operation is denied');
select is((select count(*)::integer from storage.objects),0,'member cannot list or read staging/final Storage rows');
select throws_ok($$insert into storage.objects(bucket_id,name) values('garden-media',pg_temp.media('original')::text||'/photo.png')$$,'42501',null,'member cannot insert final object');
select throws_ok($$insert into storage.objects(bucket_id,name) values('garden-staging',gen_random_uuid()::text||'/source')$$,'42501',null,'member cannot stage arbitrary path');
select pg_temp.actor(2);
select ok(not public.media_upload_allowed(pg_temp.media('original')::text||'/source'),'partner cannot upload own intent');
select throws_ok($$select public.claim_media_upload(pg_temp.media('original'))$$,'42501','media_not_available','partner cannot finalize intent');
select throws_ok($$select public.media_upload_state(pg_temp.media('original'))$$,'42501','media_not_available','partner cannot inspect untrusted intent');
select pg_temp.actor(3);
select throws_ok($$select public.create_media_upload(gen_random_uuid(),pg_temp.flower(),'image/png',100)$$,'42501',null,'unapproved authenticated user cannot create');
select ok(not public.media_upload_allowed(pg_temp.media('original')::text||'/source'),'outsider cannot stage');
select pg_temp.actor(1);
reset role;
select pg_temp.attest('original');
set local role authenticated;
select is(public.media_upload_state(pg_temp.media('original'))->>'status','ready','server attestation makes ready');
select ok(not public.media_upload_allowed(pg_temp.media('original')::text||'/source'),'claimed or validated stage cannot be written');
insert into media_test_values values('entry',to_jsonb(public.submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id',pg_temp.media('original')))));
select is(public.media_upload_state(pg_temp.media('original'))->>'status','submitted','entry atomically consumes validated reference');
select is((select count(*)::integer from public.flower_entries),1,'exactly one care fact');
select is(public.claim_media_upload(pg_temp.media('original'))->>'status','submitted','duplicate finalization identifies committed entry');
select throws_ok($$select public.submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id',pg_temp.media('original')))$$,'22023','Already submitted; edit the original entry','repeat original adds no entry');
select lives_ok($$select public.media_read_path(pg_temp.media('original'))$$,'author can authorize read');
select pg_temp.actor(2);
select lives_ok($$select public.media_read_path(pg_temp.media('original'))$$,'partner can immediately authorize read');
select throws_ok($$select public.submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id',pg_temp.media('original')))$$,'42501','media_invalid_reference','partner cannot attach author media');
select throws_ok($$select public.create_media_upload(gen_random_uuid(),pg_temp.flower(),'image/png',100,(select (value->>'id')::bigint from media_test_values where key='entry'))$$,'42501','media_wrong_owner','partner cannot request author replacement');
select pg_temp.actor(1);
select pg_temp.prepare('replacement',(select (value->>'id')::bigint from media_test_values where key='entry'));
reset role;
select pg_temp.attest('replacement');
set local role authenticated;
select lives_ok($$select public.edit_flower_entry((select (value->>'id')::bigint from media_test_values where key='entry'),jsonb_build_object('media_id',pg_temp.media('replacement')))$$,'replacement follows existing edit rules');
select is((select original_posted_at from public.flower_entries limit 1),(select (value->>'original_posted_at')::timestamptz from media_test_values where key='entry'),'replacement preserves original time');
select is((select count(*)::integer from public.flower_entries),1,'replacement grants no additional care');
select lives_ok($$select public.media_read_path(pg_temp.media('replacement'))$$,'replacement becomes readable');
select throws_ok($$select public.media_read_path(pg_temp.media('original'))$$,'42501','media_not_available','superseded object has no new signed read');
select pg_temp.prepare('late',(select (value->>'id')::bigint from media_test_values where key='entry'));
reset role;
select pg_temp.attest('late');
update public.flower_entries set original_posted_at=clock_timestamp()-interval '31 minutes';
set local role authenticated;
select throws_ok($$select public.edit_flower_entry((select (value->>'id')::bigint from media_test_values where key='entry'),jsonb_build_object('media_id',pg_temp.media('late')))$$,'22023','The edit window has ended','late photo replacement rejected');
select is((select payload->>'media_id' from public.flower_entries limit 1),pg_temp.media('replacement')::text,'failed replacement keeps prior reference');
select pg_temp.prepare('expired');
reset role;
update private.media_uploads set expires_at=clock_timestamp()-interval '2 hours' where id=pg_temp.media('expired');
set local role authenticated;
select throws_ok($$select public.claim_media_upload(pg_temp.media('expired'))$$,'22023','media_expired','expired intent cannot finalize');
select ok(not public.media_upload_allowed(pg_temp.media('expired')::text||'/source'),'expired intent cannot upload');
reset role;
create temporary table cleanup_result as select public.media_cleanup_candidates() value;
select is((select status from private.media_uploads where id=pg_temp.media('expired')),'expired','cleanup tombstones expired intent before deleting objects');
select ok(not exists(select 1 from cleanup_result,jsonb_array_elements(value) item where item->>'final_path' in (pg_temp.media('original')::text||'/photo.png',pg_temp.media('replacement')::text||'/photo.png')),'cleanup never selects submitted final objects');
select lives_ok($$select public.media_cleanup_done(pg_temp.media('expired'),true,true)$$,'cleanup ack is safely repeatable');
select lives_ok($$select public.media_cleanup_done(pg_temp.media('expired'),true,true)$$,'duplicate cleanup ack');

-- New intent semantics remain strict even when all metadata is trusted.
select pg_temp.prepare('purpose');
select pg_temp.attest('purpose');
set local role authenticated;
select throws_ok($$select public.edit_flower_entry((select (value->>'id')::bigint from media_test_values where key='entry'),jsonb_build_object('media_id',pg_temp.media('purpose')))$$,'22023','The edit window has ended','photo cannot change expired edit permission');
reset role;
update public.flower_entries set original_posted_at=updated_at;
set local role authenticated;
select throws_ok($$select public.edit_flower_entry((select (value->>'id')::bigint from media_test_values where key='entry'),jsonb_build_object('media_id',pg_temp.media('purpose')))$$,'42501','media_invalid_reference','new-original intent cannot be used for a replacement');
reset role;
insert into public.flowers(type_key,spot,planted_by,planted_at,planted_day) values('sunflower',99,1,clock_timestamp(),(select garden_day from private.garden_clock_at(clock_timestamp())));
set local role authenticated;
select throws_ok($$select public.submit_flower_entry((select id from public.flowers where spot=99),jsonb_build_object('media_id',pg_temp.media('purpose')))$$,'42501','media_invalid_reference','validated media cannot target another Sunflower');
reset role;
select pg_temp.actor(2);
select pg_temp.prepare('yesterday');
select pg_temp.attest('yesterday');
update private.media_uploads set intended_day=intended_day-1 where id=pg_temp.media('yesterday');
set local role authenticated;
select throws_ok($$select public.submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id',pg_temp.media('yesterday')))$$,'42501','media_invalid_reference','upload captured on a prior garden day cannot post today');
reset role;
select pg_temp.actor(1);
-- Request-key retries never create a second registry row or extend expiry.
select is(public.create_media_upload((select request_id from private.media_uploads where id=pg_temp.media('purpose')),pg_temp.flower(),'image/png',100),public.media_upload_state(pg_temp.media('purpose')),'identical create retry returns original intent');
select throws_ok($$select public.create_media_upload((select request_id from private.media_uploads where id=pg_temp.media('purpose')),pg_temp.flower(),'image/jpeg',100)$$,'22023','media_idempotency_conflict','changed request-key parameters rejected');
select throws_ok($$select public.attest_media_upload(pg_temp.media('purpose'),gen_random_uuid(),100,10,10,repeat('a',64))$$,'22023','media_expired_or_changed','duplicate or stale attestation cannot replace trusted metadata');
-- Historical references remain readable after current-day edit eligibility ends.
update public.flower_entries set garden_day=garden_day-1,original_posted_at=original_posted_at-interval '1 day';
set local role authenticated;
select lives_ok($$select public.media_read_path(pg_temp.media('replacement'))$$,'historical finalized photo is still authorized');
select is((select count(*)::integer from public.entry_history(pg_temp.flower(),50,null) where payload->>'media_id'=pg_temp.media('replacement')::text),1,'history retains the current validated reference');
reset role;
update private.garden_members set revoked_at=clock_timestamp() where member_id=1;
set local role authenticated;
select throws_ok($$select public.media_read_path(pg_temp.media('replacement'))$$,'42501',null,'revocation blocks new private reads immediately');
select throws_ok($$select public.claim_media_upload(pg_temp.media('late'))$$,'42501',null,'revocation blocks finalization');
reset role;
select * from finish();
rollback;
