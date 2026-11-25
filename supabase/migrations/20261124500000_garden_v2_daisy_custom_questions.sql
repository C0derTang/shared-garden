-- New-garden Daisy custom questions (decision 0068, issue #212).
-- Either member may ask the other their own question on a Daisy for the current
-- garden day instead of the shared daily question. The asker may revise or
-- withdraw it until the addressee answers; then, and after rollover, it is
-- permanent. Every Daisy entry is bound by the server to the question actually
-- addressed to its author. The daily bank assignment is unchanged.
-- Forward-only and additive: existing rows keep their meaning (no custom
-- question existed before this migration), so no achievement progress drops.
-- Legacy tables and functions are untouched.

create table public.v2_daisy_custom_questions (
  id bigint generated always as identity primary key,
  flower_id uuid not null references public.v2_flowers(id),
  garden_day date not null check (isfinite(garden_day)),
  asker_id smallint not null check (asker_id in (1,2)),
  addressee_id smallint not null check (addressee_id in (1,2) and addressee_id <> asker_id),
  -- null: withdrawn by the asker (the addressee sees the daily question again).
  prompt text check (prompt is null or (char_length(prompt) between 1 and 300
    and prompt = regexp_replace(prompt, '^[[:space:]]+|[[:space:]]+$', '', 'g'))),
  -- Bumped on every change, so a stale answer can be told apart from a fresh one.
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null check (isfinite(created_at)),
  updated_at timestamptz not null check (isfinite(updated_at) and updated_at >= created_at),
  unique (flower_id, garden_day, asker_id),
  unique (id, flower_id, garden_day, addressee_id)
);
create index v2_daisy_custom_questions_day on public.v2_daisy_custom_questions(garden_day, flower_id);

alter table public.v2_daisy_custom_questions enable row level security;
revoke all on public.v2_daisy_custom_questions from public, anon, authenticated, service_role, supabase_auth_admin;
revoke all on sequence public.v2_daisy_custom_questions_id_seq from public, anon, authenticated, service_role, supabase_auth_admin;
grant select on public.v2_daisy_custom_questions to authenticated;
create policy members_read_v2_daisy_custom_questions on public.v2_daisy_custom_questions for select to authenticated
  using ((select public.is_garden_member()));

-- The binding: a Daisy entry answering a custom question references it, and the
-- composite key proves it is the same flower, the same day, and addressed to
-- the entry's author. Existing entries keep null (they answered the daily one).
alter table public.v2_flower_entries add column daisy_custom_question_id bigint;
alter table public.v2_flower_entries add constraint v2_entries_daisy_custom_question_binding
  foreign key (daisy_custom_question_id, flower_id, garden_day, author_id)
  references public.v2_daisy_custom_questions(id, flower_id, garden_day, addressee_id);
alter table public.v2_flower_entries add constraint v2_entries_daisy_custom_question_daisy
  check (daisy_custom_question_id is null or daisy_assignment_day is not null);

-- Defense in depth beneath the RPCs: identity columns never move, and a
-- question is locked once its addressee has a Daisy entry that day.
create function private.v2_guard_daisy_custom_question()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE' and (new.id, new.flower_id, new.garden_day, new.asker_id, new.addressee_id, new.created_at)
      is distinct from (old.id, old.flower_id, old.garden_day, old.asker_id, old.addressee_id, old.created_at) then
    raise exception using errcode = '22023', message = 'A question keeps its flower, day and members';
  end if;
  if exists (select 1 from public.v2_flower_entries where flower_id = new.flower_id
      and garden_day = new.garden_day and author_id = new.addressee_id) then
    raise exception using errcode = '22023', message = 'The question is locked';
  end if;
  return new;
end $$;
create trigger v2_daisy_custom_question_guard before insert or update on public.v2_daisy_custom_questions
  for each row execute function private.v2_guard_daisy_custom_question();

-- The question an entry answered: its custom question (with the asker), else
-- the day's bank question. Null for every other flower.
create function private.v2_daisy_entry_question(p_custom_question_id bigint, p_assignment_day date)
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select case
    when p_custom_question_id is not null then
      (select jsonb_build_object('kind', 'custom', 'prompt', q.prompt, 'asked_by', q.asker_id)
        from public.v2_daisy_custom_questions q where q.id = p_custom_question_id)
    when p_assignment_day is not null then
      (select jsonb_build_object('kind', 'daily', 'prompt', a.prompt, 'category', a.category, 'question_id', a.question_id)
        from public.v2_daisy_assignments a where a.garden_day = p_assignment_day)
  end;
$$;

-- Live custom questions on a Daisy for one garden day. question_key is what an
-- answer must carry; locked means the addressee has answered.
create function private.v2_daisy_custom_questions_at(p_flower_id uuid, p_day date)
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'asker_id', q.asker_id, 'addressee_id', q.addressee_id,
      'prompt', q.prompt, 'revision', q.revision, 'question_key', 'custom-' || q.id || '-r' || q.revision,
      'created_at', q.created_at, 'updated_at', q.updated_at,
      'locked', exists (select 1 from public.v2_flower_entries e where e.flower_id = q.flower_id
        and e.garden_day = q.garden_day and e.author_id = q.addressee_id)) order by q.asker_id), '[]'::jsonb)
  from public.v2_daisy_custom_questions q
  where q.flower_id = p_flower_id and q.garden_day = p_day and q.prompt is not null;
