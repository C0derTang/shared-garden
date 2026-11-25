-- New-garden private photo and voice media (decision 0067, issue #178).
-- Mirrors the legacy registry, guard and protocol of decisions 0025 and 0027
-- with separate v2 objects: private.v2_media_uploads bound to v2 flowers and
-- entries, private buckets garden-v2-staging/garden-v2-media, and v2_ functions.
-- Legacy media tables, buckets, Storage policies and functions are untouched,
-- so legacy reads keep working. Every v2 operation that touches garden state
-- serializes on the v2 singleton lock instead of the legacy garden lock.

create table private.v2_media_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id smallint not null references private.garden_members(member_id),
  request_id uuid not null,
  flower_id uuid not null references public.v2_flowers(id),
  replacement_entry_id bigint references public.v2_flower_entries(id),
  intended_day date not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','audio/webm')),
  input_bytes integer not null check (input_bytes between 1 and 12582912),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','ready','submitted','expired')),
  lease_id uuid,
  processing_at timestamptz,
  output_bytes integer check (output_bytes between 1 and 33554432),
  width integer check (width between 1 and 12000),
  height integer check (height between 1 and 12000),
  samples integer check (samples between 1 and 14400000),
  channels integer check (channels = 1),
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  entry_id bigint references public.v2_flower_entries(id),
  staging_cleaned boolean not null default false,
  final_cleaned boolean not null default false,
  unique (owner_id, request_id),
  constraint v2_media_pixels check (width::bigint * height <= 25000000),
  constraint v2_media_ready_metadata check (status not in ('ready','submitted') or (output_bytes is not null and sha256 is not null and (
    (mime_type = 'audio/webm' and samples is not null and channels is not null and width is null and height is null and output_bytes = samples * channels * 2 + 44)
    or (mime_type <> 'audio/webm' and width is not null and height is not null and samples is null and channels is null)))),
  constraint v2_media_submitted_entry check ((status = 'submitted') = (entry_id is not null))
);
alter table private.v2_media_uploads enable row level security;
revoke all on private.v2_media_uploads from public, anon, authenticated, service_role, supabase_auth_admin;
create index v2_media_upload_expiry on private.v2_media_uploads(expires_at) where status <> 'submitted';

create function private.v2_media_upload_json(v private.v2_media_uploads)
returns jsonb language sql immutable security invoker set search_path = pg_catalog as $$
 select jsonb_build_object('id',v.id,'flower_id',v.flower_id,'replacement_entry_id',v.replacement_entry_id,
 'status',v.status,'expires_at',v.expires_at,'mime_type',v.mime_type,'input_bytes',v.input_bytes,
 'staging_path',v.id::text || '/source','final_path',v.id::text || case when v.mime_type='audio/webm' then '/audio.wav' else '/photo.' || case v.mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end end,
 'entry_id',v.entry_id,'width',v.width,'height',v.height,'samples',v.samples,'sample_rate',case when v.samples is not null then 48000 end,'channels',v.channels);
$$;

