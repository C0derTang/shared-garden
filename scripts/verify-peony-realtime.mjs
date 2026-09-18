/** Opt-in disposable LOCAL Realtime integration; never accepts a hosted URL. */
import assert from "node:assert/strict";
import process from "node:process";
import { Buffer } from "node:buffer";
import { setTimeout, clearTimeout } from "node:timers";
import console from "node:console";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const statusFile = process.argv[2];
assert(
  statusFile,
  "Usage: node scripts/verify-garden-realtime.mjs LOCAL_STATUS_JSON",
);
const local = JSON.parse(readFileSync(statusFile, "utf8"));
const ci = process.argv[3] === "ci";
assert.equal(
  local.API_URL,
  ci ? "http://127.0.0.1:56321" : "http://127.0.0.1:57921",
);
assert.match(local.PUBLISHABLE_KEY, /^sb_publishable_/);
const container = ci
  ? "supabase_db_shared-garden-clock"
  : "supabase_db_shared-garden-peony-ui31";
const sql = (query) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
assert.equal(
  sql("select count(*) from private.garden_members"),
  "0",
  "Requires empty disposable fixtures",
);
assert.equal(sql("select count(*) from auth.users"), "0");
assert.equal(sql("select count(*) from public.garden"), "0");
const ids = [1, 2, 3].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
const tokens = ids.map((id) => {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600, amr: [{ method: "oauth", timestamp: now }], is_anonymous: false })).toString("base64url")}`;
  return `${unsigned}.${createHmac("sha256", local.JWT_SECRET).update(unsigned).digest("base64url")}`;
});
const clients = tokens.map((token) =>
  createClient(local.API_URL, local.PUBLISHABLE_KEY, {
    accessToken: async () => token,
  }),
);
const anon = createClient(local.API_URL, local.PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const events = clients.map(() => []);
const anonymousEvents = [];
const channels = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (predicate()) return;
    await delay(100);
  }
  assert.fail(label);
}
async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  assert.equal(error, null, `${name}: ${error?.message}`);
  return data;
}
async function subscribe(client, list) {
  const channel = client.channel(`local-garden-${channels.length}`, {
    config: { postgres_changes_options: { wait: true, timeout: 15000 } },
  });
  for (const table of [
    "flowers",
    "peony_contributions",
    "peony_plans",
    "peony_acceptances",
  ])
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => list.push(payload),
    );
  channels.push([client, channel]);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Subscription timed out")),
      20000,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      }
      if (status === "CHANNEL_ERROR") {
        clearTimeout(timeout);
        reject(new Error("Subscription failed"));
      }
    });
  });
}
try {
  sql(
    `begin; set local role postgres; select private.bootstrap_members('owner@example.test','member@example.test'); reset role; set local role supabase_auth_admin; ${ids.map((id, i) => `insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','${["owner", "member", "outsider"][i]}@example.test','{"provider":"google","providers":["google"]}','{}'); insert into auth.identities(user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) values('${id}','local-garden-${i}','google','{"sub":"local-garden-${i}","email":"${["owner", "member", "outsider"][i]}@example.test","email_verified":true}',now(),now(),now()); update auth.users set created_at=now(),updated_at=now(),encrypted_password='',confirmation_token='',recovery_token='',email_change_token_new='',email_change='',email_confirmed_at=now() where id='${id}';`).join("")} commit;`,
  );
  for (let i = 0; i < clients.length; i++) {
    await clients[i].realtime.setAuth(tokens[i]);
    await subscribe(clients[i], events[i]);
  }
  // Anonymous may join a channel, but table privileges must still deny row delivery.
  await subscribe(anon, anonymousEvents);
  await rpc(clients[0], "current_garden_state");
  sql(
    "insert into public.flower_unlocks(type_key) values('peony') on conflict do nothing",
  );
  const flower = await rpc(clients[0], "plant_flower_at", {
    p_type_key: "peony",
    p_spot: 9,
  });
  const args = { p_flower_id: flower.id };
  await rpc(clients[0], "submit_peony_contribution", {
    ...args,
    p_milestone: 1,
    p_payload: { text: "Synthetic remote movie" },
  });
  await until(
    () => events[1].some((e) => e.table === "peony_contributions"),
    "Partner idea invalidation missing",
  );
  let partner = await rpc(clients[1], "current_peony_state", args);
  assert.equal(partner.contributions[0].payload.text, "Synthetic remote movie");
  await rpc(clients[1], "submit_peony_contribution", {
    ...args,
    p_milestone: 1,
    p_payload: { text: "Synthetic remote game" },
  });
  await rpc(clients[0], "set_peony_plan", {
    ...args,
    p_expected_version: 0,
    p_activity: "Synthetic remote movie",
    p_starts_at: "2030-09-20T19:00:00-07:00",
  });
  await rpc(clients[0], "accept_peony_plan", { ...args, p_plan_version: 1 });
  await until(
    () =>
      events[1].some(
        (e) => e.table === "peony_acceptances" && e.new.plan_version === 1,
      ),
    "Acceptance invalidation missing",
  );
  await rpc(clients[1], "set_peony_plan", {
    ...args,
    p_expected_version: 1,
    p_activity: "Synthetic remote game",
    p_starts_at: "2030-09-20T19:00:00-07:00",
  });
  await until(
    () =>
      events[0].some((e) => e.table === "peony_plans" && e.new.version === 2),
    "Plan revision invalidation missing",
  );
  partner = await rpc(clients[0], "current_peony_state", args);
  assert.equal(partner.plan.acceptances.length, 0);
  assert.ok(
    (await clients[0].rpc("accept_peony_plan", { ...args, p_plan_version: 1 }))
      .error,
  );
  for (const client of clients.slice(0, 2))
    await rpc(client, "accept_peony_plan", { ...args, p_plan_version: 2 });
  for (const client of clients.slice(0, 2))
    await rpc(client, "submit_peony_contribution", {
      ...args,
      p_milestone: 3,
      p_payload: {},
    });
  for (const client of clients.slice(0, 2))
    await rpc(client, "submit_peony_contribution", {
      ...args,
      p_milestone: 4,
      p_payload: { text: "Synthetic shared favorite" },
    });
  partner = await rpc(clients[0], "current_peony_state", args);
  assert.equal(partner.stage, 4);
  assert.equal(partner.completed_milestones.length, 4);
  assert.equal(
    new Set(partner.completed_milestones.map((m) => m.garden_day)).size,
    1,
  );
  await delay(500);
  const count = events[1].length;
  for (let i = 0; i < 3; i++)
    await rpc(clients[0], "current_peony_state", args);
  await delay(700);
  assert.equal(
    events[1].length,
    count,
    "Peony reads cause an invalidation loop",
  );
  assert.equal(events[2].length, 0, "Outsider received private content");
  assert.ok(
    anonymousEvents.every(
      (e) =>
        Object.keys(e.new ?? {}).length === 0 &&
        Object.keys(e.old ?? {}).length === 0,
    ),
  );
  assert.ok((await clients[2].rpc("current_peony_state", args)).error);
  sql("update private.garden_members set revoked_at=now() where member_id=2");
  const revokedCount = events[1].length;
  const another = await rpc(clients[0], "plant_flower_at", {
    p_type_key: "peony",
    p_spot: 10,
  });
  await rpc(clients[0], "submit_peony_contribution", {
    p_flower_id: another.id,
    p_milestone: 1,
    p_payload: { text: "Synthetic private contribution" },
  });
  await until(
    () =>
      events[0].some(
        (e) =>
          e.table === "peony_contributions" && e.new.flower_id === another.id,
      ),
    "Active member positive barrier missing",
  );
  await delay(1500);
  assert.equal(
    events[1].length,
    revokedCount,
    "Revoked connected member received content",
  );
  assert.ok((await clients[1].rpc("current_peony_state", args)).error);
  console.log(
    "PASS: partner idea/acceptance/plan revision delivery, stale version rejection, cleared acceptance, same-day remote completion, private RLS/revocation and no read loop.",
  );
} finally {
  await Promise.all(
    channels.map(([client, channel]) => client.removeChannel(channel)),
  );
  sql(
    `delete from public.before_noon_snapshots; delete from public.flower_day_facts; delete from public.peony_acceptances; delete from public.peony_plans; delete from public.peony_contributions; delete from public.peony_activity; delete from public.garden_days; delete from public.flower_entries; delete from public.daisy_assignments; delete from public.flowers; delete from public.flower_unlocks; delete from public.garden; delete from private.garden_members; delete from auth.users where id in (${ids.map((id) => `'${id}'`).join(",")});`,
  );
  assert.equal(sql("select count(*) from private.garden_members"), "0");
}
