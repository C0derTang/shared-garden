import {expect,it} from "vitest";
import {buildScenicGroundMesh} from "./scenic-ground";
import {scenicRoute} from "./scenic-route";
import {typeAreaLayout} from "@/lib/garden-v2/type-areas";
import {v2GardenFixture} from "@/test/garden-v2-fixture";
it("keeps terrain under sparse distant sections without allocating all intervening ground cells",()=>{
 const state=v2GardenFixture();state.plants[0]!.flower.spot=12001;
 const layout=typeAreaLayout(state),route=scenicRoute(layout.beds),mesh=buildScenicGroundMesh(route,layout.beds);
 const original=v2GardenFixture(),baseline=typeAreaLayout(original),base=buildScenicGroundMesh(scenicRoute(baseline.beds),baseline.beds);
 expect(mesh.vertices.length-base.vertices.length).toBeLessThan(100000);
 const z=layout.spots.find(s=>s.spot===12001)!.position[2];
 expect([...mesh.vertices].some((v,i)=>i%6===2&&Math.abs(v-z)<2)).toBe(true);
 state.plants[0]!.flower.spot=1200001;const farther=typeAreaLayout(state),fartherMesh=buildScenicGroundMesh(scenicRoute(farther.beds),farther.beds);
 expect(fartherMesh.vertices.length).toBe(mesh.vertices.length);expect(fartherMesh.indices.length).toBe(mesh.indices.length);
});
