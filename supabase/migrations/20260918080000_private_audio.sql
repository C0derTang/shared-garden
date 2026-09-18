-- Extend the same private media registry and entry boundary for validated audio.
alter table private.media_uploads drop constraint media_uploads_mime_type_check;
alter table private.media_uploads add constraint media_uploads_mime_type_check check(mime_type in ('image/jpeg','image/png','image/webp','audio/webm'));
alter table private.media_uploads add column samples integer check(samples between 1 and 14400000);
alter table private.media_uploads add column channels integer check(channels=1);
alter table private.media_uploads drop constraint media_uploads_output_bytes_check;
alter table private.media_uploads add constraint media_uploads_output_bytes_check check(output_bytes between 1 and 33554432);
alter table private.media_uploads drop constraint media_uploads_check1;
alter table private.media_uploads add constraint media_ready_metadata check(status not in ('ready','submitted') or (output_bytes is not null and sha256 is not null and ((mime_type='audio/webm' and samples is not null and channels is not null and width is null and height is null and output_bytes=samples*channels*2+44) or (mime_type<>'audio/webm' and width is not null and height is not null and samples is null and channels is null and output_bytes<=33554432))));
update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','audio/webm'] where id='garden-staging';
update storage.buckets set file_size_limit=33554432,allowed_mime_types=array['image/jpeg','image/png','image/webp','audio/wav'] where id='garden-media';


create or replace function private.media_upload_json(v private.media_uploads)
returns jsonb language sql immutable security invoker set search_path = pg_catalog as $$
 select jsonb_build_object('id',v.id,'flower_id',v.flower_id,'replacement_entry_id',v.replacement_entry_id,
 'status',v.status,'expires_at',v.expires_at,'mime_type',v.mime_type,'input_bytes',v.input_bytes,
 'staging_path',v.id::text || '/source','final_path',v.id::text || case when v.mime_type='audio/webm' then '/audio.wav' else '/photo.' || case v.mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end end,
 'entry_id',v.entry_id,'width',v.width,'height',v.height,'samples',v.samples,'sample_rate',case when v.samples is not null then 48000 end,'channels',v.channels);
$$;

