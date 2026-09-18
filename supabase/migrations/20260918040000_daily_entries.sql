-- Question rows are generated from the reviewed portable bank, never a second
-- editorial source. Historical assignments retain exact snapshots.
create table private.daisy_questions (
  question_id text primary key,
  category text not null check (category in ('light','deeper')),
  prompt text not null check (char_length(prompt) between 1 and 280),
  delivery_order smallint not null unique check (delivery_order between 1 and 100)
);
revoke all on private.daisy_questions from public, anon, authenticated, service_role, supabase_auth_admin;
-- BEGIN GENERATED DAISY BANK
insert into private.daisy_questions(question_id,category,prompt,delivery_order) values
 ('light-001','light','What small thing made you smile today?',1),
 ('deeper-001','deeper','What quality do you most appreciate in a friend?',2),
 ('light-002','light','Which snack would you pack for a tiny picnic?',3),
 ('deeper-002','deeper','What does a restful day look like for you right now?',4),
 ('light-003','light','What song would you choose for a cheerful morning?',5),
 ('deeper-003','deeper','When you feel overwhelmed, what kind of support is easiest to receive?',6),
 ('light-004','light','Which everyday object deserves a more exciting name?',7),
 ('deeper-004','deeper','What is a small hope you have for the coming month?',8),
 ('light-005','light','What scent makes a place feel welcoming to you?',9),
 ('deeper-005','deeper','What have you learned about yourself recently?',10),
 ('light-006','light','If you could borrow an animal''s ability for a day, which would you pick?',11),
 ('deeper-006','deeper','What moment from one of our conversations would you like to revisit?',12),
 ('light-007','light','What color have you been drawn to lately?',13),
 ('deeper-007','deeper','What value would you like to make more room for in everyday life?',14),
 ('light-008','light','Which fictional place would you visit for an afternoon?',15),
 ('deeper-008','deeper','How do you prefer someone to celebrate a small win with you?',16),
 ('light-009','light','What is your favorite way to spend ten free minutes?',17),
 ('deeper-009','deeper','What helps you feel heard during a conversation?',18),
 ('light-010','light','What food would you like to learn to make?',19),
 ('deeper-010','deeper','What is something you would like to try without needing to be good at it?',20),
 ('light-011','light','If today''s weather had a personality, what would it be like?',21),
 ('deeper-011','deeper','What everyday choice has felt especially like you lately?',22),
 ('light-012','light','What small discovery would you recommend to me?',23),
 ('deeper-012','deeper','What is a simple way we could make an ordinary day feel shared?',24),
 ('light-013','light','Which sound do you find surprisingly pleasant?',25),
 ('deeper-013','deeper','What does keeping a promise mean to you in small everyday situations?',26),
 ('light-014','light','What would you name a neighborhood cafe?',27),
 ('deeper-014','deeper','What helps you decide when to take a break?',28),
 ('light-015','light','Which game could you happily play again?',29),
 ('deeper-015','deeper','What kind of encouragement helps when you are learning something new?',30),
 ('light-016','light','What would you put in a pocket-sized museum of everyday life?',31),
 ('deeper-016','deeper','What would you like your future self to have more time for?',32),
 ('light-017','light','Which season has your favorite light?',33),
 ('deeper-017','deeper','What is a personal strength you are starting to appreciate?',34),
 ('light-018','light','What silly talent would you enjoy mastering?',35),
 ('deeper-018','deeper','What is a small thing you have enjoyed learning about me?',36),
 ('light-019','light','What detail do you usually notice first in a new place?',37),
 ('deeper-019','deeper','What does fairness look like to you when two people want different things?',38),
 ('light-020','light','Which breakfast would you order if every option were available?',39),
 ('deeper-020','deeper','What helps you return your attention to the present?',40),
 ('light-021','light','What would a friendly cloud say as it passed overhead?',41),
 ('deeper-021','deeper','How would you like someone to check in when you seem quieter than usual?',42),
 ('light-022','light','What kind of shop could you browse without buying anything?',43),
 ('deeper-022','deeper','What kind of tradition might you enjoy creating together?',44),
 ('light-023','light','Which word is especially fun to say?',45),
 ('deeper-023','deeper','What is an opinion you have become more open-minded about?',46),
 ('light-024','light','What is one photo you would like to take this week?',47),
 ('deeper-024','deeper','What detail from a moment we shared still makes you smile?',48),
 ('light-025','light','If you designed a holiday, what would people celebrate?',49),
 ('deeper-025','deeper','What is something worth doing slowly?',50),
 ('light-026','light','What is your favorite thing to do on a rainy afternoon?',51),
 ('deeper-026','deeper','What helps you feel at ease in a new group?',52),
 ('light-027','light','Which plant would you like to see up close?',53),
 ('deeper-027','deeper','How do you usually tell that you need company rather than time alone?',54),
 ('light-028','light','What would you call a playlist for a slow evening?',55),
 ('deeper-028','deeper','What is a small act of courage you would like to practice?',56),
 ('light-029','light','Which small convenience do you appreciate most?',57),
 ('deeper-029','deeper','What part of your personality comes out when you feel comfortable?',58),
 ('light-030','light','What would be the funniest prize in a very low-stakes contest?',59),
 ('deeper-030','deeper','What would you enjoy explaining to me about something you care about?',60),
 ('light-031','light','What topic could tempt you into watching a short documentary?',61),
 ('deeper-031','deeper','What does generosity look like to you beyond giving gifts?',62),
 ('light-032','light','Which shape would you choose for a very unusual window?',63),
 ('deeper-032','deeper','What helps you feel settled after a busy day?',64),
 ('light-033','light','What food combination do you enjoy that might surprise me?',65),
 ('deeper-033','deeper','How do you prefer to let someone know you need more time to answer?',66),
 ('light-034','light','If your bag could hold one impossibly large object, what would you carry?',67),
 ('deeper-034','deeper','What is something you hope stays part of your life as things change?',68),
 ('light-035','light','What is a tiny upgrade that would make your desk or reading spot nicer?',69),
 ('deeper-035','deeper','What kind of compliment feels most meaningful to you?',70),
 ('light-036','light','Which animated character would make a good tour guide?',71),
 ('deeper-036','deeper','What have you appreciated about the way we spend time together?',72),
 ('light-037','light','What would you draw on a blank postcard for me?',73),
 ('deeper-037','deeper','What makes an apology feel thoughtful to you?',74),
 ('light-038','light','Which outdoor activity sounds inviting right now?',75),
 ('deeper-038','deeper','What helps you notice progress that is easy to overlook?',76),
 ('light-039','light','What would be your signature move in a completely silly dance?',77),
 ('deeper-039','deeper','What would make asking for a small favor feel easier?',78),
 ('light-040','light','What object nearby has an interesting texture?',79),
 ('deeper-040','deeper','What would you like to learn about a place or community different from your own?',80),
 ('light-041','light','Which story would you like to experience again for the first time?',81),
 ('deeper-041','deeper','What is a belief about success you would like to define for yourself?',82),
 ('light-042','light','What would you serve a friendly visitor from another planet?',83),
 ('deeper-042','deeper','What is one thing we could make more playful in our conversations?',84),
 ('light-043','light','What is the best thing about the time of day you like most?',85),
 ('deeper-043','deeper','What do you admire about someone who handles disagreement well?',86),
 ('light-044','light','Which two animals would make an entertaining detective team?',87),
 ('deeper-044','deeper','What is a boundary around your free time that you would like to respect more?',88),
 ('light-045','light','What would you like to find at the end of a short walk?',89),
 ('deeper-045','deeper','How do you like someone to respond when you share an unfinished idea?',90),
 ('light-046','light','What is a small skill you could teach me in five minutes?',91),
 ('deeper-046','deeper','What is a small experience you would enjoy sharing with me someday?',92),
 ('light-047','light','If you could add one harmless sound effect to daily life, what would it be?',93),
 ('deeper-047','deeper','What helps you recognize when a goal no longer fits you?',94),
 ('light-048','light','What kind of puzzle do you enjoy figuring out?',95),
 ('deeper-048','deeper','What is a difference between us that you enjoy?',96),
 ('light-049','light','What would you put on a flag for an imaginary island?',97),
 ('deeper-049','deeper','What makes a shared decision feel collaborative to you?',98),
 ('light-050','light','What ordinary moment would make a good opening scene for a movie?',99),
 ('deeper-050','deeper','What would you like to thank yourself for today?',100);
