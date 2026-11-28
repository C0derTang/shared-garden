import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as geography from './site-geography';
import * as bank from './bank-garden';
import * as sharedRoute from './scenic-route';
import {MATURE_ENVELOPE,terraceFrame} from '@/lib/garden-v2/compact-areas';
import prior from '../../../scripts/profiling/fixtures/garden-camera-prior-057ec685.json';
import {v2GardenFixture} from '@/test/garden-v2-fixture';
import {flowerTypes} from '@/lib/garden-v2/model';
import {compactAreaLayout} from '@/lib/garden-v2/compact-areas';
import {gardenTour,tourPose,tourFovY,pixelsToTourDistance,tourDistanceToPixels} from './garden-tour';
import {scenicSurfaceHeight} from './site-surface';
import {lookAt,multiply,perspective,projectToNdc} from './camera';
import {terraceSlotPosition} from '@/lib/garden-v2/compact-areas';
import type {ScenicCameraPose} from './scenic-route';
const pitch=(p:ScenicCameraPose)=>Math.atan2(p.look[1]-p.eye[1],Math.hypot(p.look[0]-p.eye[0],p.look[2]-p.eye[2]));
const yaw=(p:ScenicCameraPose)=>Math.atan2(p.look[0]-p.eye[0],p.look[2]-p.eye[2]);
function fixture(extras:number){const state=v2GardenFixture(),template=state.plants[0]!;state.plants=flowerTypes.flatMap((type,t)=>Array.from({length:6},(_,i)=>({...structuredClone(template),flower:{...template.flower,id:`full-${t}-${i}`,spot:t*6+i+1,type_key:type,seed:i+1,planted_at:`2026-06-01T12:00:0${i}Z`}})));state.garden.next_spot=79;for(let i=0;i<extras;i++)state.plants.push({...structuredClone(state.plants[0]!),flower:{...state.plants[0]!.flower,id:`later-${i}`,spot:12001+i,seed:201+i,planted_at:new Date(Date.UTC(2099,0,1,0,0,i)).toISOString()}});return state;}
const asPose=(p:{eye:readonly number[];look:readonly number[];bankFov?:number;rear?:number;overview?:number})=>p as unknown as ScenicCameraPose;
// Mac numeric capture stays archival. Execute the exact immutable original
// constructor locally so libm rounding never weakens exact route comparisons.
const originalSource=readFileSync(resolve('scripts/profiling/fixtures/garden-tour-prior-057ec685.ts.txt'),'utf8');
const digest=(source:string)=>createHash('sha256').update(source).digest('hex');
expect(digest(originalSource)).toBe(prior.provenance.sourceSha256);
expect(createHash('sha1').update(`blob ${Buffer.byteLength(originalSource)}\0`).update(originalSource).digest('hex')).toBe('a680edc53620573191215c77cb6045c641cc019a');
for(const[file,hash]of[['site-geography.ts','4e8192211fccec824b5ce3b3a62d07c06b903271a108b6ed36aabbb01c1d73ef'],['bank-garden.ts','584f2c07d944eaae2bdfdeb3896fc7aedc86bcace1bc96c038c93c5516511a24']])expect(digest(readFileSync(resolve('src/lib/world',file!),'utf8'))).toBe(hash);
const compile=(source:string)=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
expect(digest(compile(readFileSync(resolve('src/lib/world/scenic-route.ts'),'utf8')))).toBe('3671d8e76f73845404b978368e1d0a287c630edb30cacc1e2472570a7c7069a8');
expect(MATURE_ENVELOPE).toEqual([[.40,1.10],[.28,.60],[.28,.90],[.27,.74],[.27,.71],[.28,.96],[.31,1.42],[.17,1.04],[.34,1.07],[.23,.51],[.26,.52],[.14,.43],[.34,.99],]);
expect(terraceFrame).toBe(bank.bankFrame);
const dependencies:Record<string,unknown>={'./site-geography':geography,'./bank-garden':bank,'@/lib/garden-v2/compact-areas':{MATURE_ENVELOPE,terraceFrame},'./scenic-route':sharedRoute};
const original={} as typeof import('./garden-tour');
new Function('require','exports',compile(originalSource))((name:string)=>{expect(Object.hasOwn(dependencies,name)).toBe(true);return dependencies[name];},original);
const baselines=prior.cases.map(saved=>{const tour=original.gardenTour(compactAreaLayout(fixture(saved.extras)).beds);return{extras:saved.extras,tour,samples:saved.samples.map(sample=>{const pose=original.tourPose(tour,sample.distance);return{distance:sample.distance,pose,lenses:[1280/800,390/844,844/390,800/600].map(aspect=>original.tourFovY(pose,aspect))};})};});
it('lowers all13 and sparse expansion bed cameras above unchanged terrain, aims up, and retains the original lens',()=>{
 for(const baseline of baselines){const tour=gardenTour(compactAreaLayout(fixture(baseline.extras)).beds),beds=tour.stops.filter(s=>s.id.startsWith('terrace:'));expect(beds.length).toBe(13+Math.ceil(baseline.extras/6));for(const stop of beds){const old=baseline.tour.stops.find(s=>s.id===stop.id)!;expect(stop.pose.eye[1],stop.id).toBeLessThan(old.pose.eye[1]);expect(stop.pose.eye[1]-scenicSurfaceHeight(stop.pose.eye[0],stop.pose.eye[2])).toBeGreaterThanOrEqual(.12-1e-12);expect(pitch(stop.pose),stop.id).toBeGreaterThan(pitch(asPose(old.pose)));expect([stop.pose.eye[0],stop.pose.eye[2]]).toEqual([old.pose.eye[0],old.pose.eye[2]]);expect(tourFovY(stop.pose,390/844)).toBe(tourFovY(asPose(old.pose),390/844));for(const aspect of[1280/800,844/390,800/600]){expect(tourFovY(stop.pose,aspect)).toBeGreaterThanOrEqual(tourFovY(asPose(old.pose),aspect));expect(tourFovY(stop.pose,aspect)*180/Math.PI).toBeLessThanOrEqual(44+1e-5);}expect(yaw(stop.pose)).toBe(yaw(asPose(old.pose)));}}
});
it('retains immutable route controls, native pixels, source eyes, plus original access and arrival poses',()=>{
 for(const baseline of baselines){const tour=gardenTour(compactAreaLayout(fixture(baseline.extras)).beds);expect(tour.edges).toEqual(baseline.tour.edges);expect(tour.legs).toEqual(baseline.tour.legs);expect(tour.length).toBe(baseline.tour.length);expect(tour.scrollLength).toBe(baseline.tour.scrollLength);expect(tour.startDistance).toBe(baseline.tour.startDistance);expect([...tour.anchors]).toEqual([...baseline.tour.anchors]);for(const stop of tour.stops.slice(0,tour.stops.findIndex(s=>s.id==='arrival')+1))expect(stop).toEqual(baseline.tour.stops.find(s=>s.id===stop.id));for(const sample of baseline.samples){const pixels=original.tourDistanceToPixels(baseline.tour,sample.distance);expect(tourDistanceToPixels(tour,sample.distance)).toBe(pixels);expect(pixelsToTourDistance(tour,pixels)).toBe(original.pixelsToTourDistance(baseline.tour,pixels));const pose=tourPose(tour,sample.distance);expect([pose.eye[0],pose.eye[2]]).toEqual([sample.pose.eye[0],sample.pose.eye[2]]);expect(pose.eye[1]-scenicSurfaceHeight(pose.eye[0],pose.eye[2])).toBeGreaterThanOrEqual(.12-1e-12);expect(yaw(pose)).toBeCloseTo(yaw(asPose(sample.pose)),14);expect(tourFovY(pose,390/844)).toBe(sample.lenses[1]);for(const [i,aspect]of[1280/800,390/844,844/390,800/600].entries())expect(tourFovY(pose,aspect)).toBeGreaterThanOrEqual(sample.lenses[i]!);expect(tourDistanceToPixels(tour,pixelsToTourDistance(tour,tourDistanceToPixels(tour,sample.distance)))).toBeCloseTo(tourDistanceToPixels(tour,sample.distance),9);}}
});
it('keeps the raised look continuous at every curve and exact boundary, including occupied turns',()=>{
 for(const extras of[0,1,7,13]){const tour=gardenTour(compactAreaLayout(fixture(extras)).beds);for(const leg of tour.legs){const boundary=leg.start+leg.length;expect(Math.abs(pitch(tourPose(tour,boundary-1e-7))-pitch(tourPose(tour,boundary+1e-7))),leg.edge.id).toBeLessThan(1e-6);}let previous=pitch(tourPose(tour,0));for(let d=.01;d<tour.length;d+=.01){const current=pitch(tourPose(tour,d));expect(Math.abs(current-previous)).toBeLessThan(.015);previous=current;}}
});

