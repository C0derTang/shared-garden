import {describe,expect,it} from "vitest";
import {SCENIC_ISLANDS,typePocketFrame,pocketCenter,scenicRoute,curvePoint} from "./scenic-route";
import {BACKYARD_RIGHT as RIGHT,BACKYARD_FORWARD as FORWARD} from "./backyard-frame";
import {typeAreaLayout} from "@/lib/garden-v2/type-areas";
import {v2GardenFixture} from "@/test/garden-v2-fixture";

describe('rounded planted islands',()=>{
 it('places six named pockets on two enclosed green islands and seven on the outskirts',()=>{
  expect(SCENIC_ISLANDS).toHaveLength(2);const frames=Array.from({length:13},(_,i)=>typePocketFrame(i));
  expect(frames.filter(f=>f.placement==='island')).toHaveLength(6);expect(frames.filter(f=>f.placement==='outskirts')).toHaveLength(7);
  for(let type=0;type<13;type++){
   const frame=frames[type]!,island=SCENIC_ISLANDS[frame.islandIndex]!,p=pocketCenter(type,0);
   const dx=p[0]-island.center[0],dz=p[2]-island.center[2],radius=Math.hypot((dx*RIGHT[0]+dz*RIGHT[2])/island.radiusX,(dx*FORWARD[0]+dz*FORWARD[2])/island.radiusZ);
   if(frame.placement==='island')expect(radius).toBeLessThan(.93);else expect(radius).toBeGreaterThan(1.07);
  }
  expect(frames.some(f=>f.side<0&&f.placement==='island')).toBe(true);expect(frames.some(f=>f.side>0&&f.placement==='island')).toBe(true);
 });
 it('uses two closed rounded primary loops with tangent-matched joins and bounded rounded meadow loops',()=>{
  const state=v2GardenFixture();state.garden.next_spot=27;const route=scenicRoute(typeAreaLayout(state).beds);
  for(let island=0;island<2;island++){
   const edges=route.edges.filter(e=>e.id.startsWith(`island:${island}:`));expect(edges.length).toBeGreaterThanOrEqual(6);
   for(const edge of edges){const next=edges.find(e=>e.from===edge.to)!;expect(next).toBeDefined();
    const a=edge.points,b=next.points,va=[a[3][0]-a[2][0],a[3][2]-a[2][2]],vb=[b[1][0]-b[0][0],b[1][2]-b[0][2]];
    expect((va[0]!*vb[0]!+va[1]!*vb[1]!)/(Math.hypot(...va)*Math.hypot(...vb))).toBeCloseTo(1,4);
   }
  }
  for(const island of route.islands.filter(i=>i.section)){
   const edges=route.edges.filter(e=>e.id.startsWith(`meadow:${island.section}:`));
   for(const edge of edges){const next=edges.find(e=>e.from===edge.to)!;expect(next).toBeDefined();
    const a=edge.points,b=next.points,va=[a[3][0]-a[2][0],a[3][2]-a[2][2]],vb=[b[1][0]-b[0][0],b[1][2]-b[0][2]];
    expect((va[0]!*vb[0]!+va[1]!*vb[1]!)/(Math.hypot(...va)*Math.hypot(...vb))).toBeCloseTo(1,4);
   }
   const polygon=edges.flatMap(edge=>Array.from({length:12},(_,i)=>curvePoint(edge,i/12)));
   const area=Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length]!;return sum+p[0]*q[2]-q[0]*p[2];},0))/2;
   expect(area).toBeGreaterThan(Math.PI*island.radiusX*island.radiusZ*.95);
  }
  expect(route.edges.some(e=>e.id.startsWith('meadow:'))).toBe(true);
  for(const edge of route.edges.filter(e=>e.id.startsWith('meadow:'))){const a=curvePoint(edge,0),b=curvePoint(edge,1),mid=curvePoint(edge,.5);expect(Math.hypot(mid[0]-(a[0]+b[0])/2,mid[2]-(a[2]+b[2])/2)).toBeGreaterThan(.02);}
 });
});

import {distanceToScenicPath,edgeSamples} from "./scenic-route";
it('preserves exact closest-curve distances while pruning dense and sparse routes',()=>{
 const state=v2GardenFixture();state.plants[0]!.flower.spot=12001;const route=scenicRoute(typeAreaLayout(state).beds);
 const points=Array.from({length:150},(_,i)=>[-20+(i*31.7)%240,-50+(i*19.3)%250]);
 for(const edge of route.edges.filter(e=>e.id.includes('annex')))for(const t of [0,.37,1]){const p=curvePoint(edge,t);points.push([p[0]+.8,p[2]-1.2]);}
 for(const [x,z]of points as [number,number][]){
  let expected=Infinity;
  for(const edge of route.edges){const points=edgeSamples(edge);for(let k=1;k<points.length;k++){
   const a=points[k-1]!,b=points[k]!,dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz||1)));
   expected=Math.min(expected,Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t));
  }}expect(distanceToScenicPath(route,x,z)).toBeCloseTo(expected,10);
 }
});

it('handles degenerate edges and a replacement route without retaining stale cached bounds',()=>{
 const point=(x:number,z:number)=>({id:'same',from:'a',to:'b',points:[[x,3,z],[x,3,z],[x,3,z],[x,3,z]] as [import('./layout').Vec3,import('./layout').Vec3,import('./layout').Vec3,import('./layout').Vec3]});
 const first={stops:[],edges:[point(1,2)],islands:[]},next={stops:[],edges:[point(100,200)],islands:[]};
 expect(distanceToScenicPath(first,4,6)).toBeCloseTo(5,12);
 expect(distanceToScenicPath(next,4,6)).toBeCloseTo(Math.hypot(96,194),10);
 expect(distanceToScenicPath(first,1,2)).toBe(0);
 expect(distanceToScenicPath({stops:[],edges:[],islands:[]},0,0)).toBe(Infinity);
});
