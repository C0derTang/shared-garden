import{expect,it}from'vitest';import{v2GardenFixture}from'@/test/garden-v2-fixture';import{compactAreaLayout}from'@/lib/garden-v2/compact-areas';import{gardenTour,tourPose,retainTourDistance,pixelsToTourDistance,tourDistanceToPixels}from'./garden-tour';import{distanceToScenicPath,shortestAngle}from'./scenic-route';
it('has one bounded continuous arc and13 anchors without graph junction jumps',()=>{const tour=gardenTour(compactAreaLayout(v2GardenFixture()).beds);expect(tour.anchors.size).toBe(13);expect(tour.length).toBeLessThan(160);let previous=tourPose(tour,0);for(let d=.01;d<=tour.length;d+=.04){const pose=tourPose(tour,d);expect(distanceToScenicPath(tour,pose.eye[0],pose.eye[2])).toBeLessThan(.015);expect(Math.hypot(pose.eye[0]-previous.eye[0],pose.eye[2]-previous.eye[2])).toBeLessThan(.08);const heading=(p:typeof pose)=>Math.atan2(p.look[0]-p.eye[0],p.look[2]-p.eye[2]);expect(Math.abs(shortestAngle(heading(previous),heading(pose)))).toBeLessThan(.08);previous=pose;}expect(tourPose(tour,-10)).toEqual(tourPose(tour,0));expect(tourPose(tour,Infinity)).toEqual(tourPose(tour,0));expect(tourPose(tour,tour.length+10)).toEqual(tourPose(tour,tour.length));});
it('retains actual edge coordinate and heading when a later layout appends',()=>{const state=v2GardenFixture(),before=gardenTour(compactAreaLayout(state).beds),distance=before.anchors.get(0)!+.7;state.garden.next_spot=12001;const after=gardenTour(compactAreaLayout(state).beds);expect(tourPose(after,retainTourDistance(before,after,distance))).toEqual(tourPose(before,distance));});

it('maps native pixels monotonically and exactly onto arc distance, with a brief surveyed porch approach',()=>{const tour=gardenTour(compactAreaLayout(v2GardenFixture()).beds);expect(tourPose(tour,0).rear).toBe(1);expect(tour.startDistance).toBeGreaterThan(0);expect(tourDistanceToPixels(tour,tour.startDistance)).toBeLessThan(tour.scrollLength*.25);let previous=-1;for(let p=0;p<=tour.scrollLength;p+=7){const d=pixelsToTourDistance(tour,p);expect(d).toBeGreaterThan(previous);expect(tourDistanceToPixels(tour,d)).toBeCloseTo(p,8);previous=d;}});
it('adds only a short occupied overflow terrace and retains the former endpoint semantically',()=>{const state=v2GardenFixture(),p=state.plants[0]!;state.plants=Array.from({length:6},(_,i)=>({...structuredClone(p),flower:{...p.flower,id:`p${i}`,spot:i+1,planted_at:`2026-06-01T00:00:0${i}Z`}}));const before=gardenTour(compactAreaLayout(state).beds);state.plants.push({...structuredClone(p),flower:{...p.flower,id:'later',spot:12001,planted_at:'2099-01-01T00:00:00Z'}});const layout=compactAreaLayout(state),after=gardenTour(layout.beds),overflow=after.legs.find(l=>l.edge.to==='terrace:13')!;expect(layout.beds).toHaveLength(14);expect(overflow.length).toBeLessThan(8);expect(tourPose(after,retainTourDistance(before,after,before.length))).toEqual(tourPose(before,before.length));});

import {flowerTypes} from '@/lib/garden-v2/model';
import {lookAt,multiply,perspective} from './camera';
import {tourFovY} from './garden-tour';
function fullTourFixture(){const state=v2GardenFixture(),template=state.plants[0]!;state.plants=flowerTypes.flatMap((type,t)=>Array.from({length:6},(_,i)=>({...structuredClone(template),flower:{...template.flower,id:`full-${t}-${i}`,spot:t*6+i+1,type_key:type,seed:i+1,planted_at:`2026-06-01T12:00:0${i}Z`}})));state.garden.next_spot=79;return state;}
function appendRoses(state:ReturnType<typeof fullTourFixture>,count:number){for(let i=0;i<count;i++){const spot=state.garden.next_spot++;state.plants.push({...structuredClone(state.plants[0]!),flower:{...state.plants[0]!.flower,id:`later-${spot}`,spot,planted_at:new Date(Date.UTC(2099,0,1,0,0,spot)).toISOString()}});}}
it('preserves every surviving edge and interior rendered pose/lens across first and subsequent occupied expansion',()=>{
 const state=fullTourFixture();let before=gardenTour(compactAreaLayout(state).beds);
 for(const appended of [1,6,6]){
  appendRoses(state,appended);const after=gardenTour(compactAreaLayout(state).beds),surviving=before.legs.filter(leg=>after.legs.some(next=>next.edge.id===leg.edge.id));
  expect(surviving.length).toBeGreaterThanOrEqual(before.legs.length-2);
  for(const leg of surviving){
   const next=after.legs.find(next=>next.edge.id===leg.edge.id)!;
   expect(next.edge.points,`${leg.edge.id} control points`).toEqual(leg.edge.points);
   for(const fraction of [.1,.25,.5,.75,.9]){
    const distance=leg.start+leg.length*fraction,oldPose=tourPose(before,distance),newPose=tourPose(after,retainTourDistance(before,after,distance));
    expect(new Float32Array(newPose.eye),`${leg.edge.id} eye at${fraction}`).toEqual(new Float32Array(oldPose.eye));
    for(const aspect of [1280/800,390/844,844/390,800/600]){
     const oldLens=tourFovY(oldPose,aspect),newLens=tourFovY(newPose,aspect);
     expect(newLens,`${leg.edge.id} lens`).toBe(oldLens);
     const rendered=(pose:typeof oldPose,lens:number)=>multiply(perspective(lens,aspect,.1,420),lookAt(pose.eye,pose.look,[0,1,0]));
     expect(rendered(newPose,newLens),`${leg.edge.id} GPU matrix at${fraction}`).toEqual(rendered(oldPose,oldLens));
    }
   }
  }
  before=after;
 }
});
it('replaces only the shortcut or extent-specific turn legs, with explicit adjacent-stop fallback',()=>{
 const state=fullTourFixture();let before=gardenTour(compactAreaLayout(state).beds);
 for(const [count,removedIds] of [
  [1,['tour:terrace:4:terrace:1']],
  [6,['tour:terrace:13:expansion-turn:terrace:13','tour:expansion-turn:terrace:13:return:terrace:13']],
  [6,['tour:terrace:26:expansion-turn:terrace:26','tour:expansion-turn:terrace:26:return:terrace:26']],
 ] as const){
  appendRoses(state,count);const after=gardenTour(compactAreaLayout(state).beds),removed=before.legs.filter(leg=>!after.legs.some(next=>next.edge.id===leg.edge.id));
  expect(removed.map(leg=>leg.edge.id)).toEqual(removedIds);
  for(const leg of removed){const target=leg.edge.from.startsWith('expansion-turn:')?leg.edge.to:leg.edge.from,stop=after.stops.find(s=>s.id===target)!;for(const fraction of [.25,.5,.75]){const retained=tourPose(after,retainTourDistance(before,after,leg.start+leg.length*fraction));expect(new Float32Array(retained.eye)).toEqual(new Float32Array(stop.pose.eye));}}
  before=after;
 }
});