it('retains upward base scenery framing, original phone zoom and unchanged access camera',()=>{
 for(const baseline of baselines){const tour=gardenTour(compactAreaLayout(fixture(baseline.extras)).beds);for(const stop of tour.stops){if(!stop.id.startsWith('terrace:')||stop.section!==0||stop.pose.look[2]>=stop.pose.eye[2])continue;for(const aspect of[1280/800,390/844,844/390,800/600])expect((pitch(stop.pose)+tourFovY(stop.pose,aspect)/2)*180/Math.PI,`${stop.id} upper scenery angle`).toBeGreaterThanOrEqual(8-1e-5);}
  for(const stop of tour.stops.slice(0,tour.stops.findIndex(s=>s.id==='arrival')+1)){const old=baseline.tour.stops.find(s=>s.id===stop.id)!;for(const aspect of[1280/800,390/844,844/390,800/600])expect(tourFovY(stop.pose,aspect)).toBe(tourFovY(asPose(old.pose),aspect));}
  const sunflower=tour.stops.find(s=>s.id==='terrace:6')!,old=baseline.tour.stops.find(s=>s.id==='terrace:6')!;expect(tourFovY(sunflower.pose,390/844)).toBe(tourFovY(asPose(old.pose),390/844));
 }
});

it('uses only a small desktop Cactus lens exception for the measured seed-to-tree interval while phone zoom stays original',()=>{const tour=gardenTour(compactAreaLayout(fixture(0)).beds),pose=tour.stops.find(s=>s.id==='terrace:1')!.pose;expect(tourFovY(pose,1280/800)*180/Math.PI).toBeGreaterThanOrEqual(42-1e-5);expect(tourFovY(pose,1280/800)*180/Math.PI).toBeLessThanOrEqual(44+1e-5);expect(tourFovY(pose,390/844)).toBe(tourFovY(asPose(baselines[0]!.tour.stops.find(s=>s.id==='terrace:1')!.pose),390/844));});

