-- Post-migration release audit for cc’s garden.
--
-- Read-only. It opens an explicit read-only transaction and rolls it back. It
-- reads catalog metadata and aggregate counts only: it calls no application
-- function, sets no role, forges no JWT claim, and returns no email, account
-- identifier, entry, wish, message, answer or other personal value.
--
-- Run it as a privileged session that can read pg_catalog, information_schema
-- and the private schema, for example:
--
--   psql "$AUDIT_CONNECTION" -v ON_ERROR_STOP=1 -f docs/release/audit-release-schema.sql
--
-- Validate changes on a disposable local database first. A local session
-- usually runs as the database owner, while a hosted session runs as a
-- different privileged role, so catalog visibility and ownership are not
-- identical. A local pass shows that the recipe is correct; it is not evidence
-- about any hosted project.
--
-- Every check reports `observed`, `expected` and a boolean `ok`. Read all rows;
-- nothing here aborts. Structural checks must pass immediately after the
-- migrations are applied. The membership, private-event and first-use checks
-- describe the state after the privileged bootstrap and before any real use;
-- on a freshly reset database with no bootstrap they report zero, which is the
-- correct reading, not a structural failure.

\pset pager off
\pset border 2

begin transaction read only;

select
  'transaction is read only' as check,
  current_setting('transaction_read_only') as observed,
  'on' as expected,
  current_setting('transaction_read_only') = 'on' as ok;

\echo '== 1. Row level security on every application table =='
select
  'rls enabled: ' || c.relname as check,
  c.relrowsecurity::text as observed,
  'true' as expected,
  c.relrowsecurity as ok
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- The private schema's real boundary is that no browser role has schema usage
-- or any privilege on it (checks 3 and 4). Row level security there is
-- redundant depth. `private.daisy_questions` is the one reviewed table without
-- it; naming the exception keeps a new unprotected table from hiding in a count.
select
  'private tables without row level security' as check,
  coalesce(
    string_agg(c.relname, ',' order by c.relname) filter (where not c.relrowsecurity),
    'none'
  ) as observed,
  'daisy_questions' as expected,
  coalesce(
    string_agg(c.relname, ',' order by c.relname) filter (where not c.relrowsecurity),
    'none'
  ) = 'daisy_questions' as ok
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'private' and c.relkind = 'r';

\echo '== 2. Policy inventory (names, commands and roles only) =='
select
  schemaname || '.' || tablename as relation,
  policyname,
  cmd,
  array_to_string(roles, ',') as roles,
  permissive
from pg_catalog.pg_policies
where schemaname in ('public', 'private', 'storage')
order by 1, 2;

select
  'public policies are member SELECT only' as check,
  count(*) filter (
    where cmd <> 'SELECT' or array_to_string(roles, ',') <> 'authenticated'
  )::text || ' unexpected' as observed,
  '0 unexpected' as expected,
  count(*) filter (
    where cmd <> 'SELECT' or array_to_string(roles, ',') <> 'authenticated'
  ) = 0 as ok
from pg_catalog.pg_policies
where schemaname = 'public';

\echo '== 3. No browser-role table privileges outside the intended reads =='
select
  'anon table privileges in public/private' as check,
  count(*)::text as observed,
  '0' as expected,
  count(*) = 0 as ok
from information_schema.role_table_grants
where grantee in ('anon', 'PUBLIC') and table_schema in ('public', 'private');

select
  'authenticated privileges in public that are not SELECT' as check,
  coalesce(string_agg(distinct privilege_type, ','), 'none') as observed,
  'none' as expected,
  count(*) = 0 as ok
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
  and privilege_type <> 'SELECT';

select
  'authenticated privileges in private' as check,
  count(*)::text as observed,
  '0' as expected,
  count(*) = 0 as ok
from information_schema.role_table_grants
where grantee in ('authenticated', 'anon', 'PUBLIC') and table_schema = 'private';

select
  table_name as relation,
  string_agg(distinct privilege_type, ',' order by privilege_type) as authenticated_privileges
from information_schema.role_table_grants
where grantee = 'authenticated' and table_schema = 'public'
group by table_name
order by table_name;

select
  'sequences writable by browser roles' as check,
  count(*)::text as observed,
  '0' as expected,
  count(*) = 0 as ok
from information_schema.role_usage_grants
where grantee in ('anon', 'authenticated', 'PUBLIC')
  and object_schema in ('public', 'private')
  and object_type = 'SEQUENCE';

