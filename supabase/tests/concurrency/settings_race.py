#!/usr/bin/env python3
"""Actual overlapping member-preference sessions in an empty disposable local Supabase DB.

Synthetic fixtures only. Refuses populated domain/Auth tables. Observes real
lock waits and compares once-only results. Always reset this disposable project
afterward, even if interrupted.
"""
import argparse
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("container", nargs="?", default="supabase_db_shared-garden-tutorial35")
args = parser.parse_args()
if not args.container.startswith("supabase_db_"):
    parser.error("Only a local Supabase Docker database container is supported")


def command(app="settings_race_control"):
    return ["docker", "exec", "-i", "-e", f"PGAPPNAME={app}", args.container,
            "psql", "-XAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]


def sql(query):
    result = subprocess.run(command(), input=query, text=True, capture_output=True, timeout=30)
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
    raise AssertionError(f"Did not observe {app} in overlapping state: {condition}")


def signed(member):
    uid = "11111111-1111-4111-8111-111111111111" if member == 1 else "22222222-2222-4222-8222-222222222222"
    return "set local role authenticated;\nselect set_config('request.jwt.claims'," + \
        f"'{{\"sub\":\"{uid}\",\"role\":\"authenticated\",\"amr\":[{{\"method\":\"oauth\"}}]}}',true);\n"


def as_member(member, query):
    return sql("begin;" + signed(member) + query + ";commit;")


def overlap(first, second, error=None, first_member=1, second_member=2, hold=2):
    a = session("settings_race_a", "begin;\n" + signed(first_member) + first + f";\nselect pg_sleep({hold});\ncommit;\n")
    b = None
    try:
        wait_for("settings_race_a", "wait_event='PgSleep'")
        b = session("settings_race_b", "begin;\n" + signed(second_member) + second + ";\ncommit;\n")
        wait_for("settings_race_b", "wait_event_type='Lock'")
        out_a, err_a = a.communicate(timeout=15)
        out_b, err_b = b.communicate(timeout=15)
        assert a.returncode == 0, (out_a, err_a)
        if error:
            assert b.returncode != 0 and error in err_b, (out_b, err_b)
        else:
            assert b.returncode == 0, (out_b, err_b)
        return out_a, out_b
    finally:
        for process in (a, b):
            if process is not None and process.poll() is None:
                process.kill()
                process.communicate(timeout=10)


TABLES = ["private.member_settings", "private.private_interaction_delivery", "private.private_interaction_config", "public.private_interaction_signals", "private.garden_members", "auth.users", "public.garden", "public.flowers", "public.flower_entries"]
empty = "select " + "+".join(f"(select count(*) from {table})" for table in TABLES) + ";"
assert sql(empty) == "0", "Refusing configured database; reset the dedicated local project"
try:
    sql("""
    begin;
    select private.bootstrap_members('owner@example.test','member@example.test');
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
     ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
     ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}');
    insert into auth.identities(user_id,provider_id,provider,identity_data) values
     ('11111111-1111-4111-8111-111111111111','settings-owner','google','{"sub":"settings-owner","email":"owner@example.test","email_verified":true}'),
     ('22222222-2222-4222-8222-222222222222','settings-member','google','{"sub":"settings-member","email":"member@example.test","email_verified":true}');
    commit;
    """)
    overlap("select public.save_member_setting('{\"guide\":\"skipped\"}')", "select public.save_member_setting('{\"gentle_motion\":false}')", first_member=1, second_member=1)
    assert sql("select guide||':'||gentle_motion||':'||revision from private.member_settings where member_id=1") == "skipped:false:2"
    overlap("select public.save_member_setting('{\"guide\":\"open\"}')", "select public.save_member_setting('{\"guide\":\"finished\"}')", first_member=1, second_member=1)
    assert sql("select guide||':'||gentle_motion||':'||revision from private.member_settings where member_id=1") == "finished:false:4"
    # A privileged revocation commits while an already-authorized setter waits.
    holder = session("settings_revoke_holder", "begin;select pg_advisory_xact_lock(1936028775,1);update private.garden_members set revoked_at=now() where member_id=1;select pg_sleep(2);commit;")
    setter = None
    try:
        wait_for("settings_revoke_holder", "wait_event='PgSleep'")
        setter = session("settings_revoked_setter", "begin;" + signed(1) + "select public.save_member_setting('{\"gentle_motion\":true}');commit;")
        wait_for("settings_revoked_setter", "wait_event_type='Lock'")
        out, err = holder.communicate(timeout=10)
        assert holder.returncode == 0, (out, err)
        out, err = setter.communicate(timeout=10)
        assert setter.returncode != 0 and "Garden access denied" in err, (out, err)
        assert sql("select guide||':'||gentle_motion||':'||revision from private.member_settings where member_id=1") == "finished:false:4"
    finally:
        for process in [holder, setter]:
            if process is not None and process.poll() is None:
                process.kill(); process.communicate(timeout=10)
    assert sql("select count(*) from public.garden") == "0"
    print("PASS: observed same-member lock waits preserve different fields, serialize same-field saves, and deny revocation after waiting without creating gameplay")
finally:
    sql("begin;delete from private.member_settings;delete from private.garden_members;delete from auth.users where email in ('owner@example.test','member@example.test');commit;")
assert sql(empty) == "0"
print("PASS: own preference and synthetic Auth fixtures removed")
