import { expect, it } from "vitest";
import { buildScenicPath } from "./scenic-path";
import { scenicRoute, curvePoint, PATH_HALF_WIDTH } from "./scenic-route";
import {scenicSurfaceHeight as terrainHeight} from "./site-surface";
it("tessellates the shared camera curves as a bounded natural ribbon above terrain",()=>{
 const route=scenicRoute([]),mesh=buildScenicPath(route);
 expect(mesh.vertices.length).toBe(route.edges.length*49*2*8);
 expect(mesh.indices.length).toBe(route.edges.length*48*6);
 for(let e=0;e<route.edges.length;e++)for(let i=0;i<=48;i++){
  const p=curvePoint(route.edges[e]!,i/48),j=(e*98+i*2)*8,a=mesh.vertices.slice(j,j+3),b=mesh.vertices.slice(j+8,j+11);
  expect((a[0]!+b[0]!)/2).toBeCloseTo(p[0],4);expect((a[2]!+b[2]!)/2).toBeCloseTo(p[2],4);
  expect(Math.hypot(a[0]!-b[0]!,a[2]!-b[2]!)).toBeCloseTo((route.edges[e]!.primary?PATH_HALF_WIDTH:.48)*2,3);
  expect(a[1]).toBeCloseTo(terrainHeight(a[0]!,a[2]!)+.025,4);
 }
});

import { typeAreaLayout } from "@/lib/garden-v2/type-areas";
import { v2GardenFixture } from "@/test/garden-v2-fixture";
it("keeps sparse access spurs visually narrower than the winding primary path",()=>{
 const state=v2GardenFixture();state.garden.next_spot=13;const route=scenicRoute(typeAreaLayout(state).beds),mesh=buildScenicPath(route);
 for(const [index,edge] of route.edges.entries()){
  const j=index*98*8,width=Math.hypot(mesh.vertices[j]!-mesh.vertices[j+8]!,mesh.vertices[j+2]!-mesh.vertices[j+10]!);
  if(!edge.primary)expect(width).toBeLessThan(1.1);
 }
});
