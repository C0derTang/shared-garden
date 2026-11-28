/** Opt-in old/new benchmark: never asserts a machine-dependent time threshold. */
import {expect,it} from 'vitest';
import {geometryFixture} from './geometry-check-fixture';
import {minimumMeshClearance as referenceClearance} from './fixtures/geometry-check/ground-sampler-reference';
import {meshClearanceQuery,type Clearance} from '@/test/ground-sampler';

for(const sample of [0,1,2])it(`retains raw paired sample ${sample} (${sample===0?'cold':'warm'})`,()=>{
 const {layout,ground,soil,ribbon}=geometryFixture(193);
 const run=(kind:'old'|'new')=>{
  const cpu=process.cpuUsage(),start=performance.now(),audit={candidateVisits:0};
  const query=kind==='old'?(mesh:typeof soil)=>referenceClearance(mesh,ground,audit):meshClearanceQuery(ground);
  const indexMs=performance.now()-start,results:Clearance[]=[],operations:number[]=[];
  for(const surface of [soil,ribbon]){const begin=performance.now();results.push(query(surface,audit));operations.push(performance.now()-begin);}
  const wallMs=performance.now()-start,usage=process.cpuUsage(cpu);
  return {kind,indexMs,operations,wallMs,cpuMs:(usage.user+usage.system)/1000,candidateVisits:audit.candidateVisits,results};
 };
 // Retain both cold-order effects; no discarded/warm-up samples or retries.
 const order=sample%2?['new','old'] as const:['old','new'] as const;
 const runs=order.map(run);expect(runs[0]!.results).toEqual(runs[1]!.results);
 console.log(JSON.stringify({sample,order,plants:193,beds:layout.beds.length,triangles:{ground:ground.indices.length/3,soil:soil.indices.length/3,ribbon:ribbon.indices.length/3},runs}));
},30000);
