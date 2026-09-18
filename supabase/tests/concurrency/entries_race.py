#!/usr/bin/env python3
"""Exercise real overlapping SQL sessions in a fresh disposable local container.

Requires Python 3 and Docker. No hosted connections, credentials, or extra Python
packages. Refuses a database with configured members, Auth users, or garden data.
Always reset the disposable database after running, including an interrupted run.
"""
import argparse
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("container", nargs="?", default="supabase_db_shared-garden-entries")
args = parser.parse_args()
if not args.container.startswith("supabase_db_"):
    parser.error("Only a local Supabase Docker database container is supported")


def command(app="entries_race_control"):
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
    a = session("entries_race_a", "begin;\n" + signed(1) + first + ";\nselect pg_sleep(2);\ncommit;\n")
    b = None
    try:
        wait_for("entries_race_a", "wait_event='PgSleep'")
        b = session("entries_race_b", "begin;\n" + signed(second_member) + second + ";\ncommit;\n")
        wait_for("entries_race_b", "wait_event_type='Lock'")
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
empty = "select (select count(*) from private.garden_members) + (select count(*) from auth.users) + (select count(*) from public.garden) + (select count(*) from public.flower_entries) + (select count(*) from public.daisy_assignments);"
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
    sql("begin;" + signed(1) + "select public.initialize_garden(); select public.plant_flower('rose'); commit;")
    rose = sql("select id from public.flowers where type_key='rose';")
    submit = f"select public.submit_flower_entry('{rose}','{{\"text\":\"Concurrent note\"}}')"
    overlap(submit, submit, error="Already submitted; edit the original entry", second_member=1)
    assert sql("select count(*) from public.flower_entries;") == "1"
    original = sql("select original_posted_at from public.flower_entries;")
    entry = sql("select id from public.flower_entries;")
    print("PASS: overlapping original submissions by one author produce exactly one immutable fact")

    edit = f"select public.edit_flower_entry({entry},'{{\"text\":\"Corrected note\"}}')"
    overlap(edit, submit)
    assert sql("select count(*)||'|'||count(distinct author_id) from public.flower_entries;") == "2|2"
    assert sql(f"select original_posted_at from public.flower_entries where id={entry};") == original
    assert sql("select sum(growth_units) from public.flowers;") == "0"
    print("PASS: overlapping author edit and partner submission preserve original time and exactly one pair, with no premature growth")

    overlap("select public.get_daily_daisy_question()", "select public.get_daily_daisy_question()")
    assert sql("select count(*)||'|'||min(question_id)||'|'||min(ordinal) from public.daisy_assignments;") == "1|light-001|1"
    print("PASS: overlapping Daisy reads wait and share one persistent assignment")

    # Force a real elapsed-time boundary while a request waits behind the garden
    # lock. This does not replace the production clock or expose any helper.
    sql(f"update public.flower_entries set original_posted_at=clock_timestamp()-interval '29 minutes 59 seconds', updated_at=clock_timestamp()-interval '29 minutes 59 seconds', garden_day=(select garden_day from private.garden_clock_at(clock_timestamp())) where id={entry};")
    overlap("select public.get_daily_daisy_question()", edit, error="The edit window has ended", second_member=1)
    assert sql(f"select payload->>'text' from public.flower_entries where id={entry};") == "Corrected note"
    print("PASS: queued edit uses post-lock clock and rejects a deadline expired while waiting")
finally:
    sql("""
    begin;
    delete from public.flower_entries;
    delete from public.daisy_assignments;
    delete from public.flowers;
    delete from public.flower_unlocks;
    delete from public.garden;
    delete from private.garden_members;
    delete from auth.users where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
    commit;
    """)
assert sql(empty) == "0"
print("PASS: synthetic identity and garden fixtures cleaned up")
