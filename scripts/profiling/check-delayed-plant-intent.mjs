/* global document,window,localStorage,structuredClone,requestAnimationFrame */
/** Delayed save remains real; canceled planting navigation cannot replace a newer draft. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {URL} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {createServer} from 'vite';
import {compactFixture} from './compact-browser-fixture.mjs';
import {evidenceMetadata} from './scenic-evidence.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:3234',output=process.env.PROFILE_OUTPUT||'/tmp/ccapp-230-plant-intent';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));mkdirSync(output,{recursive:true});
const metadata=evidenceMetadata(output),snapshot=()=>Object.fromEntries(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src'],{encoding:'utf8'}).trim().split('\n').filter(file=>!file.includes('.test.')).sort().map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
const start=snapshot();writeFileSync(resolve(output,'source-start.json'),JSON.stringify(start,null,2));
const modules=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false,ws:false}});
const {compactAreaLayout}=await modules.ssrLoadModule('/src/lib/garden-v2/compact-areas.ts');
const {worldFlowerAnchors}=await modules.ssrLoadModule('/src/components/world/flowers/flower-models.ts');
const {plantSpec,catalogItem}=await modules.ssrLoadModule('/src/lib/garden-v2/flowers.ts');
const {visibleCueFootprints}=await modules.ssrLoadModule('/src/lib/world/cue-placement.ts');
const {pickOnScreen}=await modules.ssrLoadModule('/src/lib/world/picking.ts');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--enable-unsafe-webgpu']}),results=[];
try{
 for(const [view,width,height,motion] of [['desktop',1280,800,'no-preference'],['portrait',390,844,'reduce'],['landscape',844,390,'no-preference'],['narrow',800,600,'reduce']]){
  for(const outcome of ['newer-flower','newer-planting','close-only','active-success','queued-newer-flower','queued-newer-planting']){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:motion}),page=await context.newPage();page.setDefaultTimeout(15000);
   const visibleInitialState=compactFixture('mixed');let state=structuredClone(visibleInitialState),release,started,queued=false;const held=new Promise(resolve=>release=resolve),requestStarted=new Promise(resolve=>started=resolve),calls=[],errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript({path:resolve('scripts/profiling/world-camera-hook.js')});await page.addInitScript(()=>localStorage.setItem('garden-v2:guide-seen:1','1'));
   await page.route('**/*',async route=>{
    const request=route.request();assert.equal(new URL(request.url()).origin,new URL(base).origin,'Unexpected external request');const action=request.headers()['next-action'];if(!action)return route.continue();
    const name=JSON.parse(readFileSync('.next/dev/server/server-reference-manifest.json','utf8')).node[action]?.exportedName,args=JSON.parse(request.postData());calls.push({name,args});let result;
    if(name==='refreshGardenV2'){if(queued)await held;result={state,error:null};}
    else if(name==='readPrivateInteraction')result={state:{status:'unavailable'},error:null};
    else if(name==='readRepliesV2')result={replies:[],error:null};
    else if(name==='mutateGardenV2'){
     const command=args[0];assert.equal(command.kind,'plant');assert.equal(command.type,'tulip');assert.equal(command.spot,state.garden.next_spot);started();if(!outcome.startsWith('queued-'))await held;
     const plant=structuredClone(state.plants.find(plant=>plant.flower.type_key==='tulip'));
     plant.flower={...plant.flower,id:'00000000-0000-4000-8000-000000009998',spot:command.spot,planted_at:'2026-11-26T21:00:00Z',first_bloom_at:null,first_bloom_day:null,growth_units:0};plant.entries=[];plant.member1_submitted=false;plant.member2_submitted=false;
     state={...state,plants:[...state.plants,plant],garden:{...state.garden,next_spot:command.spot+1}};queued=outcome.startsWith('queued-');result={state:queued?null:state,saved:true,error:null};
    }else throw Error('Unexpected synthetic action '+name);
    await route.fulfill({status:200,contentType:'text/x-component',body:`0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(result)}\n`});
   });
   try{
    await page.goto(base+'/dev/garden-areas');await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
    const trigger=page.getByRole('button',{name:'Choose a flower',exact:true}),scroll=page.locator('[data-garden-scroll]');await trigger.waitFor({timeout:90000});
    await trigger.click();await page.getByRole('dialog',{name:'Choose a flower',exact:true}).getByRole('button',{name:'rose',exact:true}).click();
    const layout=compactAreaLayout(visibleInitialState),rose=visibleInitialState.plants.find(plant=>plant.flower.type_key==='rose');
    // Wait for the picker-owned native writer to release before the planting request.
    await page.waitForFunction(()=>{const element=document.querySelector('[data-garden-scroll]');const value=element.dataset.distance;if(window.__lastPlantDistance===value)return true;window.__lastPlantDistance=value;return false;});
    await page.waitForTimeout(motion==='reduce'?50:1700);
    const tourDistance=await scroll.getAttribute('data-distance'),cameraBefore=await page.evaluate(()=>({eye:window.__actualCamera.eye,matrix:window.__actualCamera.matrix}));
    await page.getByRole('button',{name:'Plant a flower',exact:true}).click();const planting=page.getByRole('dialog',{name:'plant a seed',exact:true});await planting.waitFor();
    await planting.getByRole('radio',{name:/^tulip/}).check();await planting.getByRole('button',{name:'plant the tulip',exact:true}).click();await requestStarted;
    let before=null;
    if(outcome!=='active-success'){
     if(outcome.startsWith('queued-'))await planting.waitFor({state:'detached'});else{await page.keyboard.press('Escape');await planting.waitFor({state:'detached'});}await trigger.waitFor();
     if(outcome.endsWith('newer-flower')){
      const actual=await page.evaluate(()=>window.__actualCamera),positions=new Map(layout.spots.map(spot=>[spot.spot,spot.position])),anchors=worldFlowerAnchors(visibleInitialState.plants.map(plant=>({id:plant.flower.id,spec:plantSpec(plant,catalogItem(visibleInitialState,plant.flower.type_key)),position:positions.get(plant.flower.spot)}))),seeds=[],screen={width,height,viewProjection:actual.matrix};
      const footprint=visibleCueFootprints(screen,seeds,anchors).find(item=>item.target.kind==='flower'&&item.target.id===rose.flower.id);assert(footprint);let point;
      for(const part of footprint.parts){const x=(part.a[0]+part.b[0])/2,y=(part.a[1]+part.b[1])/2,picked=pickOnScreen(screen,x,y,seeds,anchors);if(x>0&&y>64&&x<width&&y<height&&picked?.kind==='flower'&&picked.id===rose.flower.id&&await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName==='CANVAS',{x,y})){point={x,y};break;}}
      assert(point,'Existing Rose remains physically reachable');await page.mouse.click(point.x,point.y);const field=page.getByRole('dialog',{name:'rose',exact:true}).getByRole('textbox');await field.click();await page.keyboard.type('Newer intentional rose draft');assert.equal(await field.inputValue(),'Newer intentional rose draft');
      // A trusted click can happen before an opacity-only CSS animation ends.
      // Observe its natural completion; do not finish, disable or advance it.
      await field.evaluate(async element=>{for(let node=element;node&&node!==document.body;node=node.parentElement)await Promise.all(node.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
      before={point,href:page.url(),typed:await field.inputValue(),panelAnimationsNaturallyFinished:true};
     }else if(outcome.endsWith('newer-planting')){
      await page.getByRole('button',{name:'Plant a flower',exact:true}).click();const newer=page.getByRole('dialog',{name:'plant a seed',exact:true});await newer.getByRole('radio',{name:/^dandelion/}).check();const field=newer.getByRole('textbox',{name:'Your shared wish'});await field.click();await page.keyboard.type('Newer intentional planting wish');assert.equal(await field.inputValue(),'Newer intentional planting wish');await field.evaluate(async element=>{for(let node=element;node&&node!==document.body;node=node.parentElement)await Promise.all(node.getAnimations().map(animation=>animation.finished.catch(()=>{})));});before={href:page.url(),typed:await field.inputValue(),panelAnimationsNaturallyFinished:true};
     }else before={href:page.url(),focus:await page.evaluate(()=>document.activeElement?.outerHTML)};
    }
    await page.screenshot({path:resolve(output,`${view}-${outcome}-before.png`)});release();await page.locator('[data-plot-spot="27"]').waitFor({state:'attached'});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(state.plants.length,27,'The legitimate save remains applied');assert.equal(calls.filter(call=>call.name==='mutateGardenV2').length,1,'Only the explicit planting mutates');
    if(outcome.endsWith('newer-flower')){
     const field=page.getByRole('dialog',{name:'rose',exact:true}).getByRole('textbox');assert.equal(new URL(page.url()).searchParams.get('flower'),rose.flower.id);assert.equal(await field.inputValue(),'Newer intentional rose draft');assert(await field.evaluate(element=>document.activeElement===element));
    }else if(outcome.endsWith('newer-planting')){
     const field=page.getByRole('dialog',{name:'plant a seed',exact:true}).getByRole('textbox',{name:'Your shared wish'});assert.equal(new URL(page.url()).search,'');assert.equal(await field.inputValue(),'Newer intentional planting wish');assert(await field.evaluate(element=>document.activeElement===element));
    }else if(outcome==='close-only'){
     assert.equal(await page.getByRole('dialog').count(),0);assert.equal(new URL(page.url()).search,'');assert.equal(await scroll.getAttribute('data-distance'),tourDistance);
    }else{
     const field=page.getByRole('dialog',{name:'tulip',exact:true}).getByRole('textbox',{name:'Song title'});await field.click();await page.keyboard.type('Active saved flower draft');assert.equal(await field.inputValue(),'Active saved flower draft');await field.evaluate(async element=>{for(let node=element;node&&node!==document.body;node=node.parentElement)await Promise.all(node.getAnimations().map(animation=>animation.finished.catch(()=>{})));});assert.equal(new URL(page.url()).searchParams.get('flower'),'00000000-0000-4000-8000-000000009998');
    }
    await page.screenshot({path:resolve(output,`${view}-${outcome}-after.png`)});
    if(outcome!=='close-only'){await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});await trigger.waitFor();}
    await page.waitForFunction(expected=>window.__actualCamera.eye.every((value,i)=>value===expected.eye[i])&&window.__actualCamera.matrix.every((value,i)=>value===expected.matrix[i]),cameraBefore);
    assert.equal(await scroll.getAttribute('data-distance'),tourDistance);assert.deepEqual(errors,[]);
    results.push({view,width,height,motion,outcome,before,afterHref:page.url(),savedPlantRetained:true,onlyExplicitPlantMutation:true,newerDraftAndFocusPreserved:outcome.includes('newer-'),closeStaysClosed:outcome==='close-only',normalSuccessfulNavigation:outcome==='active-success',exactTourReturn:true,calls,errors});
    writeFileSync(resolve(output,'observations.json'),JSON.stringify({metadata,results},null,2));console.log(view,outcome,'passed');
   }catch(error){release();await page.screenshot({path:resolve(output,`${view}-${outcome}-failure.png`)});writeFileSync(resolve(output,`${view}-${outcome}-failure.json`),JSON.stringify({error:String(error),beforeCalls:calls,errors},null,2));throw error;}finally{await context.close();}
  }
 }
}finally{await browser.close();await modules.close();const end=snapshot();writeFileSync(resolve(output,'source-end.json'),JSON.stringify(end,null,2));assert.deepEqual(end,start);}
