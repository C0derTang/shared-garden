/* global document,window,getComputedStyle,requestAnimationFrame,performance */
/** Narrow actual-view coverage of the expanded invitation, not a geometry resweep. */
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import process from 'node:process';
import {URL} from 'node:url';
import console from 'node:console';
import {compactFixture,installCompactFixture} from './compact-browser-fixture.mjs';
import {evidenceMetadata} from './scenic-evidence.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:3234',output=process.env.PROFILE_OUTPUT||'/tmp/ccapp-230-reservations';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
mkdirSync(output,{recursive:true});const metadata=evidenceMetadata(output);
const snapshot=()=>Object.fromEntries(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src'],{encoding:'utf8'}).trim().split('\n').filter(file=>!file.includes('.test.')).sort().map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
const before=snapshot();writeFileSync(resolve(output,'source-start.json'),JSON.stringify(before,null,2));
const modules=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false,ws:false}});
const {compactAreaLayout}=await modules.ssrLoadModule('/src/lib/garden-v2/compact-areas.ts');
const {gardenTour,tourDistanceToPixels,tourPose,tourFovY}=await modules.ssrLoadModule('/src/lib/world/garden-tour.ts');
const {tourContext}=await modules.ssrLoadModule('/src/lib/world/tour-context.ts');
const {lookAt,multiply,perspective}=await modules.ssrLoadModule('/src/lib/world/camera.ts');
const {pickOnScreen}=await modules.ssrLoadModule('/src/lib/world/picking.ts');
const {visibleCueFootprints}=await modules.ssrLoadModule('/src/lib/world/cue-placement.ts');
const {worldFlowerAnchors}=await modules.ssrLoadModule('/src/components/world/flowers/flower-models.ts');
const {plantSpec,catalogItem}=await modules.ssrLoadModule('/src/lib/garden-v2/flowers.ts');
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--enable-unsafe-webgpu']}),results=[];
try{
 for(const [view,width,height,dpr] of [['desktop',1280,800,1],['portrait',390,844,2],['landscape',844,390,2],['narrow',800,600,1]]){
  for(const task of ['moonflower','snapdragon']){
   const state=compactFixture('full'),target=state.plants.find(plant=>plant.flower.type_key===task);assert(target);
   for(const plant of state.plants)plant.member1_submitted=true;
   state.moonflower_open=true;target.member1_submitted=false;target.flower.first_bloom_at=null;target.flower.first_bloom_day=null;target.flower.growth_units=3;
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:dpr===2,reducedMotion:task==='snapdragon'?'no-preference':'reduce'}),page=await context.newPage(),errors=[];
   page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
   const mock=await installCompactFixture(page,base,state);
   await page.addInitScript({path:resolve('scripts/profiling/world-camera-hook.js')});
   await page.clock.setFixedTime('2026-06-22T06:30:00Z');
   try{
    await page.goto(`${base}/dev/garden-areas?bloom=1&many=1`);
    await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
    const trigger=page.getByRole('button',{name:'Choose a flower',exact:true}),scroll=page.locator('[data-garden-scroll]'),cue=page.locator('[data-garden-place]'),invitation=page.locator('[data-garden-invitation]');
    await trigger.waitFor({timeout:90000});await page.waitForFunction(type=>document.querySelector('[data-garden-invitation]')?.textContent.includes(type),task);
    const layout=compactAreaLayout(state),tour=gardenTour(layout.beds),positions=new Map(layout.spots.map(spot=>[spot.spot,spot.position]));
    const anchors=worldFlowerAnchors(state.plants.map(plant=>({id:plant.flower.id,spec:plantSpec(plant,catalogItem(state,plant.flower.type_key)),position:positions.get(plant.flower.spot)})));
    const bend=tour.legs.find(leg=>leg.edge.from==='terrace:0');assert(bend,'A native curve leaves the shore Rose pocket');
    const cases=[
     {name:'overlook',distance:tour.startDistance},
     {name:'activity-flower',distance:tour.anchors.get(layout.areas.findIndex(area=>area.type===task))},
     {name:'inland-flower',distance:tour.anchors.get(layout.areas.findIndex(area=>area.type==='bluebell'))},
     {name:`curve:${bend.edge.from}->${bend.edge.to}`,distance:bend.start+bend.length*.5},
    ];
    const observations=[];
    const move=async distance=>{
     await scroll.evaluate((element,top)=>element.scrollTo({top,behavior:'instant'}),tourDistanceToPixels(tour,distance));
     const tolerance=Math.max(...tour.legs.map(leg=>leg.length/leg.scrollLength))+.0001;
     await page.waitForFunction(({distance,tolerance})=>Math.abs(Number(document.querySelector('[data-garden-scroll]').dataset.distance)-distance)<tolerance,{distance,tolerance});
     const accepted=Number(await scroll.getAttribute('data-distance')),pose=tourPose(tour,accepted),matrix=multiply(perspective(tourFovY(pose,width/height),width/height,.1,420),lookAt(pose.eye,pose.look,[0,1,0]));
     await page.waitForFunction(({eye,matrix})=>window.__actualCamera?.eye.every((v,i)=>Math.abs(v-eye[i])<.001)&&window.__actualCamera.matrix.every((v,i)=>Math.abs(v-matrix[i])<.002),{eye:pose.eye,matrix:[...matrix]});
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     return accepted;
    };
    for(const sample of cases){
     const accepted=await move(sample.distance),expected=tourContext(tour,accepted);
     assert.equal(await page.locator('[data-place-label]').textContent(),expected.label);
     const bounds=await cue.boundingBox(),suppressed=await cue.getAttribute('data-place-suppressed')==='true';
     assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height);
     const chrome=await page.locator('nav,[data-world-reserved],[role="status"],[data-private-notice-host="garden"],main > button').evaluateAll(elements=>elements.filter(element=>!element.closest('[data-garden-place]')).map(element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}).filter(r=>r.width>0&&r.height>0));
     const actual=await page.evaluate(()=>window.__actualCamera),footprints=visibleCueFootprints({width,height,viewProjection:actual.matrix},layout.areas.map(area=>area.target),anchors);
     const targetCollisions=footprints.filter(footprint=>footprint.parts.some(part=>{const radius=Math.max(24,part.core);return overlap(bounds,{x:Math.min(part.a[0],part.b[0])-radius,y:Math.min(part.a[1],part.b[1])-radius,width:Math.abs(part.a[0]-part.b[0])+2*radius,height:Math.abs(part.a[1]-part.b[1])+2*radius});}));
     const hearts=await page.locator('[data-caption^="care-"]').evaluateAll(elements=>elements.filter(element=>getComputedStyle(element).visibility!=='hidden').map(element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
     assert(suppressed||chrome.every(rect=>!overlap(bounds,rect)),'Expanded note clears actual chrome');
     assert(suppressed||targetCollisions.length===0,'Expanded note clears actual flower/seed envelopes');
     assert(suppressed||hearts.every(rect=>!overlap(bounds,rect)),'Expanded note clears visible actual care hearts');
     let button=null;
     if(!suppressed){button=await invitation.boundingBox();assert(button.width>=44&&button.height>=44);assert(await invitation.evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'Actual invitation is hittable');}
     let physicalEntry=null;
     if(sample.name==='activity-flower'){
      const footprint=footprints.find(item=>item.target.kind==='flower'&&item.target.id===target.flower.id);assert(footprint,'The actual due flower is in view');
      let point=null;
      for(const part of footprint.parts){const x=(part.a[0]+part.b[0])/2,y=(part.a[1]+part.b[1])/2;
       const picked=pickOnScreen({width,height,viewProjection:actual.matrix},x,y,layout.areas.map(area=>area.target),anchors);
       if(x>0&&y>64&&x<width&&y<height&&picked?.kind==='flower'&&picked.id===target.flower.id&&await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName==='CANVAS',{x,y})){point={x,y};break;}
      }
      assert(point,'The correct due UUID is physically reachable');
      await page.evaluate(()=>document.querySelector('[data-garden-world] canvas').addEventListener('pointerup',()=>{window.__reservationPickAt=performance.now();},{once:true}));
      await page.mouse.click(point.x,point.y);
      const dialog=page.getByRole('dialog',{name:task,exact:true}),field=dialog.getByRole('textbox');await field.waitFor();
      const domMs=await page.evaluate(()=>performance.now()-window.__reservationPickAt);
      assert.equal(new URL(page.url()).searchParams.get('flower'),target.flower.id);
      await field.click();await page.keyboard.type('A synthetic reservation draft');assert.equal(await field.inputValue(),'A synthetic reservation draft');
      await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});await trigger.waitFor();await move(accepted);
      const returned=await page.evaluate(()=>window.__actualCamera);assert.deepEqual(returned.eye,actual.eye);assert.deepEqual(returned.matrix,actual.matrix);
      physicalEntry={point,domMs,correctUuid:target.flower.id,trustedTyping:true,exactGpuReturn:true};
     }
     observations.push({sample:sample.name,accepted,place:expected.label,label:(await invitation.textContent()).trim(),bounds,button,suppressed,visibleTargets:footprints.length,targetCollisions:targetCollisions.map(item=>item.target),visibleHearts:hearts.length,actualCamera:actual,physicalEntry});
     if(sample.name==='inland-flower')await page.screenshot({path:resolve(output,`${view}-${task}.png`)});
    }
    const safe=observations.find(item=>!item.suppressed);assert(safe,'At least one sampled actual view exposes the invitation');await move(safe.accepted);await invitation.waitFor({state:'visible'});
    await page.evaluate(()=>{const notice=document.createElement('p');notice.id='synthetic-reservation';notice.role='status';notice.textContent='Synthetic reserved bounds';Object.assign(notice.style,{position:'fixed',inset:'0',margin:'0',pointerEvents:'none'});document.querySelector('main').append(notice);});
    await page.waitForFunction(()=>document.querySelector('[data-garden-place]')?.dataset.placeSuppressed==='true');
    assert(!await invitation.isVisible(),'No safe slot suppresses the action with the note');
    await page.evaluate(()=>document.querySelector('#synthetic-reservation').remove());await invitation.waitFor({state:'visible'});
    assert.deepEqual(errors,[]);assert(!mock.calls.some(call=>call.name.startsWith('mutate')));
    results.push({view,width,height,dpr,motion:task==='snapdragon'?'normal':'reduced',task,targetUuid:target.flower.id,plants:state.plants.length,oneEligibleUnbloomedPlant:true,observations,noSafeSlotSuppressionAndRecovery:true,errors});
    writeFileSync(resolve(output,'observations.json'),JSON.stringify({metadata,results},null,2));console.log(view,task,'four actual views passed');
   }catch(error){await page.screenshot({path:resolve(output,`${view}-${task}-failure.png`)});writeFileSync(resolve(output,`${view}-${task}-failure.json`),JSON.stringify({error:String(error),errors,calls:mock.calls},null,2));throw error;}finally{await context.close();}
  }
 }
}finally{
 await browser.close();await modules.close();const after=snapshot();writeFileSync(resolve(output,'source-end.json'),JSON.stringify(after,null,2));assert.deepEqual(after,before);
}
