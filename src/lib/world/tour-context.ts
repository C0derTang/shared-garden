/** Passive orientation derives from the same accepted arc distance as the camera. */
import {flowerTypes,type FlowerType} from '@/lib/garden-v2/model';
import type {GardenTour} from './garden-tour';
import type {ScenicPlace} from './scenic-route';
export interface TourContext {readonly label:string;readonly type:FlowerType|null;readonly progress:number}
function words(place:ScenicPlace|undefined):Pick<TourContext,'label'|'type'> {
 if(place?.kind==='flowers'||place?.kind==='meadow-return'){
  const type=flowerTypes[place.typeIndex];
  if(type)return {type,label:place.kind==='meadow-return'?`${type} · return path`:place.section?`${type} · meadow ${place.section+1}`:`${type} garden`};
 }
 const labels={porch:'back porch',woodland:'woodland path',overlook:'garden overlook','meadow-bend':'meadow bend','meadow-edge':'meadow edge'};
 return {type:null,label:place&&place.kind in labels?labels[place.kind as keyof typeof labels]:'garden path'};
}
/** Nearest actual stop by arc distance; exact midpoint ties retain the earlier place.
 * Labels share a whole semantic region, not each edge/pixel. No selected stop state,
 * anchor lookup, direction state, camera override or geometry assumptions live here.
 */
export function tourContext(tour:GardenTour,distance:number):TourContext {
 const d=Math.max(0,Math.min(tour.length,Number.isFinite(distance)?distance:0));
 const leg=tour.legs.find(leg=>d<=leg.start+leg.length)??tour.legs.at(-1);
 const id=leg?(d-leg.start<=leg.length/2?leg.edge.from:leg.edge.to):tour.stops[0]?.id;
 return {...words(tour.stops.find(stop=>stop.id===id)?.place),progress:tour.length>0?d/tour.length:0};
}
