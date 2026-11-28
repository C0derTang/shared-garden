import {expect,it} from 'vitest';
import fixture from '../../../scripts/profiling/fixtures/type-area-garden.json';
import {parseGardenState} from '@/lib/garden-v2/model';
import {compactAreaLayout,MATURE_ENVELOPE} from '@/lib/garden-v2/compact-areas';
import {gardenTour} from './garden-tour';
import {buildLandingCasterStrokes,landingRocks} from './landing';
import {STROKE_KIND} from './strokes';
import {curvePoint,curveDirection,PATH_HALF_WIDTH} from './scenic-route';
import {landingTerrainHeight,landingLakeDepth} from './site-geography';
import {bedRimRadius,type Vec3} from './layout';
const capsules=buildLandingCasterStrokes().filter(s=>s.kind===STROKE_KIND.trunk).map(s=>({a:s.origin,d:s.axis,r:s.width/2+Math.abs(s.bend)*Math.hypot(...s.axis),length2:s.axis.reduce((n,v)=>n+v*v,0)}));
const roots=capsules.filter(c=>c.a[1]<landingTerrainHeight(c.a[0],c.a[2])+.2),rocks=landingRocks();
function solidDistance(p:Vec3){let distance=Infinity;for(const c of capsules){if(p.some((v,i)=>v<Math.min(c.a[i]!,c.a[i]!+c.d[i]!)-c.r-2||v>Math.max(c.a[i]!,c.a[i]!+c.d[i]!)+c.r+2))continue;const t=Math.max(0,Math.min(1,p.reduce((n,v,i)=>n+(v-c.a[i]!)*c.d[i]!,0)/(c.length2||1)));distance=Math.min(distance,Math.hypot(...p.map((v,i)=>v-c.a[i]!-c.d[i]!*t))-c.r);}return distance;}
const groundDistance=(x:number,z:number)=>Math.min(...roots.map(c=>Math.hypot(x-c.a[0],z-c.a[2])-c.r),...rocks.map(r=>Math.hypot(x-r.x,z-r.z)-r.radius));
it('clears all retained wood, rocks, dry shore and actual mature pockets along the full cubic ribbon including occupied bends',()=>{
 const state=parseGardenState(structuredClone(fixture)),p=state.plants[0]!;state.plants=Array.from({length:193},(_,i)=>({...structuredClone(p),flower:{...p.flower,id:`later-${i}`,spot:i+1,planted_at:new Date(Date.UTC(2099,0,1,0,0,i)).toISOString()}}));
 const layout=compactAreaLayout(state),tour=gardenTour(layout.beds);let minimumBed=Infinity,minimumAt='';
 for(const edge of tour.edges)for(let i=0;i<=100;i++){
  const eye=curvePoint(edge,i/100),direction=curveDirection(edge,i/100);expect(solidDistance(eye),`${edge.id} eye${i}`).toBeGreaterThan(.3);
  for(const side of[-1,0,1]){const x=eye[0]-direction[2]*PATH_HALF_WIDTH*side,z=eye[2]+direction[0]*PATH_HALF_WIDTH*side;expect(groundDistance(x,z),`${edge.id} ribbon${i}`).toBeGreaterThan(.2);expect(landingLakeDepth(x,z)).toBeLessThan(-.5);
   for(const bed of layout.beds){const dx=x-bed.center[0],dz=z-bed.center[2];if(Math.abs(dx)>bed.radius+2||Math.abs(dz)>bed.radius+2)continue;const clearance=Math.hypot(dx,dz)-bedRimRadius(bed,Math.atan2(dz,dx));if(clearance<minimumBed){minimumBed=clearance;minimumAt=`${edge.id} t${i} side${side} bed${bed.index} ${x},${z}`;}}
  }
 }
 expect(minimumBed,`full-width ribbon/soil separation ${minimumAt}`).toBeGreaterThan(.12);
},30000);
it('clears original capsules throughout six mature canopies, preserving the actual model and growth scales',()=>{
 const state=parseGardenState(structuredClone(fixture)),p=state.plants[0]!;state.plants=state.catalog.flatMap((c,type)=>Array.from({length:6},(_,i)=>({...structuredClone(p),flower:{...p.flower,id:`full-${type}-${i}`,type_key:c.type_key,spot:type*6+i+1,planted_at:new Date(Date.UTC(2099,0,1,0,0,i)).toISOString()}})));
 const layout=compactAreaLayout(state);for(const spot of layout.spots.filter(s=>s.spot>0)){const[radius,height]=MATURE_ENVELOPE[spot.bed%13]!;for(let a=0;a<Math.PI*2;a+=Math.PI/6)for(const fraction of[0,.25,.5,.75,1]){const x=spot.position[0]+Math.cos(a)*radius,z=spot.position[2]+Math.sin(a)*radius;expect(solidDistance([x,spot.position[1]+height*fraction,z]),`mature${spot.spot}`).toBeGreaterThan(.2);expect(landingLakeDepth(x,z)).toBeLessThan(0);}}
});
