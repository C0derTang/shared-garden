/** Public synthetic geometry only; shared immutable inputs for old/new proofs. */
import fixture from './fixtures/type-area-garden.json';
import {parseGardenState} from '@/lib/garden-v2/model';
import {compactAreaLayout} from '@/lib/garden-v2/compact-areas';
import {gardenTour} from '@/lib/world/garden-tour';
import {buildScenicGroundMesh} from '@/lib/world/scenic-ground';
import {buildScenicPath} from '@/lib/world/scenic-path';
import {buildBedMesh, type MeshData} from '@/lib/world/scenery';

export function geometryFixture(count?: number) {
 const state=parseGardenState(structuredClone(fixture)),plant=state.plants[0]!;
 if(count!==undefined)state.plants=Array.from({length:count},(_,i)=>({...structuredClone(plant),flower:{...plant.flower,id:`synthetic-${i}`,spot:i+1,planted_at:new Date(Date.UTC(2099,0,1,0,0,i)).toISOString()}}));
 const layout=compactAreaLayout(state),tour=gardenTour(layout.beds);
 return {layout,ground:buildScenicGroundMesh(tour,layout.beds),soil:buildBedMesh(layout.beds),ribbon:buildScenicPath(tour)};
}
export function mesh(points: readonly number[], indices?: readonly number[]): MeshData {
 return {vertices:new Float32Array(points),indices:new Uint32Array(indices??Array.from({length:points.length/3},(_,i)=>i)),stride:3};
}
export function join(...meshes: MeshData[]): MeshData {
 let offset=0;const indices:number[]=[];
 for(const part of meshes){indices.push(...part.indices.map(i=>i+offset));offset+=part.vertices.length/3;}
 return mesh(meshes.flatMap(part=>[...part.vertices]),indices);
}
