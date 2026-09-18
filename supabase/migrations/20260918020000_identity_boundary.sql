-- Two private slots, empty until an explicit privileged bootstrap. Bindings are
-- tombstones: deleting an Auth user must never admit a replacement implicitly.
create table private.garden_members (
  member_id smallint primary key check (member_id in (1, 2)),
  member_role text generated always as
    (case when member_id = 1 then 'owner'::text else 'member'::text end) stored,
  allowed_email text not null unique check (
    allowed_email = lower(btrim(allowed_email))
    and length(allowed_email) <= 254
    and allowed_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  user_id uuid unique,
  google_subject text unique,
  revoked_at timestamptz,
  check ((user_id is null) = (google_subject is null)),
  check (google_subject is null or length(google_subject) > 0)
);
alter table private.garden_members enable row level security;
revoke all on schema private from public, anon, authenticated, service_role;
revoke all on private.garden_members from public, anon, authenticated, service_role, supabase_auth_admin;

-- No claims or editable profile fields are used to recognize an account.
-- The confirmation exception is only for the AFTER identity trigger: Auth
-- inserts its verified OAuth identity before confirming the new user.
create function private.google_account(p_user_id uuid, p_require_confirmation boolean)
returns table (email text, google_subject text)
language sql stable security invoker set search_path = pg_catalog
as $$
  select lower(btrim(u.email)), i.provider_id
  from auth.users u join auth.identities i on i.user_id = u.id
  where u.id = p_user_id
    and u.raw_app_meta_data ->> 'provider' = 'google'
    and not u.is_anonymous and not u.is_sso_user
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now())
    and coalesce(u.encrypted_password, '') = ''
    and (not p_require_confirmation or u.email_confirmed_at is not null)
    and i.provider = 'google'
    and length(i.provider_id) > 0
    and i.identity_data ->> 'sub' = i.provider_id
    and i.identity_data -> 'email_verified' = 'true'::jsonb
    and lower(btrim(i.identity_data ->> 'email')) = lower(btrim(u.email))
    and (select count(*) from auth.identities all_identities where all_identities.user_id = u.id) = 1;
$$;

create function private.bootstrap_members(p_owner_email text, p_member_email text)
returns void
language plpgsql security invoker set search_path = pg_catalog
as $$
declare
  v_owner text := lower(btrim(p_owner_email));
  v_member text := lower(btrim(p_member_email));
  v_slot record;
  v_user_id uuid;
  v_subject text;
  v_count bigint;
begin
  if v_owner is null or v_member is null or v_owner = v_member
    or length(v_owner) > 254 or length(v_member) > 254
    or v_owner !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or v_member !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'Invalid private member configuration';
  end if;
  -- Serialize initial configuration and identity-binding writes.
  lock table private.garden_members in exclusive mode;
  if exists (select 1 from private.garden_members) then
    if (select count(*) from private.garden_members) = 2
      and exists (select 1 from private.garden_members where member_id = 1 and allowed_email = v_owner)
      and exists (select 1 from private.garden_members where member_id = 2 and allowed_email = v_member) then
      return; -- Never reset bindings or revocation on a repeated bootstrap.
    end if;
    raise exception using errcode = '22023', message = 'Private member configuration already exists';
  end if;
  insert into private.garden_members (member_id, allowed_email)
    values (1, v_owner), (2, v_member);
  for v_slot in select member_id, allowed_email from private.garden_members loop
    select count(*) into v_count from auth.users where lower(btrim(email)) = v_slot.allowed_email;
    if v_count = 0 then
      continue;
    end if;
    if v_count <> 1 then
      raise exception using errcode = '22023', message = 'Existing identity is not an unambiguous verified Google account';
    end if;
    select id into v_user_id from auth.users where lower(btrim(email)) = v_slot.allowed_email;
    select a.google_subject into v_subject from private.google_account(v_user_id, true) a;
    if v_subject is null then
      raise exception using errcode = '22023', message = 'Existing identity is not an unambiguous verified Google account';
    end if;
    update private.garden_members set user_id = v_user_id, google_subject = v_subject
      where member_id = v_slot.member_id;
  end loop;
