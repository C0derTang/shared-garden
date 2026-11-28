/** Compact presentation only: immutable chronology, never persisted spot mileage. Decision0073. */
import { flowerTypes, type Plant, type GardenState } from './model';
import type { TypeAreaLayout, TypeArea } from './type-areas';
import { bedTerrainHeight, type Bed, type PlantingSpot, type Vec3 } from '@/lib/world/layout';
import {bankFrame} from '@/lib/world/bank-garden';
import { plantingSurfaceHeight } from '@/lib/world/site-surface';

export const TERRACE_CAPACITY = 6;
/** Conservative ceilings above canonical mature seeds1..300, including sway margin.
 * Radius/height are fixed per species, independent of current growth or population. */
export const MATURE_ENVELOPE = [
 [.40,1.10],[.28,.60],[.28,.90],[.27,.74],[.27,.71],[.28,.96],
 [.31,1.42],[.17,1.04],[.34,1.07],[.23,.51],[.26,.52],[.14,.43],[.34,.99],
] as const;
/** Tall/cool framing flows into warm and shorter blooms without hiding them. */
export const TERRACE_ORDER = [6,7,0,9,12,3,2,11,4,5,10,8,1] as const;
export const TERRACE_STEP = 4.25;
export const terraceFrame=bankFrame;
export function comparePlanting(a:Plant,b:Plant):number {
 return a.flower.planted_at.localeCompare(b.flower.planted_at) || a.flower.spot-b.flower.spot || a.flower.id.localeCompare(b.flower.id);
}
/** Canonical physical centre of one of the six terrace slots. Shared with camera framing. */
export function terraceSlotPosition(bed:Bed,slot:number):Vec3 {
 const type=bed.index%13,spacing=Math.max(.5,MATURE_ENVELOPE[type]![0]*2+.2),rowSpacing=Math.max(.65,MATURE_ENVELOPE[type]![0]*2+.18),column=slot%3,row=Math.floor(slot/3);
 const a=bed.rotation??0,tx=Math.cos(a),tz=Math.sin(a),nx=-tz,nz=tx;
 const x=bed.center[0]+tx*(column-1)*spacing+nx*(row-.5)*rowSpacing,z=bed.center[2]+tz*(column-1)*spacing+nz*(row-.5)*rowSpacing;
 return[x,bedTerrainHeight(bed,x,z),z];
}
export function compactAreaLayout(state:Pick<GardenState,'plants'|'garden'|'catalog'>):TypeAreaLayout {
 const sorted=flowerTypes.map(type=>state.plants.filter(p=>p.flower.type_key===type).sort(comparePlanting));
 const modules=sorted.flatMap((plants,type)=>Array.from({length:Math.max(1,Math.ceil(plants.length/TERRACE_CAPACITY))},(_,section)=>({type,section,first:plants[section*TERRACE_CAPACITY]})));
 const overflow=modules.filter(m=>m.section>0).sort((a,b)=>a.first&&b.first?comparePlanting(a.first,b.first):a.first?-1:b.first?1:a.type-b.type);
 const beds=new Map<string,Bed>();
 for(const terrace of modules){
  const rank=terrace.section===0?TERRACE_ORDER.indexOf(terrace.type as typeof TERRACE_ORDER[number]):13+overflow.indexOf(terrace);
  const frame=terraceFrame(rank),[x,z]=frame.center;
  const envelope=MATURE_ENVELOPE[terrace.type]![0],spacing=Math.max(.5,envelope*2+.2),rowSpacing=Math.max(.65,envelope*2+.18),footprint:[number,number]=[spacing+envelope+.15,rowSpacing/2+envelope+.15],radius=Math.max(...footprint);
  beds.set(`${terrace.type}:${terrace.section}`,{index:terrace.section*13+terrace.type,row:terrace.section,center:[x,plantingSurfaceHeight(x,z),z],radius,footprint,seedSide:rank<13&&[3,7,8].includes(rank)?-1:1,site:true,organic:true,terrace:true,tourOrder:rank,rotation:Math.atan2(frame.tangent[1],frame.tangent[0])});
 }
 const spots:PlantingSpot[]=[];
 const address=(type:number,rank:number,spot:number):PlantingSpot=>{
  const section=Math.floor(rank/TERRACE_CAPACITY),slot=rank%TERRACE_CAPACITY,bed=beds.get(`${type}:${section}`)!;
  return{spot,bed:bed.index,position:terraceSlotPosition(bed,slot)};
 };
 const areas=flowerTypes.map((type,index):TypeArea=>{
  const plants=sorted[index]!;plants.forEach((p,rank)=>spots.push(address(index,rank,p.flower.spot)));
  const last=beds.get(`${index}:${Math.max(0,Math.ceil(plants.length/TERRACE_CAPACITY)-1)}`)!,a=last.rotation??0,sign=last.seedSide??1,offset=(last.footprint?.[1]??1)+.25,x=last.center[0]-Math.sin(a)*offset*sign,z=last.center[2]+Math.cos(a)*offset*sign;
  const target={spot:-index-1,bed:last.index,position:[x,bedTerrainHeight(last,x,z),z] as [number,number,number],persistedSpot:state.garden.next_spot};spots.push(target);
  return{type,name:(state.catalog.find(c=>c.type_key===type)?.display_name??type).toLowerCase(),plants,target};
 });
 return{areas,beds:[...beds.values()].sort((a,b)=>(a.tourOrder??0)-(b.tourOrder??0)),spots,maxZ:Math.max(...[...beds.values()].map(b=>b.center[2]))};
}