-- END GENERATED DAISY BANK

create table public.daisy_assignments (
  garden_day date primary key,
  ordinal bigint not null unique check (ordinal > 0),
  question_id text not null references private.daisy_questions(question_id),
  category text not null check (category in ('light','deeper')),
  prompt text not null,
  assigned_at timestamptz not null
);
create table public.hydrangea_moods (
  mood_key text primary key,
  label text not null,
  color_name text not null,
  color_hex text not null check (color_hex ~ '^#[0-9A-F]{6}$')
);
insert into public.hydrangea_moods values
 ('calm','Calm','Blue','#6F9EAB'),
 ('joyful','Joyful','Yellow','#E2B84F'),
 ('tender','Tender','Pink','#D88798'),
 ('energized','Energized','Orange','#D9854F'),
 ('low','Low','Lavender','#8B87AB'),
 ('tense','Tense','Red','#B86B61');
create table public.flower_entries (
  id bigint generated always as identity primary key,
  flower_id uuid not null references public.flowers(id),
  author_id smallint not null check (author_id in (1,2)),
  garden_day date not null,
  original_posted_at timestamptz not null,
  updated_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  daisy_assignment_day date references public.daisy_assignments(garden_day),
  unique (flower_id, garden_day, author_id),
  check (updated_at >= original_posted_at),
  check (daisy_assignment_day is null or daisy_assignment_day = garden_day)
);
create index entries_flower_history on public.flower_entries(flower_id, id desc);
create index entries_rollover_day on public.flower_entries(garden_day, flower_id);
alter table public.daisy_assignments enable row level security;
alter table public.hydrangea_moods enable row level security;
alter table public.flower_entries enable row level security;
revoke all on public.daisy_assignments, public.hydrangea_moods, public.flower_entries
  from public, anon, authenticated, service_role, supabase_auth_admin;