-- Photos attach only to a v2 Sunflower and voice memos only to a v2 Bluebell.
create function public.v2_create_media_upload(p_request_id uuid,p_flower_id uuid,p_mime_type text,p_input_bytes integer,p_replacement_entry_id bigint default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_day date; v_owner smallint; v private.v2_media_uploads; v_type text;
begin
 v_now := private.v2_begin_garden_operation(); v_owner := private.require_member();
 select garden_day into v_day from private.garden_clock_at(v_now);
 if p_request_id is null or p_flower_id is null or p_mime_type is null or p_mime_type not in ('image/jpeg','image/png','image/webp','audio/webm') or p_input_bytes is null or p_input_bytes not between 1 and 12582912 then
   raise exception using errcode='22023',message='media_invalid_request'; end if;
 select * into v from private.v2_media_uploads where owner_id=v_owner and request_id=p_request_id;
 if found then
   if v.flower_id<>p_flower_id or v.mime_type<>p_mime_type or v.input_bytes<>p_input_bytes or v.replacement_entry_id is distinct from p_replacement_entry_id then
     raise exception using errcode='22023',message='media_idempotency_conflict'; end if;
   return private.v2_media_upload_json(v);
 end if;
 select type_key into v_type from public.v2_flowers where id=p_flower_id and garden_id=1;
 if v_type is distinct from (case when p_mime_type='audio/webm' then 'bluebell' else 'sunflower' end) then
   raise exception using errcode='22023',message='media_wrong_flower'; end if;
 if p_replacement_entry_id is not null and not exists(select 1 from public.v2_flower_entries where id=p_replacement_entry_id and flower_id=p_flower_id and author_id=v_owner) then
   raise exception using errcode='42501',message='media_wrong_owner'; end if;
 if (select count(*) from private.v2_media_uploads where owner_id=v_owner and status in ('pending','processing','ready') and expires_at>v_now)>=3
 or (select count(*) from private.v2_media_uploads where owner_id=v_owner and created_at>v_now-interval '1 hour')>=20 then
   raise exception using errcode='22023',message='media_upload_limit'; end if;
 insert into private.v2_media_uploads(owner_id,request_id,flower_id,replacement_entry_id,intended_day,mime_type,input_bytes,created_at,expires_at)
 values(v_owner,p_request_id,p_flower_id,p_replacement_entry_id,v_day,p_mime_type,p_input_bytes,v_now,v_now+interval '15 minutes') returning * into v;
 return private.v2_media_upload_json(v);
end $$;

create function public.v2_media_upload_state(p_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v private.v2_media_uploads; v_owner smallint:=private.require_member();
begin
 select * into v from private.v2_media_uploads where id=p_id and owner_id=v_owner;
 if not found then raise exception using errcode='42501',message='media_not_available'; end if;
 return private.v2_media_upload_json(v);
end $$;

-- Same direct-upload boundary as legacy: only the live owner's pending path in
-- the v2 staging bucket, and only Storage's exact object.upload operation.
-- No signed-upload, overwrite, upsert, download, list or delete policies exist.
create function public.v2_media_upload_allowed(p_path text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
 select public.is_garden_member() and exists(select 1 from private.v2_media_uploads where
 owner_id=private.current_member_id() and id::text || '/source'=p_path and status='pending' and expires_at>statement_timestamp());
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('garden-v2-staging','garden-v2-staging',false,12582912,array['image/jpeg','image/png','image/webp','audio/webm']),
 ('garden-v2-media','garden-v2-media',false,33554432,array['image/jpeg','image/png','image/webp','audio/wav']);
create policy v2_media_staging_insert on storage.objects for insert to authenticated
 with check(bucket_id='garden-v2-staging' and storage.allow_only_operation('object.upload') and public.v2_media_upload_allowed(name));

create function public.v2_claim_media_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v private.v2_media_uploads; v_now timestamptz; v_owner smallint;
begin
 v_now:=private.v2_begin_garden_operation(); v_owner:=private.require_member();
 select * into v from private.v2_media_uploads where id=p_id and owner_id=v_owner for update;
 if not found then raise exception using errcode='42501',message='media_not_available'; end if;
 if v.status='submitted' then return private.v2_media_upload_json(v); end if;
 if v.status='expired' or v.expires_at<=v_now then raise exception using errcode='22023',message='media_expired'; end if;
 if v.status='ready' then return private.v2_media_upload_json(v); end if;
 if v.status='processing' and v.processing_at>v_now-interval '2 minutes' then raise exception using errcode='22023',message='media_processing'; end if;
 update private.v2_media_uploads set status='processing',lease_id=gen_random_uuid(),processing_at=v_now where id=v.id returning * into v;
 return private.v2_media_upload_json(v) || jsonb_build_object('lease_id',v.lease_id);
end $$;

-- Only the trusted server attests decoded bytes; it cannot submit a member's
-- contribution. The member's own session does that later with live identity.
create function public.v2_attest_media_upload(p_id uuid,p_lease_id uuid,p_output_bytes integer,p_width integer,p_height integer,p_sha256 text)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v private.v2_media_uploads; v_now timestamptz;
begin
 perform 1 from public.v2_garden where id=1 for update; v_now:=clock_timestamp();
 select * into v from private.v2_media_uploads where id=p_id for update;
 if not found or v.status<>'processing' or v.lease_id is distinct from p_lease_id or v.expires_at<=v_now then
   raise exception using errcode='22023',message='media_expired_or_changed'; end if;
 if not exists(select 1 from private.garden_members m cross join lateral private.google_account(m.user_id,true) a where m.member_id=v.owner_id and m.revoked_at is null and a.email=m.allowed_email and a.google_subject=m.google_subject) then
   raise exception using errcode='42501',message='media_not_available'; end if;
 if v.mime_type='audio/webm' or p_output_bytes is null or p_width is null or p_height is null or p_sha256 is null then
   raise exception using errcode='22023',message='media_invalid_metadata'; end if;
 if not exists(select 1 from storage.objects where bucket_id='garden-v2-media' and name=private.v2_media_upload_json(v)->>'final_path' and (metadata->>'size')::bigint=p_output_bytes and metadata->>'mimetype'=v.mime_type) then
   raise exception using errcode='22023',message='media_object_missing'; end if;
 update private.v2_media_uploads set status='ready',output_bytes=p_output_bytes,width=p_width,height=p_height,sha256=p_sha256 where id=v.id;
end $$;

create function public.v2_attest_audio_upload(p_id uuid,p_lease_id uuid,p_output_bytes integer,p_samples integer,p_channels integer,p_sha256 text)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v private.v2_media_uploads; v_now timestamptz;
begin
 perform 1 from public.v2_garden where id=1 for update; v_now:=clock_timestamp();
 select * into v from private.v2_media_uploads where id=p_id for update;
 if not found or v.status<>'processing' or v.lease_id is distinct from p_lease_id or v.expires_at<=v_now then
   raise exception using errcode='22023',message='media_expired_or_changed'; end if;
 if not exists(select 1 from private.garden_members m cross join lateral private.google_account(m.user_id,true) a where m.member_id=v.owner_id and m.revoked_at is null and a.email=m.allowed_email and a.google_subject=m.google_subject) then
   raise exception using errcode='42501',message='media_not_available'; end if;
 if v.mime_type<>'audio/webm' or p_output_bytes is null or p_samples is null or p_channels is null or p_sha256 is null then
   raise exception using errcode='22023',message='media_invalid_metadata'; end if;
 if not exists(select 1 from storage.objects where bucket_id='garden-v2-media' and name=private.v2_media_upload_json(v)->>'final_path' and (metadata->>'size')::bigint=p_output_bytes and metadata->>'mimetype'='audio/wav') then
   raise exception using errcode='22023',message='media_object_missing'; end if;
 update private.v2_media_uploads set status='ready',output_bytes=p_output_bytes,samples=p_samples,channels=p_channels,sha256=p_sha256 where id=v.id;
end $$;

-- Wrap whichever v2 validator precedes this migration (the core copy, or a
-- later extension such as Peony) instead of replacing it. Only an exact
-- {media_id} payload for Sunflower/Bluebell takes the media path; every other
-- payload, including invalid media payloads, keeps the prior behavior.
alter function private.v2_validate_entry_payload(text,jsonb,date) rename to v2_validate_nonmedia_entry_payload;
create function private.v2_validate_entry_payload(p_type text,p_payload jsonb,p_day date)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
begin
 if p_type is null or p_type not in ('sunflower','bluebell') or p_payload is null or jsonb_typeof(p_payload)<>'object' or not(p_payload ? 'media_id') or (select count(*) from jsonb_object_keys(p_payload))<>1 then
   return private.v2_validate_nonmedia_entry_payload(p_type,p_payload,p_day); end if;
 if octet_length(p_payload::text)>20000 or jsonb_typeof(p_payload->'media_id')<>'string' or (p_payload->>'media_id') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
   raise exception using errcode='22023',message='media_invalid_reference'; end if;
 return p_payload;
end $$;

-- Binds a ready reference to its exact owner, flower, garden day and purpose.
-- AFTER ensures the entry exists before it is marked submitted; an exception
-- still rolls back the entry and the whole operation atomically.
create function private.v2_guard_media_entry()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
declare v private.v2_media_uploads; v_type text;
begin
 select type_key into v_type from public.v2_flowers where id=new.flower_id;
 if v_type is null or v_type not in ('sunflower','bluebell') then return new; end if;
 select * into v from private.v2_media_uploads where id=(new.payload->>'media_id')::uuid for update;
 if tg_op='UPDATE' and new.payload=old.payload and v.status='submitted' and v.entry_id=new.id then return new; end if;
 if not found or v.owner_id<>private.require_member() or v.owner_id<>new.author_id or v.flower_id<>new.flower_id
 or v.intended_day<>new.garden_day or v.expires_at<=new.updated_at or v.status<>'ready'
 or (tg_op='INSERT' and v.replacement_entry_id is not null)
 or (tg_op='UPDATE' and v.replacement_entry_id is distinct from new.id) then
   raise exception using errcode='42501',message='media_invalid_reference'; end if;
 update private.v2_media_uploads set status='submitted',entry_id=new.id where id=v.id;
 return new;
end $$;
create trigger v2_flower_entry_media_guard after insert or update on public.v2_flower_entries
 for each row execute function private.v2_guard_media_entry();

-- Both live members may read a submitted attachment still referenced by its
-- entry, including past-day history; superseded media has no new read.
create function public.v2_media_read_path(p_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v private.v2_media_uploads;
begin
 perform private.require_member();
 select m.* into v from private.v2_media_uploads m join public.v2_flower_entries e on e.id=m.entry_id
 where m.id=p_id and m.status='submitted' and e.payload->>'media_id'=m.id::text;
 if not found then raise exception using errcode='42501',message='media_not_available'; end if;
 return jsonb_build_object('path',private.v2_media_upload_json(v)->>'final_path','mime_type',case when v.mime_type='audio/webm' then 'audio/wav' else v.mime_type end,'width',v.width,'height',v.height,'samples',v.samples,'sample_rate',case when v.samples is not null then 48000 end,'channels',v.channels);
end $$;

-- Bounded opportunistic sweep under the v2 lock, as in legacy: tombstone
-- expired never-submitted intents before any Storage deletion so they can
-- never acquire an entry reference; never select a submitted final object.
create function public.v2_media_cleanup_candidates()
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v private.v2_media_uploads; result jsonb:='[]';
begin
 perform 1 from public.v2_garden where id=1 for update; v_now:=clock_timestamp();
 for v in select * from private.v2_media_uploads where
 (status='submitted' and not staging_cleaned) or
 (expires_at<v_now-interval '1 hour' and entry_id is null and (not staging_cleaned or not final_cleaned))
 order by created_at limit 20 for update loop
   if v.entry_id is null then update private.v2_media_uploads set status='expired' where id=v.id; end if;
   result:=result || jsonb_build_array(jsonb_build_object('id',v.id,
    'staging_path',case when not v.staging_cleaned then private.v2_media_upload_json(v)->>'staging_path' end,
    'final_path',case when v.entry_id is null and not v.final_cleaned then private.v2_media_upload_json(v)->>'final_path' end));
 end loop;
 return result;
end $$;
create function public.v2_media_cleanup_done(p_id uuid,p_staging boolean,p_final boolean)
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
 update private.v2_media_uploads set staging_cleaned=staging_cleaned or p_staging,
 final_cleaned=final_cleaned or (p_final and status='expired' and entry_id is null)
 where id=p_id and (status='submitted' or status='expired');
end $$;

-- Explicit function grant surface (decision 0028 pattern).
revoke all on function
  private.v2_media_upload_json(private.v2_media_uploads),
  private.v2_validate_entry_payload(text,jsonb,date),
  private.v2_validate_nonmedia_entry_payload(text,jsonb,date),
  private.v2_guard_media_entry(),
  public.v2_create_media_upload(uuid,uuid,text,integer,bigint),
  public.v2_media_upload_state(uuid),
  public.v2_media_upload_allowed(text),
  public.v2_claim_media_upload(uuid),
  public.v2_attest_media_upload(uuid,uuid,integer,integer,integer,text),
  public.v2_attest_audio_upload(uuid,uuid,integer,integer,integer,text),
  public.v2_media_read_path(uuid),
  public.v2_media_cleanup_candidates(),
  public.v2_media_cleanup_done(uuid,boolean,boolean)
from public, anon, authenticated, service_role, supabase_auth_admin;
grant execute on function
  public.v2_create_media_upload(uuid,uuid,text,integer,bigint),
  public.v2_media_upload_state(uuid),
  public.v2_media_upload_allowed(text),
  public.v2_claim_media_upload(uuid),
  public.v2_media_read_path(uuid)
to authenticated;
grant execute on function
  public.v2_attest_media_upload(uuid,uuid,integer,integer,integer,text),
  public.v2_attest_audio_upload(uuid,uuid,integer,integer,integer,text),
  public.v2_media_cleanup_candidates(),
  public.v2_media_cleanup_done(uuid,boolean,boolean)
to service_role;
