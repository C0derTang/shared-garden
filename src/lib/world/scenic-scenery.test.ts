import {expect,it} from "vitest";
import {buildScenicMeadowStrokes} from "./scenic-scenery";
import {scenicRoute,distanceToScenicPath} from "./scenic-route";
import {typeAreaLayout} from "@/lib/garden-v2/type-areas";
import {v2GardenFixture} from "@/test/garden-v2-fixture";
import {worldToHouse,HOUSE} from "./landing-frame";
import {landingLakeDepth} from "./site-geography";
import {STROKE_KIND} from "./strokes";
it("continues the painted meadow around rotated route views, leaving path/house clear",()=>{
 const state=v2GardenFixture();state.garden.next_spot=27;const layout=typeAreaLayout(state),route=scenicRoute(layout.beds),strokes=buildScenicMeadowStrokes(route,layout.beds);
 expect(strokes.some(s=>s.origin[2]>60)).toBe(true);expect(strokes.some(s=>s.origin[2]>200)).toBe(true);
 for(const s of strokes)if(s.kind===STROKE_KIND.blade){
  expect(distanceToScenicPath(route,s.origin[0],s.origin[2])).toBeGreaterThan(.66);
  const p=worldToHouse(s.origin);expect(p[0]<-5.5||p[0]>5.5||p[2]<-HOUSE.depth-3.3||p[2]>3.5).toBe(true);expect(landingLakeDepth(s.origin[0],s.origin[2])).toBeLessThan(-.3);
 }
});