revoke all on sequence public.flower_entries_id_seq
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant select on public.daisy_assignments, public.hydrangea_moods, public.flower_entries to authenticated;
create policy members_read_daisy_assignments on public.daisy_assignments for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_moods on public.hydrangea_moods for select to authenticated
  using ((select public.is_garden_member()));
create policy members_read_entries on public.flower_entries for select to authenticated
  using ((select public.is_garden_member()));

-- Caller holds garden row 1, and supplies its post-lock authoritative clock.
create function private.assign_daisy_question(p_day date, p_now timestamptz)
returns public.daisy_assignments
language plpgsql security invoker set search_path = pg_catalog
as $$
declare v_assignment public.daisy_assignments; v_ordinal bigint;
begin
  select * into v_assignment from public.daisy_assignments where garden_day = p_day;
  if found then return v_assignment; end if;
  select coalesce(max(ordinal),0) + 1 into v_ordinal from public.daisy_assignments;
  insert into public.daisy_assignments(garden_day, ordinal, question_id, category, prompt, assigned_at)
    select p_day, v_ordinal, question_id, category, prompt, p_now from private.daisy_questions
    where delivery_order = (v_ordinal - 1) % 100 + 1 returning * into v_assignment;
  return v_assignment;
end;
$$;

create function private.validate_entry_payload(p_type text, p_payload jsonb, p_day date)
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
  if v_keys <> v_expected then
    raise exception using errcode = '22023', message = 'Invalid entry fields';
  end if;
  foreach v_field in array v_expected loop
    if jsonb_typeof(p_payload -> v_field) <> 'string' then
      raise exception using errcode = '22023', message = 'Entry fields must be strings';
    end if;
    v_value := regexp_replace(p_payload ->> v_field, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if char_length(v_value) < 1 or char_length(v_value) > (case when v_field = 'text' then 4000 when v_field = 'url' then 512 else 200 end) then
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
  if p_type = 'hydrangea' and not exists (select 1 from public.hydrangea_moods where mood_key = v_result ->> 'mood') then
    raise exception using errcode = '22023', message = 'Unknown mood';
  end if;
  if p_type = 'daisy' and not exists (select 1 from public.daisy_assignments where garden_day = p_day and question_id = v_result ->> 'question_id') then
    raise exception using errcode = '22023', message = 'Answer the assigned daily question';
  end if;
  return v_result;
end;
$$;

create function public.get_daily_daisy_question()
returns public.daisy_assignments
language plpgsql security definer set search_path = pg_catalog
as $$
declare v_now timestamptz; v_day date;
begin
  perform private.require_member();
  perform private.ensure_garden();
  v_now := clock_timestamp();
  select garden_day into v_day from private.garden_clock_at(v_now);
  return private.assign_daisy_question(v_day,v_now);
end;
$$;

create function public.submit_flower_entry(p_flower_id uuid, p_payload jsonb)
returns public.flower_entries
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor smallint := private.require_member(); v_flower public.flowers;
  v_now timestamptz; v_clock record; v_payload jsonb; v_entry public.flower_entries;
begin
  perform 1 from public.garden where id = 1 for update;
  v_now := clock_timestamp();
  select * into v_clock from private.garden_clock_at(v_now);
  select * into v_flower from public.flowers where id = p_flower_id and garden_id = 1;
  if not found then raise exception using errcode = '22023', message = 'Unknown flower'; end if;
  if v_flower.first_bloom_at is not null and v_flower.type_key <> 'cactus' then
    raise exception using errcode = '22023', message = 'This flower has already bloomed';
  end if;
  if v_flower.type_key = 'moonflower' and not v_clock.moonflower_open then
    raise exception using errcode = '22023', message = 'Moonflower opens from 10 p.m. to 4 a.m.';
  end if;
  if exists (select 1 from public.flower_entries where flower_id = p_flower_id and garden_day = v_clock.garden_day and author_id = v_actor) then
    raise exception using errcode = '22023', message = 'Already submitted; edit the original entry';
  end if;
  if v_flower.type_key = 'daisy' then perform private.assign_daisy_question(v_clock.garden_day,v_now); end if;
  v_payload := private.validate_entry_payload(v_flower.type_key,p_payload,v_clock.garden_day);
  insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload,daisy_assignment_day)
    values (p_flower_id,v_actor,v_clock.garden_day,v_now,v_now,v_payload,
      case when v_flower.type_key = 'daisy' then v_clock.garden_day end) returning * into v_entry;
  return v_entry;