$$;

-- Binds a new Daisy answer to the question actually addressed to its author.
-- The client sends the key of the question it displayed; a key for a changed or
-- withdrawn question, or the daily question while a custom one is live, is
-- stale. A key naming any question not addressed to the author here is forged.
-- Returns the bound custom question ID, or null for the daily question.
create function private.v2_bind_daisy_answer(p_flower_id uuid, p_author smallint, p_day date, p_key text)
returns bigint language plpgsql security invoker set search_path = pg_catalog as $$
declare v_live public.v2_daisy_custom_questions; v_id bigint; v_revision bigint; v_match text[];
begin
  select * into v_live from public.v2_daisy_custom_questions
    where flower_id = p_flower_id and garden_day = p_day and addressee_id = p_author and prompt is not null;
  v_match := regexp_match(p_key, '^custom-([1-9][0-9]{0,17})-r([1-9][0-9]{0,8})$');
  if v_match is null then
    -- The validator already proved this is the day's assigned bank question.
    if v_live.id is not null then
      raise exception using errcode = '22023', message = 'Your question changed; refresh and answer again';
    end if;
    return null;
  end if;
  v_id := v_match[1]::bigint;
  v_revision := v_match[2]::bigint;
  if not exists (select 1 from public.v2_daisy_custom_questions where id = v_id
      and flower_id = p_flower_id and garden_day = p_day and addressee_id = p_author) then
    raise exception using errcode = '22023', message = 'Answer the question asked of you';
  end if;
  if v_live.id is distinct from v_id or v_live.revision <> v_revision then
    raise exception using errcode = '22023', message = 'Your question changed; refresh and answer again';
  end if;
  return v_id;
end $$;

-- A Daisy on which the caller may ask today: it exists and has not bloomed.
-- Caller holds the v2 lock (v2_begin_garden_operation).
create function private.v2_require_open_daisy(p_flower_id uuid)
returns public.v2_flowers language plpgsql security invoker set search_path = pg_catalog as $$
declare v_flower public.v2_flowers;
begin
  select * into v_flower from public.v2_flowers where id = p_flower_id and garden_id = 1 and type_key = 'daisy';
  if not found then raise exception using errcode = '22023', message = 'Unknown Daisy'; end if;
  if v_flower.first_bloom_at is not null then
    raise exception using errcode = '22023', message = 'This flower has already bloomed';
  end if;
  return v_flower;
end $$;

-- Ask or revise your question for your partner on a Daisy, today only, while
-- they have no Daisy entry there today. Payload: exactly {"prompt": text}.
create function public.v2_ask_daisy_question(p_flower_id uuid, p_question jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_now timestamptz; v_actor smallint; v_addressee smallint; v_day date;
  v_flower public.v2_flowers; v_prompt text; v_keys text[];
begin
  v_now := private.v2_begin_garden_operation();
  v_actor := private.require_member();
  v_addressee := 3 - v_actor;
  select garden_day into v_day from private.garden_clock_at(v_now);
  v_flower := private.v2_require_open_daisy(p_flower_id);
  if p_question is null or jsonb_typeof(p_question) <> 'object' or octet_length(p_question::text) > 20000 then
    raise exception using errcode = '22023', message = 'Invalid question fields';
  end if;
  select coalesce(array_agg(k order by k), array[]::text[]) into v_keys from jsonb_object_keys(p_question) k;
  if v_keys <> array['prompt'] or jsonb_typeof(p_question -> 'prompt') <> 'string' then
    raise exception using errcode = '22023', message = 'Invalid question fields';
  end if;
  v_prompt := regexp_replace(p_question ->> 'prompt', '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if char_length(v_prompt) not between 1 and 300 then
    raise exception using errcode = '22023', message = 'Ask a question of 1 to 300 characters';
  end if;
  if not exists (select 1 from private.garden_members where member_id = v_addressee and revoked_at is null) then
    raise exception using errcode = '42501', message = 'Your partner is not a garden member';
  end if;
  if exists (select 1 from public.v2_flower_entries where flower_id = v_flower.id and garden_day = v_day and author_id = v_addressee) then
    raise exception using errcode = '22023', message = 'The question is locked';
  end if;
  insert into public.v2_daisy_custom_questions as q (flower_id, garden_day, asker_id, addressee_id, prompt, created_at, updated_at)
    values (v_flower.id, v_day, v_actor, v_addressee, v_prompt, v_now, v_now)
    on conflict (flower_id, garden_day, asker_id) do update
      set prompt = excluded.prompt, revision = q.revision + 1, updated_at = excluded.updated_at
      where q.prompt is distinct from excluded.prompt;
  return jsonb_build_object('flower_id', v_flower.id, 'garden_day', v_day,
    'questions', private.v2_daisy_custom_questions_at(v_flower.id, v_day));
end $$;

-- Withdraw your question for today while it is unanswered. Idempotent when
-- there is nothing to withdraw. The row is kept (prompt cleared, revision
-- bumped) so Realtime publishes the change; deletes are not published.
create function public.v2_remove_daisy_question(p_flower_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz; v_actor smallint; v_day date; v_flower public.v2_flowers;
begin
  v_now := private.v2_begin_garden_operation();
  v_actor := private.require_member();
  select garden_day into v_day from private.garden_clock_at(v_now);
  v_flower := private.v2_require_open_daisy(p_flower_id);
  if exists (select 1 from public.v2_daisy_custom_questions where flower_id = v_flower.id and garden_day = v_day
      and asker_id = v_actor and prompt is not null) then
    if exists (select 1 from public.v2_flower_entries where flower_id = v_flower.id and garden_day = v_day and author_id = 3 - v_actor) then
      raise exception using errcode = '22023', message = 'The question is locked';
    end if;
    update public.v2_daisy_custom_questions set prompt = null, revision = revision + 1, updated_at = v_now
      where flower_id = v_flower.id and garden_day = v_day and asker_id = v_actor;
  end if;
  return jsonb_build_object('flower_id', v_flower.id, 'garden_day', v_day,
    'questions', private.v2_daisy_custom_questions_at(v_flower.id, v_day));
end $$;

-- The questions earlier Daisy answers responded to, for history pages.
create function public.v2_daisy_entry_questions(p_entry_ids bigint[])
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform private.require_member();
  if p_entry_ids is null or cardinality(p_entry_ids) not between 1 and 100
    or exists (select 1 from unnest(p_entry_ids) id where id is null or id < 1) then
    raise exception using errcode = '22023', message = 'Invalid entry list';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('entry_id', e.id,
      'question', private.v2_daisy_entry_question(e.daisy_custom_question_id, e.daisy_assignment_day)) order by e.id)
    from public.v2_flower_entries e join public.v2_flowers f on f.id = e.flower_id
    where e.id = any (p_entry_ids) and f.garden_id = 1 and f.type_key = 'daisy'), '[]'::jsonb);
