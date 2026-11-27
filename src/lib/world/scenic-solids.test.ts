import {expect,it} from 'vitest';
import {buildLandingCasterStrokes} from './landing';
import {scenicRoute,curvePoint} from './scenic-route';
import {typeAreaLayout} from '@/lib/garden-v2/type-areas';
import {v2GardenFixture} from '@/test/garden-v2-fixture';
import {STROKE_KIND} from './strokes';

it('keeps the actual moving camera sphere clear of all original upper trunk/branch ribbons',()=>{
 const capsules=buildLandingCasterStrokes().filter(s=>s.kind===STROKE_KIND.trunk).map(s=>{
  const length=Math.hypot(...s.axis),radius=s.width/2+Math.abs(s.bend)*length;
  return {a:s.origin,d:s.axis,radius,length2:length*length,min:s.origin.map((v,i)=>Math.min(v,v+s.axis[i]!)-radius-.2),max:s.origin.map((v,i)=>Math.max(v,v+s.axis[i]!)+radius+.2)};
 });
 const route=scenicRoute(typeAreaLayout(v2GardenFixture()).beds);
 for(const edge of route.edges)for(let i=0;i<=100;i++){
  const p=curvePoint(edge,i/100);
  for(const body of capsules){
   if(p.some((v,k)=>v<body.min[k]!||v>body.max[k]!))continue;
   const t=Math.max(0,Math.min(1,p.reduce((sum,v,k)=>sum+(v-body.a[k]!)*body.d[k]!,0)/(body.length2||1)));
   const distance=Math.hypot(...p.map((v,k)=>v-body.a[k]!-body.d[k]!*t));
   expect(distance,`${edge.id} t=${i/100}, original branch ${body.a.join(',')}`).toBeGreaterThan(body.radius+.2);
  }
 }
});
