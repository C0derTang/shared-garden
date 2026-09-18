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
parser.add_argument("container", nargs="?", default="supabase_db_shared-garden-rollover")
args = parser.parse_args()
if not args.container.startswith("supabase_db_"):
    parser.error("Only a local Supabase Docker database container is supported")


def command(app="rollover_race_control"):
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
    a = session("rollover_race_a", "begin;\n" + signed(1) + first + ";\nselect pg_sleep(2);\ncommit;\n")
    b = None
    try:
        wait_for("rollover_race_a", "wait_event='PgSleep'")
        b = session("rollover_race_b", "begin;\n" + signed(second_member) + second + ";\ncommit;\n")
        wait_for("rollover_race_b", "wait_event_type='Lock'")
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


# New settlement facts are private garden content too: refuse all populated
# domain tables before adding any synthetic identity or historical fixture.
TABLES = ["private.garden_members", "auth.users", "public.garden", "public.flowers",
          "public.flower_unlocks", "public.flower_entries", "public.daisy_assignments",
          "public.flower_day_facts", "public.before_noon_snapshots",
          "public.peony_activity", "public.garden_days"]
empty = "select " + "+".join(f"(select count(*) from {table})" for table in TABLES) + ";"
assert sql(empty) == "0", "Refusing a configured database; reset the dedicated local project"


def clear_garden():
    sql("begin;" + "".join(f"delete from public.{table};" for table in (
        "flower_day_facts", "before_noon_snapshots", "peony_activity", "garden_days",
        "flower_entries", "daisy_assignments", "flowers", "flower_unlocks", "garden")) + "commit;")


def prepare(roses=1, cactus_pair=False):
    clear_garden()
    sql("begin;" + signed(1) + "select public.initialize_garden();" +
        "select public.plant_flower('rose');" * roses + "commit;")
    # Privileged disposable historical facts only: public operations continue to
    # use the actual server clock, so waiters genuinely overlap production code.
    sql("""
    begin;
    update public.garden set initialized_at=timezone('America/Los_Angeles',
      (select garden_day-1 from private.garden_clock_at(clock_timestamp()))+time '04:00'),
      last_settled_day=(select garden_day-2 from private.garden_clock_at(clock_timestamp()));
    update public.flowers set planted_at=(select initialized_at from public.garden),
      planted_day=(select last_settled_day+1 from public.garden),
      growth_units=case when spot=2 then 4 else 0 end;
    insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
      select f.id,a.author_id,f.planted_day,
        timezone('America/Los_Angeles',f.planted_day+time '10:00')+a.author_id*interval '1 minute',
        timezone('America/Los_Angeles',f.planted_day+time '10:00')+a.author_id*interval '1 minute',
        '{"text":"Synthetic previous day"}'::jsonb
      from public.flowers f cross join (values(1),(2)) a(author_id) where f.spot=2;
    commit;
    """)
    if cactus_pair:
        sql("""
        update public.flowers set growth_units=9 where type_key='cactus';
        insert into public.flower_entries(flower_id,author_id,garden_day,original_posted_at,updated_at,payload)
          select f.id,a.author_id,f.planted_day,
            timezone('America/Los_Angeles',f.planted_day+time '10:00'),
            timezone('America/Los_Angeles',f.planted_day+time '10:00'),'{}'::jsonb
          from public.flowers f cross join (values(1),(2)) a(author_id) where f.type_key='cactus';
        """)
    return sql("select id from public.flowers where spot=2;")


try:
    sql("""
    begin;
    select private.bootstrap_members('owner@example.test','member@example.test');
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data) values
     ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','owner@example.test',now(),'{"provider":"google","providers":["google"]}'),
     ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','member@example.test',now(),'{"provider":"google","providers":["google"]}');
    insert into auth.identities(user_id,provider_id,provider,identity_data) values
     ('11111111-1111-4111-8111-111111111111','rollover-owner','google','{"sub":"rollover-owner","email":"owner@example.test","email_verified":true}'),
     ('22222222-2222-4222-8222-222222222222','rollover-member','google','{"sub":"rollover-member","email":"member@example.test","email_verified":true}');
    commit;
    """)
    prepare(cactus_pair=True)
    overlap("select public.current_garden_state()", "select public.current_garden_state()")
    assert sql("select count(*) from public.garden_days;") == "1"
    assert sql("select count(*)||'|'||count(*) filter(where first_bloom) from public.flower_day_facts;") == "2|2"
    assert sql("select count(*) from public.flowers where first_bloom_at is not null;") == "2"
    assert sql("select current_streak||'|'||qualifying_days from public.garden;") == "1|1"
    assert sql("select count(*) from public.flower_unlocks;") == "6"
    assert sql("select count(*) from public.flower_day_facts where member2_posted_at-member1_posted_at between interval '0' and interval '10 minutes';") == "2"
    print("PASS: overlapping settlement waits and commits exactly one day, one fact per flower, two distinct first blooms and one streak day")

    rose = prepare(roses=3)
    overlap("select public.current_garden_state()",
            f"select public.submit_flower_entry('{rose}','{{\"text\":\"Stale care\"}}')",
            error="This flower has already bloomed")
    assert sql("select count(*) from public.flower_entries;") == "2"
    assert sql("select count(*) from public.flower_day_facts where first_bloom;") == "1"
    print("PASS: queued stale entry sees committed settlement and rejects a now-bloomed ordinary flower")

    prepare(roses=3)
    overlap("select public.plant_flower_at('rose',12)", "select public.plant_flower('rose')",
            error="Unfinished flower limit reached")
    assert sql("select count(*) filter(where first_bloom_at is null)||'|'||count(*) filter(where first_bloom_at is not null) from public.flowers where type_key='rose';") == "3|1"
    assert sql("select count(*) from public.garden_days;") == "1"
    assert sql("select count(*) from public.flowers where spot=12;") == "1"
    print("PASS: planting settles overdue bloom before capacity checks; concurrent final-capacity attempt cannot bypass the cap")

    prepare()
    overlap("select public.plant_flower('daisy')", "select public.current_garden_state()")
    assert sql("select count(*) from public.flowers where type_key='daisy';") == "1"
    assert sql("select count(*) from public.daisy_assignments;") == "1"
    print("PASS: planting can use a newly earned unlock and a waiting authoritative read shares current question/state")

    revoke_waiter = ("select public.current_garden_state(); reset role; "
                     "update private.garden_members set revoked_at=clock_timestamp() where member_id=2")
    overlap(revoke_waiter, "select public.current_garden_state()", error="Garden access denied")
    sql("update private.garden_members set revoked_at=null where member_id=2;")
    print("PASS: garden refresh rechecks live membership after waiting behind a revocation")
finally:
    clear_garden()
    sql("""
    begin;
    delete from private.garden_members;
    delete from auth.users where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
    commit;
    """)
assert sql(empty) == "0"
print("PASS: all synthetic identity, garden, and settlement fixtures cleaned up")
