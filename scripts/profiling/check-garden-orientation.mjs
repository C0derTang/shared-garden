/* global document,window,Event,structuredClone,getComputedStyle,requestAnimationFrame */
/** Loopback-only checks of passive orientation against actual GPU/native coordinates. */
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import process from 'node:process';
import console from 'node:console';
import {compactFixture,installCompactFixture} from './compact-browser-fixture.mjs';
import {evidenceMetadata} from './scenic-evidence.mjs';
import {waitForPickerPortraits} from './picker-portrait-readiness.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'http://localhost:3230',output=process.env.PROFILE_OUTPUT||'/tmp/ccapp-228-orientation';
mkdirSync(output,{recursive:true});evidenceMetadata(output);
const modules=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false,ws:false}});
const {compactAreaLayout}=await modules.ssrLoadModule('/src/lib/garden-v2/compact-areas.ts');
const {gardenTour,tourDistanceToPixels,tourPose}=await modules.ssrLoadModule('/src/lib/world/garden-tour.ts');
const {tourContext}=await modules.ssrLoadModule('/src/lib/world/tour-context.ts');
const {visibleCueFootprints}=await modules.ssrLoadModule('/src/lib/world/cue-placement.ts');
const {worldFlowerAnchors}=await modules.ssrLoadModule('/src/components/world/flowers/flower-models.ts');
const {plantSpec,catalogItem}=await modules.ssrLoadModule('/src/lib/garden-v2/flowers.ts');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--enable-unsafe-webgpu']}),results=[];
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
try{for(const [view,width,height,dpr] of [['desktop',1280,800,1],['portrait',390,844,2],['landscape',844,390,2],['narrow',800,600,1]])for(const kind of (process.env.KINDS||'empty,mixed,full,sparse,occupied').split(',')){
 if(process.env.VIEW&&process.env.VIEW!==view)continue;
 const state=compactFixture(kind==='occupied'?'full':kind);
 if(kind==='occupied')for(let i=0;i<7;i++){const p=state.plants[0],spot=state.garden.next_spot++;state.plants.push({...structuredClone(p),flower:{...p.flower,id:`00000000-0000-4000-8000-${String(spot).padStart(12,'0')}`,spot,planted_at:new Date(Date.UTC(2099,0,1,0,0,i)).toISOString()}});}
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:dpr===2,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));const mock=await installCompactFixture(page,base,state);
 await page.addInitScript({path:resolve('scripts/profiling/world-camera-hook.js')});await page.clock.setFixedTime('2026-06-22T02:52:00Z');
 const params=kind==='empty'?'empty=1':kind==='sparse'?'sparse=1':['full','occupied'].includes(kind)?'bloom=1&many=1':'';
 try{
  await page.goto(`${base}/dev/garden-areas?scope=1&${params}`);await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
  const trigger=page.getByRole('button',{name:'Choose a flower',exact:true}),scroll=page.locator('[data-garden-scroll]'),cue=page.locator('[data-garden-place]');await trigger.waitFor({timeout:90000});
  // The same guarded refresh supplies occupied synthetic state, with no private backend.
  if(kind==='occupied'){await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('[data-plot-spot="85"]').waitFor({state:'attached'});}
  const layout=compactAreaLayout(mock.state),tour=gardenTour(layout.beds),positions=new Map(layout.spots.map(s=>[s.spot,s.position]));
  const anchors=worldFlowerAnchors(mock.state.plants.map(p=>({id:p.flower.id,spec:plantSpec(p,catalogItem(mock.state,p.flower.type_key)),position:positions.get(p.flower.spot)})));
  const stops=[...tour.legs.map(leg=>({id:leg.edge.from,distance:leg.start})),{id:tour.legs.at(-1).edge.to,distance:tour.length}],observations=[];
  for(const stop of stops){
   await scroll.evaluate((element,top)=>element.scrollTo({top,behavior:'instant'}),tourDistanceToPixels(tour,stop.distance));
   // Native CSS pixels are quantized (0.5px at DPR2). Bound the arc
   // difference by one actual CSS pixel on the least dense route leg.
   const nativeMetre=Math.max(...tour.legs.map(leg=>leg.length/leg.scrollLength));
   await page.waitForFunction(({distance,tolerance})=>Math.abs(Number(document.querySelector('[data-garden-scroll]').dataset.distance)-distance)<tolerance,{distance:stop.distance,tolerance:nativeMetre+.0001});
   const accepted=Number(await scroll.getAttribute('data-distance')),expected=tourContext(tour,accepted),pose=tourPose(tour,accepted);
   await page.waitForFunction(label=>document.querySelector('[data-place-label]')?.textContent===label,expected.label);
   await page.waitForFunction(eye=>window.__actualCamera?.eye.every((v,i)=>Math.abs(v-eye[i])<.001),pose.eye);
   const bounds=await cue.boundingBox(),chrome=await page.locator('nav').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
   assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height);
   assert(chrome.every(rect=>!overlap(bounds,rect)),'Place note clears global chrome');
   assert.equal(await cue.evaluate(element=>getComputedStyle(element).pointerEvents),'none');
   assert.equal(await cue.locator('[aria-live], [role="status"]').count(),0,'No per-scroll announcements');
   const progress=Number(await cue.locator('svg').getAttribute('data-route-progress'));assert(Math.abs(progress-accepted/tour.length)<.0001);
   const actual=await page.evaluate(()=>window.__actualCamera),footprints=visibleCueFootprints({width,height,viewProjection:actual.matrix},layout.areas.map(area=>area.target),anchors);
   const collisions=footprints.filter(footprint=>footprint.parts.some(part=>{const radius=Math.max(part.core,24);return overlap(bounds,{x:Math.min(part.a[0],part.b[0])-radius,y:Math.min(part.a[1],part.b[1])-radius,width:Math.abs(part.a[0]-part.b[0])+2*radius,height:Math.abs(part.a[1]-part.b[1])+2*radius});}));
   const suppressed=await cue.getAttribute('data-place-suppressed')==='true';
   const hearts=await page.locator('[data-caption^="care-"]').evaluateAll(elements=>elements.filter(element=>getComputedStyle(element).visibility!=='hidden').map(element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
   assert(suppressed||hearts.every(rect=>!overlap(bounds,rect)),'A visible note clears actual decorative care hearts');
   assert(suppressed||collisions.length===0,'A visible place note must clear every actual onscreen target');
   observations.push({stop:stop.id,accepted,label:expected.label,progress,bounds,suppressed,targetCollisions:collisions.map(f=>({target:f.target,centre:f.centre,parts:f.parts}))});
   if(['arrival','terrace:0','terrace:13','return:terrace:13'].includes(stop.id)||(kind==='full'&&['overview:0','terrace:6','terrace:7','terrace:12','terrace:4','terrace:9','terrace:11'].includes(stop.id)))await page.screenshot({path:resolve(output,`${view}-${kind}-${stop.id.replaceAll(':','-')}.png`),style:'button[style*="position: fixed"]{visibility:hidden!important}'});
   if(process.env.ADVERSARIAL&&kind==='full'&&view==='landscape'&&['terrace:6','terrace:7','terrace:12','terrace:4','terrace:9','terrace:11'].includes(stop.id)){
    const ids=new Set(mock.state.plants.filter(plant=>plant.flower.type_key===expected.type).map(plant=>plant.flower.id));
    const target=footprints.find(footprint=>footprint.target.kind==='flower'&&ids.has(footprint.target.id)&&footprint.centre[0]>48&&footprint.centre[0]<width-80&&footprint.centre[1]>80&&footprint.centre[1]<height-48);
    assert(target,'Current actual flower is visibly reachable');
    const point={x:target.centre[0],y:target.centre[1]};assert(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS',point));
    const camera=await page.evaluate(()=>({eye:window.__actualCamera.eye,matrix:window.__actualCamera.matrix}));
    await page.mouse.click(point.x,point.y);await page.getByRole('dialog',{name:expected.type,exact:true}).waitFor();await page.keyboard.press('Escape');await trigger.waitFor();
    await page.waitForFunction(eye=>window.__actualCamera.eye.every((value,i)=>value===eye[i]),camera.eye);
    assert.deepEqual(await page.evaluate(()=>({eye:window.__actualCamera.eye,matrix:window.__actualCamera.matrix})),camera);
    observations.at(-1).actualFlowerTapAndExactReturn=true;
   }
   if(expected.type){
    await trigger.click();const panel=page.getByRole('dialog',{name:'Choose a flower'});await waitForPickerPortraits(page,mock.state.catalog.map(c=>c.type_key));
    assert.equal(await cue.count(),0,'Place note steps aside for open modal');
    assert.deepEqual(await panel.getByRole('button').allTextContents(),mock.state.catalog.map(c=>c.display_name.toLowerCase()));
    const current=panel.getByRole('button',{name:expected.type,exact:true});assert.equal(await current.getAttribute('aria-current'),'location');assert(await current.evaluate(element=>document.activeElement===element));
    const row=await current.boundingBox(),panelBounds=await panel.boundingBox();assert(row.y>=panelBounds.y&&row.y+row.height<=panelBounds.y+panelBounds.height,'Current option is visibly focused within drawer');
    assert(row.height>=44&&row.width>=44);
    await page.keyboard.press('Escape');assert(await trigger.evaluate(element=>document.activeElement===element));
   }
  }
  if(process.env.ADVERSARIAL){
   const before=await cue.boundingBox();await page.evaluate(rect=>{const notice=document.createElement('p');notice.id='synthetic-orientation-notice';notice.role='status';notice.textContent='Synthetic garden notice';Object.assign(notice.style,{position:'fixed',left:`${rect.x}px`,top:`${rect.y}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:'0'});document.querySelector('main').append(notice);},before);
   await page.waitForFunction(()=>{const cue=document.querySelector('[data-garden-place]'),notice=document.querySelector('#synthetic-orientation-notice');if(cue.dataset.placeSuppressed==='true')return true;const a=cue.getBoundingClientRect(),b=notice.getBoundingClientRect();return !(a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y);});
   await page.evaluate(()=>document.querySelector('#synthetic-orientation-notice').remove());
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:resolve(output,`${view}-${kind}-notice-cleared.png`)});
  }
  assert.deepEqual(errors,[]);results.push({view,width,height,dpr,kind,motion:'reduced',stops:observations,errors,calls:mock.calls});writeFileSync(resolve(output,'observations.json'),JSON.stringify(results,null,2));
  console.log(view,kind,observations.length,'semantic places checked;',observations.filter(o=>o.targetCollisions.length).length,'reserved-target collisions');
 }catch(error){await page.screenshot({path:resolve(output,`${view}-${kind}-failure.png`)});writeFileSync(resolve(output,`${view}-${kind}-failure.json`),JSON.stringify({error:String(error),errors,calls:mock.calls},null,2));throw error;}finally{await context.close();}
}}finally{await browser.close();await modules.close();}