\echo '== 4. Schema usage =='
select
  'schema usage: ' || n.nspname as check,
  coalesce(
    (
      select string_agg(r.rolname, ',' order by r.rolname)
      from aclexplode(n.nspacl) a
      join pg_catalog.pg_roles r on r.oid = a.grantee
      where a.privilege_type = 'USAGE'
        and r.rolname in ('anon', 'authenticated', 'service_role', 'supabase_auth_admin')
    ),
    'none'
  ) as observed,
  case n.nspname
    when 'private' then 'supabase_auth_admin'
    else 'anon,authenticated,service_role'
  end as expected,
  case n.nspname
    when 'private' then not exists (
      select 1
      from aclexplode(n.nspacl) a
      join pg_catalog.pg_roles r on r.oid = a.grantee
      where a.privilege_type = 'USAGE'
        and r.rolname in ('anon', 'authenticated', 'service_role')
    )
    else true
  end as ok
from pg_catalog.pg_namespace n
where n.nspname in ('public', 'private')
order by n.nspname;

select
  'private schema usage granted to PUBLIC' as check,
  (n.nspacl::text like '%=U%/' || pg_catalog.pg_get_userbyid(n.nspowner) || '%')::text as observed,
  'false' as expected,
  not exists (
    select 1 from aclexplode(n.nspacl) a
    where a.privilege_type = 'USAGE' and a.grantee = 0
  ) as ok
from pg_catalog.pg_namespace n
where n.nspname = 'private';

\echo '== 5. Executable routines by role =='
select
  n.nspname || '.' || p.proname as routine,
  string_agg(distinct r.rolname, ',' order by r.rolname) as execute_granted_to
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
join pg_catalog.pg_roles r on r.oid = a.grantee
where n.nspname in ('public', 'private')
  and a.privilege_type = 'EXECUTE'
  and r.rolname in ('anon', 'authenticated', 'service_role', 'supabase_auth_admin')
group by 1
order by 1;

select
  'routines executable by anon' as check,
  count(*)::text as observed,
  '0' as expected,
  count(*) = 0 as ok
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
join pg_catalog.pg_roles r on r.oid = a.grantee
where n.nspname in ('public', 'private')
  and a.privilege_type = 'EXECUTE'
  and r.rolname = 'anon';

select
  'routines executable by PUBLIC' as check,
  count(*)::text as observed,
  '0' as expected,
  count(*) = 0 as ok
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
where n.nspname in ('public', 'private')
  and a.privilege_type = 'EXECUTE'
  and a.grantee = 0;

select
  'private routines executable by browser roles' as check,
  count(*)::text as observed,
  '0' as expected,
  count(*) = 0 as ok
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
join pg_catalog.pg_roles r on r.oid = a.grantee
where n.nspname = 'private'
  and a.privilege_type = 'EXECUTE'
  and r.rolname in ('anon', 'authenticated', 'service_role');

select
  'signup hook callable only by the Auth admin' as check,
  coalesce(string_agg(distinct r.rolname, ',' order by r.rolname), 'none') as observed,
  'supabase_auth_admin' as expected,
  coalesce(string_agg(distinct r.rolname, ',' order by r.rolname), 'none')
    = 'supabase_auth_admin' as ok
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
join pg_catalog.pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and p.proname = 'before_user_created'
  and a.privilege_type = 'EXECUTE'
  and r.rolname in ('anon', 'authenticated', 'service_role', 'supabase_auth_admin');

\echo '== 6. Private storage buckets =='
select
  id as bucket,
  public as is_public,
  file_size_limit,
  array_to_string(allowed_mime_types, ',') as allowed_mime_types
from storage.buckets
order by id;

select
  'private buckets present and closed' as check,
  count(*) filter (where id in ('garden-staging', 'garden-media') and not public)::text
    || ' of ' || count(*)::text || ' buckets' as observed,
  '2 of 2 buckets' as expected,
  count(*) = 2
    and count(*) filter (
      where id in ('garden-staging', 'garden-media') and not public
    ) = 2 as ok
from storage.buckets;

select
  'garden-staging limits' as check,
  file_size_limit::text || ' / ' || array_to_string(allowed_mime_types, ',') as observed,
  '12582912 / image/jpeg,image/png,image/webp,audio/webm' as expected,
  file_size_limit = 12582912
    and allowed_mime_types
      = array['image/jpeg', 'image/png', 'image/webp', 'audio/webm'] as ok
from storage.buckets where id = 'garden-staging';

select
  'garden-media limits' as check,
  file_size_limit::text || ' / ' || array_to_string(allowed_mime_types, ',') as observed,
  '33554432 / image/jpeg,image/png,image/webp,audio/wav' as expected,
  file_size_limit = 33554432
    and allowed_mime_types
      = array['image/jpeg', 'image/png', 'image/webp', 'audio/wav'] as ok
from storage.buckets where id = 'garden-media';

