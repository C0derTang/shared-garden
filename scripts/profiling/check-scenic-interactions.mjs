import {evidenceMetadata} from "./scenic-evidence.mjs";
/* global localStorage,document,window,PointerEvent,URL,structuredClone,GPUAdapter,getComputedStyle,requestAnimationFrame */
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import process from "node:process";
import console from "node:console";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||"playwright");
const base=process.env.BASE_URL||"http://localhost:3224",output=resolve(process.env.PROFILE_OUTPUT||"/tmp/ccapp-224-interactions");assert(["localhost","127.0.0.1"].includes(new URL(base).hostname));mkdirSync(output,{recursive:true});evidenceMetadata(output);
const fixture=JSON.parse(readFileSync("scripts/profiling/fixtures/type-area-garden.json","utf8"));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:["--enable-unsafe-webgpu"]});const observations=[];
try{
 for(const [view,width,height,dpr,touch] of [["desktop",1280,800,1,false],["portrait",390,844,2,true],["landscape",844,390,2,true],["narrow",800,600,1,false]])for(const empty of [true,false]){
  if(process.env.VIEW&&view!==process.env.VIEW)continue;
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,reducedMotion:"reduce",hasTouch:touch});const page=await context.newPage(),errors=[],calls=[];
  let state=structuredClone(fixture);if(empty){state.plants=[];state.garden.next_spot=1;state.garden.spot_capacity=12;}else{state.plants=state.plants.filter(p=>p.flower.spot!==24);state.garden.next_spot=24;}
  const plantingMs=[];const preserved=structuredClone(state.plants),prefix=`${view}-${empty?'empty':'populated-boundary'}`;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript({path:resolve('scripts/profiling/world-camera-hook.js')});
  await page.addInitScript(()=>{localStorage.setItem("garden-v2:guide-seen:1","1");window.__devices=[];window.__worldDevices=[];const request=GPUAdapter.prototype.requestDevice;GPUAdapter.prototype.requestDevice=async function(...args){const device=await request.apply(this,args);window.__devices.push(device);const shader=device.createShaderModule.bind(device);let world=false;device.createShaderModule=(descriptor)=>{if(!world&&descriptor.label?.startsWith('garden-world.')){world=true;window.__worldDevices.push(device);}return shader(descriptor);};return device;};});
      await page.route("**/*", async (route) => {
        const request = route.request();
        const action = request.headers()["next-action"];
        if (!action) {
          assert.equal(new URL(request.url()).origin, new URL(base).origin, "Unexpected external request");
          return route.continue();
        }
        const manifest = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8"));
        const name = manifest.node[action]?.exportedName;
        const args = JSON.parse(request.postData());
        calls.push({ name, args });
        let result;
        if (name === "refreshGardenV2") result = { state, error: null };
        else if (name === "readPrivateInteraction") result = { state: { status: "unavailable" }, error: null };
        else if (name === "readRepliesV2") result = { replies: [], error: null };
        else if (name === "loadFlowerHistoryV2") result = { entries: [{ id: 901, flower_id: args[0], author_id: 1, garden_day: "2026-11-25", original_posted_at: "2026-11-25T20:00:00Z", updated_at: "2026-11-25T20:00:00Z", payload: { text: "An earlier synthetic memory." }, daisy_assignment_day: null }], error: null };
        else if (name === "mutateGardenV2") {
          const command = args[0];
          assert.equal(command.kind, "plant");
          assert.equal(command.spot, state.garden.next_spot);
          const template = structuredClone(fixture.plants.find((plant) => plant.flower.type_key === command.type));
          template.flower = { ...template.flower, id: `00000000-0000-4000-8000-${String(100 + command.spot).padStart(12, "0")}`, spot: command.spot, growth_units: 0, first_bloom_at: null, first_bloom_day: null, shared_wish: command.wish ?? null };
          const plants=[...state.plants,template],occupied=new Set(plants.map(plant=>plant.flower.spot));let next=1;while(occupied.has(next))next++;
          state = { ...state, plants, garden: { ...state.garden, next_spot: next, spot_capacity: Math.max(state.garden.spot_capacity,Math.ceil(next/12)*12) } };
          result = { state, saved: true, error: null };
        } else throw new Error(`Unexpected synthetic action: ${name}`);
        await route.fulfill({ status: 200, contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(result)}\n` });
      });


  try{
   await page.goto(`${base}/dev/garden-areas?scope=1&arrival=1&${empty?'empty=1':'boundary=1'}`);await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
   await page.locator('[data-arrival-light]').waitFor();assert.equal(await page.getByRole('navigation',{name:'Garden path'}).count(),0);
   const nav=page.getByRole('navigation',{name:'Garden path'});await nav.waitFor({timeout:90000});
   const selector=nav.getByRole('combobox',{name:'Scenic stop'}),world=page.locator('[data-garden-world]');
   const camera=()=>page.evaluate(()=>window.__actualCamera&&({eye:window.__actualCamera.eye,matrix:window.__actualCamera.matrix}));
   await page.waitForTimeout(150);const settled=await camera();assert(settled,'Actual rendered camera observed');
   await world.focus();for(const key of ['w','a','s','d','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'])await page.keyboard.press(key);
   await page.mouse.wheel(80,160);await page.waitForTimeout(200);assert.deepEqual(await camera(),settled,'Keys/wheel do not free-walk');
   await nav.getByRole('button',{name:/Onward to/}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(150);assert.equal(await selector.inputValue(),'pocket:0:0');
   await selector.selectOption('house-rear');await selector.selectOption('lake');await selector.selectOption('pocket:0:0');await page.waitForTimeout(150);
   const cdp=touch?await context.newCDPSession(page):null;
   const onward=nav.getByRole('button',{name:/Onward to/});const r=await onward.boundingBox(),at={x:r.x+r.width/2,y:r.y+r.height/2};
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...at,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await onward.click();
   await page.waitForTimeout(150);assert.equal(await selector.inputValue(),'pocket:1:0','Trusted/emulated onward click selects fixed stop');
   // An out-and-back drag on the actual route control must not change stops.
   await page.mouse.move(at.x,at.y);await page.mouse.down();await page.mouse.move(at.x+100,at.y-100);await page.mouse.move(at.x,at.y);await page.mouse.up();await page.waitForTimeout(100);
   assert.equal(await selector.inputValue(),'pocket:1:0');
   if(cdp){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...at,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:at.x+100,y:at.y-100,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...at,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await selector.inputValue(),'pocket:1:0');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...at,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await selector.inputValue(),'pocket:1:0');
   }
   // World route buttons retain pointer capture across an excursion outside their own element.
   let marker=null;
   for(const id of await selector.locator('option').evaluateAll(es=>es.map(e=>e.value))){
    await selector.selectOption(id);await page.waitForTimeout(150);
    marker=await page.locator('[data-caption^="route-"]').evaluateAll(es=>{for(const e of es){const r=e.getBoundingClientRect();if(!e.hasAttribute('data-offscreen')&&getComputedStyle(e).visibility!=='hidden'&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e)return{id:e.dataset.caption,x:r.x+r.width/2,y:r.y+r.height/2};}return null;});
    if(marker)break;
   }
   assert(marker,'At least one projected route marker is pointer reachable');const markerBefore=await selector.inputValue();
   await page.mouse.move(marker.x,marker.y);await page.mouse.down();await page.mouse.move(marker.x+120,marker.y-110);await page.mouse.move(marker.x,marker.y);await page.mouse.up();await page.waitForTimeout(100);assert.equal(await selector.inputValue(),markerBefore);
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:marker.x,y:marker.y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:marker.x+120,y:marker.y-110,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:marker.x,y:marker.y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);assert.equal(await selector.inputValue(),markerBefore);}
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:marker.x,y:marker.y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await selector.inputValue(),markerBefore);}
   if(touch)await page.touchscreen.tap(marker.x,marker.y);else await page.mouse.click(marker.x,marker.y);await page.waitForTimeout(150);assert.equal(await selector.inputValue(),marker.id.slice('route-'.length));
   await selector.selectOption('pocket:0:0');await page.waitForTimeout(120);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.locator('[data-nav-view="settings"]').click();await page.getByRole('dialog').waitFor();assert.equal(await nav.count(),0);
   await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});await nav.waitFor();
   await page.getByRole('button',{name:'synthetic scoped sheet'}).click();await page.getByRole('dialog',{name:'Synthetic scoped draft'}).waitFor();
   await page.getByLabel('Synthetic draft').fill('wasd and arrows stay in this draft');await page.getByLabel('Synthetic draft').press('ArrowLeft');assert.equal(await nav.count(),0);
   await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});await nav.waitFor();
   for(let type=0;type<13;type++){
    await page.waitForTimeout(120);await page.locator(`[data-plot-spot="-${type+1}"]`).focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:'plant a seed',exact:true});await dialog.waitFor();
    assert(await dialog.getByRole('radio',{name:new RegExp(`^${fixture.catalog[type].type_key} `)}).isChecked(),`${prefix}: intended planting type${type}, ${await dialog.locator('[role=radio][aria-checked=true]').allTextContents()}`);assert.equal(await nav.count(),0);
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});await nav.waitFor();
   }
   await page.waitForTimeout(160);
   const cameraBefore=await page.evaluate(()=>window.__actualCamera);const positionsBefore=await page.locator('[data-caption^="care-"]').evaluateAll(es=>Object.fromEntries(es.filter(e=>getComputedStyle(e).visibility==='visible').map(e=>[e.dataset.caption,e.style.transform])));
   if(!empty){await selector.selectOption('pocket:10:1');await page.waitForTimeout(100);}
   for(let repeat=0;repeat<2;repeat++){
    await page.locator('[data-plot-spot="-1"]').focus();await page.keyboard.press('Enter');const plantingStart=performance.now();await page.getByRole('button',{name:'plant the rose',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'rose',exact:true});await dialog.waitFor();plantingMs.push(performance.now()-plantingStart);const draft=dialog.locator('textarea');await draft.fill('synthetic wasd draft');await draft.press('ArrowLeft');await draft.press('w');
    assert.equal(await nav.count(),0);await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});await nav.waitFor();
    if(!empty&&repeat===0)assert.equal(await selector.inputValue(),'pocket:10:0','Removed pending-only stop falls back to same type');
   }
   assert.deepEqual(state.plants.slice(0,preserved.length),preserved);
   if(!empty){
    await page.locator('[data-plot-spot="1"]').focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:'rose',exact:true});await dialog.waitFor();
    await dialog.getByRole('button',{name:'read earlier days',exact:true}).click();await dialog.getByText('An earlier synthetic memory.',{exact:true}).waitFor();
    assert(calls.some(c=>c.name==='loadFlowerHistoryV2'&&c.args[0]===fixture.plants[0].flower.id));await page.screenshot({path:resolve(output,`${prefix}-history.png`)});
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});await nav.waitFor();
   }
   await selector.selectOption('pocket:0:0');await page.waitForTimeout(120);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const positionsAfter=await page.locator('[data-caption^="care-"]').evaluateAll(es=>Object.fromEntries(es.map(e=>[e.dataset.caption,e.style.transform])));
   writeFileSync(resolve(output,`${prefix}-anchor-check.json`),JSON.stringify({cameraBefore,cameraAfter:await page.evaluate(()=>window.__actualCamera),positionsBefore,positionsAfter},null,2));
   const cameraAfter=await page.evaluate(()=>window.__actualCamera);assert.deepEqual({eye:cameraAfter.eye,matrix:cameraAfter.matrix},{eye:cameraBefore.eye,matrix:cameraBefore.matrix},'Exact rendered camera returns to the same selected stop');
   const captionOffsets=[];
   if(!empty)for(const [id,position]of Object.entries(positionsBefore)){
    const before=position.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/),after=positionsAfter[id].match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/);assert(before&&after,'Existing visible care anchor still projects');
    const dx=Number(after[1])-Number(before[1]),dy=Number(after[2])-Number(before[2]);
    // Exact camera/data equality is checked separately. The renderer's existing
    // reduced-motion t=0 bob has sin(index*1.7)*3 / sin(index*2.3)*4 phases;
    // inserting nearby captions may change index, bounded by6px/8px (+rounding).
    assert(Math.abs(dx)<=6.1&&Math.abs(dy)<=8.1,'Only source-derived decorative phase can differ');captionOffsets.push({id,dx,dy});
   }
   // Real canvas pick target takes priority over route navigation; drag never visits.
   const target=await page.evaluate(()=>{const canvas=document.querySelector('canvas');for(let y=window.innerHeight*.2;y<window.innerHeight*.84;y+=8)for(let x=window.innerWidth*.08;x<window.innerWidth*.92;x+=8){if(document.elementFromPoint(x,y)!==canvas)continue;canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y}));if(canvas.style.cursor==='pointer')return{x,y};}return null;});assert(target);
   const selectedBefore=await selector.inputValue();
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...target,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x+35,y:target.y-25,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...target,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{await page.mouse.move(target.x,target.y);await page.mouse.down();await page.mouse.move(target.x+35,target.y-25);await page.mouse.move(target.x,target.y);await page.mouse.up();}
   await page.waitForTimeout(100);assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await selector.inputValue(),selectedBefore);
   if(touch)await page.touchscreen.tap(target.x,target.y);else await page.mouse.click(target.x,target.y);
   await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});await nav.waitFor();assert.equal(await selector.inputValue(),selectedBefore);
   await page.waitForTimeout(220);const ground=await page.evaluate(()=>{const canvas=document.querySelector('canvas');for(let y=window.innerHeight*.5;y<window.innerHeight*.8;y+=15)for(let x=window.innerWidth*.15;x<window.innerWidth*.85;x+=15){if(document.elementFromPoint(x,y)!==canvas)continue;canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y}));if(canvas.style.cursor!=='pointer')return{x,y};}return null;});assert(ground);
   const beforeGround=await camera();if(touch)await page.touchscreen.tap(ground.x,ground.y);else await page.mouse.click(ground.x,ground.y);await page.waitForTimeout(200);assert.deepEqual(await camera(),beforeGround);assert.equal(await selector.inputValue(),selectedBefore);
   await selector.selectOption('house-rear');await page.waitForTimeout(150);await page.setViewportSize({width:height,height:width});await page.waitForTimeout(200);await page.setViewportSize({width,height});await page.waitForTimeout(200);assert.equal(await selector.inputValue(),'house-rear');
   const count=await page.evaluate(()=>window.__worldDevices.length);await page.evaluate(()=>window.__worldDevices.at(-1).destroy());await page.waitForFunction(n=>window.__worldDevices.length>n&&document.querySelector('[data-garden-world][data-status="ready"]'),count);
   await nav.waitFor();assert.equal(await selector.inputValue(),'house-rear');await page.screenshot({path:resolve(output,`${prefix}-recovered.png`)});
   await page.evaluate(()=>window.__worldDevices.at(-1).destroy());await page.getByText('The painted garden stopped.').waitFor();
   assert.deepEqual(errors,[]);observations.push({view,width,height,empty,plantingMs,plantingTimingMethod:"Playwright click start to actual new-flower dialog visible; emulated local action response, observer latency included",preservedPlants:preserved.length,all13Areas:true,repeatedRosePlantings:2,originalHistory:empty?null:true,lowerHoleBoundary:empty?null:true,positionsBefore,positionsAfter,captionOffsets,captionOffsetBound:{x:6.1,y:8.1,reason:"Existing sin(index*1.7)*3 / sin(index*2.3)*4 static bob phase plus0.1px rounding"},keyboardNoMovement:true,groundNoMovement:true,routeKeyboard:true,trustedTouch:touch,dragRejected:true,worldMarkerDragRejected:true,worldMarkerClick:true,priorityPick:true,overlaysAndTyping:true,returnToSelectedStop:true,resize:true,actualGpuRecovery:true,stoppedAfterSecondLoss:true,calls,errors});
   writeFileSync(resolve(output,'observations.json'),JSON.stringify(observations,null,2));console.log(prefix,'passed');
  }catch(error){await page.screenshot({path:resolve(output,`${prefix}-failure.png`)});throw error;}finally{await context.close();}
 }
}finally{await browser.close();}
