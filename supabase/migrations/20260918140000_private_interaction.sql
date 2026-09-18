-- No message, answer labels, or account identities are seeded by this migration.
create function private.valid_interaction_choices(p_choices jsonb)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog as $$
declare v_choice jsonb; v_keys text[] := '{}'; v_key text;
begin
 if p_choices is null or jsonb_typeof(p_choices)<>'array' then return false; end if;
 if jsonb_array_length(p_choices) not between 2 and 6 then return false; end if;
 for v_choice in select value from jsonb_array_elements(p_choices) loop
  if jsonb_typeof(v_choice)<>'object' or (v_choice-'key'-'label')<>'{}'::jsonb
   or jsonb_typeof(v_choice->'key') is distinct from 'string'
   or jsonb_typeof(v_choice->'label') is distinct from 'string' then return false; end if;
  v_key:=v_choice->>'key';
  if v_key !~ '^[a-z0-9_-]{1,48}$' or v_key=any(v_keys)
   or length(btrim(v_choice->>'label')) not between 1 and 120 or length(v_choice->>'label')>120 then return false; end if;
  v_keys:=array_append(v_keys,v_key);
 end loop;
 return true;
end $$;
create table private.private_interaction_config (
 id smallint primary key default 1 check(id=1),
 owner_id smallint not null default 1 references private.garden_members(member_id) check(owner_id=1),
 recipient_id smallint not null references private.garden_members(member_id) check(recipient_id=2),
 title text not null check(length(btrim(title)) between 1 and 160 and length(title)<=160),
 message text not null check(length(btrim(message)) between 1 and 4000 and length(message)<=4000),
 choices jsonb not null check(private.valid_interaction_choices(choices)),
 armed boolean not null default true
);
create table private.private_interaction_delivery (
 id smallint primary key default 1 references private.private_interaction_config(id) check(id=1),
 delivered_at timestamptz not null,
 answered_at timestamptz,
 answered_by smallint references private.garden_members(member_id) check(answered_by=2),
 answer_key text check(answer_key ~ '^[a-z0-9_-]{1,48}$'),
 answer_label text check(length(answer_label) between 1 and 120),
 acknowledged_at timestamptz,
 check((answered_at is null and answered_by is null and answer_key is null and answer_label is null and acknowledged_at is null)
  or (answered_at is not null and answered_by is not null and answer_key is not null and answer_label is not null
   and answered_at>=delivered_at and (acknowledged_at is null or acknowledged_at>=answered_at)))
);
alter table private.private_interaction_config enable row level security;
alter table private.private_interaction_delivery enable row level security;
revoke all on private.private_interaction_config,private.private_interaction_delivery from public,anon,authenticated,service_role,supabase_auth_admin;

-- A payload-free owner signal is the only published interaction relation.
create table public.private_interaction_signals (
 owner_id smallint primary key default 1 check(owner_id=1),
 revision bigint not null default 1 check(revision>0)
);
alter table public.private_interaction_signals enable row level security;
revoke all on public.private_interaction_signals from public,anon,authenticated,service_role;
grant select on public.private_interaction_signals to authenticated;
create policy owner_read_interaction_signal on public.private_interaction_signals for select to authenticated
 using(exists(select 1 from public.current_member() where member_id=owner_id and member_role='owner'));
alter publication supabase_realtime add table public.private_interaction_signals;

