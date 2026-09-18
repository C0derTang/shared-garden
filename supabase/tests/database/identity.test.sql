begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

select has_table('private', 'garden_members', 'private fixed membership exists');
select has_function('public', 'current_member', array[]::text[], 'safe caller identity API exists');
select has_function('public', 'is_garden_member', array[]::text[], 'policy membership predicate exists');

-- These test-only definer wrappers exercise the same boundary future RPCs use.
create function public.identity_test_owner_guard() returns smallint
language sql security definer set search_path = pg_catalog
as $$ select private.require_owner() $$;
create function public.identity_test_member_guard() returns smallint
language sql security definer set search_path = pg_catalog
as $$ select private.require_member() $$;
revoke all on function public.identity_test_owner_guard(), public.identity_test_member_guard() from public;
grant execute on function public.identity_test_owner_guard(), public.identity_test_member_guard() to authenticated;
create table public.identity_test_probe (id integer primary key);
insert into public.identity_test_probe values (1);
alter table public.identity_test_probe enable row level security;
create policy members_only on public.identity_test_probe for select to authenticated
using ((select public.is_garden_member()));
grant select on public.identity_test_probe to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}', true);
select is_empty('select * from public.current_member()', 'missing configuration fails closed');
select is(public.is_garden_member(), false, 'missing configuration denies policy predicate');
select throws_ok('select public.identity_test_member_guard()', '42501', 'Garden access denied', 'member guard rejects before bootstrap');
reset role;

select throws_ok($$select private.bootstrap_members(null, 'member@example.test')$$, '22023', 'Invalid private member configuration', 'missing owner rejected');
select throws_ok($$select private.bootstrap_members('owner@example.test', '')$$, '22023', 'Invalid private member configuration', 'missing partner rejected');
select throws_ok($$select private.bootstrap_members(' SAME@example.test ', 'same@EXAMPLE.test')$$, '22023', 'Invalid private member configuration', 'normalized duplicate rejected');
select throws_ok($$select private.bootstrap_members('not an email', 'member@example.test')$$, '22023', 'Invalid private member configuration', 'invalid account input rejected');
select lives_ok($$select private.bootstrap_members(' OWNER@EXAMPLE.test ', 'MEMBER@example.test')$$, 'privileged bootstrap normalizes accounts');
select results_eq('select member_id, member_role from private.garden_members order by member_id',
  $$values (1::smallint, 'owner'::text), (2::smallint, 'member'::text)$$, 'exactly two slots and one owner');
select lives_ok($$select private.bootstrap_members('owner@example.test', 'member@example.test')$$, 'same bootstrap is idempotent');
select throws_ok($$select private.bootstrap_members('third@example.test', 'member@example.test')$$, '22023', 'Private member configuration already exists', 'bootstrap cannot replace an account');
select throws_ok($$select private.bootstrap_members('member@example.test', 'owner@example.test')$$, '22023', 'Private member configuration already exists', 'bootstrap cannot swap owner');

