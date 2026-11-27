/* global document */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import process from 'node:process';
import console from 'node:console';
import {compactFixture,installCompactFixture} from './compact-browser-fixture.mjs';
import {waitForPickerPortraits} from './picker-portrait-readiness.mjs';
import {evidenceMetadata} from './scenic-evidence.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),base=process.env.BASE_URL||'http://localhost:3226',output=process.env.PROFILE_OUTPUT||'/tmp/ccapp-226-picker-readiness';
mkdirSync(output,{recursive:true});const metadata=evidenceMetadata(output),browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--enable-unsafe-webgpu']}),results=[];
try{for(const kind of ['delayed','missing']){
 const state=compactFixture('empty'),context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'}),page=await context.newPage();await installCompactFixture(page,base,state);
 let release,requested;const gate=new Promise(r=>release=r),imageRequested=new Promise(r=>requested=r);
 await page.route('**/flowers/picker/rose.webp',async route=>{requested();if(kind==='missing')return route.fulfill({status:404,body:'missing synthetic image'});await gate;return route.continue();});
 try{await page.goto(`${base}/dev/garden-areas?empty=1`);await page.getByRole('button',{name:'Choose a flower',exact:true}).click({timeout:90000});await imageRequested;
  let completed=false;const waiting=waitForPickerPortraits(page,state.catalog.map(c=>c.type_key),kind==='missing'?1500:15000).then(()=>{completed=true;},error=>{throw error;});
  if(kind==='delayed'){
   await page.waitForFunction(()=>{const image=document.querySelector('#flower-picker img[src="/flowers/picker/rose.webp"]');return image&&!image.complete&&image.naturalWidth===0;});assert.equal(completed,false,'Mounted drawer with pending request cannot pass readiness');release();await waiting;assert.equal(completed,true);results.push({kind,pendingRequestObserved:true,readyOnlyAfterReleaseAndDecode:true});
  }else{await assert.rejects(waiting,/Timeout/);const dimensions=await page.locator('#flower-picker img[src="/flowers/picker/rose.webp"]').evaluate(image=>({complete:image.complete,width:image.naturalWidth,height:image.naturalHeight}));assert.equal(dimensions.width,0);results.push({kind,boundedReadinessRejected:true,dimensions});}
  console.log(kind,'passed');
 }finally{release();await context.close();}
}}finally{await browser.close();writeFileSync(resolve(output,'observations.json'),JSON.stringify({...metadata,results},null,2)+'\n');}