end;
$$;

create function public.edit_flower_entry(p_entry_id bigint, p_payload jsonb)
returns public.flower_entries
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor smallint := private.require_member(); v_now timestamptz; v_day date;
  v_entry public.flower_entries; v_type text; v_payload jsonb;
begin
  perform 1 from public.garden where id = 1 for update;
  v_now := clock_timestamp();
  select garden_day into v_day from private.garden_clock_at(v_now);
  select * into v_entry from public.flower_entries where id = p_entry_id;
  if not found or v_entry.author_id <> v_actor then
    raise exception using errcode = '42501', message = 'Only the author can edit this entry';
  end if;
  if v_entry.garden_day <> v_day or v_now < v_entry.original_posted_at or v_now > v_entry.original_posted_at + interval '30 minutes' then
    raise exception using errcode = '22023', message = 'The edit window has ended';
  end if;
  select type_key into v_type from public.flowers where id = v_entry.flower_id;
  v_payload := private.validate_entry_payload(v_type,p_payload,v_entry.garden_day);
  update public.flower_entries set payload = v_payload, updated_at = v_now where id = p_entry_id returning * into v_entry;
  return v_entry;
end;
$$;

create function public.current_entry_state(p_flower_id uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor smallint := private.require_member(); v_now timestamptz; v_clock record;
  v_flower public.flowers; v_question public.daisy_assignments; v_entries jsonb;
begin
  -- Daisy assignment and this snapshot share the mutation ordering point.
  perform 1 from public.garden where id = 1 for update;
  v_now := clock_timestamp();
  select * into v_clock from private.garden_clock_at(v_now);
  select * into v_flower from public.flowers where id = p_flower_id and garden_id = 1;
  if not found then raise exception using errcode = '22023', message = 'Unknown flower'; end if;
  if v_flower.type_key = 'daisy' then v_question := private.assign_daisy_question(v_clock.garden_day,v_now); end if;
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
    'entries',v_entries);
end;
$$;

create function public.entry_history(p_flower_id uuid default null, p_limit integer default 50, p_before_id bigint default null)
returns setof public.flower_entries
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform private.require_member();
  if p_limit is null or p_limit not between 1 and 100 or (p_before_id is not null and p_before_id < 1) then
    raise exception using errcode = '22023', message = 'Invalid history page';
  end if;
  if p_flower_id is not null and not exists (select 1 from public.flowers where id = p_flower_id and garden_id = 1) then
    raise exception using errcode = '22023', message = 'Unknown flower';
  end if;
  return query select e.* from public.flower_entries e
    where (p_flower_id is null or e.flower_id = p_flower_id) and (p_before_id is null or e.id < p_before_id)
    order by e.id desc limit p_limit;
end;
$$;

revoke all on function private.assign_daisy_question(date,timestamptz), private.validate_entry_payload(text,jsonb,date),
  public.get_daily_daisy_question(), public.submit_flower_entry(uuid,jsonb), public.edit_flower_entry(bigint,jsonb),
  public.current_entry_state(uuid), public.entry_history(uuid,integer,bigint)
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant execute on function public.get_daily_daisy_question(), public.submit_flower_entry(uuid,jsonb),
  public.edit_flower_entry(bigint,jsonb), public.current_entry_state(uuid), public.entry_history(uuid,integer,bigint) to authenticated;