create or replace function public.create_media_upload(p_request_id uuid,p_flower_id uuid,p_mime_type text,p_input_bytes integer,p_replacement_entry_id bigint default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_day date; v_owner smallint; v private.media_uploads; v_type text;
begin
 v_now := private.begin_garden_operation(); v_owner := private.require_member();
 select garden_day into v_day from private.garden_clock_at(v_now);
 if p_request_id is null or p_flower_id is null or p_mime_type is null or p_mime_type not in ('image/jpeg','image/png','image/webp','audio/webm') or p_input_bytes is null or p_input_bytes not between 1 and 12582912 then
   raise exception using errcode='22023',message='media_invalid_request'; end if;
 select * into v from private.media_uploads where owner_id=v_owner and request_id=p_request_id;
 if found then
   if v.flower_id<>p_flower_id or v.mime_type<>p_mime_type or v.input_bytes<>p_input_bytes or v.replacement_entry_id is distinct from p_replacement_entry_id then
     raise exception using errcode='22023',message='media_idempotency_conflict'; end if;
   return private.media_upload_json(v);
 end if;
 select type_key into v_type from public.flowers where id=p_flower_id and garden_id=1;
 if v_type is distinct from (case when p_mime_type='audio/webm' then 'bluebell' else 'sunflower' end) then raise exception using errcode='22023',message='media_wrong_flower'; end if;
 if p_replacement_entry_id is not null and not exists(select 1 from public.flower_entries where id=p_replacement_entry_id and flower_id=p_flower_id and author_id=v_owner) then
   raise exception using errcode='42501',message='media_wrong_owner'; end if;
 if (select count(*) from private.media_uploads where owner_id=v_owner and status in ('pending','processing','ready') and expires_at>v_now)>=3
 or (select count(*) from private.media_uploads where owner_id=v_owner and created_at>v_now-interval '1 hour')>=20 then
   raise exception using errcode='22023',message='media_upload_limit'; end if;
 insert into private.media_uploads(owner_id,request_id,flower_id,replacement_entry_id,intended_day,mime_type,input_bytes,created_at,expires_at)
 values(v_owner,p_request_id,p_flower_id,p_replacement_entry_id,v_day,p_mime_type,p_input_bytes,v_now,v_now+interval '15 minutes') returning * into v;
 return private.media_upload_json(v);
end $$;

create or replace function public.attest_audio_upload(p_id uuid,p_lease_id uuid,p_output_bytes integer,p_samples integer,p_channels integer,p_sha256 text)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v private.media_uploads; v_now timestamptz;
begin
 perform 1 from public.garden where id=1 for update; v_now:=clock_timestamp();
 select * into v from private.media_uploads where id=p_id for update;
 if not found or v.status<>'processing' or v.lease_id is distinct from p_lease_id or v.expires_at<=v_now then
   raise exception using errcode='22023',message='media_expired_or_changed'; end if;
 if not exists(select 1 from private.garden_members m cross join lateral private.google_account(m.user_id,true) a where m.member_id=v.owner_id and m.revoked_at is null and a.email=m.allowed_email and a.google_subject=m.google_subject) then
   raise exception using errcode='42501',message='media_not_available'; end if;
 if not exists(select 1 from storage.objects where bucket_id='garden-media' and name=private.media_upload_json(v)->>'final_path' and (metadata->>'size')::bigint=p_output_bytes and metadata->>'mimetype'='audio/wav') then
   raise exception using errcode='22023',message='media_object_missing'; end if;
 if p_output_bytes is null or v.mime_type<>'audio/webm' or p_samples is null or p_channels is null or p_sha256 is null then raise exception using errcode='22023',message='media_invalid_metadata'; end if;
 update private.media_uploads set status='ready',output_bytes=p_output_bytes,samples=p_samples,channels=p_channels,sha256=p_sha256 where id=v.id;
end $$;

create or replace function private.validate_entry_payload(p_type text,p_payload jsonb,p_day date)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
begin
 if p_type not in ('sunflower','bluebell') or p_payload is null or jsonb_typeof(p_payload)<>'object' or not(p_payload ? 'media_id') or (select count(*) from jsonb_object_keys(p_payload))<>1 then
   return private.validate_nonmedia_entry_payload(p_type,p_payload,p_day); end if;
 if octet_length(p_payload::text)>20000 or (select count(*) from jsonb_object_keys(p_payload))<>1 or jsonb_typeof(p_payload->'media_id')<>'string' or (p_payload->>'media_id') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
   raise exception using errcode='22023',message='media_invalid_reference'; end if;
 return p_payload;
end $$;

create or replace function private.guard_media_entry()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
declare v private.media_uploads; v_type text;
begin
 select type_key into v_type from public.flowers where id=new.flower_id;
 if v_type not in ('sunflower','bluebell') then return new; end if;
 select * into v from private.media_uploads where id=(new.payload->>'media_id')::uuid for update;
 if tg_op='UPDATE' and new.payload=old.payload and v.status='submitted' and v.entry_id=new.id then return new; end if;
 if not found or v.owner_id<>private.require_member() or v.owner_id<>new.author_id or v.flower_id<>new.flower_id
 or v.intended_day<>new.garden_day or v.expires_at<=new.updated_at or v.status<>'ready'
 or (tg_op='INSERT' and v.replacement_entry_id is not null)
 or (tg_op='UPDATE' and v.replacement_entry_id is distinct from new.id) then
   raise exception using errcode='42501',message='media_invalid_reference'; end if;
 update private.media_uploads set status='submitted',entry_id=new.id where id=v.id;
 return new;
end $$;

create or replace function public.media_read_path(p_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v private.media_uploads;
begin
 perform private.require_member();
 select m.* into v from private.media_uploads m join public.flower_entries e on e.id=m.entry_id
 where m.id=p_id and m.status='submitted' and e.payload->>'media_id'=m.id::text;
 if not found then raise exception using errcode='42501',message='media_not_available'; end if;
 return jsonb_build_object('path',private.media_upload_json(v)->>'final_path','mime_type',case when v.mime_type='audio/webm' then 'audio/wav' else v.mime_type end,'width',v.width,'height',v.height,'samples',v.samples,'sample_rate',case when v.samples is not null then 48000 end,'channels',v.channels);
end $$;

revoke all on function public.attest_audio_upload(uuid,uuid,integer,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.attest_audio_upload(uuid,uuid,integer,integer,integer,text) to service_role;