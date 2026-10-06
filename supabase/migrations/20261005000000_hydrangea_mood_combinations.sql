-- Color of the day: combined moods and an Other choice (decision 0061, issue #151).
-- A Hydrangea pick is one or two of the six colors, or Other with a short
-- note. Optional note on any pick. Identical color sets still count as a mood
-- match; Other never does. No growth, streak or care rules change.
insert into public.hydrangea_moods values ('other','Other','Neutral','#B8B2A6');

create or replace function private.validate_entry_payload(p_type text, p_payload jsonb, p_day date)
returns jsonb
language plpgsql security invoker set search_path = pg_catalog
as $$
declare v_keys text[]; v_expected text[]; v_field text; v_value text; v_url text; v_port text; v_result jsonb := p_payload;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 20000 then
    raise exception using errcode = '22023', message = 'Invalid entry content';
  end if;
  case p_type
    when 'cactus' then v_expected := array[]::text[];
    when 'tulip' then v_expected := array['artist','title','url'];
    when 'hydrangea' then v_expected := array['mood'];
    when 'daisy' then v_expected := array['question_id','text'];
    when 'rose','marigold','snapdragon','moonflower','dandelion','forget-me-not' then v_expected := array['text'];
    else raise exception using errcode = '22023', message = 'This flower requires its dedicated workflow';
  end case;
  select coalesce(array_agg(k order by k),array[]::text[]) into v_keys from jsonb_object_keys(p_payload) k;
  -- Hydrangea: mood is required; a second color and a short note are optional.
  if p_type = 'hydrangea' then
    if not (v_keys @> array['mood']) or not (array['mood','mood2','note'] @> v_keys) then
      raise exception using errcode = '22023', message = 'Invalid entry fields';
    end if;
    v_expected := v_keys;
  elsif v_keys <> v_expected then
    raise exception using errcode = '22023', message = 'Invalid entry fields';
  end if;
  foreach v_field in array v_expected loop
    if jsonb_typeof(p_payload -> v_field) <> 'string' then
      raise exception using errcode = '22023', message = 'Entry fields must be strings';
    end if;
    v_value := regexp_replace(p_payload ->> v_field, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if char_length(v_value) < 1 or char_length(v_value) > (case when v_field = 'text' then 4000 when v_field = 'url' then 512 when v_field = 'note' then 140 else 200 end) then
      raise exception using errcode = '22023', message = 'Entry field length is invalid';
    end if;
    v_result := jsonb_set(v_result, array[v_field], to_jsonb(v_value));
  end loop;
  if p_type = 'tulip' then
    v_url := p_payload ->> 'url';
    -- Accept links, never fetch them. Require an ASCII DNS host (IDNs use
    -- punycode), at most 253 host characters, no credentials, controls,
    -- whitespace, backslashes or malformed escapes. Provider-specific embed
    -- parsing is a separate integration.
    if v_url !~ '^https://([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?[.])+[A-Za-z]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$'
      or char_length(substring(v_url from '^https://([^/:?#]+)')) > 253
      or v_url ~ '[[:space:][:cntrl:]]' or position(chr(92) in v_url) > 0
      or v_url ~* '%(0[0-9a-f]|1[0-9a-f]|7f)'
      or position('%' in regexp_replace(v_url, '%[0-9A-Fa-f]{2}', '', 'g')) > 0 then
      raise exception using errcode = '22023', message = 'Use a valid HTTPS song link without credentials or control characters';
    end if;
    v_port := substring(v_url from '^https://[^/:?#]+:([0-9]+)');
    if v_port is not null and v_port::integer not between 1 and 65535 then
      raise exception using errcode = '22023', message = 'Use a valid HTTPS song link without credentials or control characters';
    end if;
  end if;
  if p_type = 'hydrangea' then
    if not exists (select 1 from public.hydrangea_moods where mood_key = v_result ->> 'mood') then
      raise exception using errcode = '22023', message = 'Unknown mood';
    end if;
    if v_result ->> 'mood' = 'other' then
      if v_result ? 'mood2' then
        raise exception using errcode = '22023', message = 'Other stands alone; choose colors or Other';
      end if;
      if not (v_result ? 'note') then
        raise exception using errcode = '22023', message = 'Say briefly why when choosing Other';
      end if;
    elsif v_result ? 'mood2' then
      if v_result ->> 'mood2' = 'other' or not exists (select 1 from public.hydrangea_moods where mood_key = v_result ->> 'mood2') then
        raise exception using errcode = '22023', message = 'Unknown mood';
      end if;
      if v_result ->> 'mood2' = v_result ->> 'mood' then
        raise exception using errcode = '22023', message = 'Choose two different colors';
      end if;
    end if;
  end if;
  if p_type = 'daisy' and not exists (select 1 from public.daisy_assignments where garden_day = p_day and question_id = v_result ->> 'question_id') then
    raise exception using errcode = '22023', message = 'Answer the assigned daily question';
  end if;
  return v_result;
end;
$$;

create or replace function private.evaluate_achievements(p_now timestamptz)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
begin
 perform private.require_member();
 perform 1 from public.garden where id=1 for update;
 perform private.require_member();
 if p_now is null or not isfinite(p_now) then raise exception 'Missing achievement time'; end if;
 with flower_counts as (
  select count(*) filter(where not is_initial) seeds,
   count(*) filter(where first_bloom_at is not null) blooms,
   count(distinct type_key) planted_types,
   count(distinct type_key) filter(where first_bloom_at is not null) bloomed_types,
   count(*) filter(where type_key='rose' and first_bloom_at is not null) roses,
   count(*) filter(where type_key='marigold' and first_bloom_at is not null) marigolds,
   count(*) filter(where type_key='tulip' and first_bloom_at is not null) tulips,
   count(*) filter(where type_key='forget-me-not' and first_bloom_at is not null) forget_me_nots,
   count(*) filter(where type_key='dandelion') wishes,
   count(*) filter(where type_key='moonflower' and first_bloom_at is not null) moonflowers,
   count(*) filter(where type_key='snapdragon' and first_bloom_at is not null) snapdragons,
   count(*) filter(where type_key='bluebell' and first_bloom_at is not null) bluebells,
   count(*) filter(where type_key='peony' and first_bloom_at is not null) peonies,
   count(*) filter(where type_key='dandelion' and fulfilled_at is not null) fulfilled
  from public.flowers
 ), pairs as (
  select a.flower_id,a.garden_day,a.original_posted_at one_at,b.original_posted_at two_at
  from public.flower_entries a join public.flower_entries b
   on a.flower_id=b.flower_id and a.garden_day=b.garden_day and b.author_id=2
  join public.flowers f on f.id=a.flower_id
  where a.author_id=1 and (f.type_key<>'hydrangea' or f.first_bloom_day is null or a.garden_day<=f.first_bloom_day)
 ), questions as (
  select daisy_question_id question_id from public.flower_day_facts where type_key='daisy' and paired
  union
  select a.question_id from pairs p join public.flowers f on f.id=p.flower_id and f.type_key='daisy'
   join public.daisy_assignments a on a.garden_day=p.garden_day
 ), evidence as (
  select f.*,
   (select longest_streak from public.garden where id=1) streak,
   (select count(distinct question_id) from questions) questions,
   (select count(distinct d.garden_day) from public.flower_day_facts d
     left join public.flower_entries x on x.flower_id=d.flower_id and x.garden_day=d.garden_day and x.author_id=1
     left join public.flower_entries y on y.flower_id=d.flower_id and y.garden_day=d.garden_day and y.author_id=2
     where d.type_key='hydrangea' and d.paired and d.member1_mood<>'other'
      and ((d.member1_mood=d.member2_mood and (x.payload->>'mood2') is not distinct from (y.payload->>'mood2'))
        or (d.member1_mood=(y.payload->>'mood2') and (x.payload->>'mood2')=d.member2_mood))) moods,
   exists(select 1 from public.flowers b join public.flower_day_facts x on x.flower_id=b.id
    where x.growth_before>0 and x.growth_after<x.growth_before and x.garden_day<b.first_bloom_day) recovery,
   exists(select 1 from public.garden_days where before_noon_complete and before_noon_eligible_count>0) noon,
   (exists(select 1 from pairs where abs(extract(epoch from (two_at-one_at)))<=600)
    or exists(select 1 from public.flower_day_facts where paired and abs(extract(epoch from(member2_posted_at-member1_posted_at)))<=600)
    or exists(select 1 from public.peony_activity p where abs(extract(epoch from(p.member2_posted_at-p.member1_posted_at)))<=600
     and (select garden_day from private.garden_clock_at(p.member1_posted_at))=(select garden_day from private.garden_clock_at(p.member2_posted_at)))) timing
  from flower_counts f
 ), metrics as (
  select v.* from evidence e cross join lateral (values
   ('first-seed',e.seeds),('first-bloom',e.blooms),('all-planted',e.planted_types),('all-bloomed',e.bloomed_types),
   ('streak-3',e.streak),('streak-7',e.streak),('streak-14',e.streak),('streak-21',e.streak),
   ('recovery',e.recovery::integer),('roses-5',e.roses),('marigolds-10',e.marigolds),('tulips-3',e.tulips),
   ('daisy-20',e.questions),('forget-me-nots-3',e.forget_me_nots),('wishes-5',e.wishes),
   ('ten-minutes',e.timing::integer),('before-noon',e.noon::integer),('moonflower',e.moonflowers),
   ('snapdragon',e.snapdragons),('bluebell',e.bluebells),('mood-match-3',e.moods),('peony',e.peonies),
   ('first-wish-blown',e.fulfilled),('coexisting-5',e.blooms),('blooms-10',e.blooms),('blooms-20',e.blooms)
  ) v(achievement_id,amount)
 )
 insert into public.achievement_progress as p
 select c.achievement_id,least(c.target,coalesce(m.amount,0))::integer
 from public.achievement_catalog c join metrics m using(achievement_id)
 on conflict(achievement_id) do update set progress=excluded.progress
 where p.progress is distinct from excluded.progress;
 insert into public.achievement_awards(achievement_id,earned_at)
 select c.achievement_id,p_now from public.achievement_catalog c join public.achievement_progress p using(achievement_id)
 where p.progress>=c.target on conflict(achievement_id) do nothing;
end $$;

create or replace function private.entry_state_at(p_flower_id uuid,v_actor smallint,v_now timestamptz)
returns jsonb
language plpgsql security invoker set search_path = pg_catalog
as $$
declare
  v_clock record;
  v_flower public.flowers; v_question public.daisy_assignments; v_entries jsonb;
begin
  select * into v_clock from private.garden_clock_at(v_now);
  select * into v_flower from public.flowers where id = p_flower_id and garden_id = 1;
  if not found then raise exception using errcode = '22023', message = 'Unknown flower'; end if;
  if v_flower.type_key = 'daisy' and v_flower.first_bloom_at is null then v_question := private.assign_daisy_question(v_clock.garden_day,v_now); end if;
  select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object(
    'edit_deadline',least(e.original_posted_at + interval '30 minutes', v_clock.next_rollover_at),
    'edit_deadline_inclusive',e.original_posted_at + interval '30 minutes' < v_clock.next_rollover_at,
    'can_edit',e.author_id = v_actor and v_now >= e.original_posted_at and v_now <= e.original_posted_at + interval '30 minutes'
    ) order by e.author_id),'[]'::jsonb) into v_entries
    from public.flower_entries e where e.flower_id = p_flower_id and e.garden_day = v_clock.garden_day;
  return jsonb_build_object('server_now',v_now,'garden_day',v_clock.garden_day,
    'day_starts_at',v_clock.day_starts_at,'next_rollover_at',v_clock.next_rollover_at,
    'moonflower_open',v_clock.moonflower_open,'flower',to_jsonb(v_flower),
    'daisy_question',case when v_question.garden_day is not null then to_jsonb(v_question) else null end,
    'member1_submitted',exists(select 1 from public.flower_entries where flower_id=p_flower_id and garden_day=v_clock.garden_day and author_id=1),
    'member2_submitted',exists(select 1 from public.flower_entries where flower_id=p_flower_id and garden_day=v_clock.garden_day and author_id=2),
    'hydrangea_moods',jsonb_build_array(
      (select e.payload->>'mood' from public.flower_entries e where e.flower_id=p_flower_id and v_flower.type_key='hydrangea' and e.author_id=1 order by e.garden_day desc limit 1),
      (select e.payload->>'mood' from public.flower_entries e where e.flower_id=p_flower_id and v_flower.type_key='hydrangea' and e.author_id=2 order by e.garden_day desc limit 1)),
    'hydrangea_picks',jsonb_build_array(
      (select e.payload from public.flower_entries e where e.flower_id=p_flower_id and v_flower.type_key='hydrangea' and e.author_id=1 order by e.garden_day desc limit 1),
      (select e.payload from public.flower_entries e where e.flower_id=p_flower_id and v_flower.type_key='hydrangea' and e.author_id=2 order by e.garden_day desc limit 1)),
    'entries',v_entries);
