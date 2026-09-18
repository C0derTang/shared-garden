#!/usr/bin/env python3
"""Exercise real overlapping SQL sessions in a fresh disposable local container.

Requires Python 3 and Docker. No hosted connections, credentials, or extra Python
packages. Refuses a database with configured members, Auth users, or garden data.
Always reset the disposable database after running, including an interrupted run.
"""
import argparse
import re
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("container", nargs="?", default="supabase_db_shared-garden-media48")
args = parser.parse_args()
if not args.container.startswith("supabase_db_"):
    parser.error("Only a local Supabase Docker database container is supported")


def command(app="media_race_control"):
    return ["docker", "exec", "-i", "-e", f"PGAPPNAME={app}", args.container,
            "psql", "-XAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]


def sql(query):
    result = subprocess.run(command(), input=query, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def session(app, query):
    process = subprocess.Popen(command(app), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
    process.stdin.write(query)
    process.stdin.close()
    process.stdin = None
    return process


def wait_for(app, condition):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if sql(f"select exists(select 1 from pg_stat_activity where application_name='{app}' and {condition});") == "t":
            return
        time.sleep(0.05)
    raise AssertionError(f"Did not observe {app} in expected overlapping state: {condition}")


def signed(member):
    uid = "11111111-1111-4111-8111-111111111111" if member == 1 else "22222222-2222-4222-8222-222222222222"
    return "set local role authenticated;\nselect set_config('request.jwt.claims'," + \
        f"'{{\"sub\":\"{uid}\",\"role\":\"authenticated\",\"amr\":[{{\"method\":\"oauth\"}}]}}',true);\n"


def overlap(first, second, error=None, second_member=2):
    a = session("media_race_a", "begin;\n" + signed(1) + first + ";\nselect pg_sleep(2);\ncommit;\n")
    b = None
    try:
        wait_for("media_race_a", "wait_event='PgSleep'")
        b = session("media_race_b", "begin;\n" + signed(second_member) + second + ";\ncommit;\n")
        wait_for("media_race_b", "wait_event_type='Lock'")
        out_a, err_a = a.communicate(timeout=10)
        out_b, err_b = b.communicate(timeout=10)
        assert a.returncode == 0, (out_a, err_a)
        if error:
            assert b.returncode != 0 and error in err_b, (out_b, err_b)
        else:
            assert b.returncode == 0, (out_b, err_b)
    finally:
        for process in (a, b):
            if process is not None and process.poll() is None:
                process.kill()
                process.communicate(timeout=10)


# Refuse existing state: fixtures are never added to a real/configured garden.
empty = "select (select count(*) from public.flower_day_facts) + (select count(*) from public.before_noon_snapshots) + (select count(*) from public.peony_activity) + (select count(*) from public.garden_days) + (select count(*) from private.garden_members) + (select count(*) from auth.users) + (select count(*) from public.garden) + (select count(*) from public.flower_entries) + (select count(*) from public.daisy_assignments) + (select count(*) from private.media_uploads) + (select count(*) from storage.objects);"
assert sql(empty) == "0", "Refusing a configured database; reset the dedicated local project"
try:
    sql("""
    begin;
    select private.bootstrap_members('owner@example.test','member@example.test');
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
     ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
     ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}');
    insert into auth.identities(user_id,provider_id,provider,identity_data) values
     ('11111111-1111-4111-8111-111111111111','entry-owner','google','{"sub":"entry-owner","email":"owner@example.test","email_verified":true}'),
     ('22222222-2222-4222-8222-222222222222','entry-member','google','{"sub":"entry-member","email":"member@example.test","email_verified":true}');
    commit;
    """)
    sql("begin;" + signed(1) + "select public.initialize_garden(); commit;")
    sql("insert into public.flower_unlocks(type_key) values('sunflower');")
    sql("begin;" + signed(1) + "select public.plant_flower('sunflower'); commit;")
    flower = sql("select id from public.flowers where type_key='sunflower';")

    def intent(replacement="null"):
        return next(line for line in sql("begin;" + signed(1) + f"select public.create_media_upload(gen_random_uuid(),'{flower}','image/png',100,{replacement})->>'id'; commit;").splitlines() if re.fullmatch(r"[a-f0-9-]{36}", line))

    def ready(media):
        # This concurrency-only harness seeds synthetic trusted attestation;
        # actual bytes/Storage/attestation are covered by media-local.test.ts.
        sql(f"update private.media_uploads set status='ready',width=10,height=10,output_bytes=100,sha256=repeat('a',64) where id='{media}';")

    original = intent()
    claim = f"select public.claim_media_upload('{original}')"
    overlap(claim, claim, error="media_processing", second_member=1)
    assert sql(f"select status from private.media_uploads where id='{original}';") == "processing"
    print("PASS: observed overlapping claims serialize to a single processing lease")
    ready(original)
    submit = f"select public.submit_flower_entry('{flower}',jsonb_build_object('media_id','{original}'))"
    overlap(submit, submit, error="Already submitted; edit the original entry", second_member=1)
    assert sql("select count(*) from public.flower_entries;") == "1"
    assert sql(f"select status from private.media_uploads where id='{original}';") == "submitted"
    print("PASS: overlapping photo commits produce one entry and one consumed attachment")
    entry = sql("select id from public.flower_entries;")
    replacement = intent(entry)
    ready(replacement)
    sql(f"update public.flower_entries set original_posted_at=clock_timestamp()-interval '29 minutes 59 seconds',updated_at=clock_timestamp()-interval '29 minutes 59 seconds' where id={entry};")
    edit = f"select public.edit_flower_entry({entry},jsonb_build_object('media_id','{replacement}'))"
    overlap("select public.current_garden_state()", edit, error="The edit window has ended", second_member=1)
    assert sql(f"select payload->>'media_id' from public.flower_entries where id={entry};") == original
    assert sql(f"select status from private.media_uploads where id='{replacement}';") == "ready"
    print("PASS: replacement expiring during observed lock wait preserves original reference")
    # Revocation committed by an administrator while a member claim is queued
    # must be rechecked after obtaining the shared garden lock.
    pending = intent(entry)
    a = session("media_race_revoke", "begin; select 1 from public.garden where id=1 for update; update private.garden_members set revoked_at=clock_timestamp() where member_id=1; select pg_sleep(2); commit;")
    b = None
    try:
        wait_for("media_race_revoke", "wait_event='PgSleep'")
        b = session("media_race_revoked", "begin;" + signed(1) + f"select public.claim_media_upload('{pending}'); commit;")
        wait_for("media_race_revoked", "wait_event_type='Lock'")
        a.communicate(timeout=10)
        out, err = b.communicate(timeout=10)
        assert a.returncode == 0
        assert b.returncode != 0 and "Garden access denied" in err, (out, err)
        assert sql(f"select status from private.media_uploads where id='{pending}';") == "pending"
    finally:
        for process in (a, b):
            if process is not None and process.poll() is None:
                process.kill()
                process.communicate(timeout=10)
    print("PASS: revocation during observed lock wait denies validation claim")

finally:
    sql("""
    begin;
    delete from private.media_uploads;
    delete from public.flower_entries;
    delete from public.daisy_assignments;
    delete from public.flower_day_facts;
    delete from public.before_noon_snapshots;
    delete from public.peony_activity;
    delete from public.garden_days;
    delete from public.flowers;
    delete from public.flower_unlocks;
    delete from public.garden;
    delete from private.garden_members;
    delete from auth.users where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
    commit;
    """)
assert sql(empty) == "0"
print("PASS: synthetic identity and garden fixtures cleaned up")
