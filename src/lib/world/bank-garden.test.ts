import {expect,it} from 'vitest';
import fixture from '../../../scripts/profiling/fixtures/type-area-garden.json';
import {parseGardenState} from '@/lib/garden-v2/model';
import {compactAreaLayout,MATURE_ENVELOPE} from '@/lib/garden-v2/compact-areas';
import {gardenTour} from './garden-tour';
import {buildScenicGroundMesh} from './scenic-ground';
import {buildScenicPath} from './scenic-path';
import {buildBedMesh} from './scenery';
import {groundSampler,meshClearanceQuery} from '@/test/ground-sampler';
import {landingLakeDepth} from './site-geography';
import {bedRimRadius} from './layout';
import {scenicWaterExtent} from './scenic-water';
function stateWithRoses(count:number){const state=parseGardenState(structuredClone(fixture)),plant=state.plants[0]!;state.plants=Array.from({length:count},(_,i)=>({...structuredClone(plant),flower:{...plant.flower,id:`synthetic-${i}`,spot:i+1,planted_at:new Date(Date.UTC(2099,0,1,0,0,i)).toISOString()}}));return state;}
it('keeps actual bank roots, full soil/ribbon triangle interiors above every rendered terrain layer',()=>{
 const state=stateWithRoses(193),layout=compactAreaLayout(state),tour=gardenTour(layout.beds),ground=buildScenicGroundMesh(tour,layout.beds),sample=groundSampler(ground),clearance=meshClearanceQuery(ground);
 for(const spot of layout.spots){const ground=sample(spot.position[0],spot.position[2]);expect(ground).not.toBeNull();expect(spot.position[1]-ground!,`root ${spot.spot} at${spot.position}`).toBeGreaterThan(.001);expect(landingLakeDepth(spot.position[0],spot.position[2])).toBeLessThan(0);}
 for(const [name,mesh]of [['soil',buildBedMesh(layout.beds)],['ribbon',buildScenicPath(tour)]] as const){const result=clearance(mesh);expect(result.pairs).toBeGreaterThan(mesh.indices.length/3);expect(result.minimum,`${name} exact overlap minimum at${result.point}`).toBeGreaterThan(.0005);}

 const extent=scenicWaterExtent(tour);for(const stop of tour.stops){expect(extent.maxX-stop.pose.eye[0]).toBeGreaterThanOrEqual(420);expect(extent.minZ).toBeLessThan(stop.pose.eye[2]-420);}
},30000);
it('fits six true mature envelopes and dry irregular rims without persisted spot mileage',()=>{
 const state=parseGardenState(structuredClone(fixture)),p=state.plants[0]!;state.plants=state.catalog.flatMap((c,type)=>Array.from({length:6},(_,i)=>({...structuredClone(p),flower:{...p.flower,type_key:c.type_key,id:`full-${type}-${i}`,spot:type*6+i+1,planted_at:new Date(Date.UTC(2099,0,1,0,0,i)).toISOString()}})));
 const layout=compactAreaLayout(state);for(const bed of layout.beds){for(let a=0;a<Math.PI*2;a+=.04){const r=bedRimRadius(bed,a);expect(landingLakeDepth(bed.center[0]+Math.cos(a)*r,bed.center[2]+Math.sin(a)*r)).toBeLessThan(-.2);}
 for(const spot of layout.spots.filter(s=>s.bed===bed.index&&s.spot>0))for(let a=0;a<Math.PI*2;a+=.08){const radius=MATURE_ENVELOPE[bed.index%13]![0],x=spot.position[0]+Math.cos(a)*radius-bed.center[0],z=spot.position[2]+Math.sin(a)*radius-bed.center[2];expect(Math.hypot(x,z)).toBeLessThan(bedRimRadius(bed,Math.atan2(z,x))-.015);}}
});
