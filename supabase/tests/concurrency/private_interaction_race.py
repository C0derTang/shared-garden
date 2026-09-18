#!/usr/bin/env python3
"""Actual overlapping private-interaction sessions in an empty disposable local Supabase DB.

Synthetic fixtures only. Refuses populated domain/Auth tables. Observes real
lock waits and compares once-only results. Always reset this disposable project
afterward, even if interrupted.
"""
import argparse
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("container", nargs="?", default="supabase_db_shared-garden-private-event36")
args = parser.parse_args()
if not args.container.startswith("supabase_db_"):
    parser.error("Only a local Supabase Docker database container is supported")


def command(app="interaction_race_control"):
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
    a = session("interaction_race_a", "begin;\n" + signed(first_member) + first + f";\nselect pg_sleep({hold});\ncommit;\n")
    b = None
    try:
        wait_for("interaction_race_a", "wait_event='PgSleep'")
        b = session("interaction_race_b", "begin;\n" + signed(second_member) + second + ";\ncommit;\n")
        wait_for("interaction_race_b", "wait_event_type='Lock'")
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


DOMAIN = ["achievement_awards", "achievement_progress", "peony_acceptances", "peony_plans", "peony_contributions", "flower_day_facts",
          "before_noon_snapshots", "peony_activity", "garden_days", "flower_entries",
          "daisy_assignments", "flowers", "flower_unlocks", "garden"]
PRIVATE = ["private.private_interaction_delivery", "private.private_interaction_config", "public.private_interaction_signals"]
TABLES = PRIVATE + ["private.garden_members", "auth.users"] + ["public." + table for table in DOMAIN]
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
     ('11111111-1111-4111-8111-111111111111','interaction-owner','google','{"sub":"interaction-owner","email":"owner@example.test","email_verified":true}'),
     ('22222222-2222-4222-8222-222222222222','interaction-member','google','{"sub":"interaction-member","email":"member@example.test","email_verified":true}');
    select private.bootstrap_private_interaction(2::smallint,'Synthetic concurrency title','Synthetic concurrency message','[{"key":"a","label":"Option A"},{"key":"b","label":"Option B"}]');
    commit;
    """)
    as_member(1, "select public.initialize_garden()")
    sql("insert into public.achievement_awards(achievement_id,earned_at) select achievement_id,clock_timestamp() from public.achievement_catalog;")
    before = sql("select jsonb_agg(to_jsonb(f) order by spot) from public.flowers f;")
    overlap("select public.current_private_interaction()", "select public.current_private_interaction()", first_member=2, second_member=2)
    assert sql("select count(*) from private.private_interaction_delivery;") == "1"
    delivered = sql("select delivered_at from private.private_interaction_delivery;")
    overlap("select public.owner_private_interaction('arm',false)", "select public.answer_private_interaction('a')", error="Interaction is not available")
    assert sql("select count(*) from private.private_interaction_delivery where answered_at is not null;") == "0"
    as_member(1, "select public.owner_private_interaction('arm',true)")
    overlap("select public.answer_private_interaction('b')", "select public.answer_private_interaction('a')", first_member=2, second_member=2)
    original = sql("select to_jsonb(d) from private.private_interaction_delivery d;")
    assert sql("select answer_key from private.private_interaction_delivery;") == "b"
    assert sql("select delivered_at from private.private_interaction_delivery;") == delivered
    overlap("select public.answer_private_interaction('b')", "select public.answer_private_interaction('b')", first_member=2, second_member=2)
    assert sql("select to_jsonb(d) from private.private_interaction_delivery d;") == original
    overlap("select public.owner_private_interaction('acknowledge')", "select public.owner_private_interaction('acknowledge')", first_member=1, second_member=1)
    assert sql("select revision from public.private_interaction_signals;") == "2"
    assert before == sql("select jsonb_agg(to_jsonb(f) order by spot) from public.flowers f;")
    assert sql("select count(*) from public.flower_day_facts;") == "0"
    print("PASS: observed garden-lock waits for concurrent delivery, disarm versus answer, differing/same answer retries, and acknowledgment; once-only history and no growth effects")
finally:
    sql("begin;" + "".join(f"delete from {table};" for table in PRIVATE) + "".join(f"delete from public.{table};" for table in DOMAIN) + "delete from private.garden_members; delete from auth.users where email in ('owner@example.test','member@example.test');commit;")
assert sql(empty) == "0"
print("PASS: synthetic configuration, delivery, notifications, garden and Auth fixtures removed")
