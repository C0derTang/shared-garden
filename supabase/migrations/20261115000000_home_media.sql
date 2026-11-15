-- Private production copies of the sunset home recording and timed lyrics.
-- Additive and idempotent: the operator setup script may create the same bucket
-- first while hosted releases are unavailable. No storage.objects policy grants
-- anon or authenticated access; only the server secret reads these objects after
-- the route's live membership check. No fixtures or media are committed.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('home-media','home-media',false,16777216,array['audio/mpeg','application/json'])
on conflict (id) do nothing;
