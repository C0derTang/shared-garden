-- Exact application function inventory and role surface; extension functions are
-- platform-owned and excluded. New application routines require an explicit
-- decision about their caller, including private helpers with no API caller.
begin;
select plan(8);

create temporary table expected_function_grants (
  signature text primary key,
  caller text
);
insert into expected_function_grants values
  ('private.all_ordinary_achievements_complete()', null),
  ('private.assign_daisy_question(date,timestamptz)', null),
  ('private.begin_garden_operation()', null),
  ('private.bind_google_identity()', null),
  ('private.bootstrap_members(text,text)', null),
  ('private.bootstrap_private_interaction(smallint,text,text,jsonb)', null),
  ('private.capture_noon_snapshot(date)', null),
  ('private.complete_peony_milestone(uuid,integer,timestamptz)', null),
  ('private.current_member_id()', null),
  ('private.ensure_garden()', null),
  ('private.entry_state_at(uuid,smallint,timestamptz)', null),
  ('private.evaluate_achievements(timestamptz)', null),
  ('private.garden_clock_at(timestamptz)', null),
  ('private.google_account(uuid,boolean)', null),
  ('private.guard_media_entry()', null),
  ('private.is_owner()', null),
  ('private.media_upload_json(private.media_uploads)', null),
  ('private.peony_state_at(uuid,smallint,timestamptz)', null),
  ('private.plant_flower(text,text,numeric,boolean)', null),
  ('private.record_first_bloom(uuid,date)', null),
  ('private.record_first_bloom_at(uuid,date,timestamptz)', null),
  ('private.record_peony_activity(uuid,smallint,timestamptz,timestamptz,timestamptz)', null),
  ('private.require_member()', null),
  ('private.require_owner()', null),
  ('private.require_peony_milestone(uuid,integer)', null),
  ('private.settle_garden_at(timestamptz)', null),
  ('private.valid_interaction_choices(jsonb)', null),
  ('private.validate_entry_payload(text,jsonb,date)', null),
  ('private.validate_nonmedia_entry_payload(text,jsonb,date)', null),
  ('private.validate_peony_payload(integer,jsonb)', null),
  ('public.accept_peony_plan(uuid,bigint)', 'authenticated'),
  ('public.answer_private_interaction(text)', 'authenticated'),
  ('public.attest_audio_upload(uuid,uuid,integer,integer,integer,text)', 'service_role'),
  ('public.attest_media_upload(uuid,uuid,integer,integer,integer,text)', 'service_role'),
  ('public.before_user_created(jsonb)', 'supabase_auth_admin'),
  ('public.claim_media_upload(uuid)', 'authenticated'),
  ('public.create_media_upload(uuid,uuid,text,integer,bigint)', 'authenticated'),
  ('public.current_achievements()', 'authenticated'),
  ('public.current_entry_state(uuid)', 'authenticated'),
  ('public.current_garden_state()', 'authenticated'),
  ('public.current_member()', 'authenticated'),
  ('public.current_member_settings()', 'authenticated'),
  ('public.current_peony_state(uuid)', 'authenticated'),
  ('public.current_private_interaction()', 'authenticated'),
  ('public.edit_flower_entry(bigint,jsonb)', 'authenticated'),
  ('public.edit_peony_contribution(bigint,jsonb)', 'authenticated'),
  ('public.entry_history(uuid,integer,bigint)', 'authenticated'),
  ('public.fulfill_dandelion(uuid)', 'authenticated'),
  ('public.get_daily_daisy_question()', 'authenticated'),
  ('public.initialize_garden()', 'authenticated'),
  ('public.is_garden_member()', 'authenticated'),
  ('public.media_cleanup_candidates()', 'service_role'),
  ('public.media_cleanup_done(uuid,boolean,boolean)', 'service_role'),
  ('public.media_read_path(uuid)', 'authenticated'),
  ('public.media_upload_allowed(text)', 'authenticated'),
  ('public.media_upload_state(uuid)', 'authenticated'),
  ('public.memories_page(text,jsonb,text[],text,integer,date,date)', 'authenticated'),
  ('public.owner_private_interaction(text,boolean)', 'authenticated'),
  ('public.plant_flower(text,text)', 'authenticated'),
  ('public.plant_flower_at(text,numeric,text)', 'authenticated'),
  ('public.save_member_setting(jsonb)', 'authenticated'),
  ('public.set_peony_plan(uuid,bigint,text,text)', 'authenticated'),
  ('public.submit_flower_entry(uuid,jsonb)', 'authenticated'),
  ('public.submit_peony_contribution(uuid,integer,jsonb)', 'authenticated');

create temporary view application_functions as
select p.oid, p.proowner, p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_proc'::regclass and d.objid = p.oid
      and d.deptype = 'e'
  );

select results_eq(
  'select oid::regprocedure::text from application_functions order by 1',
  'select to_regprocedure(signature)::text from expected_function_grants order by 1',
  'every application function has an explicit expected caller, including helpers'
);

select is_empty($$
  select p.oid::regprocedure::text
  from application_functions p,
    lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where a.grantee = 0 and a.privilege_type = 'EXECUTE'
$$, 'PUBLIC has no application function execution');

select is_empty($$
  select oid::regprocedure::text from application_functions
  where has_function_privilege('anon', oid, 'EXECUTE')
$$, 'anonymous callers have no application function execution');

select results_eq(
  $$select oid::regprocedure::text from application_functions
    where has_function_privilege('authenticated', oid, 'EXECUTE') order by 1$$,
  $$select to_regprocedure(signature)::text from expected_function_grants
    where caller = 'authenticated' order by 1$$,
  'authenticated has exactly its approved execution surface'
);

select results_eq(
  $$select oid::regprocedure::text from application_functions
    where has_function_privilege('service_role', oid, 'EXECUTE') order by 1$$,
  $$select to_regprocedure(signature)::text from expected_function_grants
    where caller = 'service_role' order by 1$$,
  'service_role has exactly its approved execution surface'
);

select results_eq(
  $$select oid::regprocedure::text from application_functions
    where has_function_privilege('supabase_auth_admin', oid, 'EXECUTE') order by 1$$,
  $$select to_regprocedure(signature)::text from expected_function_grants
    where caller = 'supabase_auth_admin' order by 1$$,
  'supabase_auth_admin has exactly its approved execution surface'
);

select is_empty($$
  select p.oid::regprocedure::text, r.rolname
  from application_functions p
  cross join pg_roles r
  where r.rolname in ('anon', 'authenticated', 'service_role', 'supabase_auth_admin')
    and has_function_privilege(r.oid, p.oid, 'EXECUTE WITH GRANT OPTION')
$$, 'application callers cannot delegate function execution');

select is_empty($$
  select p.oid::regprocedure::text, a.grantee
  from application_functions p
  join expected_function_grants e on to_regprocedure(e.signature) = p.oid
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where a.grantee <> p.proowner
    and a.grantee is distinct from (select oid from pg_roles where rolname = e.caller)
$$, 'no other role receives a direct application function grant');

select * from finish();
rollback;