-- Before-user-created has no persisted identity or confirmed timestamp yet.
-- Its trusted app_metadata comes from Auth, not browser profile metadata.
select is(public.before_user_created('{"user":{"email":"OwNeR@example.test","app_metadata":{"provider":"google","providers":["google"]},"user_metadata":{"role":"owner"},"identities":[],"is_anonymous":false}}'), '{}'::jsonb, 'Google allowlisted prospective signup succeeds before identity creation');
select is(public.before_user_created('{"user":{"email":"member@example.test","app_metadata":{"provider":"google","providers":["google"]},"is_anonymous":false}}'), '{}'::jsonb, 'second configured Google signup succeeds');
select is(public.before_user_created('{"user":{"email":"outsider@example.test","app_metadata":{"provider":"google","providers":["google"]},"is_anonymous":false}}') #>> '{error,http_code}', '403', 'unlisted signup rejected');
select is(public.before_user_created('{"user":{"email":"owner@example.test","app_metadata":{"provider":"email","providers":["email"]},"user_metadata":{"provider":"google","email_verified":true},"is_anonymous":false}}') #>> '{error,http_code}', '403', 'user metadata cannot spoof Google provider');
select is(public.before_user_created('{"user":{"email":"owner@example.test","app_metadata":{"provider":"google","providers":["google","email"]},"is_anonymous":false}}') #>> '{error,http_code}', '403', 'mixed providers rejected');
select is(public.before_user_created('{"user":{"email":"owner@example.test","app_metadata":{"provider":"google","providers":["google"]},"is_anonymous":true}}') #>> '{error,http_code}', '403', 'anonymous signup rejected');
select is(public.before_user_created('{}') #>> '{error,http_code}', '403', 'incomplete hook input fails closed');
select is(public.before_user_created(null) #>> '{error,http_code}', '403', 'null hook input fails closed');
reset role;

savepoint incomplete;
delete from private.garden_members where member_id = 2;
select is(public.before_user_created('{"user":{"email":"owner@example.test","app_metadata":{"provider":"google","providers":["google"]},"is_anonymous":false}}') #>> '{error,http_code}', '403', 'one configured account cannot open signup');
reset role;
select throws_ok($$select private.bootstrap_members('owner@example.test', 'member@example.test')$$, '22023', 'Private member configuration already exists', 'bootstrap refuses partial configuration repair');
rollback to incomplete;

-- Actual Supabase tables with OAuth ordering: unconfirmed user,
-- verified provider identity, then user confirmation. No mock auth schema.
-- postgres inserts fixtures; Auth role execution is separately verified locally.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'owner@example.test', '{"provider":"google","providers":["google"]}', '{"role":"member"}');
insert into auth.identities (user_id, provider_id, provider, identity_data)
values ('11111111-1111-4111-8111-111111111111', 'google-owner', 'google', '{"sub":"google-owner","email":"OWNER@example.test","email_verified":true}');
reset role;
select is((select user_id from private.garden_members where member_id=1), '11111111-1111-4111-8111-111111111111'::uuid, 'first identity binds stable user before confirmation');
set local role authenticated;
select is_empty('select * from public.current_member()', 'unconfirmed stored user cannot authorize');
reset role;
update auth.users set email_confirmed_at = now() where id = '11111111-1111-4111-8111-111111111111';
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
 ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'MEMBER@example.test', now(), '{"provider":"google","providers":["google"]}', '{"role":"owner","member_id":1,"email":"owner@example.test"}'),
 ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'outsider@example.test', now(), '{"provider":"google","providers":["google"]}', '{"role":"owner","member_id":1,"email":"owner@example.test"}');
insert into auth.identities (user_id, provider_id, provider, identity_data) values
 ('22222222-2222-4222-8222-222222222222', 'google-member', 'google', '{"sub":"google-member","email":"member@example.test","email_verified":true}'),
 ('33333333-3333-4333-8333-333333333333', 'google-outsider', 'google', '{"sub":"google-outsider","email":"outsider@example.test","email_verified":true}');
select is(public.before_user_created('{"user":{"email":"owner@example.test","app_metadata":{"provider":"google","providers":["google"]},"is_anonymous":false}}') #>> '{error,http_code}', '403', 'duplicate creation of a bound account rejected');
reset role;

set local role authenticated;
select results_eq('select * from public.current_member()', $$values (1::smallint, 'owner'::text)$$, 'owner resolves after real Google confirmation lifecycle');
select is(public.is_garden_member(), true, 'owner passes policy check');
select is(public.identity_test_owner_guard(), 1::smallint, 'owner guard authorizes owner');
select is(public.identity_test_member_guard(), 1::smallint, 'member guard authorizes owner');
select results_eq('select id from public.identity_test_probe', 'values (1)', 'member-only RLS allows owner');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","email":"owner@example.test","user_metadata":{"role":"owner","member_id":1},"amr":[{"method":"oauth"}]}', true);
select results_eq('select * from public.current_member()', $$values (2::smallint, 'member'::text)$$, 'spoofed email and role metadata cannot elevate partner');
select is(public.identity_test_member_guard(), 2::smallint, 'partner passes member guard');
select throws_ok('select public.identity_test_owner_guard()', '42501', 'Owner access denied', 'partner fails owner-only guard');
select results_eq('select id from public.identity_test_probe', 'values (1)', 'policy allows the second member');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"owner","email":"owner@example.test","member_id":1,"user_metadata":{"role":"owner"},"app_metadata":{"role":"owner"},"amr":[{"method":"oauth"}]}', true);
select is_empty('select * from public.current_member()', 'unrelated user cannot spoof application membership');
select is(public.is_garden_member(), false, 'unrelated user fails policy predicate');
select is_empty('select id from public.identity_test_probe', 'RLS denies unrelated authenticated user');
select throws_ok('select public.identity_test_member_guard()', '42501', 'Garden access denied', 'member guard denies unrelated user');
select throws_ok('select public.identity_test_owner_guard()', '42501', 'Owner access denied', 'owner guard denies unrelated user');
select throws_ok('select * from private.garden_members', '42501', 'permission denied for schema private', 'authenticated cannot read allowlist');
select throws_ok($$select private.bootstrap_members('owner@example.test','member@example.test')$$, '42501', 'permission denied for schema private', 'authenticated cannot bootstrap');
select throws_ok('select private.current_member_id()', '42501', 'permission denied for schema private', 'private helpers are not browser APIs');
select throws_ok($$select public.before_user_created('{}')$$, '42501', 'permission denied for function before_user_created', 'browser cannot forge privileged hook events');
select throws_ok($$update auth.users set raw_app_meta_data = '{"role":"owner"}'$$, '42501', 'permission denied for table users', 'browser cannot change trusted user data');
select throws_ok($$update auth.identities set identity_data = '{"email":"owner@example.test","email_verified":true}'$$, '42501', 'permission denied for table identities', 'browser cannot change trusted identity data');
select throws_ok($$select * from public.current_member('11111111-1111-4111-8111-111111111111'::uuid)$$, '42883', null, 'safe API has no target-user impersonation argument');
select set_config('request.jwt.claims', '{}', true);
select is_empty('select * from public.current_member()', 'missing signed subject fails closed');
reset role;
set local role anon;
select throws_ok('select * from public.current_member()', '42501', 'permission denied for function current_member', 'anonymous cannot invoke member API');
select throws_ok('select public.is_garden_member()', '42501', 'permission denied for function is_garden_member', 'anonymous cannot invoke policy predicate');
select throws_ok('select * from private.garden_members', '42501', 'permission denied for schema private', 'anonymous cannot read private allowlist');
select throws_ok($$select public.before_user_created('{}')$$, '42501', 'permission denied for function before_user_created', 'anonymous cannot invoke hook');
reset role;
set local role service_role;
select throws_ok($$select private.bootstrap_members('owner@example.test','member@example.test')$$, '42501', 'permission denied for schema private', 'service API key cannot bootstrap private configuration');
select throws_ok($$select public.before_user_created('{}')$$, '42501', 'permission denied for function before_user_created', 'service API key cannot invoke signup hook');
reset role;

-- Live revalidation: a previously issued OAuth JWT must not retain revoked or
-- changed identity privileges. Every mutation is rolled back to the same fixture.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth"}]}', true);
savepoint revoked;
update private.garden_members set revoked_at = now() where member_id=1;
set local role authenticated;
select is_empty('select * from public.current_member()', 'revocation denies an existing token immediately');
select is(public.is_garden_member(), false, 'revocation reaches RLS predicate');
select throws_ok('select public.identity_test_owner_guard()', '42501', 'Owner access denied', 'revoked owner cannot invoke owner-only RPC');
reset role;
select is(public.before_user_created('{"user":{"email":"owner@example.test","app_metadata":{"provider":"google","providers":["google"]},"is_anonymous":false}}') #>> '{error,http_code}', '403', 'revoked account cannot sign up again');
reset role;
select lives_ok($$select private.bootstrap_members('owner@example.test', 'member@example.test')$$, 'repeated bootstrap remains idempotent after revocation');
select ok((select revoked_at is not null from private.garden_members where member_id=1), 'idempotence never undoes revocation');
rollback to revoked;

savepoint incomplete_live;
delete from private.garden_members where member_id=2;
set local role authenticated;
select is_empty('select * from public.current_member()', 'incomplete configuration revokes live access');
reset role;
rollback to incomplete_live;

savepoint changed_email;
update auth.users set email='new-owner@example.test' where id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select is_empty('select * from public.current_member()', 'changed user email cannot retain membership');
reset role;
rollback to changed_email;

savepoint unverified;
update auth.identities set identity_data = jsonb_set(identity_data, '{email_verified}', 'false') where provider_id='google-owner';
set local role authenticated;
select is_empty('select * from public.current_member()', 'unverified provider identity cannot authorize');
reset role;
rollback to unverified;

savepoint string_verification;
update auth.identities set identity_data = jsonb_set(identity_data, '{email_verified}', '"true"') where provider_id='google-owner';
set local role authenticated;
select is_empty('select * from public.current_member()', 'truthy verification string is not trusted boolean');
reset role;
rollback to string_verification;

savepoint changed_identity_email;
update auth.identities set identity_data = jsonb_set(identity_data, '{email}', '"other@example.test"') where provider_id='google-owner';
set local role authenticated;
select is_empty('select * from public.current_member()', 'changed provider email cannot authorize');
reset role;
rollback to changed_identity_email;

savepoint changed_subject;
update auth.identities set provider_id='google-replacement', identity_data=jsonb_set(identity_data, '{sub}', '"google-replacement"') where provider_id='google-owner';
set local role authenticated;
select is_empty('select * from public.current_member()', 'different Google subject cannot inherit member slot');
reset role;
rollback to changed_subject;

savepoint linked_identity;
insert into auth.identities (user_id, provider_id, provider, identity_data)
values ('11111111-1111-4111-8111-111111111111','email-owner','email','{"email":"owner@example.test","email_verified":true}');
set local role authenticated;
select is_empty('select * from public.current_member()', 'additional linked non-Google identity fails closed');
reset role;
rollback to linked_identity;

savepoint duplicate_google;
insert into auth.identities (user_id, provider_id, provider, identity_data)
values ('11111111-1111-4111-8111-111111111111','google-owner-second','google','{"sub":"google-owner-second","email":"owner@example.test","email_verified":true}');
set local role authenticated;
select is_empty('select * from public.current_member()', 'multiple Google identities cannot ambiguously authorize');
reset role;
rollback to duplicate_google;

savepoint banned;
update auth.users set banned_until=now()+interval '1 day' where id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select is_empty('select * from public.current_member()', 'banned user loses access before token expiry');
reset role;
rollback to banned;

savepoint deleted;
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
select ok((select user_id is not null from private.garden_members where member_id=1), 'deleted user retains reserved binding');
insert into auth.users (id,aud,role,email,email_confirmed_at,raw_app_meta_data)
values ('44444444-4444-4444-8444-444444444444','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}');
insert into auth.identities(user_id,provider_id,provider,identity_data)
values ('44444444-4444-4444-8444-444444444444','google-owner','google','{"sub":"google-owner","email":"owner@example.test","email_verified":true}');
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","amr":[{"method":"oauth"}]}',true);
set local role authenticated;
select is_empty('select * from public.current_member()', 'recreated auth user cannot silently inherit reserved member slot');
reset role;
rollback to deleted;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"password"}]}',true);
select is_empty('select * from public.current_member()', 'password session cannot reuse Google membership');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is_empty('select * from public.current_member()', 'missing authentication method fails closed');
reset role;

-- Bootstrap supports verified preexisting accounts, but never silently chooses
-- among duplicate/ambiguous identities or revives changed existing bindings.
savepoint existing;
delete from private.garden_members;
select lives_ok($$select private.bootstrap_members('owner@example.test','member@example.test')$$, 'privileged bootstrap binds verified existing Google accounts');
select results_eq('select user_id from private.garden_members order by member_id', $$values ('11111111-1111-4111-8111-111111111111'::uuid), ('22222222-2222-4222-8222-222222222222'::uuid)$$, 'existing account bindings preserve their actual Auth user IDs');
rollback to existing;

savepoint ambiguous;
delete from private.garden_members;
insert into auth.users(id,aud,role,email,is_sso_user,email_confirmed_at,raw_app_meta_data)
values('55555555-5555-4555-8555-555555555555','authenticated','authenticated','OWNER@example.test',true,now(),'{"provider":"google","providers":["google"]}');
select throws_ok($$select private.bootstrap_members('owner@example.test','member@example.test')$$, '22023', 'Existing identity is not an unambiguous verified Google account', 'case-normalized duplicate users stop bootstrap');
select is((select count(*) from private.garden_members), 0::bigint, 'failed bootstrap is atomic');
rollback to ambiguous;

savepoint existing_email;
delete from private.garden_members;
update auth.users set raw_app_meta_data='{"provider":"email","providers":["email"]}' where id='11111111-1111-4111-8111-111111111111';
select throws_ok($$select private.bootstrap_members('owner@example.test','member@example.test')$$, '22023', 'Existing identity is not an unambiguous verified Google account', 'existing email signup cannot be adopted as a Google member');
rollback to existing_email;

-- PUBLIC and platform-role grants must not turn internal routines into APIs.
select ok(not has_schema_privilege('authenticated','private','USAGE'), 'authenticated has no private schema access');
select ok(not has_schema_privilege('anon','private','USAGE'), 'anonymous has no private schema access');
select ok(not has_function_privilege('supabase_auth_admin','private.bootstrap_members(text,text)','EXECUTE'), 'Auth cannot modify private configuration');
select ok(not has_table_privilege('supabase_auth_admin','private.garden_members','UPDATE'), 'Auth cannot directly change membership');
select ok(not has_function_privilege('authenticated','private.garden_clock_at(timestamptz)','EXECUTE'), 'identity integration does not expose clock primitive');
select ok(relrowsecurity, 'allowlist has RLS enabled') from pg_class where oid='private.garden_members'::regclass;
select is_empty($$
 select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
 where p.oid in ('public.current_member()'::regprocedure,'public.is_garden_member()'::regprocedure,'public.before_user_created(jsonb)'::regprocedure,'private.bootstrap_members(text,text)'::regprocedure,'private.current_member_id()'::regprocedure,'private.is_owner()'::regprocedure,'private.require_member()'::regprocedure,'private.require_owner()'::regprocedure,'private.bind_google_identity()'::regprocedure)
 and acl.grantee=0 and acl.privilege_type='EXECUTE'
$$, 'PUBLIC has no implicit execution grants');

select * from finish();
rollback;
