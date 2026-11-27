import { expect, it } from "vitest";
import { buildHouseMesh, HOUSE_MATERIAL } from "./landing";
import { HOUSE, houseToWorld, worldToHouse } from "./landing-frame";
import { buildGardenHouseMesh } from "./garden-house";
import { scenicRoute } from "./scenic-route";
it("reuses every original house vertex/material/UV/index and presents its actual rear to the return stop",()=>{
  const original=buildHouseMesh({rearPorch:true}),garden=buildGardenHouseMesh();
  expect(garden.indices).toEqual(original.indices); expect(garden.stride).toBe(original.stride);
  for(let i=0;i<garden.vertices.length;i+=garden.stride){
    const p=gardenHousePoint([original.vertices[i]!,original.vertices[i+1]!,original.vertices[i+2]!]);
    for(let j=0;j<3;j++)expect(garden.vertices[i+j]).toBeCloseTo(p[j]!,4);
    expect(garden.vertices.slice(i+6,i+garden.stride)).toEqual(original.vertices.slice(i+6,i+original.stride));
  }
  const rear=gardenHousePoint(houseToWorld([0,2,-HOUSE.depth])),front=gardenHousePoint(houseToWorld([0,2,0]));
  const stop=scenicRoute([]).stops.find(s=>s.id==='house-rear')!;
  expect(worldToHouse(stop.pose.eye)[2]).toBeLessThan(-HOUSE.depth);expect(worldToHouse(rear)[2]).toBeLessThan(worldToHouse(front)[2]);
  const sidingNormals=[];
  for(let i=0;i<garden.vertices.length;i+=garden.stride)if(Math.abs(worldToHouse([garden.vertices[i]!,garden.vertices[i+1]!,garden.vertices[i+2]!])[2]+HOUSE.depth)<.01&&garden.vertices[i+8]===HOUSE_MATERIAL.siding)sidingNormals.push(worldToHouse([garden.vertices[i+3]!,garden.vertices[i+4]!,garden.vertices[i+5]!])[2]);
  expect(sidingNormals.some(n=>n!<-.9)).toBe(true);
});

import { gardenHouseOccludes, gardenHousePoint } from "./garden-house-frame";
it("hides labels behind solid house while retaining near-side/side-of-house labels",()=>{
 expect(gardenHouseOccludes(houseToWorld([0,2.5,-25]),houseToWorld([0,1,5]))).toBe(true);
 expect(gardenHouseOccludes(houseToWorld([0,2.5,-25]),houseToWorld([0,1,-15]))).toBe(false);
 expect(gardenHouseOccludes(houseToWorld([0,2.5,-25]),houseToWorld([25,1,0]))).toBe(false);
});

it('adds a real rear doorway, covered timber porch and three readable steps only in the garden option',()=>{
 const source=buildHouseMesh({rearPorch:true}),original=buildHouseMesh();
 expect(source.vertices.length).toBeGreaterThan(original.vertices.length);
 const local=[];
 for(let i=0;i<source.vertices.length;i+=source.stride)local.push({p:worldToHouse([source.vertices[i]!,source.vertices[i+1]!,source.vertices[i+2]!]),m:source.vertices[i+8]});
 expect(local.some(v=>v.m===HOUSE_MATERIAL.backDoor&&v.p[2]<-HOUSE.depth-.01&&v.p[1]>2)).toBe(true);
 expect(local.some(v=>v.m===HOUSE_MATERIAL.plank&&v.p[2]<-HOUSE.depth-2&&v.p[1]>=.59)).toBe(true);
 for(const height of [.15,.3,.45])expect(local.some(v=>v.m===HOUSE_MATERIAL.plank&&Math.abs(v.p[1]-height)<.001&&v.p[2]<-HOUSE.depth-2.1)).toBe(true);
 expect(local.some(v=>v.m===HOUSE_MATERIAL.roof&&v.p[2]<-HOUSE.depth-2&&v.p[1]>2.9)).toBe(true);
});

import {perspective,lookAt,multiply,projectToNdc} from './camera';
import {scenicPose,scenicFovY} from './scenic-route';
it.each([[1280,800],[390,844],[844,390],[800,600]])('frames the actual whole rear house above route controls at %ix%i', (width,height)=>{
 const stop=scenicRoute([]).stops.find(s=>s.id==='house-rear')!,aspect=width/height,fov=scenicFovY(stop.pose,aspect),pose=scenicPose(stop.pose,aspect,fov,null,0),matrix=multiply(perspective(fov,aspect,.1,420),lookAt(pose.eye,pose.look,[0,1,0])),mesh=buildGardenHouseMesh();
 const points=[];for(let i=0;i<mesh.vertices.length;i+=mesh.stride){const ndc=projectToNdc(matrix,[mesh.vertices[i]!,mesh.vertices[i+1]!,mesh.vertices[i+2]!] )!;points.push([(ndc[0]+1)/2*width,(1-ndc[1])/2*height]);}
 expect(Math.min(...points.map(p=>p[0]!))).toBeGreaterThan(12);expect(Math.max(...points.map(p=>p[0]!))).toBeLessThan(width-12);
 expect(Math.min(...points.map(p=>p[1]!))).toBeGreaterThan(12);expect(Math.max(...points.map(p=>p[1]!))).toBeLessThan(height-72);
});
