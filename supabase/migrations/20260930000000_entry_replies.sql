-- Replies are conversation, never daily care or progression inputs.
create table public.entry_replies (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.flower_entries(id),
  author_id smallint not null check (author_id in (1,2)),
  body text not null check (char_length(body) between 1 and 4000 and body ~ '[^[:space:]]'),
  request_id uuid not null,
  created_at timestamptz not null check (isfinite(created_at)),
  unique (author_id, request_id)
);
create index entry_replies_history on public.entry_replies(entry_id,id desc);
alter table public.entry_replies enable row level security;
revoke all on public.entry_replies from public,anon,authenticated,service_role,supabase_auth_admin;
revoke all on sequence public.entry_replies_id_seq from public,anon,authenticated,service_role,supabase_auth_admin;
grant select on public.entry_replies to authenticated;
create policy members_read_replies on public.entry_replies for select to authenticated
  using ((select public.is_garden_member()));

create function public.reply_to_entry(p_entry_id bigint,p_body text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor smallint; v_author smallint; v_body text; v_reply public.entry_replies;
begin
  perform private.require_member();
  -- Serialize request IDs and parent validation without settling or evaluating
  -- the garden. Replies must not change any care/progression facts.
  perform 1 from public.garden where id=1 for update;
  v_actor := private.require_member();
  select e.author_id into v_author from public.flower_entries e
    join public.flowers f on f.id=e.flower_id
    where e.id=p_entry_id and f.garden_id=1 and f.type_key <> 'peony';
  if not found then raise exception using errcode='22023',message='Unknown entry'; end if;
  if v_author=v_actor then raise exception using errcode='42501',message='Reply to your partner’s entry'; end if;
  v_body := regexp_replace(p_body,'^[[:space:]]+|[[:space:]]+$','','g');
  if v_body is null or char_length(v_body) not between 1 and 4000 then
    raise exception using errcode='22023',message='Reply must contain 1 to 4000 characters';
  end if;
  if p_request_id is null then raise exception using errcode='22023',message='A reply request ID is required'; end if;
  select * into v_reply from public.entry_replies where author_id=v_actor and request_id=p_request_id;
  if found then
    if v_reply.entry_id<>p_entry_id or v_reply.body<>v_body then
      raise exception using errcode='22023',message='Retry must use the original reply';
    end if;
  else
    insert into public.entry_replies(entry_id,author_id,body,request_id,created_at)
      values(p_entry_id,v_actor,v_body,p_request_id,clock_timestamp()) returning * into v_reply;
  end if;
  return to_jsonb(v_reply)-'request_id';
end $$;
create function public.entry_reply_history(p_entry_id bigint,p_limit integer default 50,p_before_id bigint default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform private.require_member();
  if p_limit is null or p_limit not between 1 and 50 or p_entry_id is null then
    raise exception using errcode='22023',message='Invalid reply page';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(r)-'request_id' order by r.id) from (
    select * from public.entry_replies where entry_id=p_entry_id and (p_before_id is null or id<p_before_id)
    order by id desc limit p_limit
  ) r),'[]'::jsonb);
end $$;
revoke all on function public.reply_to_entry(bigint,text,uuid),public.entry_reply_history(bigint,integer,bigint)
  from public,anon,authenticated,service_role,supabase_auth_admin;
grant execute on function public.reply_to_entry(bigint,text,uuid),public.entry_reply_history(bigint,integer,bigint) to authenticated;
alter publication supabase_realtime add table public.entry_replies;
