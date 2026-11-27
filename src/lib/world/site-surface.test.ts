import {expect,it} from "vitest";
import {buildScenicGroundMesh} from "./scenic-ground";
import {scenicRoute} from "./scenic-route";
import {buildScenicPath} from "./scenic-path";
import {typeAreaLayout} from "@/lib/garden-v2/type-areas";
import fixture from "../../../scripts/profiling/fixtures/type-area-garden.json";
import {parseGardenState} from "@/lib/garden-v2/model";
import {buildBedMesh,type MeshData} from "./scenery";

/** Independent barycentric queries over ALL rendered ground triangles/layers. */
function groundSampler(mesh:MeshData){
 const v=mesh.vertices,s=mesh.stride,bins=new Map<string,number[]>(),wide:number[]=[];
 for(let k=0;k<mesh.indices.length;k+=3){
  const ids=[mesh.indices[k]!*s,mesh.indices[k+1]!*s,mesh.indices[k+2]!*s],xs=ids.map(i=>v[i]!),zs=ids.map(i=>v[i+2]!),minX=Math.floor(Math.min(...xs)/8),maxX=Math.floor(Math.max(...xs)/8),minZ=Math.floor(Math.min(...zs)/8),maxZ=Math.floor(Math.max(...zs)/8);
  if((maxX-minX+1)*(maxZ-minZ+1)>64){wide.push(k);continue;}
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const key=`${x}:${z}`,bucket=bins.get(key);if(bucket)bucket.push(k);else bins.set(key,[k]);}
 }
 return(x:number,z:number)=>{
  let top:number|null=null;
  for(const k of [...(bins.get(`${Math.floor(x/8)}:${Math.floor(z/8)}`)??[]),...wide]){
   const a=mesh.indices[k]!*s,b=mesh.indices[k+1]!*s,c=mesh.indices[k+2]!*s,ax=v[a]!,az=v[a+2]!,bx=v[b]!,bz=v[b+2]!,cx=v[c]!,cz=v[c+2]!;
   if(x<Math.min(ax,bx,cx)-1e-5||x>Math.max(ax,bx,cx)+1e-5||z<Math.min(az,bz,cz)-1e-5||z>Math.max(az,bz,cz)+1e-5)continue;
   const d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz),u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,w=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d,t=1-u-w;
   if(u>=-1e-5&&w>=-1e-5&&t>=-1e-5)top=Math.max(top??-Infinity,u*v[a+1]!+w*v[b+1]!+t*v[c+1]!);
  }return top;
 };
}
for(const scenario of ['empty','populated','sparse','boundary-before','boundary-after'])it(`keeps soil/path vertices and triangle interiors above all ground layers: ${scenario}`,()=>{
 const state=parseGardenState(structuredClone(fixture));
 if(scenario==='empty'){state.plants=[];state.garden.next_spot=1;}
 if(scenario==='sparse'){state.plants[0]!.flower.spot=12001;state.garden.next_spot=1;}
 if(scenario.startsWith('boundary')){state.plants=state.plants.filter(p=>p.flower.spot!==24);state.garden.next_spot=24;}
 if(scenario==='boundary-after'){const rose=structuredClone(state.plants[0]!);rose.flower.spot=24;rose.flower.id='synthetic-new-rose';state.plants.push(rose);state.garden.next_spot=27;}
 const layout=typeAreaLayout(state),route=scenicRoute(layout.beds),ground=buildScenicGroundMesh(route,layout.beds),sample=groundSampler(ground);
 for(const spot of layout.spots){const h=sample(spot.position[0],spot.position[2]);expect(h).not.toBeNull();expect(spot.position[1]-h!,`root ${spot.spot}`).toBeGreaterThan(.001);}
 for(const [name,mesh]of [['soil',buildBedMesh(layout.beds)],['path',buildScenicPath(route)]] as const){
  let minimum=Infinity,minimumPoint:number[]=[];
  const check=(x:number,y:number,z:number)=>{const h=sample(x,z);expect(h,`${scenario} ${name} at ${x},${z}`).not.toBeNull();if(y-h!<minimum){minimum=y-h!;minimumPoint=[x,y,z,h!];}};
  for(let i=0;i<mesh.vertices.length;i+=mesh.stride)check(mesh.vertices[i]!,mesh.vertices[i+1]!,mesh.vertices[i+2]!);
  for(let k=0;k<mesh.indices.length;k+=3){const a=mesh.indices[k]!*mesh.stride,b=mesh.indices[k+1]!*mesh.stride,c=mesh.indices[k+2]!*mesh.stride;for(const [u,v,w]of [[1/3,1/3,1/3],[.9,.05,.05],[.05,.9,.05],[.05,.05,.9]])check(mesh.vertices[a]!*u!+mesh.vertices[b]!*v!+mesh.vertices[c]!*w!,mesh.vertices[a+1]!*u!+mesh.vertices[b+1]!*v!+mesh.vertices[c+1]!*w!,mesh.vertices[a+2]!*u!+mesh.vertices[b+2]!*v!+mesh.vertices[c+2]!*w!);}
  expect(minimum,`${scenario} ${name} minimum rendered clearance at${minimumPoint.join(",")}`).toBeGreaterThan(.0005);
 }
},15000);


import {originalLandingSurfaceHeight} from './site-surface';
import {buildLandingGroundMesh} from './landing';
it('queries the frozen original rendered landing triangles without changing terrain or meshes',()=>{
 const sample=groundSampler(buildLandingGroundMesh());
 for(let i=0;i<300;i++){const x=-31+(i*7.31)%180,z=-159+(i*17.63)%318;expect(originalLandingSurfaceHeight(x,z)).toBeCloseTo(sample(x,z)!,5);}
});
