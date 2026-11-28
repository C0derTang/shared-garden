import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {geometryFixture,join,mesh} from '../../scripts/profiling/geometry-check-fixture';
import {groundSampler as referenceSampler,minimumMeshClearance as referenceClearance} from '../../scripts/profiling/fixtures/geometry-check/ground-sampler-reference';
import {groundSampler,meshClearanceQuery,type ClearanceAudit} from './ground-sampler';
import type {MeshData} from '@/lib/world/scenery';

function audit() {
 const hash=createHash('sha256');let overlaps=0,vertices=0;
 const work:ClearanceAudit={candidateVisits:0,observe:(k,j,polygon)=>{
  overlaps++;vertices+=polygon.length;
  // Hash every exact clipped polygon and BOTH original mesh offsets, in the
  // old traversal order. An omitted layer/triangle or changed tie order fails.
  const record=new Float64Array([k,j,polygon.length,...polygon.flat()]);
  hash.update(new Uint8Array(record.buffer));
 }};
 return {work,finish:()=>({digest:hash.digest('hex'),overlaps,vertices})};
}
function compare(surface:MeshData,ground:MeshData) {
 const oldAudit=audit(),newAudit=audit();
 const prior=referenceClearance(surface,ground,oldAudit.work),query=meshClearanceQuery(ground),actual=query(surface,newAudit.work);
 expect(actual).toEqual(prior);
 expect(newAudit.finish()).toEqual(oldAudit.finish());
 return {prior,oldVisits:oldAudit.work.candidateVisits,newVisits:newAudit.work.candidateVisits};
}

describe('independent exact overlap equivalence',()=>{
 it('retains narrow creases, coincident layers, reversed/degenerate triangles, negative/grid boundaries and wide triangles',()=>{
  const surface=mesh([0,1,0,2,1,0,0,1,2]);
  const narrow=mesh([.025,1.1,.025,.055,.8,.025,.025,.8,.055]);
  const lower=mesh([0,.2,0,2,.2,0,0,.2,2]);
  const reversed=mesh([0,.3,2,2,.3,0,0,.3,0]);
  const degenerate=mesh([0,100,0,0,100,0,0,100,0]);
  const wide=mesh([-100,0,-100,100,0,-100,0,0,100]);
  compare(surface,join(lower,narrow,lower,reversed,degenerate,wide));
  // Equal minima across fine/wide layers must preserve the old first witness.
  compare(surface,join(surface,mesh([-100,1,-100,100,1,-100,0,1,100]),surface));
  for(const size of [.001,.5,8,128])for(const x of [-8,-.5,0,8]) {
   const top=mesh([x,1,-size,x+size,1,-size,x,1,0]);
   const layers=join(mesh([x,0,-size,x+size,0,-size,x,0,0]),mesh([x,.2,-size,x+size,.8,-size,x,.4,0]));
   compare(top,layers);
  }
  compare(surface,mesh([100,0,100,101,0,100,100,0,101]));
 });

 for(const count of [undefined,193])it(`matches every clipped pair and minimum witness for ${count??'base'} plants`,()=>{
  const {layout,ground,soil,ribbon}=geometryFixture(count),query=meshClearanceQuery(ground);
  if(count===193){expect(layout.beds).toHaveLength(45);expect(layout.spots.filter(s=>s.spot>0)).toHaveLength(193);}
  const oldSample=referenceSampler(ground),sample=groundSampler(ground);
  for(const spot of layout.spots)expect(sample(spot.position[0],spot.position[2])).toBe(oldSample(spot.position[0],spot.position[2]));
  for(const surface of [soil,ribbon]){
   const priorAudit=audit(),currentAudit=audit();
   const prior=referenceClearance(surface,ground,priorAudit.work),actual=query(surface,currentAudit.work);
   expect(actual).toEqual(prior);expect(currentAudit.finish()).toEqual(priorAudit.finish());
  }
 },30000);
});
