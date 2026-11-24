-- New-garden private photo and voice media (issue #178): the legacy registry
-- boundary of decisions 0025/0027, rebuilt on v2 flowers, entries and buckets.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();
select has_table('private','v2_media_uploads','v2 private upload registry exists');
select has_function('public','v2_create_media_upload',array['uuid','uuid','text','integer','bigint'],'v2 member upload intent RPC');
select has_function('public','v2_claim_media_upload',array['uuid'],'v2 member validation claim RPC');
select has_function('public','v2_attest_media_upload',array['uuid','uuid','integer','integer','integer','text'],'v2 trusted photo attestation');
select has_function('public','v2_attest_audio_upload',array['uuid','uuid','integer','integer','integer','text'],'v2 trusted audio attestation');
select has_function('public','v2_media_read_path',array['uuid'],'v2 member read authorization');
select has_trigger('public','v2_flower_entries','v2_flower_entry_media_guard','v2 entries bind media references');
select ok(not has_table_privilege('authenticated','private.v2_media_uploads','SELECT'),'registry is not directly readable');
select ok(not has_table_privilege('service_role','private.v2_media_uploads','SELECT'),'registry is not directly readable by the server key');
select ok(not has_function_privilege('authenticated','public.v2_attest_media_upload(uuid,uuid,integer,integer,integer,text)','EXECUTE'),'browser cannot attest photos');
select ok(not has_function_privilege('authenticated','public.v2_attest_audio_upload(uuid,uuid,integer,integer,integer,text)','EXECUTE'),'browser cannot attest audio');
select ok(not has_function_privilege('anon','public.v2_create_media_upload(uuid,uuid,text,integer,bigint)','EXECUTE'),'anonymous cannot create intents');
select ok(not has_function_privilege('authenticated','public.v2_media_cleanup_candidates()','EXECUTE'),'browser cannot select cleanup paths');
select ok(has_function_privilege('service_role','public.v2_attest_audio_upload(uuid,uuid,integer,integer,integer,text)','EXECUTE'),'trusted server can attest');
select is((select string_agg(format('%s|%s|%s|%s',id,public,file_size_limit,allowed_mime_types),';' order by id) from storage.buckets where id like 'garden-v2-%'),
 'garden-v2-media|f|33554432|{image/jpeg,image/png,image/webp,audio/wav};garden-v2-staging|f|12582912|{image/jpeg,image/png,image/webp,audio/webm}',
 'separate private v2 buckets keep the legacy limits');
select is((select string_agg(format('%s|%s|%s',policyname,cmd,roles),';') from pg_policies where schemaname='storage' and tablename='objects'
   and (coalesce(qual,'')||coalesce(with_check,'')) like '%garden-v2-%'),
 'v2_media_staging_insert|INSERT|{authenticated}',
 'only one INSERT policy reaches the v2 buckets');
select ok((select with_check like '%garden-v2-staging%' and with_check like '%allow_only_operation%' and with_check like '%v2_media_upload_allowed%'
  from pg_policies where schemaname='storage' and policyname='v2_media_staging_insert'),'v2 staging allows only a live owner direct upload');
select ok((select with_check like '%''garden-staging''%' and with_check like '% media_upload_allowed(name)%' and with_check not like '%v2%'
  from pg_policies where schemaname='storage' and policyname='media_staging_insert'),'legacy staging policy is unchanged');

select private.bootstrap_members('owner@example.test','member@example.test');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
 ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}'),
 ('33333333-3333-4333-8333-333333333333','authenticated','authenticated','outsider@example.test',now(),'{"provider":"google","providers":["google"]}');
insert into auth.identities(user_id,provider_id,provider,identity_data) values
 ('11111111-1111-4111-8111-111111111111','v2-media-owner','google','{"sub":"v2-media-owner","email":"owner@example.test","email_verified":true}'),
 ('22222222-2222-4222-8222-222222222222','v2-media-member','google','{"sub":"v2-media-member","email":"member@example.test","email_verified":true}'),
 ('33333333-3333-4333-8333-333333333333','v2-media-outsider','google','{"sub":"v2-media-outsider","email":"outsider@example.test","email_verified":true}');
