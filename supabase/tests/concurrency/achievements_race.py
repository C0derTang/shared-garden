#!/usr/bin/env python3
"""Actual overlapping achievement evaluation sessions in an empty disposable local Supabase DB.

Synthetic fixtures only. Refuses populated domain/Auth tables. Observes real
lock waits and compares once-only results. Always reset this disposable project
afterward, even if interrupted.
"""
import argparse
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("container", nargs="?", default="supabase_db_shared-garden-achievements33")
args = parser.parse_args()
if not args.container.startswith("supabase_db_"):
    parser.error("Only a local Supabase Docker database container is supported")


def command(app="achievements_race_control"):
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
    a = session("achievements_race_a", "begin;\n" + signed(first_member) + first + f";\nselect pg_sleep({hold});\ncommit;\n")
    b = None
    try:
        wait_for("achievements_race_a", "wait_event='PgSleep'")
        b = session("achievements_race_b", "begin;\n" + signed(second_member) + second + ";\ncommit;\n")
        wait_for("achievements_race_b", "wait_event_type='Lock'")
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
TABLES = ["private.garden_members", "auth.users"] + ["public." + table for table in DOMAIN]
empty = "select " + "+".join(f"(select count(*) from {table})" for table in TABLES) + ";"
assert sql(empty) == "0", "Refusing configured database; reset the dedicated local project"
original_clock = sql("select pg_get_functiondef('private.begin_garden_operation()'::regprocedure);")


def clear_garden():
    sql("begin;" + "".join(f"delete from public.{table};" for table in DOMAIN) + "commit;")


try:
    sql("""
    begin;
    select private.bootstrap_members('owner@example.test','member@example.test');
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
     ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
     ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}');
    insert into auth.identities(user_id,provider_id,provider,identity_data) values
     ('11111111-1111-4111-8111-111111111111','peony-owner','google','{"sub":"peony-owner","email":"owner@example.test","email_verified":true}'),
     ('22222222-2222-4222-8222-222222222222','peony-member','google','{"sub":"peony-member","email":"member@example.test","email_verified":true}');
    commit;
    """)
    as_member(1, "select public.initialize_garden()")
    sql("insert into public.flower_unlocks(type_key) values('dandelion');")
    as_member(1, "select public.plant_flower('dandelion','Synthetic shared wish')")
    flower = sql("select id from public.flowers where type_key='dandelion';")
    sql(f"update public.flowers set growth_units=5,first_bloom_at=clock_timestamp(),first_bloom_day=current_date where id='{flower}';")
    before = sql("select jsonb_agg(to_jsonb(f)-'fulfilled_at'-'fulfilled_by' order by spot) from public.flowers f;")
    query = f"select public.fulfill_dandelion('{flower}')"
    a, b = overlap(query, query)
    import json
    facts = lambda output: [json.loads(line) for line in output.splitlines() if line.startswith('{') and 'flower_id' in line]
    assert facts(a) == facts(b), (a,b)
    assert facts(a)[0]['fulfilled_by'] == 1
    assert sql("select count(*) from public.achievement_awards where achievement_id='first-wish-blown';") == '1'
    award = sql("select earned_at from public.achievement_awards where achievement_id='first-wish-blown';")
    overlap("select public.current_achievements()", query)
    assert sql("select earned_at from public.achievement_awards where achievement_id='first-wish-blown';") == award
    overlap("select public.plant_flower('rose')", "select public.current_achievements()")
    assert sql("select count(*) from public.achievement_awards where achievement_id='first-seed';") == '1'
    before = sql("select jsonb_agg(to_jsonb(f)-'fulfilled_at'-'fulfilled_by' order by spot) from public.flowers f;")
    original = sql(f"select fulfilled_at from public.flowers where id='{flower}';")
    overlap(query, query, first_member=2, second_member=2)
    assert sql(f"select fulfilled_at from public.flowers where id='{flower}';") == original
    assert before == sql("select jsonb_agg(to_jsonb(f)-'fulfilled_at'-'fulfilled_by' order by spot) from public.flowers f;")
    assert sql("select count(*) from public.flower_day_facts;") == '0'
    assert sql("select count(*) from public.peony_activity;") == '0'
    print("PASS: observed garden-lock waits for competing members and same-member repeat; identical once-only fact, original time, no plant/growth/bloom/activity effects")
finally:
    sql(original_clock)
    clear_garden()
    sql("""
    begin;
    delete from private.garden_members;
    delete from auth.users where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
    commit;
    """)
assert sql(empty) == "0"
assert sql("select pg_get_functiondef('private.begin_garden_operation()'::regprocedure);") == original_clock
print("PASS: synthetic fixtures removed and the production operation-clock definition restored")
