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
parser.add_argument("container", nargs="?", default="supabase_db_shared-garden-planting")
args = parser.parse_args()
if not args.container.startswith("supabase_db_"):
    parser.error("Only a local Supabase Docker database container is supported")


def command(app="planting_race_control"):
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


def overlap(first, second, expected_error=None):
    a = session("planting_race_a", "begin;\n" + signed(1) + first + ";\nselect pg_sleep(2);\ncommit;\n")
    b = None
    try:
        wait_for("planting_race_a", "wait_event='PgSleep'")
        b = session("planting_race_b", "begin;\n" + signed(2) + second + ";\ncommit;\n")
        wait_for("planting_race_b", "wait_event_type='Lock'")
        out_a, err_a = a.communicate(timeout=10)
        out_b, err_b = b.communicate(timeout=10)
        assert a.returncode == 0, (out_a, err_a)
        if expected_error:
            assert b.returncode != 0 and expected_error in err_b, (out_b, err_b)
        else:
            assert b.returncode == 0, (out_b, err_b)
    finally:
        for process in (a, b):
            if process is not None and process.poll() is None:
                process.kill()
                process.communicate(timeout=10)


# The harness must never bootstrap, truncate, or disturb an existing garden.
assert sql("select (select count(*) from private.garden_members) + (select count(*) from auth.users) + (select count(*) from public.garden) + (select count(*) from public.flowers) + (select count(*) from public.flower_unlocks);") == "0", "Refusing a configured database; use a fresh dedicated local project"
try:
    sql("""
    begin;
    select private.bootstrap_members('owner@example.test','member@example.test');
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
     ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
     ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}');
    insert into auth.identities(user_id,provider_id,provider,identity_data) values
     ('11111111-1111-4111-8111-111111111111','race-owner','google','{"sub":"race-owner","email":"owner@example.test","email_verified":true}'),
     ('22222222-2222-4222-8222-222222222222','race-member','google','{"sub":"race-member","email":"member@example.test","email_verified":true}');
    commit;
    """)
    overlap("select public.initialize_garden()", "select public.initialize_garden()")
    assert sql("select (select count(*) from public.garden)||'|'||(select count(*) from public.flowers)||'|'||(select spot from public.flowers where type_key='cactus')||'|'||(select next_spot from public.garden);") == "1|1|1|2"
    print("PASS: overlapping initializations wait and produce one garden, one Cactus, spot 1")

    sql("begin;\n" + signed(2) + "select public.plant_flower('rose'); select public.plant_flower('rose'); commit;")
    overlap("select public.plant_flower('rose')", "select public.plant_flower('rose')",
            expected_error="Unfinished flower limit reached")
    assert sql("select (select count(*) from public.flowers where type_key='rose')||'|'||(select count(*) from public.flowers)||'|'||(select next_spot from public.garden);") == "3|4|5"
    print("PASS: overlapping final-slot attempts admit one Rose and reject the other without consuming a spot")

    overlap("select public.plant_flower('tulip')", "select public.plant_flower('marigold')")
    assert sql("select string_agg(spot::text,',' order by spot) from public.flowers;") == "1,2,3,4,5,6"
    print("PASS: overlapping different-type plantings receive distinct increasing spots")

    # Free two Rose type slots through the trusted evaluator while retaining
    # those plants/spots. Both contenders below have legal unfinished capacity.
    sql("begin;\n" + signed(1) + "reset role; select private.record_first_bloom(id,planted_day) "
        "from public.flowers where spot in (2,3); commit;")
    overlap("select public.plant_flower_at('rose',12)",
            "select public.plant_flower_at('marigold',12)",
            expected_error="Planting spot is occupied")
    assert sql("select (select count(*) from public.flowers)||'|'||next_spot||'|'||spot_capacity from public.garden;") == "7|7|12"
    assert sql("select count(*) from public.flowers where spot=12;") == "1"
    print("PASS: same selected-spot contenders wait; exactly one succeeds without consuming extra capacity")

    overlap("select public.plant_flower_at('rose',8)",
            "select public.plant_flower_at('marigold',9)")
    assert sql("select string_agg(spot::text,',' order by spot) from public.flowers;") == "1,2,3,4,5,6,8,9,12"
    assert sql("select next_spot||'|'||spot_capacity from public.garden;") == "7|12"
    assert sql("select (select planted_at from public.flowers where spot=9) > "
               "(select planted_at from public.flowers where spot=8) + interval '1 second';") == "t"
    print("PASS: different selected spots both succeed; waiting planter timestamps after the garden lock")

    # Administrative revocation occurs in the lock holder's uncommitted
    # transaction. The waiting request initially sees live membership, then must
    # recheck it after the shared initialization/allocation lock is released.
    revoke_waiter = ("select public.initialize_garden(); reset role; "
                     "update private.garden_members set revoked_at=clock_timestamp() where member_id=2")
    overlap(revoke_waiter, "select public.plant_flower_at('rose',7)",
            expected_error="Garden access denied")
    sql("update private.garden_members set revoked_at=null where member_id=2;")
    overlap(revoke_waiter, "select public.initialize_garden()",
            expected_error="Garden access denied")
    assert sql("select (select count(*) from public.flowers)||'|'||next_spot||'|'||spot_capacity from public.garden;") == "9|7|12"
    print("PASS: initialization and selected allocation share the lock and recheck queued membership")
finally:
    sql("""
    begin;
    delete from public.flowers;
    delete from public.flower_unlocks;
    delete from public.garden;
    delete from private.garden_members;
    delete from auth.users where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
    commit;
    """)
assert sql("select (select count(*) from private.garden_members) + (select count(*) from auth.users) + (select count(*) from public.garden) + (select count(*) from public.flowers) + (select count(*) from public.flower_unlocks);") == "0"
print("PASS: synthetic identity and garden fixtures cleaned up")
