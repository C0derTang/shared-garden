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
  "Usage: node scripts/verify-private-interaction.mjs LOCAL_STATUS_JSON",
);
const local = JSON.parse(readFileSync(statusFile, "utf8"));
const ci = process.argv[3] === "ci";
assert.equal(
  local.API_URL,
  ci ? "http://127.0.0.1:56321" : "http://127.0.0.1:58621",
);
assert.match(local.PUBLISHABLE_KEY, /^sb_publishable_/);
const container = ci
  ? "supabase_db_shared-garden-clock"
  : "supabase_db_shared-garden-private-event36";
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
for (const table of ["private.private_interaction_config", "private.private_interaction_delivery", "public.private_interaction_signals", "public.achievement_awards", "public.achievement_progress"]) assert.equal(sql(`select count(*) from ${table}`), "0", "Requires empty disposable interaction fixtures");
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
  for (const table of ["private_interaction_signals"])
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
  sql("select private.bootstrap_private_interaction(2::smallint,'Synthetic runtime title','synthetic-runtime-copy-36-9c3fa','[{\"key\":\"a\",\"label\":\"Synthetic A\"},{\"key\":\"b\",\"label\":\"Synthetic B\"}]')");
  for (let i=0;i<clients.length;i++) { await clients[i].realtime.setAuth(tokens[i]); await subscribe(clients[i],events[i]); }
  await subscribe(anon,anonymousEvents);
  for (const client of [clients[1],clients[2],anon]) {
    for (const action of ['status','preview','arm','acknowledge']) {
      const result=await client.rpc('owner_private_interaction',{p_action:action,p_armed:true});
      assert.ok(result.error,'Unauthorized owner RPC unexpectedly allowed');
      assert.ok(!JSON.stringify(result).includes('synthetic-runtime-copy-36-9c3fa'));
    }
    for (const table of ['private_interaction_config','private_interaction_delivery']) {
      const result=await client.from(table).select('*');
      assert.ok(result.error);
      assert.ok(!JSON.stringify(result).includes('synthetic-runtime-copy-36-9c3fa'));
    }
  }
  assert.deepEqual(await rpc(clients[1],'current_private_interaction'),{status:'unavailable'});
  assert.ok((await clients[2].rpc('current_private_interaction')).error);
  assert.ok((await anon.rpc('current_private_interaction')).error);
  assert.equal((await rpc(clients[0],'owner_private_interaction',{p_action:'preview'})).content.message,'synthetic-runtime-copy-36-9c3fa');
  assert.equal(sql('select count(*) from private.private_interaction_delivery'),'0');
  sql('insert into public.achievement_awards(achievement_id,earned_at) select achievement_id,clock_timestamp() from public.achievement_catalog');
  const pending=await rpc(clients[1],'current_private_interaction');
  assert.equal(pending.status,'pending');
  assert.equal(pending.content.message,'synthetic-runtime-copy-36-9c3fa');
  assert.deepEqual(await rpc(clients[1],'current_private_interaction'),pending);
  assert.equal((await rpc(clients[1],'answer_private_interaction',{p_answer_key:'b'})).status,'answered');
  await until(()=>events[0].length===1,'Owner notification missing');
  assert.deepEqual(Object.keys(events[0][0].new).sort(),['owner_id','revision']);
  assert.ok(!JSON.stringify(events).includes('Synthetic B'));
  let owner=await rpc(clients[0],'owner_private_interaction',{p_action:'status'});
  assert.equal(owner.unread,true); assert.equal(owner.answer.key,'b');
  assert.deepEqual(await rpc(clients[1],'current_private_interaction'),{status:'answered'});
  for(let n=0;n<3;n++) {
    await rpc(clients[0],'owner_private_interaction',{p_action:'status'});
    await rpc(clients[1],'current_private_interaction');
    await rpc(clients[1],'answer_private_interaction',{p_answer_key:'a'});
  }
  await delay(600); assert.equal(events[0].length,1,'Reads/replays caused a notification loop');
  await rpc(clients[0],'owner_private_interaction',{p_action:'acknowledge'});
  await until(()=>events[0].length===2,'Owner acknowledgment signal missing');
  await rpc(clients[0],'owner_private_interaction',{p_action:'acknowledge'});
  owner=await rpc(clients[0],'owner_private_interaction',{p_action:'status'});
  assert.equal(owner.unread,false); assert.equal(owner.answer.key,'b');
  await delay(600); assert.equal(events[0].length,2);
  assert.equal(events[1].length,0,'Recipient received owner signal');
  assert.equal(events[2].length,0,'Outsider received owner signal');
  assert.ok(anonymousEvents.every((event)=>Object.keys(event.new ?? {}).length===0 && Object.keys(event.old ?? {}).length===0),'Anonymous received owner row payload');
  sql('update private.garden_members set revoked_at=now() where member_id=1');
  sql('update public.private_interaction_signals set revision=revision+1');
  await delay(600); assert.equal(events[0].length,2,'Revoked owner received signal');
  assert.ok((await clients[0].rpc('owner_private_interaction',{p_action:'status'})).error);
  console.log('PASS: actual HTTP authorization, marker isolation, pending/answer lifecycle, owner-only Realtime notification, revocation and no read feedback loop');
} finally {
  for(const [client,channel] of channels) await client.removeChannel(channel);
  for(const client of [...clients,anon]) client.realtime.disconnect();
  sql("begin; delete from private.private_interaction_delivery; delete from private.private_interaction_config; delete from public.private_interaction_signals; delete from public.achievement_awards; delete from public.achievement_progress; delete from public.before_noon_snapshots; delete from public.garden_days; delete from public.flower_unlocks; delete from public.flowers; delete from public.garden; delete from private.garden_members; delete from auth.users where email in ('owner@example.test','member@example.test','outsider@example.test'); commit;");
}
assert.equal(sql('select (select count(*) from auth.users)+(select count(*) from private.garden_members)+(select count(*) from private.private_interaction_config)+(select count(*) from private.private_interaction_delivery)+(select count(*) from public.private_interaction_signals)+(select count(*) from public.garden)'), '0');
console.log('PASS: fixture tables restored to zero');
