begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
set local timezone = 'UTC';
select no_plan();

select has_function('private', 'garden_clock_at', array['timestamp with time zone'],
  'the internal clock accepts an explicit instant');

-- Literal UTC expectations detect fixed offsets, 24-hour arithmetic, and
-- off-by-one boundaries without reproducing the implementation in the tests.
create temporary table clock_cases (
  label text,
  instant timestamptz,
  garden_day date,
  day_starts_at timestamptz,
  next_rollover_at timestamptz,
  moonflower_open boolean
);
insert into clock_cases values
  ('summer: just before rollover', '2026-09-18T10:59:59Z', '2026-09-17', '2026-09-17T11:00:00Z', '2026-09-18T11:00:00Z', true),
  ('summer: at rollover', '2026-09-18T11:00:00Z', '2026-09-18', '2026-09-18T11:00:00Z', '2026-09-19T11:00:00Z', false),
  ('Moonflower: just before 10 p.m.', '2026-09-19T04:59:59Z', '2026-09-18', '2026-09-18T11:00:00Z', '2026-09-19T11:00:00Z', false),
  ('Moonflower: at 10 p.m.', '2026-09-19T05:00:00Z', '2026-09-18', '2026-09-18T11:00:00Z', '2026-09-19T11:00:00Z', true),
  ('spring: day starts before DST', '2026-03-07T12:00:00Z', '2026-03-07', '2026-03-07T12:00:00Z', '2026-03-08T11:00:00Z', false),
  ('spring: just before clock jump', '2026-03-08T09:59:59Z', '2026-03-07', '2026-03-07T12:00:00Z', '2026-03-08T11:00:00Z', true),
  ('spring: just after clock jump', '2026-03-08T10:00:00Z', '2026-03-07', '2026-03-07T12:00:00Z', '2026-03-08T11:00:00Z', true),
  ('spring: rollover after clock jump', '2026-03-08T11:00:00Z', '2026-03-08', '2026-03-08T11:00:00Z', '2026-03-09T11:00:00Z', false),
  ('fall: day starts before DST ends', '2026-10-31T11:00:00Z', '2026-10-31', '2026-10-31T11:00:00Z', '2026-11-01T12:00:00Z', false),
  ('fall: first 1:30 a.m.', '2026-11-01T08:30:00Z', '2026-10-31', '2026-10-31T11:00:00Z', '2026-11-01T12:00:00Z', true),
  ('fall: second 1:30 a.m.', '2026-11-01T09:30:00Z', '2026-10-31', '2026-10-31T11:00:00Z', '2026-11-01T12:00:00Z', true),
  ('fall: rollover after repeated hour', '2026-11-01T12:00:00Z', '2026-11-01', '2026-11-01T12:00:00Z', '2026-11-02T12:00:00Z', false),
  ('winter: just before rollover', '2026-01-15T11:59:59Z', '2026-01-14', '2026-01-14T12:00:00Z', '2026-01-15T12:00:00Z', true),
  ('winter: at rollover', '2026-01-15T12:00:00Z', '2026-01-15', '2026-01-15T12:00:00Z', '2026-01-16T12:00:00Z', false),
  ('month: before first rollover', '2026-05-01T10:59:59Z', '2026-04-30', '2026-04-30T11:00:00Z', '2026-05-01T11:00:00Z', true),
  ('year: before first rollover', '2027-01-01T11:59:59Z', '2026-12-31', '2026-12-31T12:00:00Z', '2027-01-01T12:00:00Z', true),
  ('year: at first rollover', '2027-01-01T12:00:00Z', '2027-01-01', '2027-01-01T12:00:00Z', '2027-01-02T12:00:00Z', false);

select results_eq(
  format('select * from private.garden_clock_at(%L::timestamptz)', instant),
  format('select %L::date, %L::timestamptz, %L::timestamptz, %L::boolean',
    garden_day, day_starts_at, next_rollover_at, moonflower_open),
  label
) from clock_cases;

select is(next_rollover_at - day_starts_at, interval '23 hours',
  'spring garden day is 23 hours')
from private.garden_clock_at('2026-03-07T12:00:00Z');
select is(next_rollover_at - day_starts_at, interval '25 hours',
  'fall garden day is 25 hours')
from private.garden_clock_at('2026-10-31T11:00:00Z');
select is_empty('select * from private.garden_clock_at(null::timestamptz)',
  'null input returns no row');

-- Repeat identical instants/expectations with a very different session zone.
set local timezone = 'Asia/Tokyo';
select results_eq(
  format('select * from private.garden_clock_at(%L::timestamptz)', instant),
  format('select %L::date, %L::timestamptz, %L::timestamptz, %L::boolean',
    garden_day, day_starts_at, next_rollover_at, moonflower_open),
  'session timezone independent: ' || label
) from clock_cases;

select ok(proisstrict, 'function is STRICT')
from pg_proc where oid = 'private.garden_clock_at(timestamptz)'::regprocedure;
select ok(not prosecdef, 'function runs with invoker permissions')
from pg_proc where oid = 'private.garden_clock_at(timestamptz)'::regprocedure;
select ok(proconfig @> array['search_path=pg_catalog'],
  'function controls its search path')
from pg_proc where oid = 'private.garden_clock_at(timestamptz)'::regprocedure;

-- PUBLIC is a pseudo-role: inspect its ACLs and exercise an unprivileged role
-- with no application grants/memberships to catch accidental PUBLIC access.
select is_empty($$
  select 1 from pg_namespace,
    lateral aclexplode(coalesce(nspacl, acldefault('n', nspowner))) acl
  where nspname = 'private' and acl.grantee = 0
    and acl.privilege_type = 'USAGE'
$$, 'PUBLIC has no private schema usage');
select is_empty($$
  select 1 from pg_proc,
    lateral aclexplode(coalesce(proacl, acldefault('f', proowner))) acl
  where oid = 'private.garden_clock_at(timestamptz)'::regprocedure
    and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
$$, 'PUBLIC has no clock execution privilege');
select ok(not has_schema_privilege(role_name, 'private', 'USAGE'),
  role_name || ' has no private schema usage')
from (values ('anon'), ('authenticated')) roles(role_name);
select ok(not has_function_privilege(role_name,
  'private.garden_clock_at(timestamptz)', 'EXECUTE'),
  role_name || ' has no clock execution privilege')
from (values ('anon'), ('authenticated')) roles(role_name);

create role garden_clock_public_probe nologin;
-- Supabase postgres is not a superuser; allow the test runner to SET ROLE.
grant garden_clock_public_probe to postgres;
-- Only test-harness access, never private-schema or clock access.
grant usage on schema extensions to garden_clock_public_probe;
set local role garden_clock_public_probe;
select throws_ok($$select * from private.garden_clock_at('2026-09-18T11:00:00Z')$$,
  '42501', 'permission denied for schema private',
  'role with only PUBLIC application privileges cannot call the clock');
reset role;
set local role anon;
select throws_ok($$select * from private.garden_clock_at('2026-09-18T11:00:00Z')$$,
  '42501', 'permission denied for schema private',
  'anon cannot call the clock');
reset role;
set local role authenticated;
select throws_ok($$select * from private.garden_clock_at('2026-09-18T11:00:00Z')$$,
  '42501', 'permission denied for schema private',
  'authenticated cannot call the clock');
reset role;

select * from finish();
rollback;
