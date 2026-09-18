-- One permanent fact per existing instance. Existing member RLS and Realtime
-- publication protect and deliver it together with the authoritative flower.
alter table public.flowers
  add column fulfilled_at timestamptz,
  add column fulfilled_by smallint,
  add constraint dandelion_fulfillment_valid check (
    (fulfilled_at is null and fulfilled_by is null) or
    (fulfilled_at is not null and fulfilled_by is not null and fulfilled_by in (1,2)
      and type_key='dandelion' and first_bloom_at is not null
      and isfinite(fulfilled_at) and fulfilled_at >= first_bloom_at)
  );

create function public.fulfill_dandelion(p_flower_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_actor smallint; v_flower public.flowers;
begin
  -- Serializes with settlement/planting/care and rechecks membership after lock.
  v_now := private.begin_garden_operation();
  v_actor := private.require_member();
  select * into v_flower from public.flowers
    where id=p_flower_id and garden_id=1 and type_key='dandelion';
  if not found then raise exception using errcode='22023',message='Unknown Dandelion'; end if;
  if v_flower.first_bloom_at is null then
    raise exception using errcode='22023',message='The wish must bloom before fulfillment';
  end if;
  if v_flower.fulfilled_at is null then
    update public.flowers set fulfilled_at=v_now,fulfilled_by=v_actor
      where id=p_flower_id returning * into v_flower;
  end if;
  return jsonb_build_object('flower_id',v_flower.id,'fulfilled_at',v_flower.fulfilled_at,'fulfilled_by',v_flower.fulfilled_by);
end $$;
revoke all on function public.fulfill_dandelion(uuid) from public,anon,authenticated,service_role,supabase_auth_admin;
grant execute on function public.fulfill_dandelion(uuid) to authenticated;
