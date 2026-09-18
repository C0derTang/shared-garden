-- Disposable LOCAL Supabase only. Run with psql as supabase_admin, which is
-- needed to SET ROLE to the platform Auth role. No persistent grants are made.
-- See identity-setup.md for the Docker command. Every fixture is rolled back.
\set ON_ERROR_STOP on
begin;
set local search_path = pg_catalog;

do $$ begin
  if current_user <> 'supabase_admin' then
    raise exception 'Run this local harness as supabase_admin';
  end if;
  if exists (select 1 from private.garden_members) then
    raise exception 'Run only in a disposable unconfigured local project';
  end if;
end $$;
set local role postgres;
select private.bootstrap_members('owner@example.test', 'member@example.test');
reset role;
set local role supabase_auth_admin;

do $$ begin
  if public.before_user_created('{"user":{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","aud":"authenticated","role":"","email":"owner@example.test","app_metadata":{"provider":"google","providers":["google"]},"user_metadata":{},"identities":[],"is_anonymous":false}}') is distinct from '{}'::jsonb then
    raise exception 'Approved Google prospective signup must pass before confirmation/identity insertion';
  end if;
  if public.before_user_created('{"user":{"email":"outsider@example.test","app_metadata":{"provider":"google","providers":["google"]},"is_anonymous":false}}') #>> '{error,http_code}' is distinct from '403' then
    raise exception 'Unapproved Google signup must fail';
  end if;
  if public.before_user_created('{"user":{"email":"owner@example.test","app_metadata":{"provider":"email","providers":["email"]},"user_metadata":{"provider":"google","role":"owner","email_verified":true},"is_anonymous":false}}') #>> '{error,http_code}' is distinct from '403' then
    raise exception 'Spoofed profile cannot turn email signup into Google';
  end if;
end $$;

-- Match the actual OAuth ordering and use a persisted UUID different from the
-- prospective hook UUID. Confirmation is deliberately absent at this point.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'owner@example.test', '{"provider":"google","providers":["google"]}', '{}');
insert into auth.identities (user_id, provider_id, provider, identity_data)
values ('11111111-1111-4111-8111-111111111111', 'google-owner', 'google', '{"sub":"google-owner","email":"owner@example.test","email_verified":true}');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}', true);
do $$ begin
  if public.is_garden_member() then
    raise exception 'Unconfirmed user must not have application access';
  end if;
end $$;
reset role;
set local role supabase_auth_admin;
update auth.users set email_confirmed_at = now() where id = '11111111-1111-4111-8111-111111111111';
-- A returning Google sign-in updates the existing identity instead of invoking
-- before-user-created. That update must preserve the original bound member.
update auth.identities set identity_data = identity_data || '{"name":"Synthetic Profile"}' where provider_id = 'google-owner';
reset role;
set local role authenticated;
do $$ begin
  if not public.is_garden_member()
    or not exists (select 1 from public.current_member() where member_id = 1 and member_role = 'owner') then
    raise exception 'Verified Google signup and returning sign-in must resolve owner';
  end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","email":"owner@example.test","role":"owner","user_metadata":{"member_id":1},"amr":[{"method":"oauth"}]}', true);
do $$ begin
  if public.is_garden_member() then
    raise exception 'Spoofed claims must not establish a member binding';
  end if;
end $$;
reset role;
set local role postgres;
update private.garden_members set revoked_at = now() where member_id = 1;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}', true);
do $$ begin
  if public.is_garden_member() or exists (select 1 from public.current_member()) then
    raise exception 'Revocation must reach existing JWT authorization';
  end if;
end $$;
reset role;
set local role supabase_auth_admin;
do $$ begin
  if public.before_user_created('{"user":{"email":"owner@example.test","app_metadata":{"provider":"google","providers":["google"]},"is_anonymous":false}}') #>> '{error,http_code}' is distinct from '403' then
    raise exception 'Revoked/reserved account must not be recreated';
  end if;
end $$;
reset role;
rollback;
do $$ begin
  if exists (select 1 from private.garden_members)
    or exists (select 1 from auth.users where email in ('owner@example.test','member@example.test')) then
    raise exception 'Local harness fixtures were not fully rolled back';
  end if;
end $$;
select 'PASS: Auth role hook, OAuth insertion/confirmation, returning identity, spoofed claims, revocation, rollback' as verification;