create function pg_temp.actor(n integer) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',case n when 1 then '11111111-1111-4111-8111-111111111111' when 2 then '22222222-2222-4222-8222-222222222222' else '33333333-3333-4333-8333-333333333333' end,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
end $$;
select pg_temp.actor(1);
select public.v2_plant_flower_at('sunflower',1);
select public.v2_plant_flower_at('bluebell',2);
select public.v2_plant_flower_at('cactus',3);
create temporary table media_test_values(key text primary key,value jsonb);
grant all on media_test_values to authenticated;
create function pg_temp.flower(p_type text default 'sunflower') returns uuid language sql as $$ select id from public.v2_flowers where type_key=p_type order by spot limit 1 $$;
create function pg_temp.media(k text) returns uuid language sql as $$ select (value->>'id')::uuid from media_test_values where key=k $$;
create function pg_temp.entry(k text) returns bigint language sql as $$ select (value->>'id')::bigint from media_test_values where key=k $$;
create function pg_temp.prepare(k text, replacement bigint default null, p_type text default 'sunflower') returns uuid language plpgsql as $$
declare v jsonb;
begin
 v:=public.v2_create_media_upload(gen_random_uuid(),pg_temp.flower(p_type),case p_type when 'bluebell' then 'audio/webm' else 'image/png' end,100,replacement);
 insert into media_test_values values(k,v); return (v->>'id')::uuid;
end $$;
-- Simulated trusted Storage metadata in this SQL-only boundary test. The opt-in
-- HTTP integration suite independently tests actual files and Storage APIs.
create function pg_temp.attest(k text, p_bucket text default 'garden-v2-media') returns void language plpgsql as $$
declare v jsonb;
begin
 v:=public.v2_claim_media_upload(pg_temp.media(k));
 if v->>'mime_type'='audio/webm' then
   insert into storage.objects(bucket_id,name,metadata) values(p_bucket,v->>'final_path','{"size":100,"mimetype":"audio/wav"}');
   perform public.v2_attest_audio_upload((v->>'id')::uuid,(v->>'lease_id')::uuid,100,28,1,repeat('a',64));
 else
   insert into storage.objects(bucket_id,name,metadata) values(p_bucket,v->>'final_path','{"size":100,"mimetype":"image/png"}');
   perform public.v2_attest_media_upload((v->>'id')::uuid,(v->>'lease_id')::uuid,100,10,10,repeat('a',64));
 end if;
end $$;

