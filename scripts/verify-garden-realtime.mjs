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
const achievements = process.argv[3] === "achievements";
assert.equal(
  local.API_URL,
  ci
    ? "http://127.0.0.1:56321"
    : achievements
      ? "http://127.0.0.1:58221"
      : "http://127.0.0.1:57121",
);
assert.match(local.PUBLISHABLE_KEY, /^sb_publishable_/);
const container = ci
  ? "supabase_db_shared-garden-clock"
  : achievements
    ? "supabase_db_shared-garden-achievements33"
    : "supabase_db_shared-garden-garden-ui";
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
    "flower_entries",
    "flower_unlocks",
    "achievement_progress",
    "achievement_awards",
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
  const first = await rpc(clients[0], "current_garden_state");
  const rose = await rpc(clients[0], "plant_flower_at", {
    p_type_key: "rose",
    p_spot: 9,
  });
  await until(
    () => events[1].some((e) => e.table === "flowers" && e.new.id === rose.id),
    "Partner did not receive planting",
  );
  const entry = await rpc(clients[0], "submit_flower_entry", {
    p_flower_id: rose.id,
    p_payload: { text: "A synthetic shared walk." },
  });
  await until(
    () =>
      events[1].some(
        (e) =>
          e.table === "flower_entries" &&
          e.eventType === "INSERT" &&
          e.new.id === entry.id,
      ),
    "Partner did not receive entry",
  );
  const partner = await rpc(clients[1], "current_garden_state");
  assert.equal(
    partner.plants.find((p) => p.flower.id === rose.id).entries[0].payload.text,
    "A synthetic shared walk.",
  );
  await rpc(clients[0], "edit_flower_entry", {
    p_entry_id: entry.id,
    p_payload: { text: "A synthetic walk, edited." },
  });
  await until(
    () =>
      events[1].some(
        (e) =>
          e.table === "flower_entries" &&
          e.eventType === "UPDATE" &&
          e.new.payload.text === "A synthetic walk, edited.",
      ),
    "Partner did not receive edit",
  );
  await rpc(clients[1], "submit_flower_entry", {
    p_flower_id: rose.id,
    p_payload: { text: "A second synthetic thought." },
  });
  await until(
    () =>
      events[1].some(
        (e) =>
          e.table === "achievement_awards" &&
          e.new.achievement_id === "first-seed",
      ) &&
      events[1].some(
        (e) =>
          e.table === "achievement_awards" &&
          e.new.achievement_id === "ten-minutes",
      ),
    "Partner did not receive permanent achievements",
  );
  const achievementsState = await rpc(clients[1], "current_achievements");
  assert.equal(achievementsState.achievements.length, 26);
  assert.ok(
    achievementsState.achievements.find(
      (a) => a.achievement_id === "ten-minutes",
    ).earned_at,
  );
  const paired = await rpc(clients[0], "current_garden_state");
  assert.equal(
    paired.plants.find((p) => p.flower.id === rose.id).member2_submitted,
    true,
  );
  // Privileged local fixture only: simulate durable evaluator writes without a clock override.
  sql(
    `update public.flowers set growth_units=1 where id='${rose.id}'; insert into public.flower_unlocks(type_key) values('daisy');`,
  );
  await until(
    () =>
      events[1].some(
        (e) =>
          e.table === "flowers" &&
          e.eventType === "UPDATE" &&
          e.new.growth_units === 1,
      ) &&
      events[1].some(
        (e) => e.table === "flower_unlocks" && e.new.type_key === "daisy",
      ),
    "Growth/unlock invalidation missing",
  );
  await delay(500);
  const count = events[1].length;
  for (let i = 0; i < 3; i++) {
    await rpc(clients[0], "current_garden_state");
    await rpc(clients[0], "current_achievements");
  }
  await delay(700);
  assert.equal(
    events[1].length,
    count,
    "Authoritative reads cause a refresh loop",
  );
  assert.equal(events[2].length, 0, "Outsider received a private row");
  assert.ok(
    anonymousEvents.every(
      (e) =>
        Object.keys(e.new ?? {}).length === 0 &&
        Object.keys(e.old ?? {}).length === 0,
    ),
    "Anonymous received private row fields",
  );
  assert.ok(
    (await clients[2].rpc("current_garden_state")).error,
    "Outsider read must fail",
  );
  sql("update private.garden_members set revoked_at=now() where member_id=2");
  const revokedCount = events[1].length;
  const marigold = await rpc(clients[0], "plant_flower_at", {
    p_type_key: "marigold",
    p_spot: 10,
  });
  await until(
    () =>
      events[0].some((e) => e.table === "flowers" && e.new.id === marigold.id),
    "Active member positive barrier missing",
  );
  await delay(1500);
  assert.equal(
    events[1].length,
    revokedCount,
    "Already-connected revoked member received new state",
  );
  assert.equal(events[2].length, 0);
  assert.ok(
    anonymousEvents.every(
      (e) =>
        Object.keys(e.new ?? {}).length === 0 &&
        Object.keys(e.old ?? {}).length === 0,
    ),
  );
  assert.ok(
    (await clients[1].rpc("current_garden_state")).error,
    "Revoked read must fail",
  );
  assert.equal(first.plants.length, 1);
  console.log(
    "PASS: member planting, entry insert/edit, paired markers, growth/unlock/achievement delivery; anonymous/outsider denial; live revocation; no read loop. Synthetic local OAuth fixtures only.",
  );
} finally {
  await Promise.all(
    channels.map(([client, channel]) => client.removeChannel(channel)),
  );
  sql(
    `delete from public.achievement_awards; delete from public.achievement_progress; delete from public.before_noon_snapshots; delete from public.flower_day_facts; delete from public.peony_activity; delete from public.garden_days; delete from public.flower_entries; delete from public.daisy_assignments; delete from public.flowers; delete from public.flower_unlocks; delete from public.garden; delete from private.garden_members; delete from auth.users where id in (${ids.map((id) => `'${id}'`).join(",")});`,
  );
  assert.equal(sql("select count(*) from private.garden_members"), "0");
}