end;
$$;

drop function public.memories_page(text,jsonb,text[],text,integer,date,date,integer);
create function public.memories_page(
  p_mode text default 'latest', p_cursor jsonb default null,
  p_keys text[] default null, p_type text default null, p_spot integer default null,
  p_from date default null, p_to date default null, p_author integer default null
) returns jsonb language plpgsql stable security invoker set search_path = pg_catalog as $$
declare v_at timestamptz; v_kind text; v_id text; v_result jsonb;
begin
  if not public.is_garden_member() then
    raise exception using errcode='42501',message='Garden membership required';
  end if;
  if p_mode is null or p_mode not in ('latest','older','newer','updates')
    or (p_type is not null and p_type not in ('rose','cactus','tulip','marigold','daisy','hydrangea','sunflower','snapdragon','moonflower','bluebell','dandelion','forget-me-not','peony'))
    or p_spot <= 0 or p_from > p_to or not isfinite(p_from) or not isfinite(p_to)
    or (p_author is not null and p_author not in (1,2)) then
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
      e.flower_id, e.garden_day, e.author_id::smallint as author_id
    from public.flower_entries e
    union all
    select f.planted_at, case f.type_key when 'dandelion' then 'wish' else 'peony' end,
      f.id::text, f.id, f.planted_day, f.planted_by::smallint
    from public.flowers f where f.type_key in ('dandelion','peony')
  ), candidates as (
    select s.* from sources s join public.flowers f on f.id=s.flower_id
    where (p_type is null or f.type_key=p_type) and (p_spot is null or f.spot=p_spot)
      and (p_from is null or s.garden_day>=p_from) and (p_to is null or s.garden_day<=p_to)
      and (p_author is null or s.author_id=p_author
        or (s.kind='peony' and exists(select 1 from public.peony_contributions c where c.flower_id=s.flower_id and c.author_id=p_author)))
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
          when 'hydrangea' then jsonb_strip_nulls(jsonb_build_object('mood',e.payload->>'mood','mood2',e.payload->>'mood2','note',e.payload->>'note'))
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
revoke all on function public.memories_page(text,jsonb,text[],text,integer,date,date,integer)
  from public,anon,authenticated,service_role,supabase_auth_admin;
grant execute on function public.memories_page(text,jsonb,text[],text,integer,date,date,integer) to authenticated;
