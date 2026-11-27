import { describe, expect, it } from "vitest";
import { v2GardenFixture } from "@/test/garden-v2-fixture";
import { typeAreaLayout } from "@/lib/garden-v2/type-areas";
import { flowerTypes } from "@/lib/garden-v2/model";
import { lookAt, multiply, perspective } from "./camera";
import { pickOnScreen, plotFootprints } from "./picking";
import {landingLakeDepth} from "./site-geography";
import {worldToHouse,HOUSE} from "./landing-frame";
import { createScenicNavigator, curvePoint, distanceToScenicPath, pocketCenter, scenicRoute, scenicPose, scenicFovY, shortestAngle } from "./scenic-route";

describe("shared scenic garden route", () => {
  it("closes a visibly curved loop, with thirteen distinct pocket views, lake and rear-house stops", () => {
    const route = scenicRoute(typeAreaLayout(v2GardenFixture()).beds);
    expect(route.stops.filter((s) => s.section === 0)).toHaveLength(13);
    expect(route.stops.some((s) => s.id === "lake")).toBe(true);
    expect(route.stops.some((s) => s.id === "house-rear")).toBe(true);
    const loop = route.edges.filter(e=>e.primary);
    expect(route.islands.filter(island=>!island.section)).toHaveLength(2);
    let bend=0;
    for(const edge of loop){
      const mid=curvePoint(edge,.5),a=curvePoint(edge,0),b=curvePoint(edge,1);bend+=Math.hypot(mid[0]-(a[0]+b[0])/2,mid[2]-(a[2]+b[2])/2);
      for(let j=0;j<=50;j++){
        const p=curvePoint(edge,j/50);expect(landingLakeDepth(p[0],p[2])).toBeLessThan(-1.5);
        for(const bed of typeAreaLayout(v2GardenFixture()).beds)expect(Math.hypot(p[0]-bed.center[0],p[2]-bed.center[2])).toBeGreaterThan(bed.radius+.9);
        const h=worldToHouse(p);expect(((edge.id==='porch-connection'||edge.id==='rear-view')&&h[2]<=-HOUSE.depth-3.2+1e-6)||h[0]<-5.5||h[0]>5.5||h[2]<-10.3||h[2]>3.6).toBe(true);
      }
    }
    expect(bend).toBeGreaterThan(10);
    const headings=route.stops.map(s=>Math.atan2(s.pose.look[0]-s.pose.eye[0],s.pose.look[2]-s.pose.eye[2]));
    expect(Math.max(...headings)-Math.min(...headings)).toBeGreaterThan(1.5);
    expect(Math.max(...headings.slice(0,13))-Math.min(...headings.slice(0,13))).toBeGreaterThan(.3);
  });

  it("preserves route coordinates under rapid, reverse and wrap selections; turns by shortest angle", () => {
    const route = scenicRoute(typeAreaLayout(v2GardenFixture()).beds);
    const nav = createScenicNavigator(route, "pocket:0:0");
    nav.select("pocket:4:0", false);
    nav.tick(0.2);
    const before = nav.pose;
    nav.select("lake", false);
    expect(nav.pose).toEqual(before);
    let previous = nav.pose;
    for (let i = 0; i < 4000 && nav.pose !== route.stops.find(s=>s.id==="lake")!.pose; i++) {
      nav.tick(0.016);
      const current = nav.pose;
      expect(Math.hypot(current.eye[0] - previous.eye[0], current.eye[2] - previous.eye[2])).toBeLessThan(0.8);
      expect(distanceToScenicPath(route, current.eye[0], current.eye[2])).toBeLessThan(0.03);
      const a = Math.atan2(previous.look[0] - previous.eye[0], previous.look[2] - previous.eye[2]);
      const b = Math.atan2(current.look[0] - current.eye[0], current.look[2] - current.eye[2]);
      expect(Math.abs(shortestAngle(a,b))).toBeLessThan(0.15);
      previous = current;
    }
    expect(nav.pose).toEqual(route.stops.find((s) => s.id === "lake")!.pose);
    nav.select("pocket:0:0", true);
    expect(nav.pose).toEqual(route.stops.find(s=>s.id==='pocket:0:0')!.pose);
    nav.select("house-rear", false); nav.tick(0.2); nav.interrupt();
    const interrupted = nav.pose; nav.tick(10);
    expect(nav.pose).toEqual(interrupted);
    expect(nav.pose).toEqual(route.stops.find((s) => s.id === "house-rear")!.pose);
    expect(Math.abs(shortestAngle(Math.PI - 0.01, -Math.PI + 0.01))).toBeCloseTo(0.02);
  });

  it("generates only used sparse sections, with stable nonoverlapping pocket addresses and navigable spurs", () => {
    const state = v2GardenFixture(); state.plants[0]!.flower.spot = 12001; state.garden.next_spot = 1;
    const before = typeAreaLayout(state); const route = scenicRoute(before.beds);
    expect(route.stops.length).toBeLessThan(55); expect(route.edges.length).toBeLessThan(55);
    expect(pocketCenter(0,1000)).toEqual(before.beds.find((b) => b.index === 13000)!.center);
    state.plants.push({ ...structuredClone(state.plants[0]!), flower: { ...state.plants[0]!.flower, id: "new", spot: 1 } });
    expect(typeAreaLayout(state).spots.find((s) => s.spot === 12001)).toEqual(before.spots.find((s) => s.spot === 12001));
    const nav = createScenicNavigator(route, route.stops[0]!.id);
    nav.select("pocket:0:1000", true); expect(nav.pose.eye[2]).toBeGreaterThan(3000);
    for (const edge of route.edges) for (let i=0;i<=50;i++) {
      const p=curvePoint(edge,i/50);
      for (const bed of before.beds) expect(Math.hypot(p[0]-bed.center[0],p[2]-bed.center[2])).toBeGreaterThan(bed.radius+0.55);
    }
  });

  it.each([[1280,800],[390,844],[844,390],[800,600]])("gives every flower/seed a full-scene pickable scenic approach at %ix%i", (width,height) => {
    const state=v2GardenFixture(), template=state.plants[0]!;
    state.plants=Array.from({length:39},(_,i)=>({...structuredClone(template),flower:{...template.flower,id:`p${i}`,spot:i+1,type_key:flowerTypes[i%13]!}})); state.garden.next_spot=40;
    const layout=typeAreaLayout(state), route=scenicRoute(layout.beds), empty=layout.areas.map(a=>a.target);
    const flowers=layout.spots.filter(s=>s.spot>0).map(s=>({id:`p${s.spot-1}`,position:s.position,height:1.1,radius:.32}));
    for(const spot of layout.spots) {
      const type=spot.spot<0 ? -spot.spot-1 : (spot.spot-1)%13;
      const section=Math.floor(((spot.spot<0?40:spot.spot)-1)/12);
      const stop=route.stops.find(s=>s.typeIndex===type&&s.section===section)!;
      const aspect=width/height,fovY=scenicFovY(stop.pose,aspect),pose=scenicPose(stop.pose,aspect,fovY,null,0);
      const view={width,height,viewProjection:multiply(perspective(fovY,aspect,.1,420),lookAt(pose.eye,pose.look,[0,1,0]))};
      const footprint=plotFootprints(view,empty,flowers).find(p=>spot.spot<0?p.target.kind==='spot'&&p.target.spot===spot.spot:p.target.kind==='flower'&&p.target.id===`p${spot.spot-1}`)!;
      expect(footprint).toBeDefined(); const part=footprint.parts.at(-1)!;
      const x=(part.a[0]+part.b[0])/2,y=(part.a[1]+part.b[1])/2;
      expect(x).toBeGreaterThan(0);expect(x).toBeLessThan(width);expect(y).toBeGreaterThan(0);expect(y).toBeLessThan(height);
      expect(pickOnScreen(view,x,y,empty,flowers)).toMatchObject(footprint.target);
    }
  });
});