end $$;

-- Daily questions keep the #173 rule; a Daisy key may also name a custom
-- question, whose binding v2_bind_daisy_answer checks with flower and author.
-- Otherwise identical to the core validator (renamed by the media migration).
create or replace function private.v2_validate_nonmedia_entry_payload(p_type text, p_payload jsonb, p_day date)
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
    -- Accept links, never fetch them (same rule as the legacy garden).
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
  if p_type = 'daisy' and (v_result ->> 'question_id') !~ '^custom-[1-9][0-9]{0,17}-r[1-9][0-9]{0,8}$'
      and not exists (select 1 from public.v2_daisy_assignments where garden_day = p_day and question_id = v_result ->> 'question_id') then
    raise exception using errcode = '22023', message = 'Answer the assigned daily question';
  end if;
  return v_result;
end;
$$;

-- Snapshot: adds today's live custom questions and, per entry, the question it
-- answered. Otherwise identical to #173.
create or replace function private.v2_entry_state_at(p_flower_id uuid, p_actor smallint, p_now timestamptz)
returns jsonb
language plpgsql security invoker set search_path = pg_catalog
as $$
declare
  v_clock record;
  v_flower public.v2_flowers; v_question public.v2_daisy_assignments; v_entries jsonb;
begin
  select * into v_clock from private.garden_clock_at(p_now);
  select * into v_flower from public.v2_flowers where id = p_flower_id and garden_id = 1;
  if not found then raise exception using errcode = '22023', message = 'Unknown flower'; end if;
  if v_flower.type_key = 'daisy' and v_flower.first_bloom_at is null then
    v_question := private.v2_assign_daisy_question(v_clock.garden_day, p_now);
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object(
    'edit_deadline', least(e.original_posted_at + interval '30 minutes', v_clock.next_rollover_at),
    'edit_deadline_inclusive', e.original_posted_at + interval '30 minutes' < v_clock.next_rollover_at,
    'can_edit', e.author_id = p_actor and p_now >= e.original_posted_at and p_now <= e.original_posted_at + interval '30 minutes',
    'question', private.v2_daisy_entry_question(e.daisy_custom_question_id, e.daisy_assignment_day)
    ) order by e.author_id), '[]'::jsonb) into v_entries
    from public.v2_flower_entries e where e.flower_id = p_flower_id and e.garden_day = v_clock.garden_day;
  return jsonb_build_object('server_now', p_now, 'garden_day', v_clock.garden_day,
    'day_starts_at', v_clock.day_starts_at, 'next_rollover_at', v_clock.next_rollover_at,
    'moonflower_open', v_clock.moonflower_open, 'flower', to_jsonb(v_flower),
    'daisy_question', case when v_question.garden_day is not null then to_jsonb(v_question) else null end,
    'daisy_custom_questions', case when v_flower.type_key = 'daisy'
      then private.v2_daisy_custom_questions_at(p_flower_id, v_clock.garden_day) else '[]'::jsonb end,
    'member1_submitted', exists (select 1 from public.v2_flower_entries where flower_id = p_flower_id and garden_day = v_clock.garden_day and author_id = 1),
    'member2_submitted', exists (select 1 from public.v2_flower_entries where flower_id = p_flower_id and garden_day = v_clock.garden_day and author_id = 2),
    'hydrangea_picks', jsonb_build_array(
      (select e.payload from public.v2_flower_entries e where e.flower_id = p_flower_id and v_flower.type_key = 'hydrangea' and e.author_id = 1 order by e.garden_day desc limit 1),
      (select e.payload from public.v2_flower_entries e where e.flower_id = p_flower_id and v_flower.type_key = 'hydrangea' and e.author_id = 2 order by e.garden_day desc limit 1)),
    'entries', v_entries);