-- Privileged setup only. Exactly repeated configuration cannot rearm or reset.
create function private.bootstrap_private_interaction(p_recipient_id smallint,p_title text,p_message text,p_choices jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare v_config private.private_interaction_config;
begin
 if p_recipient_id is distinct from 2::smallint or p_title is null or length(btrim(p_title)) not between 1 and 160 or length(p_title)>160
  or p_message is null or length(btrim(p_message)) not between 1 and 4000 or length(p_message)>4000
  or not private.valid_interaction_choices(p_choices) then
  raise exception using errcode='22023',message='Invalid private interaction configuration';
 end if;
 lock table private.private_interaction_config in exclusive mode;
 select * into v_config from private.private_interaction_config where id=1;
 if found then
  if v_config.recipient_id=p_recipient_id and v_config.title=p_title and v_config.message=p_message and v_config.choices=p_choices then return; end if;
  raise exception using errcode='22023',message='Private interaction configuration already exists';
 end if;
 insert into private.private_interaction_config(recipient_id,title,message,choices) values(p_recipient_id,p_title,p_message,p_choices);
end $$;

create function public.current_private_interaction()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor smallint; v_now timestamptz; v_config private.private_interaction_config; v_delivery private.private_interaction_delivery;
begin
 v_actor:=private.require_member();
 if v_actor=1 then return jsonb_build_object('status','owner'); end if;
 v_now:=private.begin_garden_operation();
 v_actor:=private.require_member();
 select * into v_config from private.private_interaction_config where id=1;
 if not found or v_config.recipient_id<>v_actor then return jsonb_build_object('status','unavailable'); end if;
 select * into v_delivery from private.private_interaction_delivery where id=1;
 if v_delivery.answered_at is not null then return jsonb_build_object('status','answered'); end if;
 if not v_config.armed or not private.all_ordinary_achievements_complete() then return jsonb_build_object('status','unavailable'); end if;
 insert into private.private_interaction_delivery(id,delivered_at) values(1,v_now) on conflict(id) do nothing;
 return jsonb_build_object('status','pending','content',jsonb_build_object('title',v_config.title,'message',v_config.message,'choices',v_config.choices));
end $$;

create function public.answer_private_interaction(p_answer_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor smallint; v_now timestamptz; v_config private.private_interaction_config; v_delivery private.private_interaction_delivery; v_label text;
begin
 v_actor:=private.require_member();
 if v_actor<>2 then raise exception using errcode='42501',message='Recipient access denied'; end if;
 if p_answer_key is null or p_answer_key !~ '^[a-z0-9_-]{1,48}$' then
  raise exception using errcode='22023',message='Choose an available answer';
 end if;
 v_now:=private.begin_garden_operation();
 v_actor:=private.require_member();
 select * into v_config from private.private_interaction_config where id=1;
 select * into v_delivery from private.private_interaction_delivery where id=1;
 if v_delivery.answered_at is not null then return jsonb_build_object('status','answered'); end if;
 if v_config.id is null or v_config.recipient_id<>v_actor or not v_config.armed
  or not private.all_ordinary_achievements_complete() or v_delivery.id is null then
  raise exception using errcode='22023',message='Interaction is not available';
 end if;
 select value->>'label' into v_label from jsonb_array_elements(v_config.choices) where value->>'key'=p_answer_key;
 if v_label is null then raise exception using errcode='22023',message='Choose an available answer'; end if;
 update private.private_interaction_delivery set answered_at=v_now,answered_by=v_actor,answer_key=p_answer_key,answer_label=v_label where id=1;
 insert into public.private_interaction_signals(owner_id,revision) values(1,1)
  on conflict(owner_id) do update set revision=public.private_interaction_signals.revision+1;
 return jsonb_build_object('status','answered');
end $$;

create function public.owner_private_interaction(p_action text,p_armed boolean default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_config private.private_interaction_config; v_delivery private.private_interaction_delivery;
begin
 perform private.require_owner();
 if p_action is null or p_action not in ('status','preview','arm','acknowledge') or (p_action='arm' and p_armed is null) then
  raise exception using errcode='22023',message='Invalid interaction control';
 end if;
 -- Same lock order as recipient operations, without settling/creating a garden
 -- for a preview or owner status read. The configuration row serializes bootstrap.
 perform 1 from public.garden where id=1 for update;
 perform private.require_owner();
 select * into v_config from private.private_interaction_config where id=1 for update;
 perform private.require_owner();
 if v_config.id is null then return jsonb_build_object('status','unconfigured','armed',false,'unread',false,'answer',null); end if;
 if p_action='arm' and v_config.armed<>p_armed then
  update private.private_interaction_config set armed=p_armed where id=1 returning * into v_config;
 end if;
 select * into v_delivery from private.private_interaction_delivery where id=1;
 if p_action='preview' then
  return jsonb_build_object('status','preview','content',jsonb_build_object('title',v_config.title,'message',v_config.message,'choices',v_config.choices));
 end if;
 if p_action='acknowledge' and v_delivery.answered_at is not null and v_delivery.acknowledged_at is null then
  update private.private_interaction_delivery set acknowledged_at=clock_timestamp() where id=1 returning * into v_delivery;
  update public.private_interaction_signals set revision=revision+1 where owner_id=1;
 end if;
 return jsonb_build_object('status',case when v_delivery.answered_at is not null then 'answered' when v_delivery.id is not null then 'pending' else 'ready' end,
  'armed',v_config.armed,'unread',v_delivery.answered_at is not null and v_delivery.acknowledged_at is null,
  'answer',case when v_delivery.answered_at is not null then jsonb_build_object('key',v_delivery.answer_key,'label',v_delivery.answer_label,'answered_at',v_delivery.answered_at) else null end);
end $$;
revoke all on function private.valid_interaction_choices(jsonb),private.bootstrap_private_interaction(smallint,text,text,jsonb),
 public.current_private_interaction(),public.answer_private_interaction(text),public.owner_private_interaction(text,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.current_private_interaction(),public.answer_private_interaction(text),public.owner_private_interaction(text,boolean) to authenticated;
