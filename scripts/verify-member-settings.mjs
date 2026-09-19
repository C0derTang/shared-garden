/** Synthetic disposable local Auth/REST/Realtime boundary; no hosted endpoints. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import console from "node:console";
import { Buffer } from "node:buffer";
import { setTimeout, clearTimeout } from "node:timers";
import { createClient } from "@supabase/supabase-js";
const local = JSON.parse(readFileSync(process.argv[2], "utf8"));
const ci = process.argv[3] === "ci";
assert.equal(local.API_URL, ci ? "http://127.0.0.1:56321" : "http://127.0.0.1:58521");
const container = ci ? "supabase_db_shared-garden-clock" : "supabase_db_shared-garden-tutorial35";
const sql = (query) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
assert.equal(sql("select (select count(*) from private.garden_members)+(select count(*) from auth.users)+(select count(*) from public.garden)+(select count(*) from private.member_settings)"), "0", "Requires empty disposable fixtures");
const ids = [1,2,3].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
const tokens = ids.map((id) => {
  const now = Math.floor(Date.now()/1000);
  const unsigned = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", iat: now, exp: now+1800, amr: [{ method: "oauth", timestamp: now }], is_anonymous: false })).toString("base64url")}`;
  return `${unsigned}.${createHmac("sha256",local.JWT_SECRET).update(unsigned).digest("base64url")}`;
});
const clients = tokens.map((token) => createClient(local.API_URL,local.PUBLISHABLE_KEY,{ accessToken: async () => token }));
const anon = createClient(local.API_URL,local.PUBLISHABLE_KEY,{ auth: { persistSession:false,autoRefreshToken:false } });
let channel;
try {
  sql(`begin;set local role postgres;select private.bootstrap_members('owner@example.test','member@example.test');reset role;set local role supabase_auth_admin;${ids.map((id,i)=>`insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','${["owner","member","outsider"][i]}@example.test','{"provider":"google","providers":["google"]}','{}');insert into auth.identities(user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) values('${id}','settings-http-${i}','google','{"sub":"settings-http-${i}","email":"${["owner","member","outsider"][i]}@example.test","email_verified":true}',now(),now(),now());update auth.users set encrypted_password='',confirmation_token='',recovery_token='',email_change_token_new='',email_change='',email_confirmed_at=now() where id='${id}';`).join("")}commit;`);
  const rpc = async (client,name,args) => { const response=await client.rpc(name,args); assert.equal(response.error,null); return response.data; };
  const original = { revision:0,guide:"open",gentle_motion:true };
  assert.deepEqual(await rpc(clients[1],"current_member_settings"),original);
  assert.deepEqual(await rpc(clients[0],"save_member_setting",{p_change:{guide:"skipped"}}),{...original,revision:1,guide:"skipped"});
  assert.deepEqual(await rpc(clients[1],"current_member_settings"),original);
  for(const client of clients) {
    assert.ok((await client.schema("private").from("member_settings").select("*")).error,"Private REST schema must be unavailable");
    assert.ok((await client.from("member_settings").select("*").eq("member_id",1)).error,"No public table exposure");
  }
  for(const client of [anon,clients[2]]) {
    assert.ok((await client.rpc("current_member_settings")).error);
    assert.ok((await client.rpc("save_member_setting",{p_change:{guide:"open"}})).error);
  }
  assert.ok((await clients[1].rpc("current_member_settings",{p_member_id:1})).error,"No target-member read argument");
  for(const p_change of [{guide:"open",member_id:1},{rose_noted:true},{guide:"finished",gentle_motion:false}])
    assert.ok((await clients[1].rpc("save_member_setting",{p_change})).error,"Invalid actor/action/multifield write denied");
  const rows=[];
  await clients[1].realtime.setAuth(tokens[1]);
  channel=clients[1].channel("attempt-partner-preferences",{config:{postgres_changes_options:{wait:true}}}).on("postgres_changes",{event:"*",schema:"private",table:"member_settings",filter:"member_id=eq.1"},(payload)=>rows.push(payload));
  const subscription = await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("Subscription did not resolve")),15000);channel.subscribe((status)=>{if(["SUBSCRIBED","CHANNEL_ERROR"].includes(status)){clearTimeout(timer);resolve(status);}});});
  assert.equal(subscription,"CHANNEL_ERROR","Private unpublished preferences cannot establish a changes subscription");
  await rpc(clients[0],"save_member_setting",{p_change:{gentle_motion:false}});
  await delay(300);
  assert.deepEqual(rows,[]);
  // A fresh client represents another device with the same member identity.
  const otherDevice=createClient(local.API_URL,local.PUBLISHABLE_KEY,{accessToken:async()=>tokens[0]});
  assert.deepEqual(await rpc(otherDevice,"current_member_settings"),{revision:2,guide:"skipped",gentle_motion:false});
  sql("update private.garden_members set revoked_at=now() where member_id=1");
  assert.ok((await otherDevice.rpc("current_member_settings")).error);
  assert.ok((await otherDevice.rpc("save_member_setting",{p_change:{guide:"open"}})).error);
  assert.equal(sql("select count(*) from public.garden"),"0");
  console.log("PASS: own-only REST/RPC, rejected actor/gameplay fields, partner Realtime denial, cross-device persistence and live revocation; no gameplay writes");
} finally {
  if(channel) await clients[1].removeChannel(channel);
  sql(`delete from private.member_settings;delete from private.garden_members;delete from auth.users where id in (${ids.map(id=>`'${id}'`).join(",")});`);
  assert.equal(sql("select (select count(*) from private.garden_members)+(select count(*) from auth.users)+(select count(*) from private.member_settings)"),"0");
}