-- Intents: each medium attaches only to its own v2 flower type.
set local role authenticated;
select throws_ok($$select public.v2_create_media_upload(gen_random_uuid(),pg_temp.flower('cactus'),'image/png',100)$$,'22023','media_wrong_flower','photo cannot attach to a nonmedia flower');
select throws_ok($$select public.v2_create_media_upload(gen_random_uuid(),pg_temp.flower('bluebell'),'image/png',100)$$,'22023','media_wrong_flower','photo cannot attach to a Bluebell');
select throws_ok($$select public.v2_create_media_upload(gen_random_uuid(),pg_temp.flower(),'audio/webm',100)$$,'22023','media_wrong_flower','audio cannot attach to a Sunflower');
select throws_ok($$select public.v2_create_media_upload(gen_random_uuid(),gen_random_uuid(),'image/png',100)$$,'22023','media_wrong_flower','unknown or legacy flower IDs are rejected');
select throws_ok($$select public.v2_create_media_upload(gen_random_uuid(),pg_temp.flower(),'image/gif',100)$$,'22023','media_invalid_request','unsupported type rejected');
select throws_ok($$select public.v2_create_media_upload(gen_random_uuid(),pg_temp.flower(),'image/png',12582913)$$,'22023','media_invalid_request','byte limit enforced');
select pg_temp.prepare('original');
select is((public.v2_media_upload_state(pg_temp.media('original'))->>'status'),'pending','intent starts untrusted');
select is(public.v2_media_upload_state(pg_temp.media('original'))->>'final_path',pg_temp.media('original')::text||'/photo.png','server chooses the final path');
select ok(public.v2_media_upload_allowed(pg_temp.media('original')::text||'/source'),'own pending path is insertable');
select ok(not public.v2_media_upload_allowed(gen_random_uuid()::text||'/source'),'arbitrary path is not insertable');
select ok(not public.media_upload_allowed(pg_temp.media('original')::text||'/source'),'legacy staging never authorizes a v2 intent');
select throws_ok($$select public.media_upload_state(pg_temp.media('original'))$$,'42501','media_not_available','legacy state never exposes a v2 intent');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id',pg_temp.media('original')))$$,'42501','media_invalid_reference','unvalidated media cannot count as care');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id',pg_temp.media('original'),'width',10))$$,'22023','This flower requires its dedicated workflow','browser metadata is rejected');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id','not-a-uuid'))$$,'22023','media_invalid_reference','malformed reference rejected');
select throws_ok($$select public.v2_attest_media_upload(pg_temp.media('original'),gen_random_uuid(),100,10,10,repeat('a',64))$$,'42501',null,'member cannot invoke attestation');
select throws_ok($$insert into storage.objects(bucket_id,name) values('garden-v2-staging',pg_temp.media('original')::text||'/source')$$,'42501',null,'non-Storage INSERT without an operation is denied');
select is((select count(*)::integer from storage.objects),0,'member cannot list or read staging/final Storage rows');
select throws_ok($$insert into storage.objects(bucket_id,name) values('garden-v2-media',pg_temp.media('original')::text||'/photo.png')$$,'42501',null,'member cannot insert final object');
select throws_ok($$insert into storage.objects(bucket_id,name) values('garden-v2-staging',gen_random_uuid()::text||'/source')$$,'42501',null,'member cannot stage arbitrary path');
select pg_temp.actor(2);
select ok(not public.v2_media_upload_allowed(pg_temp.media('original')::text||'/source'),'partner cannot upload own intent');
select throws_ok($$select public.v2_claim_media_upload(pg_temp.media('original'))$$,'42501','media_not_available','partner cannot finalize intent');
select throws_ok($$select public.v2_media_upload_state(pg_temp.media('original'))$$,'42501','media_not_available','partner cannot inspect untrusted intent');
select pg_temp.actor(3);
select throws_ok($$select public.v2_create_media_upload(gen_random_uuid(),pg_temp.flower(),'image/png',100)$$,'42501',null,'unapproved authenticated user cannot create');
select ok(not public.v2_media_upload_allowed(pg_temp.media('original')::text||'/source'),'outsider cannot stage');
select pg_temp.actor(1);
reset role;

-- Attestation requires the canonical object in the private v2 final bucket.
create function pg_temp.claim_only(k text) returns jsonb language sql as $$ select public.v2_claim_media_upload(pg_temp.media(k)) $$;
create temporary table claim_result as select pg_temp.claim_only('original') value;
insert into storage.objects(bucket_id,name,metadata) values('garden-media',(select value->>'final_path' from claim_result),'{"size":100,"mimetype":"image/png"}');
select throws_ok($$select public.v2_attest_media_upload(pg_temp.media('original'),(select (value->>'lease_id')::uuid from claim_result),100,10,10,repeat('a',64))$$,'22023','media_object_missing','an object in the legacy bucket cannot attest v2 media');
insert into storage.objects(bucket_id,name,metadata) values('garden-v2-media',(select value->>'final_path' from claim_result),'{"size":100,"mimetype":"image/png"}');
select throws_ok($$select public.v2_attest_audio_upload(pg_temp.media('original'),(select (value->>'lease_id')::uuid from claim_result),100,28,1,repeat('a',64))$$,'22023','media_invalid_metadata','audio attestation cannot attest a photo');
select throws_ok($$select public.attest_media_upload(pg_temp.media('original'),(select (value->>'lease_id')::uuid from claim_result),100,10,10,repeat('a',64))$$,'22023','media_expired_or_changed','legacy attestation cannot attest v2 media');
select lives_ok($$select public.v2_attest_media_upload(pg_temp.media('original'),(select (value->>'lease_id')::uuid from claim_result),100,10,10,repeat('a',64))$$,'trusted server attests the v2 photo');
select lives_ok($$update private.v2_media_uploads set width=5712,height=4284 where id=pg_temp.media('original')$$,'nominal 24MP phone dimensions fit trusted bound');
select lives_ok($$update private.v2_media_uploads set width=5000,height=5000 where id=pg_temp.media('original')$$,'exactly 25 million pixels fit trusted bound');
select throws_ok($$update private.v2_media_uploads set width=5001,height=5000 where id=pg_temp.media('original')$$,'23514',null,'over 25 million pixels rejected by trusted registry');
select throws_ok($$update private.v2_media_uploads set width=12001,height=1 where id=pg_temp.media('original')$$,'23514',null,'per-side bound remains 12000');
update private.v2_media_uploads set width=10,height=10 where id=pg_temp.media('original');
set local role authenticated;
select is(public.v2_media_upload_state(pg_temp.media('original'))->>'status','ready','server attestation makes ready');
select ok(not public.v2_media_upload_allowed(pg_temp.media('original')::text||'/source'),'claimed or validated stage cannot be written');
select throws_ok($$select public.v2_media_read_path(pg_temp.media('original'))$$,'42501','media_not_available','ready but unattached media is not readable');