end;
$$;

-- Submission: identical to #173 except that a Daisy answer is bound to the
-- question addressed to its author (or rejected as stale or forged).
create or replace function public.v2_submit_flower_entry(p_flower_id uuid, p_payload jsonb)
returns public.v2_flower_entries
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor smallint; v_flower public.v2_flowers;
  v_now timestamptz; v_clock record; v_payload jsonb; v_entry public.v2_flower_entries; v_custom bigint;
begin
  v_now := private.v2_begin_garden_operation();
  v_actor := private.require_member();
  select * into v_clock from private.garden_clock_at(v_now);
  select * into v_flower from public.v2_flowers where id = p_flower_id and garden_id = 1;
  if not found then raise exception using errcode = '22023', message = 'Unknown flower'; end if;
  if v_flower.first_bloom_at is not null and v_flower.type_key not in ('cactus','hydrangea') then
    raise exception using errcode = '22023', message = 'This flower has already bloomed';
  end if;
  if v_flower.type_key = 'moonflower' and not v_clock.moonflower_open then
    raise exception using errcode = '22023', message = 'Moonflower opens from 10 p.m. to 4 a.m.';
  end if;
  if exists (select 1 from public.v2_flower_entries where flower_id = p_flower_id and garden_day = v_clock.garden_day and author_id = v_actor) then
    raise exception using errcode = '22023', message = 'Already submitted; edit the original entry';
  end if;
  if v_flower.type_key = 'daisy' then perform private.v2_assign_daisy_question(v_clock.garden_day, v_now); end if;
  v_payload := private.v2_validate_entry_payload(v_flower.type_key, p_payload, v_clock.garden_day);
  if v_flower.type_key = 'daisy' then
    v_custom := private.v2_bind_daisy_answer(p_flower_id, v_actor, v_clock.garden_day, v_payload ->> 'question_id');
  end if;
  insert into public.v2_flower_entries(flower_id, author_id, garden_day, original_posted_at, updated_at, payload,
      daisy_assignment_day, daisy_custom_question_id)
    values (p_flower_id, v_actor, v_clock.garden_day, v_now, v_now, v_payload,
      case when v_flower.type_key = 'daisy' then v_clock.garden_day end, v_custom) returning * into v_entry;
  perform private.v2_evaluate_achievements(v_now);
  return v_entry;
end;
$$;

-- Edit: identical to #173 except that a Daisy edit keeps the question its
-- original answered (the same question key); the binding never changes.
create or replace function public.v2_edit_flower_entry(p_entry_id bigint, p_payload jsonb)
returns public.v2_flower_entries
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor smallint; v_now timestamptz; v_day date;
  v_entry public.v2_flower_entries; v_type text; v_payload jsonb;
begin
  v_now := private.v2_begin_garden_operation();
  v_actor := private.require_member();
  select garden_day into v_day from private.garden_clock_at(v_now);
  select * into v_entry from public.v2_flower_entries where id = p_entry_id;
  if not found or v_entry.author_id <> v_actor then
    raise exception using errcode = '42501', message = 'Only the author can edit this entry';
  end if;
  if v_entry.garden_day <> v_day or v_now < v_entry.original_posted_at or v_now > v_entry.original_posted_at + interval '30 minutes' then
    raise exception using errcode = '22023', message = 'The edit window has ended';
  end if;
  select type_key into v_type from public.v2_flowers where id = v_entry.flower_id;
  v_payload := private.v2_validate_entry_payload(v_type, p_payload, v_entry.garden_day);
  if v_type = 'daisy' and (v_payload ->> 'question_id') is distinct from (v_entry.payload ->> 'question_id') then
    raise exception using errcode = '22023', message = 'An edit keeps its original question';
  end if;
  update public.v2_flower_entries set payload = v_payload, updated_at = v_now where id = p_entry_id returning * into v_entry;
  return v_entry;
end;
$$;

