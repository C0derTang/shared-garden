import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
/* global localStorage,URL */
export async function installReadOnlyFixture(page,base,state){
 assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
 await page.addInitScript(()=>localStorage.setItem('garden-v2:guide-seen:1','1'));
 const calls=[];
 await page.route('**/*',async route=>{
  const request=route.request(),action=request.headers()['next-action'];
  assert.equal(new URL(request.url()).origin,new URL(base).origin,'Unexpected external request');
  if(!action)return route.continue();
  const manifest=JSON.parse(readFileSync('.next/dev/server/server-reference-manifest.json','utf8')),name=manifest.node[action]?.exportedName;calls.push(name);
  let result;
  if(name==='refreshGardenV2')result={state,error:null};
  else if(name==='readPrivateInteraction')result={state:{status:'unavailable'},error:null};
  else if(name==='readRepliesV2')result={replies:[],error:null};
  else throw new Error(`Unexpected read-only synthetic action: ${name}`);
  await route.fulfill({status:200,contentType:'text/x-component',body:`0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(result)}\n`});
 });return calls;
}
