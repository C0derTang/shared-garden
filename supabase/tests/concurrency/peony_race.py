#!/usr/bin/env python3
"""Actual overlapping Peony sessions in an empty disposable local Supabase DB.

Synthetic fixtures only. Refuses populated domain/Auth tables. A test-only clock
shift exercises a real elapsed rollover while queued; its definition is restored
in finally. Always reset this disposable project afterward, even if interrupted.
"""
import argparse
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("container", nargs="?", default="supabase_db_shared-garden-peony49")
args = parser.parse_args()
if not args.container.startswith("supabase_db_"):
    parser.error("Only a local Supabase Docker database container is supported")


def command(app="peony_race_control"):
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
    a = session("peony_race_a", "begin;\n" + signed(first_member) + first + f";\nselect pg_sleep({hold});\ncommit;\n")
    b = None
    try:
        wait_for("peony_race_a", "wait_event='PgSleep'")
        b = session("peony_race_b", "begin;\n" + signed(second_member) + second + ";\ncommit;\n")
        wait_for("peony_race_b", "wait_event_type='Lock'")
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


DOMAIN = ["peony_acceptances", "peony_plans", "peony_contributions", "flower_day_facts",
          "before_noon_snapshots", "peony_activity", "garden_days", "flower_entries",
          "daisy_assignments", "flowers", "flower_unlocks", "garden"]
TABLES = ["private.garden_members", "auth.users"] + ["public." + table for table in DOMAIN]
empty = "select " + "+".join(f"(select count(*) from {table})" for table in TABLES) + ";"
assert sql(empty) == "0", "Refusing configured database; reset the dedicated local project"
original_clock = sql("select pg_get_functiondef('private.begin_garden_operation()'::regprocedure);")


def clear_garden():
    sql("begin;" + "".join(f"delete from public.{table};" for table in DOMAIN) + "commit;")


def contribution(flower, milestone, text="Synthetic contribution"):
    payload = "{}" if milestone == 3 else '{"text":"' + text + '"}'
    return f"select public.submit_peony_contribution('{flower}',{milestone},'{payload}')"


def plan(flower, version=0, activity="Synthetic remote activity"):
    return f"select public.set_peony_plan('{flower}',{version},'{activity}','2030-09-18T19:00:00-07:00')"


def accept(flower, version=1):
    return f"select public.accept_peony_plan('{flower}',{version})"


def prepare(stage=0):
    clear_garden()
    as_member(1, "select public.initialize_garden()")
    sql("insert into public.flower_unlocks(type_key) values('peony');")
    as_member(1, "select public.plant_flower('peony')")
    flower = sql("select id from public.flowers where type_key='peony';")
    if stage >= 1:
        for member in (1, 2):
            as_member(member, contribution(flower, 1))
        as_member(1, plan(flower))
    if stage >= 2:
        for member in (1, 2):
            as_member(member, accept(flower))
    if stage >= 3:
        for member in (1, 2):
            as_member(member, contribution(flower, 3))
    return flower


