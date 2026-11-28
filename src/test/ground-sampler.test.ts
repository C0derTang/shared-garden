import {expect,it} from 'vitest';
import {minimumMeshClearance} from './ground-sampler';
import type {MeshData} from '@/lib/world/scenery';
const mesh=(points:number[]):MeshData=>({vertices:new Float32Array(points),indices:new Uint32Array([0,1,2]),stride:3});
it('finds a narrow crossing missed by sparse barycentric probes and evaluates every overlapping ground layer',()=>{
 const surface=mesh([0,1,0,2,1,0,0,1,2]),narrow=mesh([.025,1.1,.025,.055,.8,.025,.025,.8,.055]);
 const result=minimumMeshClearance(surface,narrow);expect(result.pairs).toBe(1);expect(result.minimum).toBeCloseTo(-.1,6);expect(result.point[0]).toBeCloseTo(.025,6);expect(result.point[2]).toBeCloseTo(.025,6);
 const lower=mesh([0,.2,0,2,.2,0,0,.2,2]),layers:MeshData={vertices:new Float32Array([...lower.vertices,...narrow.vertices]),indices:new Uint32Array([0,1,2,3,4,5]),stride:3};expect(minimumMeshClearance(surface,layers).minimum).toBe(result.minimum);
});
