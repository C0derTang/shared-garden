// Native readback of the exact shared house WGSL hinge functions.
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import process from "node:process";
import console from "node:console";
import assert from "node:assert/strict";
import {init,effect,target} from "vgpu/node";
import {prepareShader} from "@vgpu/wgsl/prepare";
const core=readFileSync("src/components/world/house/house-core.wgsl","utf8").replaceAll('export ',''),gpu=await init();
try{
 const shader=prepareShader(`${core}
 @fragment fn fs_main(@builtin(position) pixel:vec4f)->@location(0)vec4f{
  let column=u32(pixel.x);var house:House;house.hinge=vec3f(1.0,0.0,2.0);house.doorAngle=1.4;house.glow=0.0;house.spill=0.0;house.windows=0.0;house.time=0.0;
  let p=vec3f(2.5,1.8,-6.5);let n=vec3f(0.0,0.0,-1.0);
  if(column==0u){return vec4f(swingDoor(p,MAT_DOOR,house),1.0);}
  if(column==1u){return vec4f(swingDoor(p,MAT_BACK_DOOR,house),1.0);}
  if(column==2u){return vec4f(swingDoorNormal(n,MAT_DOOR,house),1.0);}
  if(column==3u){return vec4f(swingDoorNormal(n,MAT_BACK_DOOR,house),1.0);}
  return vec4f(swingDoor(p,MAT_PLANK,house),1.0);
 }`),out=target(gpu,{size:[5,1],format:"rgba32float"});
 effect(gpu,shader).draw(out);const bytes=await out.color.read({mipLevel:0,region:"all"}),values=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4),vectors=Array.from({length:5},(_,i)=>[...values.slice(i*4,i*4+3)]);
 const close=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-5);
 assert(!close(vectors[0],[2.5,1.8,-6.5]),'Front door must move');assert(close(vectors[1],[2.5,1.8,-6.5]),'Rear door must remain fixed');
 assert(!close(vectors[2],[0,0,-1]),'Front normal must rotate');assert(close(vectors[3],[0,0,-1]),'Rear normal must stay fixed');assert(close(vectors[4],[2.5,1.8,-6.5]),'Porch planks must stay fixed');
 const result={probe:"Exact shared house-core WGSL functions used by scene/reflection and shadow passes",doorAngle:1.4,frontMoves:true,rearStatic:true,rearNormalStatic:true,porchStatic:true,vectors,tolerance:1e-5};
 writeFileSync(resolve(process.env.PROFILE_OUTPUT||"/tmp/ccapp-224-house-door.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{gpu.dispose();}
