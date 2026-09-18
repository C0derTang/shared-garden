-- A shared-content read only. No garden operation, settlement or private event.
create index entries_memories_order on public.flower_entries(original_posted_at desc, (id::text) collate "C" desc);
create index flowers_memories_order on public.flowers(planted_at desc, (id::text) collate "C" desc) where type_key in ('dandelion','peony');

create function public.memories_page(
  p_mode text default 'latest', p_cursor jsonb default null,
  p_keys text[] default null, p_type text default null, p_spot integer default null,
  p_from date default null, p_to date default null
) returns jsonb language plpgsql stable security invoker set search_path = pg_catalog as $$
declare v_at timestamptz; v_kind text; v_id text; v_result jsonb;
begin
  if not public.is_garden_member() then
    raise exception using errcode='42501',message='Garden membership required';
  end if;
  if p_mode is null or p_mode not in ('latest','older','newer','updates')
    or (p_type is not null and p_type not in ('rose','cactus','tulip','marigold','daisy','hydrangea','sunflower','snapdragon','moonflower','bluebell','dandelion','forget-me-not','peony'))
    or p_spot <= 0 or p_from > p_to or not isfinite(p_from) or not isfinite(p_to) then
    raise exception using errcode='22023',message='Invalid memories query';
  end if;
  if p_mode in ('older','newer') then
    if p_cursor is null or jsonb_typeof(p_cursor)<>'object'
      or coalesce(p_cursor->>'at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      or coalesce(p_cursor->>'kind','') not in ('entry','wish','peony')
      or (p_cursor->>'kind'='entry' and coalesce(p_cursor->>'id','') !~ '^[1-9][0-9]{0,18}$')
      or (p_cursor->>'kind'<>'entry' and coalesce(p_cursor->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception using errcode='22023',message='Invalid memories cursor';
    end if;
    v_at := (p_cursor->>'at')::timestamptz;
    v_kind := p_cursor->>'kind'; v_id := p_cursor->>'id';
  end if;
  if p_mode='updates' and (p_keys is null or cardinality(p_keys) not between 1 and 20
    or exists(select 1 from unnest(p_keys) k where k is null or k !~ '^(entry:[1-9][0-9]{0,18}|(wish|peony):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')) then
    raise exception using errcode='22023',message='Invalid memories update batch';
  end if;
  with sources as (
    select e.original_posted_at as at, 'entry'::text as kind, e.id::text as source_id,
      e.flower_id, e.garden_day
    from public.flower_entries e
    union all
    select f.planted_at, case f.type_key when 'dandelion' then 'wish' else 'peony' end,
      f.id::text, f.id, f.planted_day
    from public.flowers f where f.type_key in ('dandelion','peony')
  ), candidates as (
    select s.* from sources s join public.flowers f on f.id=s.flower_id
    where (p_type is null or f.type_key=p_type) and (p_spot is null or f.spot=p_spot)
      and (p_from is null or s.garden_day>=p_from) and (p_to is null or s.garden_day<=p_to)
      and (p_mode<>'older' or (s.at,s.kind collate "C",s.source_id collate "C") < (v_at,v_kind collate "C",v_id collate "C"))
      and (p_mode<>'newer' or (s.at,s.kind collate "C",s.source_id collate "C") > (v_at,v_kind collate "C",v_id collate "C"))
      and (p_mode<>'updates' or (s.kind||':'||s.source_id)=any(p_keys))
    order by
      case when p_mode='newer' then s.at end asc,
      case when p_mode='newer' then s.kind end collate "C" asc,
      case when p_mode='newer' then s.source_id end collate "C" asc,
      s.at desc, s.kind collate "C" desc, s.source_id collate "C" desc
    limit 21
  ), numbered as (
    select *, row_number() over(order by
      case when p_mode='newer' then at end asc,
      case when p_mode='newer' then kind end collate "C" asc,
      case when p_mode='newer' then source_id end collate "C" asc,
      at desc, kind collate "C" desc, source_id collate "C" desc) as ordinal
    from candidates
  ), enriched as (
    select n.ordinal,jsonb_build_object(
      'key',n.kind||':'||n.source_id,'kind',n.kind,'source_id',n.source_id,
      'at',n.at,'garden_day',n.garden_day,'read_at',statement_timestamp(),
      'flower',jsonb_build_object('id',f.id,'type_key',f.type_key,'spot',f.spot,
        'planted_at',f.planted_at,'planted_day',f.planted_day,'planted_by',f.planted_by,
        'first_bloom_at',f.first_bloom_at,'first_bloom_day',f.first_bloom_day,
        'shared_wish',f.shared_wish,'fulfilled_at',f.fulfilled_at,'fulfilled_by',f.fulfilled_by),
      'entry',case when n.kind='entry' then jsonb_build_object(
        'author_id',e.author_id,'updated_at',e.updated_at,
        'payload',case f.type_key
          when 'cactus' then '{}'::jsonb
          when 'tulip' then jsonb_build_object('title',e.payload->>'title','artist',e.payload->>'artist','url',e.payload->>'url')
          when 'hydrangea' then jsonb_build_object('mood',e.payload->>'mood')
          when 'sunflower' then jsonb_build_object('media_id',e.payload->>'media_id')
          when 'bluebell' then jsonb_build_object('media_id',e.payload->>'media_id')
          else jsonb_build_object('text',e.payload->>'text') end,
        'question',case when f.type_key='daisy' then d.prompt end) end,
      'peony',case when n.kind='peony' then jsonb_build_object(
        'contributions',(select coalesce(jsonb_agg(jsonb_build_object(
          'milestone',c.milestone,'author_id',c.author_id,'original_posted_at',c.original_posted_at,
          'garden_day',c.garden_day,'text',case when c.milestone<>3 then c.payload->>'text' end)
          order by c.milestone,c.author_id),'[]'::jsonb) from public.peony_contributions c where c.flower_id=f.id),
        'plan',(select jsonb_build_object('version',p.version::text,'activity',p.activity,
          'starts_at',p.starts_at,'updated_at',p.updated_at,'updated_by',p.updated_by,
          'acceptances',(select coalesce(jsonb_agg(jsonb_build_object('author_id',a.author_id,
            'original_posted_at',a.original_posted_at,'garden_day',a.garden_day) order by a.author_id),'[]'::jsonb)
            from public.peony_acceptances a where a.flower_id=p.flower_id and a.plan_version=p.version))
          from public.peony_plans p where p.flower_id=f.id),
        'completed',(select coalesce(jsonb_agg(jsonb_build_object('milestone',a.milestone,
          'garden_day',a.garden_day,'completed_at',a.completed_at,
          'member1_posted_at',a.member1_posted_at,'member2_posted_at',a.member2_posted_at)
          order by a.milestone),'[]'::jsonb) from public.peony_activity a where a.flower_id=f.id)) end
    ) as item
    from numbered n join public.flowers f on f.id=n.flower_id
    left join public.flower_entries e on e.id=case when n.kind='entry' then n.source_id::bigint end
    left join public.daisy_assignments d on d.garden_day=e.daisy_assignment_day
    where n.ordinal<=20
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(item order by ordinal) from enriched),'[]'::jsonb),
    'more',(select count(*)>20 from candidates)) into v_result;
  return v_result;
end $$;
revoke all on function public.memories_page(text,jsonb,text[],text,integer,date,date)
  from public,anon,authenticated,service_role,supabase_auth_admin;
grant execute on function public.memories_page(text,jsonb,text[],text,integer,date,date) to authenticated;