def rollover_clock():
    # Shift the actual ticking server clock to two seconds before its upcoming
    # Pacific rollover. The waiter samples time only after a four-second hold.
    boundary = sql("select next_rollover_at from private.garden_clock_at(clock_timestamp());")
    offset = sql(f"select extract(epoch from ('{boundary}'::timestamptz-interval '2 seconds'-clock_timestamp()));")
    sql(original_clock.replace("clock_timestamp()", f"(clock_timestamp()+interval '{offset} seconds')"))
    return boundary


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
    flower = prepare()
    overlap(contribution(flower, 1), contribution(flower, 1))
    assert sql("select count(*) from public.peony_contributions;") == "2"
    assert sql("select count(*) from public.peony_activity;") == "1"
    assert sql(f"select growth_units from public.flowers where id='{flower}';") == "1"
    assert sql("select member1_posted_at<member2_posted_at and member2_posted_at=completed_at from public.peony_activity;") == "t"
    print("PASS: simultaneous paired ideas wait on the shared lock and earn exactly one stage with original timestamps")

    flower = prepare()
    overlap(contribution(flower, 1), contribution(flower, 1),
            error="Already contributed", second_member=1)
    assert sql("select count(*) from public.peony_contributions;") == "1"
    assert sql("select count(*) from public.peony_activity;") == "0"
    print("PASS: overlapping duplicate originals cannot grant extra contribution or growth")

    flower = prepare(1)
    as_member(1, accept(flower))
    overlap(plan(flower, 1, "Changed in-person activity"), accept(flower),
            error="The shared plan has changed")
    assert sql("select version from public.peony_plans;") == "2"
    assert sql("select count(*) from public.peony_acceptances;") == "0"
    assert sql(f"select growth_units from public.flowers where id='{flower}';") == "1"
    overlap(accept(flower, 2), accept(flower, 2))
    assert sql("select count(*) from public.peony_acceptances where plan_version=2;") == "2"
    assert sql("select count(*) from public.peony_activity where milestone=2;") == "1"
    print("PASS: material edit wins over stale queued acceptance; paired acceptance of the new version completes once")

    flower = prepare(1)
    as_member(1, accept(flower))
    overlap(accept(flower), plan(flower, 1, "Too late"), error="Milestones must complete in order",
            first_member=2, second_member=1)
    assert sql("select version from public.peony_plans;") == "1"
    assert sql(f"select growth_units from public.flowers where id='{flower}';") == "2"
    print("PASS: completing acceptance wins over a queued plan edit and fixes the agreed version")

    flower = prepare(1)
    overlap(accept(flower), plan(flower, 1, "Negotiated activity"))
    assert sql("select count(*) from public.peony_acceptances;") == "0"
    assert sql(f"select growth_units from public.flowers where id='{flower}';") == "1"
    print("PASS: a queued material edit clears a newly committed single acceptance without advancing")

    flower = prepare(3)
    overlap(contribution(flower, 4), contribution(flower, 4))
    assert sql("select count(*) from public.peony_activity;") == "4"
    assert sql("select count(*) from public.flowers where first_bloom_at is not null;") == "1"
    assert sql(f"select growth_units from public.flowers where id='{flower}';") == "4"
    assert sql("select count(*) from public.flower_unlocks where type_key='daisy';") == "1"
    assert sql(f"select f.first_bloom_at=a.completed_at from public.flowers f join public.peony_activity a on a.flower_id=f.id and a.milestone=4 where f.id='{flower}';") == "t"
    print("PASS: simultaneous favorites bloom once, retain all four milestones and earn the permanent unlock")

    flower = prepare()
    revoke = (f"select public.current_peony_state('{flower}');reset role;"
              "update private.garden_members set revoked_at=clock_timestamp() where member_id=2")
    for request in (f"select public.current_peony_state('{flower}')", contribution(flower, 1)):
        overlap(revoke, request, error="Garden access denied")
        sql("update private.garden_members set revoked_at=null where member_id=2;")
    assert sql("select count(*) from public.peony_contributions;") == "0"
    print("PASS: queued read and contribution recheck live membership after the lock")

    # Real thirty-minute expiry during contention; no clock replacement here.
    as_member(1, contribution(flower, 1))
    entry = sql("select id from public.peony_contributions;")
    sql("update public.peony_contributions set original_posted_at=clock_timestamp()-interval '30 minutes'+interval '1 second';")
    overlap(f"select public.current_peony_state('{flower}')",
            f"select public.edit_peony_contribution({entry},'{{\"text\":\"Late\"}}')",
            error="The edit window has ended", second_member=1)
    print("PASS: personal edit expiry is evaluated after a real lock wait")

    flower = prepare()
    as_member(1, contribution(flower, 1))
    entry = sql("select id from public.peony_contributions;")
    # Synthetic original ten minutes before upcoming rollover, within 30 minutes
    # on either side; only same-garden-day eligibility can reject the queued edit.
    sql("update public.peony_contributions set original_posted_at=(select next_rollover_at-interval '10 minutes' from private.garden_clock_at(clock_timestamp())),updated_at=(select next_rollover_at-interval '10 minutes' from private.garden_clock_at(clock_timestamp()));")
    boundary = rollover_clock()
    before = sql(f"select garden_day from private.garden_clock_at('{boundary}'::timestamptz-interval '1 second');")
    first, _ = overlap(f"select public.current_peony_state('{flower}')->>'garden_day'",
                       f"select public.edit_peony_contribution({entry},'{{\"text\":\"New day\"}}')",
                       error="The edit window has ended", second_member=1, hold=4)
    assert before in first.splitlines(), "Lock holder must start before the shifted rollover"
    sql(original_clock)
    print("PASS: an edit queued before rollover is rejected after rollover despite fewer than thirty elapsed minutes")

    flower = prepare()
    as_member(1, contribution(flower, 1))
    sql("update public.peony_contributions set original_posted_at=(select next_rollover_at-interval '1 minute' from private.garden_clock_at(clock_timestamp())),updated_at=(select next_rollover_at-interval '1 minute' from private.garden_clock_at(clock_timestamp()));")
    boundary = rollover_clock()
    before = sql(f"select garden_day from private.garden_clock_at('{boundary}'::timestamptz-interval '1 second');")
    after = sql(f"select garden_day from private.garden_clock_at('{boundary}'::timestamptz);")
    first, _ = overlap(f"select public.current_peony_state('{flower}')->>'garden_day'", contribution(flower, 1), hold=4)
    assert before in first.splitlines(), "Lock holder must start before the shifted rollover"
    assert sql("select garden_day from public.peony_activity;") == after
    assert sql(f"select member1_posted_at<'{boundary}'::timestamptz and member2_posted_at>='{boundary}'::timestamptz and completed_at=member2_posted_at from public.peony_activity;") == "t"
    assert sql("select current_streak from public.garden;") == "0"
    assert sql("select last_settled_day from public.garden;") == before
    print("PASS: queued paired completion uses the post-lock garden day, keeps cross-day originals and settles the previous empty day")
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