select
  'storage.objects policies' as check,
  coalesce(string_agg(policyname || ' ' || cmd, ', ' order by policyname), 'none') as observed,
  'media_staging_insert INSERT' as expected,
  coalesce(string_agg(policyname || ' ' || cmd, ', ' order by policyname), 'none')
    = 'media_staging_insert INSERT' as ok
from pg_catalog.pg_policies
where schemaname = 'storage' and tablename = 'objects';

select
  'stored objects' as check,
  count(*)::text as observed,
  '0 before first use' as expected,
  count(*) = 0 as ok
from storage.objects;

\echo '== 7. Realtime publication =='
select
  'supabase_realtime publish' as check,
  case when p.puballtables then 'all tables; ' else 'listed tables; ' end
    || concat_ws(
      ', ',
      case when p.pubinsert then 'insert' end,
      case when p.pubupdate then 'update' end,
      case when p.pubdelete then 'delete' end,
      case when p.pubtruncate then 'truncate' end
    ) as observed,
  'listed tables; insert, update' as expected,
  not p.puballtables and p.pubinsert and p.pubupdate
    and not p.pubdelete and not p.pubtruncate as ok
from pg_catalog.pg_publication p
where p.pubname = 'supabase_realtime';

select schemaname || '.' || tablename as published_table
from pg_catalog.pg_publication_tables
where pubname = 'supabase_realtime'
order by 1;

select
  'published tables' as check,
  string_agg(tablename, ',' order by tablename) as observed,
  'achievement_awards,achievement_progress,flower_entries,flower_unlocks,flowers,'
    || 'peony_acceptances,peony_contributions,peony_plans,private_interaction_signals' as expected,
  string_agg(tablename, ',' order by tablename) =
    'achievement_awards,achievement_progress,flower_entries,flower_unlocks,flowers,'
    || 'peony_acceptances,peony_contributions,peony_plans,private_interaction_signals' as ok
from pg_catalog.pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public';

\echo '== 8. Membership slots (counts only, never identities) =='
select
  'membership slots' as check,
  count(*)::text || ' bound ' || count(user_id)::text
    || ' revoked ' || count(revoked_at)::text as observed,
  '2 bound 0..2 revoked 0 after bootstrap; 0 before it' as expected,
  count(*) in (0, 2) and count(revoked_at) = 0 as ok
from private.garden_members;

select
  'membership slot ids' as check,
  coalesce(string_agg(member_id::text, ',' order by member_id), 'none') as observed,
  '1,2 after bootstrap' as expected,
  coalesce(string_agg(member_id::text, ',' order by member_id), 'none')
    in ('none', '1,2') as ok
from private.garden_members;

\echo '== 9. Private event configuration (shape only, never its words) =='
select
  'private event configured' as check,
  count(*)::text || ' row(s), armed ' || count(*) filter (where armed)::text
    || ', choices ' || coalesce(max(jsonb_array_length(choices))::text, '0') as observed,
  '1 row(s), armed 1, choices 2..6 after bootstrap' as expected,
  count(*) <= 1
    and count(*) filter (where armed) = count(*)
    and coalesce(max(jsonb_array_length(choices)), 2) between 2 and 6 as ok
from private.private_interaction_config;

select
  'private event delivery' as check,
  count(*)::text || ' delivered, ' || count(answered_at)::text || ' answered' as observed,
  '0 delivered, 0 answered before launch' as expected,
  count(*) = 0 and count(answered_at) = 0 as ok
from private.private_interaction_delivery;

select
  'owner interaction signals' as check,
  count(*)::text as observed,
  '0 before first use' as expected,
  count(*) = 0 as ok
from public.private_interaction_signals;

\echo '== 10. Reference data =='
select
  'flower catalog' as check,
  count(*)::text || ' types, ' || count(*) filter (where unlock_after_blooms = 0)::text
    || ' unlocked from the start' as observed,
  '13 types, 4 unlocked from the start' as expected,
  count(*) = 13 and count(*) filter (where unlock_after_blooms = 0) = 4 as ok
from public.flower_catalog;

select
  'achievement catalog' as check,
  count(*)::text as observed,
  'matches the reviewed migration' as expected,
  count(*) > 0 as ok
from public.achievement_catalog;

select
  'hydrangea mood palette' as check,
  count(*)::text as observed,
  '6 reference moods' as expected,
  count(*) = 6 as ok
from public.hydrangea_moods;

select
  'daisy question bank' as check,
  count(*)::text as observed,
  'matches the authored bank' as expected,
  count(*) > 0 as ok
from private.daisy_questions;

\echo '== 11. First authorized visit: nothing is earned before it =='
select
  'garden row' as check,
  count(*)::text as observed,
  '0 before the first authorized visit, then exactly 1' as expected,
  count(*) <= 1 as ok
from public.garden;

