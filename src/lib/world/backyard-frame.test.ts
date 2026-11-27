import {expect,it} from "vitest";
import {BACKYARD_ORIGIN,backyardToWorld,worldToBackyard} from "./backyard-frame";
import {HOUSE,houseToWorld,worldToHouse,FRONT_NORMAL} from "./landing-frame";
import {landingLakeDepth} from "./site-geography";
import {plantingSurfaceHeight} from "./site-surface";
import {scenicRoute,curvePoint} from "./scenic-route";
import {typeAreaLayout} from "@/lib/garden-v2/type-areas";
import {v2GardenFixture} from "@/test/garden-v2-fixture";
import {buildGardenHouseMesh} from "./garden-house";
import {buildHouseMesh} from "./landing";
it('anchors the backyard to the actual rear centre without moving the complete shared house',()=>{
 expect(BACKYARD_ORIGIN).toEqual(houseToWorld([0,0,-HOUSE.depth]));
 expect(backyardToWorld([0,0,0])).toEqual(BACKYARD_ORIGIN);
 worldToBackyard(backyardToWorld([31,2.4,26])).forEach((v,i)=>expect(v).toBeCloseTo([31,2.4,26][i]!,10));
 expect(buildGardenHouseMesh()).toEqual(buildHouseMesh({rearPorch:true}));
});
it('keeps all original and sparse pockets/rounded paths on the rear half-plane and actual dry land',()=>{
 for(const sparse of [false,true]){
  const state=v2GardenFixture();if(sparse){state.plants[0]!.flower.spot=12001;state.garden.next_spot=1;}
  const layout=typeAreaLayout(state),route=scenicRoute(layout.beds);
  for(const bed of layout.beds){
   expect(landingLakeDepth(bed.center[0],bed.center[2])).toBeLessThan(-bed.radius-1.2);
   expect(bed.center[1]).toBeCloseTo(plantingSurfaceHeight(bed.center[0],bed.center[2]),8);
   expect((bed.center[0]-BACKYARD_ORIGIN[0])*FRONT_NORMAL[0]+(bed.center[2]-BACKYARD_ORIGIN[2])*FRONT_NORMAL[2]).toBeLessThan(-1);
  }
  for(const edge of route.edges)for(let i=0;i<=100;i++){
   const p=curvePoint(edge,i/100);expect(landingLakeDepth(p[0],p[2])).toBeLessThan(-1.5);
   const h=worldToHouse(p);expect(((edge.id==='porch-connection'||edge.id==='rear-view')&&h[2]<=-HOUSE.depth-3.2+1e-6)||h[0]<-5.5||h[0]>5.5||h[2]<-10.3||h[2]>3.6,`${edge.id} local=${h}`).toBe(true);
  }
 }
});
it('visibly connects the route to the actual rear steps and looks at the same physical back',()=>{
 const route=scenicRoute([]),rear=route.stops.find(s=>s.id==='house-rear')!,local=worldToHouse(rear.pose.eye);
 expect(local[2]).toBeCloseTo(-HOUSE.depth-6,8);expect(Math.abs(local[0])).toBeLessThan(.001);
 const connection=route.edges.find(e=>e.id==='porch-connection')!;expect(connection).toBeDefined();
 const doorstep=worldToHouse(connection.points[0]);expect(doorstep[2]).toBeCloseTo(-HOUSE.depth-3.2,3);expect(Math.abs(doorstep[0])).toBeLessThan(.2);
});
