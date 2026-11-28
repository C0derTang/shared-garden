/** One directed distance contract for native scroll, flower anchors and actual camera. */
import type { Bed, Vec3 } from './layout';
import { landingTerrainHeight } from './site-geography';
import {BANK_APPROACHES} from './bank-garden';
import {MATURE_ENVELOPE} from '@/lib/garden-v2/compact-areas';
import { terraceFrame } from '@/lib/garden-v2/compact-areas';
import { curvePoint, edgeSamples, shortestAngle, type ScenicRoute, type ScenicCameraPose, type ScenicStop, type ScenicEdge, scenicRoute, scenicFovY } from './scenic-route';
export interface TourLeg {readonly edge:ScenicEdge;readonly start:number;readonly length:number;readonly distances:readonly number[];readonly scrollStart:number;readonly scrollLength:number}
export interface GardenTour extends ScenicRoute {readonly legs:readonly TourLeg[];readonly length:number;readonly scrollLength:number;readonly startDistance:number;readonly anchors:ReadonlyMap<number,number>}
const point=(x:number,z:number,height=2.55):Vec3=>[x,landingTerrainHeight(x,z)+height,z];
const heading=(p:ScenicCameraPose)=>Math.atan2(p.look[0]-p.eye[0],p.look[2]-p.eye[2]);
export function gardenTour(beds:readonly Bed[]):GardenTour {
 const ordered=[...beds].sort((a,b)=>(a.tourOrder??0)-(b.tourOrder??0));
 const terraces:ScenicStop[]=ordered.map(b=>{const frame=terraceFrame(b.tourOrder??0),eye=point(frame.walk[0],frame.walk[1],1.95);
 return{id:`terrace:${b.index}`,label:'',typeIndex:b.index%13,section:b.row,place:{kind:'flowers',typeIndex:b.index%13,section:b.row},pose:{eye,bankFov:MATURE_ENVELOPE[b.index%13]![1]<.75?40:48,look:[b.center[0],b.center[1]+.27,b.center[2]]}};});
 const base=terraces.filter(s=>s.section===0),expansion=terraces.filter(s=>s.section!==0);
 const surveyed=scenicRoute([]),ids=['house-rear',...Array.from({length:5},(_,i)=>`woodland:${i}`)];
 const access:ScenicStop[]=ids.map(id=>{const stop=surveyed.stops.find(s=>s.id===id)!;return {...stop,place:{kind:stop.pose.rear?'porch':'woodland'}};});
 const room:ScenicStop[]=[];
 for(let rank=0;rank<base.length;rank++){
  const bed=base[rank]!,previous=rank?base[rank-1]!:access.at(-1)!;
  const knots=BANK_APPROACHES[rank]!,chain=[previous.pose.eye,...knots.map(knot=>point(knot[0],knot[1],1.95)),bed.pose.eye],distances=[0];
  chain.slice(1).forEach((p,i)=>distances.push(distances[i]!+Math.hypot(p[0]-chain[i]![0],p[2]-chain[i]![2])));
  for(const [i,knot]of knots.entries()){
   const eye=point(knot[0],knot[1],1.95),u=distances[i+1]!/distances.at(-1)!,yaw=heading(previous.pose)+shortestAngle(heading(previous.pose),heading(bed.pose))*u;
   const pitch=(pose:ScenicCameraPose)=>Math.atan2(pose.look[1]-pose.eye[1],Math.hypot(pose.look[0]-pose.eye[0],pose.look[2]-pose.eye[2]));
   const tilt=pitch(previous.pose)+(pitch(bed.pose)-pitch(previous.pose))*u,target:Vec3=[eye[0]+Math.sin(yaw)*Math.cos(tilt)*8,eye[1]+Math.sin(tilt)*8,eye[2]+Math.cos(yaw)*Math.cos(tilt)*8];
   room.push({id:rank?`bank:${rank}:${i}`:`woodland:bank:${i}`,label:'',transit:true,place:rank?{kind:'flowers',typeIndex:bed.typeIndex!,section:0}:{kind:'woodland'},pose:{eye,look:target,bankFov:(previous.pose.bankFov??48)+((bed.pose.bankFov??48)-(previous.pose.bankFov??48))*u}});
  }
  if(!rank){const index=room.findIndex(stop=>stop.pose.eye[0]>=31.5);const arrival=room[index]!;room[index]={...arrival,id:'arrival',place:{kind:'overlook'},transit:false,pose:{eye:point(31,-6,3.7),look:[34,.2,-10.3],bankFov:60}};}
  room.push(bed);
 }
 const last=base.at(-1)!,lastFrame=terraceFrame(12);
 const end:ScenicStop={id:'end',label:'garden end',place:{kind:'meadow-edge'},pose:{eye:point(last.pose.eye[0]+lastFrame.tangent[0]*.5,last.pose.eye[2]+lastFrame.tangent[1]*.5,1.95),look:last.pose.look,bankFov:last.pose.bankFov}};
 const canonical=[...access,...room,end],tangents=new Map<string,readonly [number,number]>();
 canonical.forEach((stop,i)=>{const p=canonical[Math.max(0,i-1)]!.pose.eye,q=canonical[Math.min(canonical.length-1,i+1)]!.pose.eye,dx=q[0]-p[0],dz=q[2]-p[2],distance=Math.hypot(dx,dz)||1;
  const outgoing=i<canonical.length-1?Math.hypot(canonical[i+1]!.pose.eye[0]-stop.pose.eye[0],canonical[i+1]!.pose.eye[2]-stop.pose.eye[2]):1;
  const incoming=i?Math.hypot(stop.pose.eye[0]-canonical[i-1]!.pose.eye[0],stop.pose.eye[2]-canonical[i-1]!.pose.eye[2]):1;
  const size=Math.min(.5,incoming*.22,outgoing*.22);tangents.set(stop.id,[dx/distance*size,dz/distance*size]);
 });
 if(expansion.length){
  const final=expansion.at(-1)!,f=terraceFrame(13+expansion.length-1);
  for(const stop of expansion){const frame=terraceFrame(13+expansion.indexOf(stop));tangents.set(stop.id,[frame.tangent[0]*.55,frame.tangent[1]*.55]);}
  const turn:ScenicStop={id:`expansion-turn:${final.id}`,label:'meadow bend',place:{kind:'meadow-bend'},transit:true,pose:{eye:point(final.pose.eye[0]+f.tangent[0]*2.0+f.normal[0],final.pose.eye[2]+f.tangent[1]*2.0+f.normal[1],1.95),look:final.pose.look}};
  tangents.set(turn.id,[f.normal[0]*.6,f.normal[1]*.6]);
  const returning:ScenicStop[]=[...expansion].reverse().map(stop=>{const frame=terraceFrame(13+expansion.indexOf(stop));const id=`return:${stop.id}`;tangents.set(id,[-frame.tangent[0]*.55,-frame.tangent[1]*.55]);return{id,label:'meadow return',place:{kind:'meadow-return',typeIndex:stop.typeIndex!,section:stop.section!},transit:true,pose:{eye:point(stop.pose.eye[0]+frame.normal[0]*2.0,stop.pose.eye[2]+frame.normal[1]*2.0,1.95),look:stop.pose.look}};});
  const bend=(id:string,x:number,z:number,look:Vec3,tangent:readonly [number,number]):ScenicStop=>{tangents.set(id,tangent);return{id,label:'',transit:true,place:{kind:'woodland'},pose:{eye:point(x,z,1.95),look,bankFov:48}};};
  const outbound=[bend('expansion-access:0',77.5,-13.5,expansion[0]!.pose.look,[.5,-.1]),bend('expansion-access:1',80,-15.6,expansion[0]!.pose.look,[.5,-.05])];
  const home=[bend('expansion-return:0',82.5,-10.5,returning.at(-1)!.pose.look,[-.4,.4]),bend('expansion-return:1',77,-10.5,end.pose.look,[-.4,-.3])];
  room.push(...outbound,...expansion,turn,...returning,...home);

 }
 const stops=[...access,...room,end];
 const edges:ScenicEdge[]=stops.slice(1).map((to,i)=>{
  const from=stops[i]!,original=surveyed.edges.find(e=>(e.from===from.id&&e.to===to.id)||(e.from===to.id&&e.to===from.id));
  if(i<access.length-1&&original)return original.from===from.id?original:{...original,from:from.id,to:to.id,points:[...original.points].reverse() as [Vec3,Vec3,Vec3,Vec3]};
  const p=from.pose.eye,q=to.pose.eye,outgoing=tangents.get(from.id)!,incoming=tangents.get(to.id)!;
  return{id:`tour:${from.id}:${to.id}`,from:from.id,to:to.id,primary:true,points:[p,point(p[0]+outgoing[0],p[2]+outgoing[1],p[1]-landingTerrainHeight(p[0],p[2])),point(q[0]-incoming[0],q[2]-incoming[1],q[1]-landingTerrainHeight(q[0],q[2])),q]};
 });
 let length=0,scrollLength=0,startDistance=0;const anchors=new Map<number,number>();
 const legs=edges.map((edge,i)=>{const samples=edgeSamples(edge),distances=[0];samples.slice(1).forEach((p,j)=>distances.push(distances[j]!+Math.hypot(p[0]-samples[j]![0],p[2]-samples[j]![2])));const geometric=distances.at(-1)!,woodland=i<stops.findIndex(s=>s.id==='arrival');
 const pixels=Math.max(geometric*(woodland?12:80),Math.abs(shortestAngle(heading(stops[i]!.pose),heading(stops[i+1]!.pose)))*(woodland?80:300));
 const leg={edge,start:length,length:geometric,distances,scrollStart:scrollLength,scrollLength:pixels};length+=geometric;scrollLength+=pixels;
 const stop=stops[i+1]!;if(stop.id==='arrival')startDistance=length;if(stop.typeIndex!==undefined&&!anchors.has(stop.typeIndex))anchors.set(stop.typeIndex,length);return leg;});
 return{stops,edges,legs,length,scrollLength,startDistance,anchors,islands:[{id:'garden-bank',center:point(53,-13,0),radiusX:25,radiusZ:7}]};
}
export function tourCoordinate(tour:GardenTour,distance:number):{id:string;fraction:number}{const d=Math.max(0,Math.min(tour.length,Number.isFinite(distance)?distance:0));const leg=tour.legs.find(l=>d<=l.start+l.length)??tour.legs.at(-1)!;return{id:leg.edge.id,fraction:(d-leg.start)/(leg.length||1)};}
export function pixelsToTourDistance(tour:GardenTour,pixels:number):number {const p=Math.max(0,Math.min(tour.scrollLength,Number.isFinite(pixels)?pixels:0)),leg=tour.legs.find(l=>p<=l.scrollStart+l.scrollLength)??tour.legs.at(-1)!;return leg.start+(p-leg.scrollStart)/leg.scrollLength*leg.length;}
export function tourDistanceToPixels(tour:GardenTour,distance:number):number {const at=tourCoordinate(tour,distance),leg=tour.legs.find(l=>l.edge.id===at.id)!;return leg.scrollStart+leg.scrollLength*at.fraction;}
export function retainTourDistance(before:GardenTour,after:GardenTour,distance:number):number {
 const d=Math.max(0,Math.min(before.length,Number.isFinite(distance)?distance:0));
 const boundaries=(tour:GardenTour)=>[...tour.legs.map(leg=>({id:leg.edge.from,distance:leg.start})),{id:tour.legs.at(-1)!.edge.to,distance:tour.length}];
 const next=new Map(boundaries(after).map(stop=>[stop.id,stop.distance]));
 const stable=boundaries(before).filter(stop=>next.has(stop.id));
 // A shared stop is its own identity, even if division classifies the incoming
 // curve fraction a ULP above one. Never alias it to another stop of its type.
 const exact=stable.find(stop=>stop.distance===d);if(exact)return next.get(exact.id)!;
 const at=tourCoordinate(before,d),leg=after.legs.find(leg=>leg.edge.id===at.id);
 if(leg)return leg.start+leg.length*at.fraction;
 // Only genuinely removed geometry may fall back. Use old-route proximity,
 // including both sides of a removed turn; an exact tie keeps the earlier stop.
 let nearest=stable[0];for(const stop of stable)if(!nearest||Math.abs(stop.distance-d)<Math.abs(nearest.distance-d))nearest=stop;
 return nearest?next.get(nearest.id)!:after.startDistance;
}
export function tourPose(tour:GardenTour,distance:number):ScenicCameraPose {
 const d=Math.max(0,Math.min(tour.length,Number.isFinite(distance)?distance:0));
 const exact=tour.legs.find(leg=>leg.start===d);if(exact)return tour.stops.find(stop=>stop.id===exact.edge.from)!.pose;
 if(d===tour.length)return tour.stops.at(-1)!.pose;
 const at=tourCoordinate(tour,d),leg=tour.legs.find(l=>l.edge.id===at.id)!,target=at.fraction*leg.length,ds=leg.distances;
 let i=1;while(i<ds.length-1&&ds[i]!<target)i++;const t=((i-1)+(target-ds[i-1]!)/(ds[i]!-ds[i-1]!||1))/(ds.length-1),eye=curvePoint(leg.edge,t);
 const a=tour.stops.find(s=>s.id===leg.edge.from)!.pose,b=tour.stops.find(s=>s.id===leg.edge.to)!.pose,s=at.fraction*at.fraction*(3-2*at.fraction);
 const pitch=(p:ScenicCameraPose)=>Math.atan2(p.look[1]-p.eye[1],Math.hypot(p.look[0]-p.eye[0],p.look[2]-p.eye[2]));
 const yaw=heading(a)+shortestAngle(heading(a),heading(b))*s,tilt=pitch(a)+(pitch(b)-pitch(a))*s;
 return{eye,bankFov:(a.bankFov??48)+((b.bankFov??48)-(a.bankFov??48))*s,look:[eye[0]+Math.sin(yaw)*Math.cos(tilt)*8,eye[1]+Math.sin(tilt)*8,eye[2]+Math.cos(yaw)*Math.cos(tilt)*8],overview:(a.overview??0)+((b.overview??0)-(a.overview??0))*s,rear:(a.rear??0)+((b.rear??0)-(a.rear??0))*s};
}
/** Keep the mature terrace inside portrait width without moving the camera off its path. */
export function tourFovY(pose:ScenicCameraPose,aspect:number,focusWeight=0):number {const ordinary=scenicFovY(pose,aspect,focusWeight),horizontal=pose.bankFov??48,minimum=30+Math.min(1,Math.max(0,(horizontal-40)/8))*8+Math.min(1,Math.max(0,(horizontal-48)/12))*10,bank=Math.max(minimum*Math.PI/180,2*Math.atan(Math.tan(horizontal*.5*Math.PI/180)/Math.max(.2,aspect)));const lens=ordinary+(bank-ordinary)*(1-(pose.rear??0))*(1-focusWeight);return pose.rear===1||focusWeight===1?ordinary:Math.fround(lens);}
