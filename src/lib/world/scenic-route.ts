/** Rounded scenic garden fitted around the ORIGINAL landing landmarks. Decision0072. */
import { flowerTypes } from "@/lib/garden-v2/model";
import { blendPoses, focusPose, type FocusTarget, type JourneyPose } from "./journey";
import { type Bed, type Vec3 } from "./layout";
import { landingTerrainHeight } from "./site-geography";
import { BACKYARD_RIGHT as RIGHT, BACKYARD_FORWARD as FORWARD } from "./backyard-frame";
import { HOUSE, houseToWorld } from "./landing-frame";
import { gardenFovY } from "./garden-camera";
import {plantingSurfaceHeight} from "./site-surface";
export interface ScenicCameraPose extends JourneyPose { readonly overview?: number; readonly rear?: number; readonly bankFov?: number }
/** Geometry-independent place semantics consumed only by passive orientation UI. */
export type ScenicPlace =
  | { readonly kind: 'porch' | 'woodland' | 'overlook' | 'meadow-bend' | 'meadow-edge' }
  | { readonly kind: 'flowers' | 'meadow-return'; readonly typeIndex: number; readonly section: number };
export interface ScenicStop { readonly place?: ScenicPlace; readonly id: string; readonly label: string; readonly pose: ScenicCameraPose; readonly typeIndex?: number; readonly section?: number; readonly transit?: boolean }
export interface ScenicEdge { readonly id: string; readonly from: string; readonly to: string; readonly points: readonly [Vec3, Vec3, Vec3, Vec3]; readonly primary?: boolean }
export interface ScenicIsland { readonly id: string; readonly center: Vec3; readonly radiusX: number; readonly radiusZ: number; readonly section?: number }
export interface ScenicRoute { readonly stops: readonly ScenicStop[]; readonly edges: readonly ScenicEdge[]; readonly islands: readonly ScenicIsland[] }
export const PATH_HALF_WIDTH = .72;
const eyeAt = (x: number, z: number, height = 2.65): Vec3 => [x, landingTerrainHeight(x,z)+height,z];
const normalized = (angle: number) => (angle+Math.PI*2)%(Math.PI*2);
export const SCENIC_ISLANDS: readonly ScenicIsland[] = [
  { id: "island-0", center: eyeAt(18,60,0), radiusX: 15, radiusZ: 8 },
  { id: "island-1", center: eyeAt(18,102,0), radiusX: 15, radiusZ: 8 },
];
const INSIDE = [0,2,5,7,9,11];
/** World +z is inland. Used additional sections occupy rounded meadow loops. */
export function sectionIsland(section: number): ScenicIsland {
  return { id: `section-${section}`, section, center: eyeAt(18,160+(section-1)*60,0), radiusX: 16, radiusZ: 12 };
}
export function islandBoundaryPoint(island: ScenicIsland, angle: number, height=2.65): Vec3 {
  return eyeAt(island.center[0]+FORWARD[0]*Math.sin(angle)*island.radiusZ+RIGHT[0]*Math.cos(angle)*island.radiusX,
    island.center[2]+FORWARD[2]*Math.sin(angle)*island.radiusZ+RIGHT[2]*Math.cos(angle)*island.radiusX,height);
}
export function typePocketFrame(index: number): {islandIndex:number;side:number;row:number;placement:"island"|"outskirts";angle:number} {
  const islandIndex=index<7?0:1,local=index-(islandIndex===0?0:7),count=islandIndex===0?7:6,angle=normalized(Math.PI/2+local*Math.PI*2/count);
  return {islandIndex,side:Math.cos(angle)>=0?1:-1,row:local,placement:INSIDE.includes(index)?"island":"outskirts",angle};
}
function frame(type:number,section:number) {
  const base=typePocketFrame(type);
  return { ...base, island:section?sectionIsland(section):SCENIC_ISLANDS[base.islandIndex]!, angle:section?normalized(Math.PI/2+type*Math.PI*2/13):base.angle };
}
export function pocketCenter(type:number,section:number):Vec3 {
  const f=frame(type,section),p=islandBoundaryPoint(f.island,f.angle,0),c=f.island.center;
  if(f.placement==="island"){const x=c[0]+(p[0]-c[0])*.45,z=c[2]+(p[2]-c[2])*.45;return [x,plantingSurfaceHeight(x,z),z];}
  const nx=FORWARD[0]*Math.sin(f.angle)/f.island.radiusZ+RIGHT[0]*Math.cos(f.angle)/f.island.radiusX,
    nz=FORWARD[2]*Math.sin(f.angle)/f.island.radiusZ+RIGHT[2]*Math.cos(f.angle)/f.island.radiusX,length=Math.hypot(nx,nz);
  const x=p[0]+nx/length*3.8,z=p[2]+nz/length*3.8;return [x,plantingSurfaceHeight(x,z),z];
}
function pocketStop(type:number,section:number):ScenicStop {
  const f=frame(type,section),p=pocketCenter(type,section);
  return {id:`pocket:${type}:${section}`,label:`${flowerTypes[type]} ${section?`meadow ${section+1}`:f.placement}`,typeIndex:type,section,
    pose:{eye:islandBoundaryPoint(f.island,f.angle),look:[p[0],p[1]+.7,p[2]]}};
}
export function scenicMarkerPosition(stop:ScenicStop):Vec3 {return eyeAt(stop.pose.eye[0],stop.pose.eye[2],.55);}
function arcEdge(id:string,from:ScenicStop,to:ScenicStop,island:ScenicIsland,a:number,b:number,primary=false):ScenicEdge {
  const k=4/3*Math.tan((b-a)/4),p=from.pose.eye,q=to.pose.eye;
  const tangent=(angle:number):Vec3=>[FORWARD[0]*Math.cos(angle)*island.radiusZ-RIGHT[0]*Math.sin(angle)*island.radiusX,0,FORWARD[2]*Math.cos(angle)*island.radiusZ-RIGHT[2]*Math.sin(angle)*island.radiusX];
  const u=tangent(a),v=tangent(b);
  return {id,from:from.id,to:to.id,primary,points:[p,[p[0]+u[0]*k,p[1],p[2]+u[2]*k],[q[0]-v[0]*k,q[1],q[2]-v[2]*k],q]};
}
export function scenicRoute(beds:readonly Bed[]):ScenicRoute {
  const stops:ScenicStop[]=[],edges:ScenicEdge[]=[],islands:ScenicIsland[]=[...SCENIC_ISLANDS];
  const node=(id:string,label:string,eye:Vec3,look:Vec3,transit=true,pose:Partial<ScenicCameraPose>={}):ScenicStop=>{
    const stop={id,label,pose:{eye,look,...pose},transit};stops.push(stop);return stop;
  };
  const curve=(id:string,from:ScenicStop,to:ScenicStop,a:Vec3,b:Vec3,primary=true)=>edges.push({id,from:from.id,to:to.id,points:[from.pose.eye,a,b,to.pose.eye],primary});
  function ring(island:ScenicIsland,section:number,types:readonly number[],primary:boolean) {
    const points=types.map(type=>{
      const stop=pocketStop(type,section),used=section===0||beds.some(b=>b.row===section&&b.index%13===type);
      const actual=used?stop:{...stop,id:`meadow:${section}:transit:${type}`,transit:true};stops.push(actual);
      return {angle:frame(type,section).angle,stop:actual};
    });
    const gate=(angle:number,id:string,overview=false)=>{
      const a=normalized(angle),existing=points.find(p=>Math.abs(p.angle-a)<1e-7);
      if(existing)return existing.stop;
      const stop=node(id,overview?`island ${island.id==='island-0'?1:2} overlook`:"meadow curve",islandBoundaryPoint(island,a,overview?8:2.65),[island.center[0],island.center[1]+.7,island.center[2]],!overview,overview?{overview:1}:{});
      points.push({angle:a,stop});return stop;
    };
    const west=gate(section?Math.PI/2+3.5*Math.PI*2/13:Math.PI,section?`meadow:${section}:west`:`overview:${island.id==='island-0'?0:1}`,!section),
      east=gate(section?Math.PI/2+9.5*Math.PI*2/13:0,`${island.id}:east`);
    points.sort((a,b)=>a.angle-b.angle);
    for(let i=0;i<points.length;i++){
      const from=points[i]!,to=points[(i+1)%points.length]!;
      edges.push(arcEdge(`${primary?'island:'+island.id.split('-')[1]:'meadow:'+section}:${i}`,from.stop,to.stop,island,from.angle,to.angle+(i===points.length-1?Math.PI*2:0),primary));
    }
    return {west,east};
  }
  const first=ring(SCENIC_ISLANDS[0]!,0,[0,1,2,3,4,5,6],true),second=ring(SCENIC_ISLANDS[1]!,0,[7,8,9,10,11,12],true);
  curve('island-bridge',first.east,second.west,eyeAt(14,78),eyeAt(14,84));
  const porch=houseToWorld([0,0,-HOUSE.depth-3.2]),woodland:ScenicStop[]=[];
  const samples:readonly (readonly [number,number])[]=[[porch[0],porch[2]],[9.2,7.75],[10.25,8.8],[11.65,9.85],[12.35,10.55],[16.2,15.45],[16.9,23.5]];
  for(const [i,p]of samples.entries()){
    const next=samples[i+1]??[first.west.pose.eye[0],first.west.pose.eye[2]],dx=next[0]!-p[0],dz=next[1]!-p[1],length=Math.hypot(dx,dz)||1,look:Vec3=[p[0]+dx/length*8,landingTerrainHeight(p[0],p[1])+.7,p[1]+dz/length*8];
    woodland.push(node(`woodland:${i}`,'woodland bend',eyeAt(p[0],p[1]),look));
  }
  woodland.push(first.west);
  for(let i=0;i<woodland.length-1;i++){
    const p=woodland[i]!.pose.eye,q=woodland[i+1]!.pose.eye,previous=woodland[Math.max(0,i-1)]!.pose.eye,next=woodland[Math.min(woodland.length-1,i+2)]!.pose.eye;
    curve(i===0?'porch-connection':`woodland:${i}`,woodland[i]!,woodland[i+1]!,eyeAt(p[0]+(q[0]-previous[0])*.12,p[2]+(q[2]-previous[2])*.12,p[1]-landingTerrainHeight(p[0],p[2])),eyeAt(q[0]-(next[0]-p[0])*.12,q[2]-(next[2]-p[2])*.12,q[1]-landingTerrainHeight(q[0],q[2])));
  }
  const rearPoint=houseToWorld([0,0,-HOUSE.depth-6]),rear=node('house-rear','back porch',eyeAt(rearPoint[0],rearPoint[2]),houseToWorld([0,2,-HOUSE.depth]),false,{rear:1});
  const step=woodland[0]!.pose.eye;
  curve('rear-view',woodland[0]!,rear,eyeAt(step[0]+(rearPoint[0]-step[0])/3,step[2]+(rearPoint[2]-step[2])/3),eyeAt(step[0]+(rearPoint[0]-step[0])*2/3,step[2]+(rearPoint[2]-step[2])*2/3));
  const lake=node('lake','lakeside',eyeAt(30,-8.187110232253284),eyeAt(30,-40,0),false);
  const shorePoints:readonly (readonly [number,number])[]=[[12.7,7.3],[13,6.7],[14.8,4.9],[15.7,4.9],[17.8,2.8],[17.8,2.5],[21.4,-3.2],[23.5,-5.3],[29.8,-8]];
  const shore=[woodland[4]!,...shorePoints.map((p,i)=>node(`shore:${i}`,'woodland shore',eyeAt(p[0],p[1]),lake.pose.look)),lake];
  for(let i=0;i<shore.length-1;i++){
    const p=shore[i]!.pose.eye,q=shore[i+1]!.pose.eye,previous=shore[Math.max(0,i-1)]!.pose.eye,next=shore[Math.min(shore.length-1,i+2)]!.pose.eye;
    curve(`shore-connection:${i}`,shore[i]!,shore[i+1]!,eyeAt(p[0]+(q[0]-previous[0])*.1,p[2]+(q[2]-previous[2])*.1),eyeAt(q[0]-(next[0]-p[0])*.1,q[2]-(next[2]-p[2])*.1));
  }

  let previous=second.east;
  const sections=[...new Set(beds.map(b=>b.row).filter(s=>s>0))].sort((a,b)=>a-b);
  for(const section of sections){
    const island=sectionIsland(section);islands.push(island);const next=ring(island,section,Array.from({length:13},(_,i)=>i),false),p=previous.pose.eye,q=next.west.pose.eye;
    curve(`meadow-link:${section}`,previous,next.west,eyeAt(p[0]-3,p[2]+4),eyeAt(q[0]-1,q[2]-1),false);previous=next.east;
  }
  const itinerary=['overview:0',...Array.from({length:7},(_,i)=>`pocket:${i}:0`),'overview:1',...Array.from({length:6},(_,i)=>`pocket:${i+7}:0`),'house-rear','lake'];
  const rank=(stop:ScenicStop)=>{const index=itinerary.indexOf(stop.id);return index<0?100:index;};stops.sort((a,b)=>rank(a)-rank(b));
  return {stops,edges,islands};
}
export function scenicFovY(pose:ScenicCameraPose,aspect:number,focusWeight=0):number {
  const normal=gardenFovY(aspect),overview=(aspect>=1?56:86)*Math.PI/180,rear=(aspect>=1?(aspect>1.9?108:100):128)*Math.PI/180;
  return normal+((overview-normal)*(pose.overview??0)+(rear-normal)*(pose.rear??0))*(1-focusWeight);
}
export function curvePoint(edge:ScenicEdge,t:number):Vec3 {
  const u=Math.max(0,Math.min(1,t)),v=1-u,[a,b,c,d]=edge.points;
  const x=a[0]*v**3+3*b[0]*v*v*u+3*c[0]*v*u*u+d[0]*u**3;
  const z=a[2]*v**3+3*b[2]*v*v*u+3*c[2]*v*u*u+d[2]*u**3;
  const above=(p:Vec3)=>p[1]-landingTerrainHeight(p[0],p[2]);
  return eyeAt(x,z,above(a)*v**3+3*above(b)*v*v*u+3*above(c)*v*u*u+above(d)*u**3);
}
/** Shared bounded tessellation, with metre-scale end samples on long sparse links. */
const parameterCache=new WeakMap<ScenicEdge,readonly number[]>();
export function edgeParameters(edge:ScenicEdge):readonly number[] {
 const cached=parameterCache.get(edge);if(cached)return cached;
 const values=Array.from({length:49},(_,i)=>i/48),first=edge.points[0],last=edge.points[3];
 if(Math.hypot(last[0]-first[0],last[2]-first[2])>80){
  const xz=(t:number)=>{const v=1-t,[a,b,c,d]=edge.points;return [a[0]*v**3+3*b[0]*v*v*t+3*c[0]*v*t*t+d[0]*t**3,a[2]*v**3+3*b[2]*v*v*t+3*c[2]*v*t*t+d[2]*t**3];};
  for(const reverse of [false,true])for(let distance=.5;distance<=20;distance+=.5){
   const origin=reverse?last:first;let low=0,high=.5;
   for(let i=0;i<24;i++){const mid=(low+high)/2,p=xz(reverse?1-mid:mid),length=Math.hypot(p[0]!-origin[0],p[1]!-origin[2]);if(length<distance)low=mid;else high=mid;}
   values.push(reverse?1-(low+high)/2:(low+high)/2);
  }
 }
 const result=[...new Set(values)].sort((a,b)=>a-b);parameterCache.set(edge,result);return result;
}
export function curveDirection(edge:ScenicEdge,t:number):Vec3 {
 const u=Math.max(0,Math.min(1,t)),v=1-u,[a,b,c,d]=edge.points;
 const dx=3*v*v*(b[0]-a[0])+6*v*u*(c[0]-b[0])+3*u*u*(d[0]-c[0]),dz=3*v*v*(b[2]-a[2])+6*v*u*(c[2]-b[2])+3*u*u*(d[2]-c[2]),length=Math.hypot(dx,dz);
 return length?[dx/length,0,dz/length]:[1,0,0];
}
export function edgeSamples(edge:ScenicEdge):readonly Vec3[] {return edgeParameters(edge).map(t=>curvePoint(edge,t));}
type PathSegment=readonly [number,number,number,number,number,number,number,number];
interface PathTree {minX:number;maxX:number;minZ:number;maxZ:number;segments?:readonly PathSegment[];left?:PathTree;right?:PathTree}
const clearanceCache=new WeakMap<ScenicRoute,PathTree>();
function pathTree(segments:readonly PathSegment[]):PathTree{
 const node:PathTree={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
 for(const s of segments){node.minX=Math.min(node.minX,s[4]);node.maxX=Math.max(node.maxX,s[5]);node.minZ=Math.min(node.minZ,s[6]);node.maxZ=Math.max(node.maxZ,s[7]);}
 if(segments.length<=12){node.segments=segments;return node;}
 const x=node.maxX-node.minX>=node.maxZ-node.minZ,ordered=[...segments].sort((a,b)=>x?(a[4]+a[5])-(b[4]+b[5]):(a[6]+a[7])-(b[6]+b[7])),mid=ordered.length>>1;
 node.left=pathTree(ordered.slice(0,mid));node.right=pathTree(ordered.slice(mid));return node;
}
/** Exact nearest flattened-curve distance; cached bounded BVH avoids per-stroke full scans. */
export function distanceToScenicPath(route:ScenicRoute,x:number,z:number):number{
 let tree=clearanceCache.get(route);
 if(!tree){
  const segments=route.edges.flatMap(edge=>{const p=edgeSamples(edge);return p.slice(1).map((b,i)=>[p[i]![0],p[i]![2],b[0]-p[i]![0],b[2]-p[i]![2],Math.min(p[i]![0],b[0]),Math.max(p[i]![0],b[0]),Math.min(p[i]![2],b[2]),Math.max(p[i]![2],b[2])] as const);});
  tree=pathTree(segments);clearanceCache.set(route,tree);
 }
 let best=Infinity;
 const bound=(node:PathTree)=>{const dx=Math.max(node.minX-x,0,x-node.maxX),dz=Math.max(node.minZ-z,0,z-node.maxZ);return dx*dx+dz*dz;};
 const visit=(node:PathTree)=>{
  if(bound(node)>=best)return;
  if(node.segments){for(const [ax,az,dx,dz]of node.segments){const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1))),px=x-ax-dx*t,pz=z-az-dz*t;best=Math.min(best,px*px+pz*pz);}return;}
  const left=node.left!,right=node.right!;if(bound(left)<bound(right)){visit(left);visit(right);}else{visit(right);visit(left);}
 };
 visit(tree);return Math.sqrt(best);
}