import { scenicRocks } from "./scenic-scenery";
import {buildLandingCasterStrokes} from "./landing";
import {STROKE_KIND} from "./strokes";
import {landingTerrainHeight} from "./site-geography";
import { bedRimRadius } from "./layout";
it("clears actual full-scene beds, shoreline rocks, tree trunks and house with path/camera width",()=>{
 const state=v2GardenFixture(),template=state.plants[0]!;
 state.plants=Array.from({length:39},(_,i)=>({...structuredClone(template),flower:{...template.flower,id:`p${i}`,spot:i+1,type_key:flowerTypes[i%13]!}}));state.garden.next_spot=40;
 const layout=typeAreaLayout(state),route=scenicRoute(layout.beds),trunks=buildLandingCasterStrokes().filter(s=>s.kind===STROKE_KIND.trunk&&s.origin[1]<landingTerrainHeight(s.origin[0],s.origin[2])+.2);
 for(const edge of route.edges)for(let i=0;i<=100;i++){
  const p=curvePoint(edge,i/100),clearance=(edge.primary?.72:.48)+.2;
  for(const bed of layout.beds){
   const dx=p[0]-bed.center[0],dz=p[2]-bed.center[2];if(Math.abs(dx)>bed.radius*1.21+clearance||Math.abs(dz)>bed.radius*1.21+clearance)continue;
   expect(Math.hypot(dx,dz),`${edge.id} t=${i/100} bed=${bed.index}`).toBeGreaterThan(bedRimRadius(bed,Math.atan2(dz,dx))+clearance);
  }
  for(const rock of scenicRocks()){
   const dx=p[0]-rock.x,dz=p[2]-rock.z;if(Math.abs(dx)>rock.radius+clearance||Math.abs(dz)>rock.radius+clearance)continue;
   expect(Math.hypot(dx,dz),`${edge.id} rock=${rock.x},${rock.z}`).toBeGreaterThan(rock.radius+clearance);
  }
  for(const trunk of trunks){
   const dx=p[0]-trunk.origin[0],dz=p[2]-trunk.origin[2];if(Math.abs(dx)>trunk.width/2+clearance||Math.abs(dz)>trunk.width/2+clearance)continue;
   expect(Math.hypot(dx,dz),`${edge.id} t=${i/100} trunk=${trunk.origin.join(",")}`).toBeGreaterThan(trunk.width/2+clearance);
  }
 }
});

it("falls back within the same type when a pending-only stop disappears at a planting boundary",()=>{
 const state=v2GardenFixture();state.garden.next_spot=24;
 const before=scenicRoute(typeAreaLayout(state).beds),nav=createScenicNavigator(before,"pocket:1:1");
 state.plants.push({...structuredClone(state.plants[0]!),flower:{...state.plants[0]!.flower,id:'new',spot:24}});state.garden.next_spot=25;
 const after=scenicRoute(typeAreaLayout(state).beds);
 expect(after.stops.some(s=>s.id==='pocket:1:1')).toBe(false);
 nav.update(after);expect(nav.selectedId).toBe('pocket:1:0');expect(nav.pose).toEqual(after.stops.find(s=>s.id===nav.selectedId)!.pose);
 const stable=nav.pose;nav.tick(.1);expect(nav.pose).toEqual(stable);
 const moving=createScenicNavigator(before,'pocket:1:1');moving.select('lake',false);moving.tick(.1);moving.update(after);
 expect(moving.pose).toEqual(after.stops.find(s=>s.id==='lake')!.pose);const arrived=moving.pose;moving.tick(.1);expect(moving.pose).toEqual(arrived);
});