-- Entry attachment, partner reads and replacement.
insert into media_test_values values('entry',to_jsonb(public.v2_submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id',pg_temp.media('original')))));
select is(public.v2_media_upload_state(pg_temp.media('original'))->>'status','submitted','entry atomically consumes validated reference');
select is((select count(*)::integer from public.v2_flower_entries),1,'exactly one care fact');
select is(public.v2_claim_media_upload(pg_temp.media('original'))->>'status','submitted','duplicate finalization identifies committed entry');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id',pg_temp.media('original')))$$,'22023','Already submitted; edit the original entry','repeat original adds no entry');
select is(public.v2_media_read_path(pg_temp.media('original')),jsonb_build_object('path',pg_temp.media('original')::text||'/photo.png','mime_type','image/png','width',10,'height',10,'samples',null,'sample_rate',null,'channels',null),'author can authorize read');
select throws_ok($$select public.media_read_path(pg_temp.media('original'))$$,'42501','media_not_available','legacy read never authorizes v2 media');
select pg_temp.actor(2);
select lives_ok($$select public.v2_media_read_path(pg_temp.media('original'))$$,'partner can immediately authorize read');
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id',pg_temp.media('original')))$$,'42501','media_invalid_reference','partner cannot attach author media');
select throws_ok($$select public.v2_create_media_upload(gen_random_uuid(),pg_temp.flower(),'image/png',100,pg_temp.entry('entry'))$$,'42501','media_wrong_owner','partner cannot request author replacement');
select pg_temp.actor(3);
select throws_ok($$select public.v2_media_read_path(pg_temp.media('original'))$$,'42501',null,'outsider cannot authorize read');
select pg_temp.actor(1);
select pg_temp.prepare('replacement',pg_temp.entry('entry'));
reset role;
select pg_temp.attest('replacement');
set local role authenticated;
select lives_ok($$select public.v2_edit_flower_entry(pg_temp.entry('entry'),jsonb_build_object('media_id',pg_temp.media('replacement')))$$,'replacement follows existing edit rules');
select is((select original_posted_at from public.v2_flower_entries limit 1),(select (value->>'original_posted_at')::timestamptz from media_test_values where key='entry'),'replacement preserves original time');
select is((select count(*)::integer from public.v2_flower_entries),1,'replacement grants no additional care');
select lives_ok($$select public.v2_media_read_path(pg_temp.media('replacement'))$$,'replacement becomes readable');
select throws_ok($$select public.v2_media_read_path(pg_temp.media('original'))$$,'42501','media_not_available','superseded object has no new signed read');
select pg_temp.prepare('late',pg_temp.entry('entry'));
reset role;
select pg_temp.attest('late');
update public.v2_flower_entries set original_posted_at=clock_timestamp()-interval '31 minutes';
set local role authenticated;
select throws_ok($$select public.v2_edit_flower_entry(pg_temp.entry('entry'),jsonb_build_object('media_id',pg_temp.media('late')))$$,'22023','The edit window has ended','late photo replacement rejected');
select is((select payload->>'media_id' from public.v2_flower_entries limit 1),pg_temp.media('replacement')::text,'failed replacement keeps prior reference');
select pg_temp.prepare('expired');
reset role;
update private.v2_media_uploads set expires_at=clock_timestamp()-interval '2 hours' where id=pg_temp.media('expired');
set local role authenticated;
select throws_ok($$select public.v2_claim_media_upload(pg_temp.media('expired'))$$,'22023','media_expired','expired intent cannot finalize');
select ok(not public.v2_media_upload_allowed(pg_temp.media('expired')::text||'/source'),'expired intent cannot upload');
reset role;
create temporary table cleanup_result as select public.v2_media_cleanup_candidates() value;
select is((select status from private.v2_media_uploads where id=pg_temp.media('expired')),'expired','cleanup tombstones expired intent before deleting objects');
select ok(exists(select 1 from cleanup_result,jsonb_array_elements(value) item where item->>'staging_path'=pg_temp.media('expired')::text||'/source' and item->>'final_path'=pg_temp.media('expired')::text||'/photo.png'),'cleanup selects expired staging and final paths');
select ok(not exists(select 1 from cleanup_result,jsonb_array_elements(value) item where item->>'final_path' in (pg_temp.media('original')::text||'/photo.png',pg_temp.media('replacement')::text||'/photo.png')),'cleanup never selects submitted final objects');
select lives_ok($$select public.v2_media_cleanup_done(pg_temp.media('expired'),true,true)$$,'cleanup ack is safely repeatable');
select lives_ok($$select public.v2_media_cleanup_done(pg_temp.media('expired'),true,true)$$,'duplicate cleanup ack');
select is((select count(*)::integer from private.media_uploads),0,'v2 media never touches the legacy registry');

-- New intent semantics remain strict even when all metadata is trusted.
select pg_temp.prepare('purpose');
select pg_temp.attest('purpose');
set local role authenticated;
select throws_ok($$select public.v2_edit_flower_entry(pg_temp.entry('entry'),jsonb_build_object('media_id',pg_temp.media('purpose')))$$,'22023','The edit window has ended','photo cannot change expired edit permission');
reset role;
update public.v2_flower_entries set original_posted_at=updated_at;
set local role authenticated;
select throws_ok($$select public.v2_edit_flower_entry(pg_temp.entry('entry'),jsonb_build_object('media_id',pg_temp.media('purpose')))$$,'42501','media_invalid_reference','new-original intent cannot be used for a replacement');
select public.v2_plant_flower_at('sunflower',4);
select throws_ok($$select public.v2_submit_flower_entry((select id from public.v2_flowers where spot=4),jsonb_build_object('media_id',pg_temp.media('purpose')))$$,'42501','media_invalid_reference','validated media cannot target another Sunflower');
reset role;
select pg_temp.actor(2);
select pg_temp.prepare('yesterday');
select pg_temp.attest('yesterday');
update private.v2_media_uploads set intended_day=intended_day-1 where id=pg_temp.media('yesterday');
set local role authenticated;
select throws_ok($$select public.v2_submit_flower_entry(pg_temp.flower(),jsonb_build_object('media_id',pg_temp.media('yesterday')))$$,'42501','media_invalid_reference','upload captured on a prior garden day cannot post today');
select lives_ok($$select public.v2_create_media_upload(gen_random_uuid(),pg_temp.flower(),'image/png',100)$$,'second unfinished intent');
select lives_ok($$select public.v2_create_media_upload(gen_random_uuid(),pg_temp.flower(),'image/png',100)$$,'third unfinished intent');
select throws_ok($$select public.v2_create_media_upload(gen_random_uuid(),pg_temp.flower(),'image/png',100)$$,'22023','media_upload_limit','at most three unfinished intents per member');
reset role;
select pg_temp.actor(1);
-- Request-key retries never create a second registry row or extend expiry.
select is(public.v2_create_media_upload((select request_id from private.v2_media_uploads where id=pg_temp.media('purpose')),pg_temp.flower(),'image/png',100),public.v2_media_upload_state(pg_temp.media('purpose')),'identical create retry returns original intent');
select throws_ok($$select public.v2_create_media_upload((select request_id from private.v2_media_uploads where id=pg_temp.media('purpose')),pg_temp.flower(),'image/jpeg',100)$$,'22023','media_idempotency_conflict','changed request-key parameters rejected');
select throws_ok($$select public.v2_attest_media_upload(pg_temp.media('purpose'),gen_random_uuid(),100,10,10,repeat('a',64))$$,'22023','media_expired_or_changed','duplicate or stale attestation cannot replace trusted metadata');

-- Bluebell voice memos use the same boundary with trusted audio metadata.
select pg_temp.prepare('voice',null,'bluebell');
select is((select value->>'final_path' from media_test_values where key='voice'),pg_temp.media('voice')::text||'/audio.wav','audio final path is canonical WAV');
create temporary table voice_claim as select pg_temp.claim_only('voice') value;
insert into storage.objects(bucket_id,name,metadata) values('garden-v2-media',(select value->>'final_path' from voice_claim),'{"size":100,"mimetype":"audio/wav"}');
select throws_ok($$select public.v2_attest_media_upload(pg_temp.media('voice'),(select (value->>'lease_id')::uuid from voice_claim),100,10,10,repeat('a',64))$$,'22023','media_invalid_metadata','photo attestation cannot attest audio');
select throws_ok($$select public.v2_attest_audio_upload(pg_temp.media('voice'),(select (value->>'lease_id')::uuid from voice_claim),100,29,1,repeat('a',64))$$,'23514',null,'audio bytes must match trusted samples');
select lives_ok($$select public.v2_attest_audio_upload(pg_temp.media('voice'),(select (value->>'lease_id')::uuid from voice_claim),100,28,1,repeat('a',64))$$,'trusted server attests the v2 voice memo');
set local role authenticated;
select throws_ok($$select public.v2_submit_flower_entry((select id from public.v2_flowers where spot=4),jsonb_build_object('media_id',pg_temp.media('voice')))$$,'42501','media_invalid_reference','a voice memo cannot attach to a Sunflower');
insert into media_test_values values('voice_entry',to_jsonb(public.v2_submit_flower_entry(pg_temp.flower('bluebell'),jsonb_build_object('media_id',pg_temp.media('voice')))));
select is(public.v2_media_upload_state(pg_temp.media('voice'))->>'status','submitted','voice memo attaches to the Bluebell entry');
select is(public.v2_media_read_path(pg_temp.media('voice')),jsonb_build_object('path',pg_temp.media('voice')::text||'/audio.wav','mime_type','audio/wav','width',null,'height',null,'samples',28,'sample_rate',48000,'channels',1),'author reads trusted playback metadata');
select pg_temp.actor(2);
select lives_ok($$select public.v2_media_read_path(pg_temp.media('voice'))$$,'partner can read the voice memo');
select pg_temp.actor(3);
select throws_ok($$select public.v2_media_read_path(pg_temp.media('voice'))$$,'42501',null,'outsider cannot read the voice memo');
select pg_temp.actor(1);
reset role;

-- Historical references remain readable after current-day edit eligibility ends.
update public.v2_flower_entries set garden_day=garden_day-1,original_posted_at=original_posted_at-interval '1 day',updated_at=updated_at-interval '1 day';
set local role authenticated;
select lives_ok($$select public.v2_media_read_path(pg_temp.media('replacement'))$$,'historical finalized photo is still authorized');
select is((select count(*)::integer from public.v2_entry_history(pg_temp.flower(),50,null) where payload->>'media_id'=pg_temp.media('replacement')::text),1,'history retains the current validated reference');
reset role;
update private.garden_members set revoked_at=clock_timestamp() where member_id=1;
set local role authenticated;
select throws_ok($$select public.v2_media_read_path(pg_temp.media('replacement'))$$,'42501',null,'revocation blocks new private reads immediately');
select throws_ok($$select public.v2_claim_media_upload(pg_temp.media('late'))$$,'42501',null,'revocation blocks finalization');
reset role;
select * from finish();
rollback;