end;
$$;

create function private.bind_google_identity()
returns trigger
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  -- Only a verified Google identity can reserve an unbound slot. Confirmation
  -- is enforced on every access, not here, because OAuth confirms afterward.
  if (select count(*) from private.garden_members) = 2 then
    update private.garden_members m
      set user_id = new.user_id, google_subject = a.google_subject
      from private.google_account(new.user_id, false) a
      where m.allowed_email = a.email and m.user_id is null and m.revoked_at is null;
  end if;
  return new;
end;
$$;
create trigger garden_bind_google_identity
  after insert or update of identity_data, provider, provider_id, user_id on auth.identities
  for each row execute function private.bind_google_identity();

-- This prospective event is supplied only by Supabase Auth. In its OAuth
-- lifecycle identities is empty and email confirmation has not happened yet.
-- Do not bind event.user.id: Auth may create a different UUID afterward.
create function public.before_user_created(event jsonb)
returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog
as $$
begin
  if event #>> '{user,app_metadata,provider}' = 'google'
    and event #> '{user,app_metadata,providers}' = '["google"]'::jsonb
    and event #> '{user,is_anonymous}' = 'false'::jsonb
    and (select count(*) from private.garden_members) = 2
    and exists (
      select 1 from private.garden_members m
      where m.allowed_email = lower(btrim(event #>> '{user,email}'))
        and m.revoked_at is null and m.user_id is null
    )
    and not exists (
      select 1 from auth.users u
      where lower(btrim(u.email)) = lower(btrim(event #>> '{user,email}'))
    ) then
    return '{}'::jsonb;
  end if;
  -- Never reveal which account, provider, or configuration check failed.
  return '{"error":{"http_code":403,"message":"This garden is private."}}'::jsonb;
end;
$$;

create function private.current_member_id()
returns smallint
language sql stable security invoker set search_path = pg_catalog
as $$
  select m.member_id
  from private.garden_members m
  cross join lateral private.google_account(m.user_id, true) a
  where m.user_id = auth.uid()
    and m.revoked_at is null
    and m.allowed_email = a.email and m.google_subject = a.google_subject
    and (select count(*) from private.garden_members) = 2
    and auth.jwt() -> 'amr' @> '[{"method":"oauth"}]'::jsonb;
$$;
create function private.is_owner()
returns boolean
language sql stable security invoker set search_path = pg_catalog
as $$ select coalesce(private.current_member_id() = 1, false) $$;
create function private.require_member()
returns smallint
language plpgsql stable security invoker set search_path = pg_catalog
as $$
declare v_member smallint := private.current_member_id();
begin
  if v_member is null then
    raise exception using errcode = '42501', message = 'Garden access denied';
  end if;
  return v_member;
end;
$$;
create function private.require_owner()
returns smallint
language plpgsql stable security invoker set search_path = pg_catalog
as $$
begin
  if not private.is_owner() then
    raise exception using errcode = '42501', message = 'Owner access denied';
  end if;
  return 1::smallint;
end;
$$;

create function public.current_member()
returns table (member_id smallint, member_role text)
language sql stable security definer set search_path = pg_catalog
as $$
  select m.member_id, m.member_role from private.garden_members m
  where m.member_id = private.current_member_id();
$$;
create function public.is_garden_member()
returns boolean
language sql stable security definer set search_path = pg_catalog
as $$ select private.current_member_id() is not null $$;

-- Explicit grants only, including revoking Supabase's public-schema defaults.
revoke all on function private.google_account(uuid, boolean),
  private.bootstrap_members(text, text), private.bind_google_identity(),
  private.current_member_id(), private.is_owner(), private.require_member(),
  private.require_owner(), public.current_member(), public.is_garden_member(),
  public.before_user_created(jsonb)
  from public, anon, authenticated, service_role, supabase_auth_admin;
grant execute on function public.current_member(), public.is_garden_member() to authenticated;
grant usage on schema public, private to supabase_auth_admin;
grant select on private.garden_members to supabase_auth_admin;
create policy auth_signup_allowlist on private.garden_members for select
  to supabase_auth_admin using (true);
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