export function shortestAngle(from:number,to:number):number {return Math.atan2(Math.sin(to-from),Math.cos(to-from));}
function heading(p:JourneyPose){const dx=p.look[0]-p.eye[0],dz=p.look[2]-p.eye[2];return {yaw:Math.atan2(dx,dz),pitch:Math.atan2(p.look[1]-p.eye[1],Math.hypot(dx,dz))};}
function directedPose(eye:Vec3,from:ScenicCameraPose,to:ScenicCameraPose,t:number):ScenicCameraPose{
  const a=heading(from),b=heading(to),yaw=a.yaw+shortestAngle(a.yaw,b.yaw)*t,pitch=a.pitch+(b.pitch-a.pitch)*t;
  return {eye,look:[eye[0]+Math.sin(yaw)*Math.cos(pitch)*8,eye[1]+Math.sin(pitch)*8,eye[2]+Math.cos(yaw)*Math.cos(pitch)*8],overview:(from.overview??0)+((to.overview??0)-(from.overview??0))*t,rear:(from.rear??0)+((to.rear??0)-(from.rear??0))*t};
}
function edgeLength(edge:ScenicEdge){const p=edgeSamples(edge);return p.slice(1).reduce((sum,b,i)=>sum+Math.hypot(b[0]-p[i]![0],b[2]-p[i]![2]),0);}
interface Leg {edge:ScenicEdge;start:number;end:number;node:string}
function path(route:ScenicRoute,start:string,end:string):{cost:number;legs:Leg[]}{
  const costs=new Map([[start,0]]),paths=new Map<string,Leg[]>([[start,[]]]),pending=new Set(route.stops.map(s=>s.id));
  while(pending.size){const id=[...pending].sort((a,b)=>(costs.get(a)??Infinity)-(costs.get(b)??Infinity))[0]!;pending.delete(id);
    const cost=costs.get(id);if(cost===undefined)break;if(id===end)return{cost,legs:paths.get(id)!};
    for(const edge of route.edges){const forward=edge.from===id;if(!forward&&edge.to!==id)continue;const other=forward?edge.to:edge.from,next=cost+edgeLength(edge);
      if(next<(costs.get(other)??Infinity)){costs.set(other,next);paths.set(other,[...paths.get(id)!,{edge,start:forward?0:1,end:forward?1:0,node:other}]);}}
  }return{cost:Infinity,legs:[]};
}
/** Stable first view for the same type if a pending-only section disappears. */
export function resolveScenicStop(route:ScenicRoute,id:string):string {
 if(route.stops.some(s=>s.id===id&&!s.transit))return id;
 const type=Number(id.split(":")[1]),sameType=route.stops.find(s=>s.typeIndex===type&&s.section===0);
 return sameType?.id??route.stops[0]!.id;
}
export interface ScenicNavigator {readonly pose:ScenicCameraPose;readonly selectedId:string;select(id:string,reducedMotion:boolean):void;tick(seconds:number):void;interrupt():void;update(route:ScenicRoute):void}
export function createScenicNavigator(initial:ScenicRoute,initialId:string):ScenicNavigator {
  let route=initial,selectedId=route.stops.some(s=>s.id===initialId)?initialId:route.stops[0]!.id,node=selectedId;
  let pose=route.stops.find(s=>s.id===node)!.pose,legs:Leg[]=[],current:Leg|null=null,t=0,elapsed=0,startPose=pose;
  const stopPose=(id:string)=>route.stops.find(s=>s.id===id)!.pose;
  const begin=()=>{current=legs.shift()??null;elapsed=0;startPose=pose;if(current)t=current.start;};
  const interrupt=()=>{legs=[];current=null;node=selectedId;pose=stopPose(node);};
  return {get pose(){return pose;},get selectedId(){return selectedId;},interrupt,
    update(next){
      const invalid=current && [current,...legs].some(leg=>!next.edges.some(edge=>edge.id===leg.edge.id&&edge.from===leg.edge.from&&edge.to===leg.edge.to));
      route=next;const resolved=resolveScenicStop(route,selectedId);
      if(resolved!==selectedId||invalid){selectedId=resolved;interrupt();}
    },
    select(id,still){if(!route.stops.some(s=>s.id===id)||id===selectedId)return;selectedId=id;if(still){interrupt();return;}
      if(current){const edge=route.edges.find(e=>e.id===current!.edge.id)??current.edge,a=path(route,edge.from,id),b=path(route,edge.to,id),length=edgeLength(edge);
        const toStart=t*length+a.cost<=(1-t)*length+b.cost;
        legs=[{edge,start:t,end:toStart?0:1,node:toStart?edge.from:edge.to},...(toStart?a.legs:b.legs)];
      }else legs=path(route,node,id).legs;
      begin();
    },
    tick(seconds){let remaining=Math.min(.1,Math.max(0,Number.isFinite(seconds)?seconds:0));
      while(current&&remaining>0){const turn=Math.abs(shortestAngle(heading(startPose).yaw,heading(stopPose(current.node)).yaw)),duration=Math.min(3.2,Math.max(.65,edgeLength(current.edge)*Math.abs(current.end-current.start)/6,turn/1.2));
        const dt=Math.min(remaining,duration-elapsed);elapsed+=dt;remaining-=dt;const linear=Math.min(1,elapsed/duration),s=linear*linear*(3-2*linear);
        t=current.start+(current.end-current.start)*s;pose=directedPose(curvePoint(current.edge,t),startPose,stopPose(current.node),s);
        if(linear>=1){node=current.node;pose=stopPose(node);begin();}
      }
    }};
}
export function scenicPose(pose:JourneyPose,aspect:number,fovY:number,focus:FocusTarget|null,weight:number):JourneyPose {
  return focus&&weight>0?blendPoses(pose,focusPose(focus,aspect,fovY),weight):pose;
}
