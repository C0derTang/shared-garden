/* global window,document,Event */
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import process from 'node:process';
import console from 'node:console';
import {evidenceMetadata} from './scenic-evidence.mjs';
import {installReadOnlyFixture} from './scenic-browser-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=resolve(process.env.PROFILE_OUTPUT||'/tmp/ccapp-224-final-motion'),base=process.env.BASE_URL||'http://localhost:3224';mkdirSync(output,{recursive:true});evidenceMetadata(output);
const fixture=JSON.parse(readFileSync('scripts/profiling/fixtures/type-area-garden.json','utf8')),observations=[];
const modules=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true}});
const {scenicRoute,scenicPose,scenicFovY}=await modules.ssrLoadModule('/src/lib/world/scenic-route.ts'),{typeAreaLayout}=await modules.ssrLoadModule('/src/lib/garden-v2/type-areas.ts'),{lookAt,perspective,multiply}=await modules.ssrLoadModule('/src/lib/world/camera.ts');const route=scenicRoute(typeAreaLayout(fixture).beds);await modules.close();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--enable-unsafe-webgpu']});
try{for(const [view,width,height]of [['desktop',1280,800],['portrait',390,844],['landscape',844,390],['narrow',800,600]].filter(([view])=>!process.env.VIEW||process.env.VIEW===view)){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript({path:resolve('scripts/profiling/world-camera-hook.js')});
 const calls=await installReadOnlyFixture(page,base,fixture);await page.clock.setFixedTime('2026-06-22T02:52:00Z');
 const nav=page.getByRole('navigation',{name:'Garden path'}),selector=nav.getByRole('combobox',{name:'Scenic stop'});
 const camera=()=>page.evaluate(()=>window.__actualCamera&&({eye:window.__actualCamera.eye,matrix:window.__actualCamera.matrix}));
 const stable=async()=>{
  let previous=null,equal=0;for(let i=0;i<240;i++){await page.waitForTimeout(250);const current=await camera();assert(current,'Actual world-camera uniform hook captured');if(JSON.stringify(current)===JSON.stringify(previous))equal++;else equal=0;previous=current;if(equal>=4){const id=await selector.inputValue(),stop=route.stops.find(s=>s.id===id),aspect=width/height,fov=scenicFovY(stop.pose,aspect),pose=scenicPose(stop.pose,aspect,fov,null,0),expected=multiply(perspective(fov,aspect,.1,420),lookAt(pose.eye,pose.look,[0,1,0]));assert(current.eye.every((v,i)=>Math.abs(v-pose.eye[i])<1e-4),`Actual eye reaches${id}`);assert(current.matrix.every((v,i)=>Math.abs(v-expected[i])<1e-4),`Actual orientation/lens reaches${id}`);return current;}}throw new Error('Camera did not settle within60seconds');
 };

 try{
  await page.goto(`${base}/dev/garden-areas?arrival=1`);await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
  await page.locator('[data-arrival-light]').waitFor();assert.equal(await nav.count(),0);await nav.waitFor({timeout:90000});assert.equal(await selector.inputValue(),'overview:0');await stable();
  await page.screenshot({path:resolve(output,`${view}-initial-layout.png`)});writeFileSync(resolve(output,`${view}-initial-layout.json`),JSON.stringify(await page.locator('nav,[data-caption^="route-"]').evaluateAll(elements=>elements.map(e=>({text:e.textContent,offscreen:e.hasAttribute('data-offscreen'),rect:e.getBoundingClientRect().toJSON()}))),null,2));
  const hint=page.getByText('choose a stop along the path · tap a flower to visit',{exact:true}),h=await hint.boundingBox(),n=await nav.boundingBox();assert(h&&n&&h.x>=0&&h.y>=0&&h.x+h.width<=width&&h.y+h.height<=height);assert(h.y+h.height<=n.y||h.y>=n.y+n.height||h.x+h.width<=n.x||h.x>=n.x+n.width,'Initial hint avoids route controls');for(const marker of await page.locator('[data-caption^="route-"]').all()){if(await marker.evaluate(e=>e.hasAttribute('data-offscreen')))continue;const r=await marker.boundingBox();assert(!r||r.x+r.width<=h.x||r.x>=h.x+h.width||r.y+r.height<=h.y||r.y>=h.y+h.height,'Initial hint avoids visible world route markers');}await page.screenshot({path:resolve(output,`${view}-arrival.png`)});
  await selector.selectOption('pocket:0:0');const before=await stable();
  await page.locator('[data-plot-spot="1"]').focus();await page.keyboard.press('Enter');assert.equal(await nav.count(),0);const dialog=page.getByRole('dialog',{name:'rose',exact:true});await dialog.waitFor();await page.screenshot({path:resolve(output,`${view}-activity.png`)});
  await page.keyboard.press('Escape');assert.equal(await nav.count(),0);await nav.waitFor({timeout:15000});assert.equal(await selector.inputValue(),'pocket:0:0');assert.deepEqual(await stable(),before,'Normal return restores selected scenic pose');
  await selector.selectOption('pocket:8:0');await page.waitForTimeout(100);await selector.selectOption('pocket:12:0');await page.waitForTimeout(100);await selector.selectOption('house-rear');await stable();assert.equal(await selector.inputValue(),'house-rear');await page.screenshot({path:resolve(output,`${view}-retarget.png`)});
  await selector.selectOption('lake');await page.waitForTimeout(150);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await stable();assert.equal(await selector.inputValue(),'lake');
  await selector.selectOption('pocket:3:0');await page.waitForTimeout(150);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await stable();assert.equal(await selector.inputValue(),'pocket:3:0');
  await selector.selectOption('pocket:4:0');await page.waitForTimeout(100);const settings=await page.locator('[data-nav-view="settings"]').boundingBox();assert(settings);await page.mouse.click(settings.x+settings.width/2,settings.y+settings.height/2);await page.getByRole('dialog').waitFor();assert.equal(await nav.count(),0);await page.keyboard.press('Escape');await nav.waitFor();await stable();assert.equal(await selector.inputValue(),'pocket:4:0');
  await selector.selectOption('house-rear');await page.waitForTimeout(150);await page.setViewportSize({width:height,height:width});await page.waitForTimeout(200);await page.setViewportSize({width,height});await stable();assert.equal(await selector.inputValue(),'house-rear');
  assert.deepEqual(errors,[]);observations.push({finalCamera:await camera(),view,width,height,motion:'normal',skyTime:'2026-06-22T02:52:00Z',arrival:true,activityReturn:true,rapidRetarget:true,blur:true,visibilityChange:true,overlayInterrupt:true,resizeDuringTravel:true,calls,errors});writeFileSync(resolve(output,'observations.json'),JSON.stringify(observations,null,2));console.log(view,'normal motion passed');
 }finally{await context.close();}
}}finally{await browser.close();}
