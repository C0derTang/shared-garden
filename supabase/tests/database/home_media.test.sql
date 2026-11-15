begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

select is((select public from storage.buckets where id='home-media'),false,'home media bucket is private');
select is((select file_size_limit from storage.buckets where id='home-media'),16777216::bigint,'home media is limited to 16 MiB');
select is((select allowed_mime_types from storage.buckets where id='home-media'),array['audio/mpeg','application/json'],'home media accepts only the recording and lyrics types');
select is((select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects' and (coalesce(qual,'') like '%home-media%' or coalesce(with_check,'') like '%home-media%')),0,'no storage policy mentions home media');

insert into storage.objects(bucket_id,name,metadata) values('home-media','sunset/synthetic.json','{"size":2,"mimetype":"application/json"}');

set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='home-media'),0,'members cannot list or read home media rows');
select throws_ok($$insert into storage.objects(bucket_id,name) values('home-media','sunset/other.json')$$,'42501',null,'members cannot write home media');
reset role;

set local role anon;
select is((select count(*)::integer from storage.objects where bucket_id='home-media'),0,'anonymous visitors cannot read home media rows');
select throws_ok($$insert into storage.objects(bucket_id,name) values('home-media','sunset/other.json')$$,'42501',null,'anonymous visitors cannot write home media');
reset role;

select * from finish();
rollback;