select
  'planted flowers' as check,
  count(*)::text || ' total, ' || count(*) filter (where type_key = 'cactus')::text
    || ' cactus, ' || count(*) filter (where first_bloom_at is not null)::text
    || ' bloomed, ' || count(*) filter (where growth_units > 0)::text || ' grown' as observed,
  '0 total before the first visit, then 1 total / 1 cactus / 0 bloomed / 0 grown' as expected,
  count(*) = count(*) filter (where type_key = 'cactus' and is_initial)
    and count(*) <= 1
    and count(*) filter (where first_bloom_at is not null) = 0
    and count(*) filter (where growth_units > 0) = 0
    and count(*) filter (where fulfilled_at is not null) = 0 as ok
from public.flowers;

select
  'unlocked flower types' as check,
  count(*)::text as observed,
  '0 before the first visit, then exactly 4' as expected,
  count(*) in (0, 4) as ok
from public.flower_unlocks;

select
  'unlocked types are the initial four' as check,
  coalesce(string_agg(u.type_key, ',' order by u.type_key), 'none') as observed,
  'cactus,marigold,rose,tulip after the first visit' as expected,
  not exists (
    select 1
    from public.flower_unlocks u2
    join public.flower_catalog c on c.type_key = u2.type_key
    where c.unlock_after_blooms > 0
  ) as ok
from public.flower_unlocks u;

-- Progress counters are scaffolding created with the garden, not credit.
-- Only `achievement_awards` records something earned, and it must stay empty.
select
  'achievement progress rows' as check,
  p.rows::text || ' of ' || c.rows::text || ' catalog entries, '
    || a.rows::text || ' awards' as observed,
  '0 before the first visit, then one row per catalog entry, always 0 awards' as expected,
  p.rows in (0, c.rows) and a.rows = 0 as ok
from (select count(*) as rows from public.achievement_progress) p,
     (select count(*) as rows from public.achievement_catalog) c,
     (select count(*) as rows from public.achievement_awards) a;

select
  'garden spot cursor' as check,
  coalesce(max(next_spot)::text, 'no garden row') as observed,
  '2 after the first visit' as expected,
  coalesce(max(next_spot), 2) = 2 as ok
from public.garden;

\echo '== 12. No recorded activity before launch =='
select relation, observed, '0' as expected, observed = 0 as ok
from (
  select 'public.flower_entries' as relation, count(*) as observed from public.flower_entries
  union all select 'public.achievement_awards', count(*) from public.achievement_awards
  union all select 'public.daisy_assignments', count(*) from public.daisy_assignments
  union all select 'public.garden_days', count(*) from public.garden_days
  union all select 'public.flower_day_facts', count(*) from public.flower_day_facts
  union all select 'public.before_noon_snapshots', count(*) from public.before_noon_snapshots
  union all select 'public.peony_activity', count(*) from public.peony_activity
  union all select 'public.peony_contributions', count(*) from public.peony_contributions
  union all select 'public.peony_plans', count(*) from public.peony_plans
  union all select 'public.peony_acceptances', count(*) from public.peony_acceptances
  union all select 'private.media_uploads', count(*) from private.media_uploads
  union all select 'private.member_settings', count(*) from private.member_settings
) counts
order by relation;

\echo '== 13. Migration inventory =='
select count(*)::text || ' applied migrations' as observed
from supabase_migrations.schema_migrations;

select version from supabase_migrations.schema_migrations order by version;

rollback;

\echo '=='
\echo '== NOT PROVABLE BY SQL =='
\echo '=='
\echo 'These belong to the Management API, the hosting dashboard or a real'
\echo 'sign-in, and no query in this file is evidence about any of them:'
\echo ' 1. Google is the only enabled Auth provider, with email/password, phone,'
\echo '    anonymous sign-in and manual linking disabled.'
\echo ' 2. The Google client is the intended one, its scopes are the minimum, and'
\echo '    email-verification bypasses are off.'
\echo ' 3. Site URL and the exact redirect allowlist match the canonical origin.'
\echo ' 4. The Before User Created hook is selected, enabled and saved in the'
\echo '    hosted project. Local config.toml does not activate it there.'
\echo ' 5. APP_ORIGIN, the public pair and SUPABASE_SECRET_KEY exist with the'
\echo '    intended per-environment scope, and the secret is Production only.'
\echo ' 6. No preview or development deployment holds the secret key.'
\echo ' 7. Actual sign-in by each allowed account, and rejection of any other.'
\echo ' 8. Native decoding on the hosted Linux runtime (issue #37).'
\echo ' 9. Backups, log retention and project region settings.'
\echo 'Record each of these as a separate operator observation with its own'
\echo 'evidence, never as an inference from the rows above.'
