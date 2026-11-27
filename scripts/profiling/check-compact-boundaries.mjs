/* global document,window,Event,requestAnimationFrame,performance,structuredClone */
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createServer} from 'vite';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import process from 'node:process';
import console from 'node:console';
import {compactFixture,installCompactFixture} from './compact-browser-fixture.mjs';
import {evidenceMetadata} from './scenic-evidence.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),base=process.env.BASE_URL||'http://localhost:3226',output=process.env.PROFILE_OUTPUT||'/tmp/ccapp-226-boundaries';
mkdirSync(output,{recursive:true});const metadata=evidenceMetadata(output),v=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false,ws:false}});
const {compactAreaLayout}=await v.ssrLoadModule('/src/lib/garden-v2/compact-areas.ts'),{gardenTour,tourPose,tourFovY,tourCoordinate,tourDistanceToPixels,retainTourDistance}=await v.ssrLoadModule('/src/lib/world/garden-tour.ts'),{lookAt,perspective,multiply}=await v.ssrLoadModule('/src/lib/world/camera.ts');
function append(state,count){for(let i=0;i<count;i++){const spot=state.garden.next_spot++,p=state.plants[0];state.plants.push({...structuredClone(p),flower:{...p.flower,id:`00000000-0000-4000-8000-${String(spot).padStart(12,'0')}`,spot,planted_at:new Date(Date.UTC(2099,0,1,0,0,spot)).toISOString()}});}}
const stops=tour=>[...tour.legs.map(leg=>({id:leg.edge.from,distance:leg.start})),{id:tour.legs.at(-1).edge.to,distance:tour.length}];
const cases=[...[-1,0,1].map(offset=>({modules:0,id:'terrace:1',flower:'cactus',offset})),...[-1,1].map(offset=>({modules:0,id:'terrace:4',flower:'daisy',offset})),{modules:0,id:'terrace:0',flower:'rose',offset:0},...['terrace:13','return:terrace:13'].flatMap(id=>[-1,0,1].map(offset=>({modules:1,id,offset}))),...['terrace:26','return:terrace:26'].map(id=>({modules:2,id,offset:0}))];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--enable-unsafe-webgpu']}),results=[];
try{for(const [view,width,height,dpr]of [['desktop',1280,800,1],['portrait',390,844,2],['landscape',844,390,2],['narrow',800,600,1]])for(const motion of ['reduce','no-preference'])for(const test of cases){
 if(process.env.VIEW&&process.env.VIEW!==view)continue;
 if(['landscape','narrow'].includes(view)&&!(test.id==='terrace:1'&&test.modules===0))continue;
 const state=compactFixture('full');if(test.modules)append(state,1+(test.modules-1)*6);const before=gardenTour(compactAreaLayout(state).beds),stop=stops(before).find(stop=>stop.id===test.id);assert(stop);
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,reducedMotion:motion}),page=await context.newPage(),mock=await installCompactFixture(page,base,state),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript({path:resolve('scripts/profiling/world-camera-hook.js')});
 const camera=()=>page.evaluate(()=>({eye:window.__actualCamera.eye,matrix:window.__actualCamera.matrix})),scroll=page.locator('[data-garden-scroll]');
 try{
  await page.goto(`${base}/dev/garden-areas?bloom=1&many=1`);const trigger=page.getByRole('button',{name:'Choose a flower',exact:true});await trigger.waitFor({timeout:90000});
  if(test.flower){await trigger.click();await page.getByRole('dialog',{name:'Choose a flower'}).getByRole('button',{name:test.flower,exact:true}).click();}
  else{const current=await scroll.evaluate(e=>e.scrollTop);await page.mouse.move(width*.45,height*.6);await page.mouse.wheel(0,tourDistanceToPixels(before,stop.distance)-current);}
  await page.waitForFunction(d=>Math.abs(Number(document.querySelector('[data-garden-scroll]').dataset.distance)-d)<.03,stop.distance,{timeout:15000});
  await page.waitForFunction(()=>{const top=document.querySelector('[data-garden-scroll]').scrollTop;if(window.__boundaryTop!==top){window.__boundaryTop=top;window.__boundaryTime=performance.now();}return performance.now()-window.__boundaryTime>150;});
  if(test.offset){const old=await scroll.evaluate(e=>e.scrollTop);await page.mouse.move(width*.45,height*.6);await page.mouse.wheel(0,test.offset);await page.waitForFunction(top=>document.querySelector('[data-garden-scroll]').scrollTop!==top,old);}
  const accepted=await scroll.evaluate(e=>({distance:Number(e.dataset.distance),native:e.scrollTop})),pose=tourPose(before,accepted.distance);await page.waitForFunction(eye=>window.__actualCamera.eye.every((value,i)=>Math.abs(value-eye[i])<.001),pose.eye);const a=await camera();
  await page.evaluate(()=>{let current=window.__actualCamera;window.__boundaryFrames=[];window.__recordBoundary=true;Object.defineProperty(window,'__actualCamera',{configurable:true,get:()=>current,set:value=>{current=value;if(window.__recordBoundary)window.__boundaryFrames.push({eye:value.eye,matrix:value.matrix});}});});
  const first=mock.state.garden.next_spot;append(mock.state,test.modules?6:1);const after=gardenTour(compactAreaLayout(mock.state).beds),coordinate=tourCoordinate(before,accepted.distance),survives=after.legs.some(leg=>leg.edge.id===coordinate.id),retained=retainTourDistance(before,after,accepted.distance),newStop=stops(after).find(stop=>stop.id===test.id);
  assert(newStop);if(!survives)assert.equal(retained,newStop.distance,'Native point beside removed geometry must choose this exact surviving stop, never a latest-type alias');
  const canonical=tourPose(after,newStop.distance),expected=survives?a:{eye:[...new Float32Array(canonical.eye)],matrix:[...multiply(perspective(tourFovY(canonical,width/height),width/height,.1,420),lookAt(canonical.eye,canonical.look,[0,1,0]))]};
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator(`[data-plot-spot="${first}"]`).waitFor({state:'attached'});await page.waitForFunction(d=>Math.abs(Number(document.querySelector('[data-garden-scroll]').dataset.distance)-d)<.01,retained);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const b=await camera(),frames=await page.evaluate(()=>{window.__recordBoundary=false;return window.__boundaryFrames;});results.push({view,motion,...test,accepted,oldStopDistance:stop.distance,newStopDistance:newStop.distance,coordinate,survives,retained,before:a,expectedAfter:expected,after:b,frames,errors});writeFileSync(resolve(output,'observations.json'),JSON.stringify({...metadata,results},null,2));
  assert.deepEqual(errors,[]);assert.deepEqual(b,expected,'Actual uploaded canonical pose/lens after refresh');assert(frames.length);for(const frame of frames)assert(isDeepStrictEqual(frame,a)||isDeepStrictEqual(frame,expected),'Every submitted frame is the accepted surviving pose or the permitted canonical fallback');
  console.log(view,motion,test.id,test.offset,survives?'exact surviving buffer':'nearest stable boundary');
 }catch(error){await page.screenshot({path:resolve(output,`${view}-${motion}-${test.modules}-${test.id.replaceAll(':','-')}-${test.offset}-failure.png`)});throw error;}finally{await context.close();}
}}finally{await browser.close();await v.close();}
