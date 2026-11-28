/* global structuredClone,localStorage */
import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{URL}from'node:url';
export const fixture=JSON.parse(readFileSync('scripts/profiling/fixtures/type-area-garden.json','utf8'));
export function compactFixture(kind='mixed'){
 const state=structuredClone(fixture);
 if(kind==='empty'){state.plants=[];state.garden.next_spot=1;state.garden.spot_capacity=12;}
 if(kind==='boundary'){state.plants=state.plants.filter(p=>p.flower.spot!==24);state.garden.next_spot=24;}
 if(kind==='sparse'){state.plants[0].flower.spot=12001;state.garden.next_spot=1;state.garden.spot_capacity=12012;}
 if(kind==='full'){const templates=state.catalog.map(c=>state.plants.find(p=>p.flower.type_key===c.type_key));state.plants=templates.flatMap((p,type)=>Array.from({length:6},(_,i)=>({...structuredClone(p),flower:{...p.flower,id:`00000000-0000-4000-8000-${String(type*6+i+1).padStart(12,'0')}`,spot:type*6+i+1,seed:i+1,planted_at:`2026-06-01T12:00:${String(i).padStart(2,'0')}Z`,growth_units:state.catalog[type].growth_target,first_bloom_at:'2026-06-01T12:00:00Z',first_bloom_day:'2026-06-01'}})));state.garden.next_spot=79;}
 return state;
}
export async function installCompactFixture(page,base,initial,{mutations=false}={}){
 assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));let state=structuredClone(initial);const calls=[];
 await page.addInitScript(()=>localStorage.setItem('garden-v2:guide-seen:1','1'));
 await page.route('**/*',async route=>{const request=route.request();assert.equal(new URL(request.url()).origin,new URL(base).origin,'Unexpected external request');const action=request.headers()['next-action'];if(!action)return route.continue();
 const manifest=JSON.parse(readFileSync('.next/dev/server/server-reference-manifest.json','utf8')),name=manifest.node[action]?.exportedName,args=JSON.parse(request.postData());calls.push({name,args});let result;
 if(name==='refreshGardenV2')result={state,error:null};
 else if(name==='readPrivateInteraction')result={state:{status:'unavailable'},error:null};
 else if(name==='readPeonyV2'){
  const plant=state.plants.find(plant=>plant.flower.id===args[0]&&plant.flower.type_key==='peony');assert(plant,'Only the visited synthetic Peony can be read');const stage=plant.flower.growth_units;
  result={state:{server_now:state.server_now,garden_day:state.garden_day,next_rollover_at:state.next_rollover_at,member_id:state.member_id,stage,next_milestone:stage===4?null:stage+1,contributions:[],plan:null,completed_milestones:Array.from({length:stage},(_,index)=>({milestone:index+1,completed_at:state.server_now,garden_day:state.garden_day}))},error:null};
 }
 else if(name==='readRepliesV2')result={replies:[],error:null};
 else if(name==='loadFlowerHistoryV2')result={entries:[{id:901,flower_id:args[0],author_id:1,garden_day:'2026-11-25',original_posted_at:'2026-11-25T20:00:00Z',updated_at:'2026-11-25T20:00:00Z',payload:{text:'An earlier synthetic memory.'},daisy_assignment_day:null}],error:null};
 else if(name==='mutateGardenV2'&&mutations){const command=args[0];assert.equal(command.kind,'plant');assert.equal(command.spot,state.garden.next_spot);const template=structuredClone(fixture.plants.find(p=>p.flower.type_key===command.type));assert(template);template.flower={...template.flower,id:`00000000-0000-4000-8000-${String(1000+command.spot).padStart(12,'0')}`,spot:command.spot,planted_at:`2099-01-01T00:${String(calls.length).padStart(2,'0')}:00Z`,growth_units:0,first_bloom_at:null,first_bloom_day:null,shared_wish:command.wish??null};const plants=[...state.plants,template],occupied=new Set(plants.map(p=>p.flower.spot));let next=1;while(occupied.has(next))next++;state={...state,plants,garden:{...state.garden,next_spot:next,spot_capacity:Math.max(state.garden.spot_capacity,Math.ceil(next/12)*12)}};result={state,saved:true,error:null};}
 else throw Error(`Unexpected synthetic action: ${name}`);
 await route.fulfill({status:200,contentType:'text/x-component',body:`0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(result)}\n`});});
 return{calls,get state(){return state;}};
}
