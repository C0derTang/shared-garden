/** One directed distance contract for native scroll, flower anchors and actual camera. */
import type { Bed, Vec3 } from './layout';
import { landingTerrainHeight } from './site-geography';
import { terraceFrame } from '@/lib/garden-v2/compact-areas';
import { curvePoint, edgeSamples, shortestAngle, type ScenicRoute, type ScenicCameraPose, type ScenicStop, type ScenicEdge, scenicRoute, scenicFovY } from './scenic-route';
export interface TourLeg {readonly edge:ScenicEdge;readonly start:number;readonly length:number;readonly distances:readonly number[];readonly scrollStart:number;readonly scrollLength:number}
export interface GardenTour extends ScenicRoute {readonly legs:readonly TourLeg[];readonly length:number;readonly scrollLength:number;readonly startDistance:number;readonly anchors:ReadonlyMap<number,number>}
const point=(x:number,z:number,height=2.55):Vec3=>[x,landingTerrainHeight(x,z)+height,z];
const heading=(p:ScenicCameraPose)=>Math.atan2(p.look[0]-p.eye[0],p.look[2]-p.eye[2]);
export function gardenTour(beds:readonly Bed[]):GardenTour {
 const ordered=[...beds].sort((a,b)=>(a.tourOrder??0)-(b.tourOrder??0));
 const terraces:ScenicStop[]=ordered.map(b=>{const frame=terraceFrame(b.tourOrder??0),eye=point(frame.walk[0],frame.walk[1],2.35);
 return{id:`terrace:${b.index}`,label:'',typeIndex:b.index%13,section:b.row,pose:{eye,look:[b.center[0],b.center[1]+.55,b.center[2]]}};});
 const base=terraces.filter(s=>s.section===0),expansion=terraces.filter(s=>s.section!==0),room=[...base];
 if(expansion.length){
  const last=expansion.at(-1)!;
  const turn:ScenicStop={id:`expansion-turn:${last.id}`,label:'meadow bend',transit:true,pose:{eye:point(23,last.pose.eye[2]+3,2.35),look:last.pose.look}};
  const returning:ScenicStop[]=[...expansion].reverse().map(stop=>({id:`return:${stop.id}`,label:'meadow return',transit:true,pose:{eye:point(24,stop.pose.eye[2],2.35),look:stop.pose.look}}));
  room.splice(room.findIndex(s=>s.typeIndex===4)+1,0,...expansion,turn,...returning);
 }
 const first=base[0]!,last=base.at(-1)!;
 room.unshift({id:'arrival',label:'garden',pose:{eye:point(first.pose.eye[0]+1,first.pose.eye[2]-3,5.0),look:[18,landingTerrainHeight(18,64),64],overview:.5}});
 room.push({id:'end',label:'garden end',pose:{eye:point(last.pose.eye[0]-1,last.pose.eye[2]-2),look:last.pose.look}});
 const surveyed=scenicRoute([]),ids=['house-rear',...Array.from({length:7},(_,i)=>`woodland:${i}`),'overview:0'];
 const access=ids.map(id=>surveyed.stops.find(s=>s.id===id)!);
 const stops=[...access,...room];
 // A stop's tangent belongs to its immutable spatial slot, not its current
 // itinerary neighbors. Inserting a spur must not bend surviving room edges.
 const tangents=new Map<string,readonly [number,number]>();
 const delta=(previous:Vec3,next:Vec3):readonly [number,number]=>[(next[0]-previous[0])*.16,(next[2]-previous[2])*.16];
 const canonical=[...access,room[0]!,...base,room.at(-1)!];
 canonical.forEach((stop,i)=>tangents.set(stop.id,delta(canonical[Math.max(0,i-1)]!.pose.eye,canonical[Math.min(canonical.length-1,i+1)]!.pose.eye)));
 const virtual=(ordinal:number):Vec3=>{const frame=terraceFrame(13+ordinal);return point(frame.walk[0],frame.walk[1],2.35);};
 expansion.forEach((stop,i)=>{
  tangents.set(stop.id,delta(i?virtual(i-1):base.find(s=>s.typeIndex===4)!.pose.eye,virtual(i+1)));
  tangents.set(`return:${stop.id}`,delta(point(24,virtual(i+1)[2],2.35),i?point(24,virtual(i-1)[2],2.35):base.find(s=>s.typeIndex===1)!.pose.eye));
 });
 const turn=room.find(s=>s.id.startsWith('expansion-turn:'));if(turn)tangents.set(turn.id,[.32,0]);
 const edges:ScenicEdge[]=stops.slice(1).map((to,i)=>{
  const from=stops[i]!,original=surveyed.edges.find(e=>(e.from===from.id&&e.to===to.id)||(e.from===to.id&&e.to===from.id));
  if(i<access.length-1&&original)return original.from===from.id?original:{...original,from:from.id,to:to.id,points:[...original.points].reverse() as [Vec3,Vec3,Vec3,Vec3]};
  const p=from.pose.eye,q=to.pose.eye,outgoing=tangents.get(from.id)!,incoming=tangents.get(to.id)!;
  return{id:`tour:${from.id}:${to.id}`,from:from.id,to:to.id,primary:true,points:[p,point(p[0]+outgoing[0],p[2]+outgoing[1],p[1]-landingTerrainHeight(p[0],p[2])),point(q[0]-incoming[0],q[2]-incoming[1],q[1]-landingTerrainHeight(q[0],q[2])),q]};
 });
 let length=0,scrollLength=0,startDistance=0;const anchors=new Map<number,number>();
 const legs=edges.map((edge,i)=>{const samples=edgeSamples(edge),distances=[0];samples.slice(1).forEach((p,j)=>distances.push(distances[j]!+Math.hypot(p[0]-samples[j]![0],p[2]-samples[j]![2])));const geometric=distances.at(-1)!,woodland=i<access.length;
 const pixels=Math.max(geometric*(woodland?12:80),Math.abs(shortestAngle(heading(stops[i]!.pose),heading(stops[i+1]!.pose)))*(woodland?80:300));
 const leg={edge,start:length,length:geometric,distances,scrollStart:scrollLength,scrollLength:pixels};length+=geometric;scrollLength+=pixels;
 const stop=stops[i+1]!;if(stop.id==='arrival')startDistance=length;if(stop.typeIndex!==undefined&&!anchors.has(stop.typeIndex))anchors.set(stop.typeIndex,length);return leg;});
 return{stops,edges,legs,length,scrollLength,startDistance,anchors,islands:[{id:'garden-room',center:point(18,64,0),radiusX:17,radiusZ:13}]};
}
export function tourCoordinate(tour:GardenTour,distance:number):{id:string;fraction:number}{const d=Math.max(0,Math.min(tour.length,Number.isFinite(distance)?distance:0));const leg=tour.legs.find(l=>d<=l.start+l.length)??tour.legs.at(-1)!;return{id:leg.edge.id,fraction:(d-leg.start)/(leg.length||1)};}
export function pixelsToTourDistance(tour:GardenTour,pixels:number):number {const p=Math.max(0,Math.min(tour.scrollLength,Number.isFinite(pixels)?pixels:0)),leg=tour.legs.find(l=>p<=l.scrollStart+l.scrollLength)??tour.legs.at(-1)!;return leg.start+(p-leg.scrollStart)/leg.scrollLength*leg.length;}
export function tourDistanceToPixels(tour:GardenTour,distance:number):number {const at=tourCoordinate(tour,distance),leg=tour.legs.find(l=>l.edge.id===at.id)!;return leg.scrollStart+leg.scrollLength*at.fraction;}
export function retainTourDistance(before:GardenTour,after:GardenTour,distance:number):number {const at=tourCoordinate(before,distance),leg=after.legs.find(l=>l.edge.id===at.id);if(leg)return leg.start+leg.length*at.fraction;const previous=before.legs.find(l=>l.edge.id===at.id)!;const anchor=previous.edge.from.startsWith('expansion-turn:')?after.legs.find(l=>l.edge.to===previous.edge.to):after.legs.find(l=>l.edge.to===previous.edge.from)??after.legs.find(l=>l.edge.to===previous.edge.to);return anchor?anchor.start+anchor.length:after.startDistance;}
export function tourPose(tour:GardenTour,distance:number):ScenicCameraPose {
 const at=tourCoordinate(tour,distance),leg=tour.legs.find(l=>l.edge.id===at.id)!,target=at.fraction*leg.length,ds=leg.distances;
 let i=1;while(i<ds.length-1&&ds[i]!<target)i++;const t=((i-1)+(target-ds[i-1]!)/(ds[i]!-ds[i-1]!||1))/(ds.length-1),eye=curvePoint(leg.edge,t);
 const a=tour.stops.find(s=>s.id===leg.edge.from)!.pose,b=tour.stops.find(s=>s.id===leg.edge.to)!.pose,s=at.fraction*at.fraction*(3-2*at.fraction);
 const pitch=(p:ScenicCameraPose)=>Math.atan2(p.look[1]-p.eye[1],Math.hypot(p.look[0]-p.eye[0],p.look[2]-p.eye[2]));
 const yaw=heading(a)+shortestAngle(heading(a),heading(b))*s,tilt=pitch(a)+(pitch(b)-pitch(a))*s;
 return{eye,look:[eye[0]+Math.sin(yaw)*Math.cos(tilt)*8,eye[1]+Math.sin(tilt)*8,eye[2]+Math.cos(yaw)*Math.cos(tilt)*8],overview:(a.overview??0)+((b.overview??0)-(a.overview??0))*s,rear:(a.rear??0)+((b.rear??0)-(a.rear??0))*s};
}
/** Keep the mature terrace inside portrait width without moving the camera off its path. */
export function tourFovY(pose:ScenicCameraPose,aspect:number,focusWeight=0):number {const ordinary=scenicFovY(pose,aspect,focusWeight),wide=2*Math.atan(Math.tan(30*Math.PI/180)/Math.max(.2,aspect));return ordinary+(Math.max(ordinary,wide)-ordinary)*(1-focusWeight);}