-- Settlement: identical to #177 except the Daisy fact's question. A pair where
-- either answer used a custom question records a key unique to that flower and
-- day ('custom:<flower>:<day>'); a pair on the daily question keeps its bank ID.
-- Custom answers are ordinary Daisy care, so pairing and growth are unchanged.
create or replace function private.v2_settle_garden_at(p_now timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare
  v_today date; v_day date; v_starts timestamptz; v_ends timestamptz; v_noon timestamptz;
  v_flower record; v_one public.v2_flower_entries; v_two public.v2_flower_entries;
  v_paired boolean; v_after smallint; v_bloom boolean; v_active boolean;
  v_streak integer; v_eligible integer; v_noon_complete boolean;
begin
  perform private.require_member();
  perform 1 from public.v2_garden where id = 1 for update;
  perform private.require_member();
  if p_now is null then raise exception using errcode = '22023', message = 'Missing operation time'; end if;
  select garden_day into v_today from private.garden_clock_at(p_now);
  select last_settled_day + 1 into v_day from public.v2_garden where id = 1;
  if v_day is null then raise exception using errcode = '22023', message = 'Garden is not initialized'; end if;
  while v_day < v_today loop
    v_starts := timezone('America/Los_Angeles', v_day + time '04:00');
    v_ends := timezone('America/Los_Angeles', (v_day + 1) + time '04:00');
    v_noon := timezone('America/Los_Angeles', v_day + time '12:00');
    perform private.v2_capture_noon_snapshot(v_day);
    for v_flower in select f.*, c.growth_target from public.v2_flowers f
      join public.flower_catalog c using (type_key)
      where f.planted_day <= v_day and f.type_key <> 'peony'
        and (f.first_bloom_at is null or f.type_key = 'cactus') order by f.spot loop
      select * into v_one from public.v2_flower_entries where flower_id = v_flower.id and garden_day = v_day and author_id = 1;
      select * into v_two from public.v2_flower_entries where flower_id = v_flower.id and garden_day = v_day and author_id = 2;
      v_paired := v_one.id is not null and v_two.id is not null;
      v_after := v_flower.growth_units;
      if v_flower.first_bloom_at is null and v_paired then
        v_after := least(v_flower.growth_target, v_after + 1);
      end if;
      v_bloom := v_flower.first_bloom_at is null and v_after = v_flower.growth_target;
      if v_after <> v_flower.growth_units then
        update public.v2_flowers set growth_units = v_after where id = v_flower.id;
      end if;
      if v_bloom then perform private.v2_record_first_bloom_at(v_flower.id, v_day, p_now); end if;
      insert into public.v2_flower_day_facts(flower_id, garden_day, type_key, growth_before, growth_after, paired,
        qualifying_activity, first_bloom, member1_posted_at, member2_posted_at, member1_mood, member2_mood, daisy_question_id)
      values (v_flower.id, v_day, v_flower.type_key, v_flower.growth_units, v_after, v_paired, v_paired, v_bloom,
        v_one.original_posted_at, v_two.original_posted_at,
        case when v_flower.type_key = 'hydrangea' then v_one.payload ->> 'mood' end,
        case when v_flower.type_key = 'hydrangea' then v_two.payload ->> 'mood' end,
        case when v_flower.type_key = 'daisy' and v_paired then
          case when v_one.daisy_custom_question_id is not null or v_two.daisy_custom_question_id is not null
            then 'custom:' || v_flower.id::text || ':' || to_char(v_day, 'YYYY-MM-DD')
            else (select question_id from public.v2_daisy_assignments where garden_day = v_day) end end);
    end loop;
    update public.v2_before_noon_snapshots s set
      member1_posted_at = e1.original_posted_at, member2_posted_at = e2.original_posted_at,
      completed = coalesce(e1.original_posted_at < v_noon and e2.original_posted_at < v_noon, false)
    from public.v2_flowers f
      left join public.v2_flower_entries e1 on e1.flower_id = f.id and e1.garden_day = v_day and e1.author_id = 1
      left join public.v2_flower_entries e2 on e2.flower_id = f.id and e2.garden_day = v_day and e2.author_id = 2
    where s.garden_day = v_day and s.flower_id = f.id;
    select count(*)::integer, coalesce(bool_and(completed), false) into v_eligible, v_noon_complete
      from public.v2_before_noon_snapshots where garden_day = v_day;
    v_active := exists (select 1 from public.v2_flower_day_facts where garden_day = v_day and qualifying_activity)
      or exists (select 1 from public.v2_peony_activity where garden_day = v_day);
    update public.v2_garden set current_streak = case when v_active then current_streak + 1 else 0 end,
      longest_streak = greatest(longest_streak, case when v_active then current_streak + 1 else 0 end),
      qualifying_days = qualifying_days + case when v_active then 1 else 0 end, last_settled_day = v_day
      where id = 1 returning current_streak into v_streak;
    insert into public.v2_garden_days values (v_day, v_starts, v_ends, p_now, v_active, v_streak, v_eligible, v_noon_complete);
    v_day := v_day + 1;
  end loop;
  perform private.v2_capture_noon_snapshot(v_today);
end $$;

-- Achievements: identical to #177 except the distinct Daisy questions. Today's
-- (not yet settled) pairs use the same rule as settlement: a custom pair counts
-- once under its flower/day key, a daily pair under its bank question ID.
create or replace function private.v2_evaluate_achievements(p_now timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
declare v_day date;
begin
  perform private.require_member();
  perform 1 from public.v2_garden where id = 1 for update;
  perform private.require_member();
  if p_now is null or not isfinite(p_now) then raise exception 'Missing achievement time'; end if;
  select garden_day into v_day from private.garden_clock_at(p_now);
  with flower_counts as (
    select count(*) seeds,
      count(*) filter (where first_bloom_at is not null) blooms,
      count(distinct type_key) planted_types,
      count(distinct type_key) filter (where first_bloom_at is not null) bloomed_types,
      count(*) filter (where type_key = 'rose' and first_bloom_at is not null) roses,
      count(*) filter (where type_key = 'marigold' and first_bloom_at is not null) marigolds,
      count(*) filter (where type_key = 'tulip' and first_bloom_at is not null) tulips,
      count(*) filter (where type_key = 'forget-me-not' and first_bloom_at is not null) forget_me_nots,
      count(*) filter (where type_key = 'dandelion') wishes,
      count(*) filter (where type_key = 'moonflower' and first_bloom_at is not null) moonflowers,
      count(*) filter (where type_key = 'snapdragon' and first_bloom_at is not null) snapdragons,
      count(*) filter (where type_key = 'bluebell' and first_bloom_at is not null) bluebells,
      count(*) filter (where type_key = 'peony' and first_bloom_at is not null) peonies,
      count(*) filter (where type_key = 'dandelion' and fulfilled_at is not null) fulfilled
    from public.v2_flowers
  ), pairs as (
    select a.flower_id, a.garden_day, a.original_posted_at one_at, b.original_posted_at two_at,
      a.daisy_custom_question_id one_custom, b.daisy_custom_question_id two_custom
    from public.v2_flower_entries a join public.v2_flower_entries b
      on a.flower_id = b.flower_id and a.garden_day = b.garden_day and b.author_id = 2
    join public.v2_flowers f on f.id = a.flower_id
    where a.author_id = 1 and (f.type_key <> 'hydrangea' or f.first_bloom_day is null or a.garden_day <= f.first_bloom_day)
  ), questions as (
    select daisy_question_id question_id from public.v2_flower_day_facts where type_key = 'daisy' and paired
    union
    select case when p.one_custom is not null or p.two_custom is not null
        then 'custom:' || p.flower_id::text || ':' || to_char(p.garden_day, 'YYYY-MM-DD')
        else a.question_id end
    from pairs p join public.v2_flowers f on f.id = p.flower_id and f.type_key = 'daisy'
      left join public.v2_daisy_assignments a on a.garden_day = p.garden_day
  ), evidence as (
    select f.*,
      (select longest_streak from public.v2_garden where id = 1) streak,
      (select count(distinct question_id) from questions) questions,
      (select count(distinct d.garden_day) from public.v2_flower_day_facts d
        left join public.v2_flower_entries x on x.flower_id = d.flower_id and x.garden_day = d.garden_day and x.author_id = 1
        left join public.v2_flower_entries y on y.flower_id = d.flower_id and y.garden_day = d.garden_day and y.author_id = 2
        where d.type_key = 'hydrangea' and d.paired and d.member1_mood <> 'other'
          and ((d.member1_mood = d.member2_mood and (x.payload ->> 'mood2') is not distinct from (y.payload ->> 'mood2'))
            or (d.member1_mood = (y.payload ->> 'mood2') and (x.payload ->> 'mood2') = d.member2_mood))) moods,
      exists (select 1 from public.v2_garden_days where before_noon_complete and before_noon_eligible_count > 0) noon,
      (exists (select 1 from pairs where abs(extract(epoch from (two_at - one_at))) <= 600)
        or exists (select 1 from public.v2_flower_day_facts where paired and abs(extract(epoch from (member2_posted_at - member1_posted_at))) <= 600)
        or exists (select 1 from public.v2_peony_activity p where abs(extract(epoch from (p.member2_posted_at - p.member1_posted_at))) <= 600
          and (select garden_day from private.garden_clock_at(p.member1_posted_at)) = (select garden_day from private.garden_clock_at(p.member2_posted_at)))) timing
    from flower_counts f
  ), metrics as (
    select v.* from evidence e cross join lateral (values
      ('first-seed', e.seeds), ('first-bloom', e.blooms), ('all-planted', e.planted_types), ('all-bloomed', e.bloomed_types),
      ('streak-3', e.streak), ('streak-7', e.streak), ('streak-14', e.streak), ('streak-21', e.streak),
      ('roses-5', e.roses), ('marigolds-10', e.marigolds), ('tulips-3', e.tulips),
      ('daisy-20', e.questions), ('forget-me-nots-3', e.forget_me_nots), ('wishes-5', e.wishes),
      ('ten-minutes', e.timing::integer), ('before-noon', e.noon::integer), ('moonflower', e.moonflowers),
      ('snapdragon', e.snapdragons), ('bluebell', e.bluebells), ('mood-match-3', e.moods), ('peony', e.peonies),
      ('first-wish-blown', e.fulfilled), ('coexisting-5', e.blooms), ('blooms-10', e.blooms), ('blooms-20', e.blooms)
    ) v(achievement_id, amount)
  )
  insert into public.v2_achievement_progress as p
  select c.achievement_id, least(c.target, coalesce(m.amount, 0))::integer
  from public.v2_achievement_catalog c join metrics m using (achievement_id)
  on conflict (achievement_id) do update set progress = excluded.progress
  where p.progress is distinct from excluded.progress;
  insert into public.v2_achievement_awards(achievement_id, earned_at, earned_day)
  select c.achievement_id, p_now, v_day from public.v2_achievement_catalog c
    join public.v2_achievement_progress p using (achievement_id)
  where p.progress >= c.target on conflict (achievement_id) do nothing;
end $$;

-- Memories: identical to #177 except that a Daisy entry shows the question it
-- answered (custom or daily) and, for a custom question, who asked it.
create or replace function public.v2_memories_page(
  p_mode text default 'latest', p_cursor jsonb default null,
  p_keys text[] default null, p_type text default null, p_spot integer default null,
  p_from date default null, p_to date default null, p_author integer default null
) returns jsonb language plpgsql stable security invoker set search_path = pg_catalog as $$
declare v_at timestamptz; v_kind text; v_id text; v_result jsonb;
begin
  if not public.is_garden_member() then
    raise exception using errcode = '42501', message = 'Garden membership required';
  end if;
  if p_mode is null or p_mode not in ('latest','older','newer','updates')
    or (p_type is not null and not exists (select 1 from public.flower_catalog where type_key = p_type))
    or p_spot <= 0 or p_from > p_to or not isfinite(p_from) or not isfinite(p_to)
    or (p_author is not null and p_author not in (1,2)) then
    raise exception using errcode = '22023', message = 'Invalid memories query';
  end if;
  if p_mode in ('older','newer') then
    if p_cursor is null or jsonb_typeof(p_cursor) <> 'object'
      or coalesce(p_cursor ->> 'at', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      or coalesce(p_cursor ->> 'kind', '') not in ('entry','wish','peony')
      or (p_cursor ->> 'kind' = 'entry' and coalesce(p_cursor ->> 'id', '') !~ '^[1-9][0-9]{0,18}$')
      or (p_cursor ->> 'kind' <> 'entry' and coalesce(p_cursor ->> 'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception using errcode = '22023', message = 'Invalid memories cursor';
    end if;
    v_at := (p_cursor ->> 'at')::timestamptz;
    v_kind := p_cursor ->> 'kind'; v_id := p_cursor ->> 'id';
  end if;
  if p_mode = 'updates' and (p_keys is null or cardinality(p_keys) not between 1 and 20
    or exists (select 1 from unnest(p_keys) k where k is null or k !~ '^(entry:[1-9][0-9]{0,18}|(wish|peony):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')) then
    raise exception using errcode = '22023', message = 'Invalid memories update batch';
  end if;
  with sources as (
    select e.original_posted_at as at, 'entry'::text as kind, e.id::text as source_id,
      e.flower_id, e.garden_day, e.author_id::smallint as author_id
    from public.v2_flower_entries e
    union all
    select f.planted_at, case f.type_key when 'dandelion' then 'wish' else 'peony' end,
      f.id::text, f.id, f.planted_day, f.planted_by::smallint
    from public.v2_flowers f where f.type_key in ('dandelion','peony')
  ), candidates as (
    select s.* from sources s join public.v2_flowers f on f.id = s.flower_id
    where (p_type is null or f.type_key = p_type) and (p_spot is null or f.spot = p_spot)
      and (p_from is null or s.garden_day >= p_from) and (p_to is null or s.garden_day <= p_to)
      and (p_author is null or s.author_id = p_author
        or (s.kind = 'peony' and exists (select 1 from public.v2_peony_contributions c where c.flower_id = s.flower_id and c.author_id = p_author)))
      and (p_mode <> 'older' or (s.at, s.kind collate "C", s.source_id collate "C") < (v_at, v_kind collate "C", v_id collate "C"))
      and (p_mode <> 'newer' or (s.at, s.kind collate "C", s.source_id collate "C") > (v_at, v_kind collate "C", v_id collate "C"))
      and (p_mode <> 'updates' or (s.kind || ':' || s.source_id) = any (p_keys))
    order by
      case when p_mode = 'newer' then s.at end asc,
      case when p_mode = 'newer' then s.kind end collate "C" asc,
      case when p_mode = 'newer' then s.source_id end collate "C" asc,
      s.at desc, s.kind collate "C" desc, s.source_id collate "C" desc
    limit 21
  ), numbered as (
    select *, row_number() over (order by
      case when p_mode = 'newer' then at end asc,
      case when p_mode = 'newer' then kind end collate "C" asc,
      case when p_mode = 'newer' then source_id end collate "C" asc,
      at desc, kind collate "C" desc, source_id collate "C" desc) as ordinal
    from candidates
  ), enriched as (
    select n.ordinal, jsonb_build_object(
      'key', n.kind || ':' || n.source_id, 'kind', n.kind, 'source_id', n.source_id,
      'at', n.at, 'garden_day', n.garden_day, 'read_at', statement_timestamp(),
      'flower', jsonb_build_object('id', f.id, 'type_key', f.type_key, 'spot', f.spot,
        'planted_at', f.planted_at, 'planted_day', f.planted_day, 'planted_by', f.planted_by,
        'first_bloom_at', f.first_bloom_at, 'first_bloom_day', f.first_bloom_day,
        'shared_wish', f.shared_wish, 'fulfilled_at', f.fulfilled_at, 'fulfilled_by', f.fulfilled_by),
      'entry', case when n.kind = 'entry' then jsonb_build_object(
        'author_id', e.author_id, 'updated_at', e.updated_at,
        'payload', case f.type_key
          when 'cactus' then '{}'::jsonb
          when 'tulip' then jsonb_build_object('title', e.payload ->> 'title', 'artist', e.payload ->> 'artist', 'url', e.payload ->> 'url')
          when 'hydrangea' then jsonb_strip_nulls(jsonb_build_object('mood', e.payload ->> 'mood', 'mood2', e.payload ->> 'mood2', 'note', e.payload ->> 'note'))
          when 'sunflower' then jsonb_build_object('media_id', e.payload ->> 'media_id')
          when 'bluebell' then jsonb_build_object('media_id', e.payload ->> 'media_id')
          else jsonb_build_object('text', e.payload ->> 'text') end,
        'question', case when f.type_key = 'daisy' then coalesce(q.prompt, d.prompt) end,
        'question_asked_by', case when f.type_key = 'daisy' then q.asker_id end) end,
      'peony', case when n.kind = 'peony' then jsonb_build_object(
        'contributions', (select coalesce(jsonb_agg(jsonb_build_object(
          'milestone', c.milestone, 'author_id', c.author_id, 'original_posted_at', c.original_posted_at,
          'garden_day', c.garden_day, 'text', case when c.milestone <> 3 then c.payload ->> 'text' end)
          order by c.milestone, c.author_id), '[]'::jsonb) from public.v2_peony_contributions c where c.flower_id = f.id),
        'plan', (select jsonb_build_object('version', p.version::text, 'activity', p.activity,
          'starts_at', p.starts_at, 'updated_at', p.updated_at, 'updated_by', p.updated_by,
          'acceptances', (select coalesce(jsonb_agg(jsonb_build_object('author_id', a.author_id,
            'original_posted_at', a.original_posted_at, 'garden_day', a.garden_day) order by a.author_id), '[]'::jsonb)
            from public.v2_peony_acceptances a where a.flower_id = p.flower_id and a.plan_version = p.version))
          from public.v2_peony_plans p where p.flower_id = f.id),
        'completed', (select coalesce(jsonb_agg(jsonb_build_object('milestone', a.milestone,
          'garden_day', a.garden_day, 'completed_at', a.completed_at,
          'member1_posted_at', a.member1_posted_at, 'member2_posted_at', a.member2_posted_at)
          order by a.milestone), '[]'::jsonb) from public.v2_peony_activity a where a.flower_id = f.id)) end
    ) as item
    from numbered n join public.v2_flowers f on f.id = n.flower_id
    left join public.v2_flower_entries e on e.id = case when n.kind = 'entry' then n.source_id::bigint end
    left join public.v2_daisy_assignments d on d.garden_day = e.daisy_assignment_day
    left join public.v2_daisy_custom_questions q on q.id = e.daisy_custom_question_id
    where n.ordinal <= 20
  ) select jsonb_build_object('items', coalesce((select jsonb_agg(item order by ordinal) from enriched), '[]'::jsonb),
    'more', (select count(*) > 20 from candidates)) into v_result;
  return v_result;
end $$;

-- Explicit function grant surface (decision 0028 pattern). The replaced
-- functions keep their existing grants; they are restated here so this
-- migration alone documents the surface it touches.
revoke all on function
  private.v2_guard_daisy_custom_question(),
  private.v2_daisy_entry_question(bigint,date),
  private.v2_daisy_custom_questions_at(uuid,date),
  private.v2_bind_daisy_answer(uuid,smallint,date,text),
  private.v2_require_open_daisy(uuid),
  public.v2_ask_daisy_question(uuid,jsonb),
  public.v2_remove_daisy_question(uuid),
  public.v2_daisy_entry_questions(bigint[]),
  private.v2_validate_nonmedia_entry_payload(text,jsonb,date),
  private.v2_entry_state_at(uuid,smallint,timestamptz),
  private.v2_settle_garden_at(timestamptz),
  private.v2_evaluate_achievements(timestamptz),
  public.v2_submit_flower_entry(uuid,jsonb),
  public.v2_edit_flower_entry(bigint,jsonb),
  public.v2_memories_page(text,jsonb,text[],text,integer,date,date,integer)
from public, anon, authenticated, service_role, supabase_auth_admin;
grant execute on function
  public.v2_ask_daisy_question(uuid,jsonb),
  public.v2_remove_daisy_question(uuid),
  public.v2_daisy_entry_questions(bigint[]),
  public.v2_submit_flower_entry(uuid,jsonb),
  public.v2_edit_flower_entry(bigint,jsonb),
  public.v2_memories_page(text,jsonb,text[],text,integer,date,date,integer)
to authenticated;

-- The partner sees a question asked, revised or withdrawn without reloading.
-- Member RLS authorizes each change; messages only invalidate the client.
alter publication supabase_realtime add table public.v2_daisy_custom_questions;