it('retains the exact original wide lens for the other nine base species and original phone zoom for all thirteen',()=>{const baseline=baselines[0]!,tour=gardenTour(compactAreaLayout(fixture(0)).beds);for(const stop of tour.stops.filter(s=>s.id.startsWith('terrace:'))){const old=baseline.tour.stops.find(s=>s.id===stop.id)!;expect(tourFovY(stop.pose,390/844)).toBe(tourFovY(asPose(old.pose),390/844));if([1,5,8,10].includes(stop.typeIndex!))continue;for(const aspect of[1280/800,844/390,800/600])expect(tourFovY(stop.pose,aspect),stop.id).toBe(tourFovY(asPose(old.pose),aspect));}});

it('keeps lowered actual cameras outside retained solid wood through all sampled curves',async()=>{const{buildSiteCasterStrokes}=await import('./site-woodland'),{STROKE_KIND}=await import('./strokes'),wood=buildSiteCasterStrokes().filter(s=>s.kind===STROKE_KIND.trunk).map(s=>{const length=Math.hypot(...s.axis),radius=s.width/2+Math.abs(s.bend)*length;return{a:s.origin,d:s.axis,radius,length2:length*length,min:s.origin.map((v,i)=>Math.min(v,v+s.axis[i]!)-radius-.2),max:s.origin.map((v,i)=>Math.max(v,v+s.axis[i]!)+radius+.2)};});for(const extras of[0,13]){const tour=gardenTour(compactAreaLayout(fixture(extras)).beds);for(const leg of tour.legs)for(let i=0;i<=100;i++){const p=tourPose(tour,leg.start+leg.length*i/100).eye;for(const body of wood){if(p.some((v,k)=>v<body.min[k]!||v>body.max[k]!))continue;const t=Math.max(0,Math.min(1,p.reduce((sum,v,k)=>sum+(v-body.a[k]!)*body.d[k]!,0)/(body.length2||1)));expect(Math.hypot(...p.map((v,k)=>v-body.a[k]!-body.d[k]!*t)),leg.edge.id).toBeGreaterThan(body.radius+.2);}}}});

it('keeps true camera-plane seed bounds safely inside all four viewports on occupied expansion',()=>{const layout=compactAreaLayout(fixture(13)),tour=gardenTour(layout.beds);for(const bed of layout.beds.filter(b=>b.row>0)){const pose=tour.stops.find(s=>s.id===`terrace:${bed.index}`)!.pose;for(const[width,height]of[[1280,800],[390,844],[844,390],[800,600]]){const matrix=multiply(perspective(tourFovY(pose,width!/height!),width!/height!,.1,420),lookAt(pose.eye,pose.look,[0,1,0]));for(let slot=0;slot<6;slot++){const root=terraceSlotPosition(bed,slot),ndc=projectToNdc(matrix,[root[0],root[1]+.05,root[2]])!;expect((1-ndc[1])/2*height!,`bed${bed.index}/slot${slot}/${width}x${height}`).toBeLessThan(height!-18);}}}});
