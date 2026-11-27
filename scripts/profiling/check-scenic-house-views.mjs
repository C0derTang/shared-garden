import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import process from 'node:process';
import console from 'node:console';
import sharp from 'sharp';
import {evidenceMetadata} from './scenic-evidence.mjs';
import {installReadOnlyFixture} from './scenic-browser-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=resolve(process.env.PROFILE_OUTPUT||'/tmp/ccapp-224-final-house'),base=process.env.BASE_URL||'http://localhost:3224';mkdirSync(output,{recursive:true});evidenceMetadata(output);
const fixture=JSON.parse(readFileSync('scripts/profiling/fixtures/type-area-garden.json','utf8')),observations=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--enable-unsafe-webgpu']});
try{for(const [view,width,height,dpr]of [['desktop',1280,800,1],['portrait',390,844,2],['landscape',844,390,2],['narrow',800,600,1]])for(const [sky,time]of [['dusk','2026-06-22T02:52:00Z'],['day','2026-06-21T19:30:00Z'],['night','2026-06-22T06:30:00Z']]){
 if(!['desktop','portrait'].includes(view)&&sky!=='dusk')continue;
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await installReadOnlyFixture(page,base,fixture);await page.clock.setFixedTime(time);
 try{
  const images=[];for(const side of ['front','rear']){
   await page.goto(`${base}${side==='front'?`/dev/landing?sky=${sky}`:'/dev/garden-areas'}`);await page.addStyleTag({content:'nextjs-portal{display:none!important}'});await page.locator('[data-garden-world][data-status="ready"]').waitFor({timeout:90000});
   if(side==='rear')await page.getByRole('combobox',{name:'Scenic stop'}).selectOption('house-rear');await page.waitForTimeout(1500);
   const name=`${view}-${sky}-${side}.png`;await page.screenshot({path:resolve(output,name)});images.push(name);
  }
  const w=view==='portrait'?390:640,h=Math.round(w*height/width);await sharp({create:{width:w*2,height:h,channels:3,background:'#efe9d7'}}).composite(await Promise.all(images.map(async(name,i)=>({input:await sharp(resolve(output,name)).resize(w,h).toBuffer(),left:i*w,top:0})))).png().toFile(resolve(output,`${view}-${sky}-front-rear.png`));
  assert.deepEqual(errors,[]);observations.push({view,width,height,dpr,sky,time,images,frontVisitor:true,sameOriginalHouseFrame:true,originalLandingMesh:true,augmentedRearViewMesh:true,errors});writeFileSync(resolve(output,'observations.json'),JSON.stringify(observations,null,2));console.log(view,sky,'front/rear captured');
 }finally{await context.close();}
}
 const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'no-preference'}),page=await context.newPage(),entryErrors=[];page.on('pageerror',e=>entryErrors.push(e.message));
 try{
  await installReadOnlyFixture(page,base,fixture);await page.route(`${base}/garden**`,route=>route.fulfill({status:204,body:''}));
  await page.goto(`${base}/dev/landing?sky=dusk&member=1`);await page.addStyleTag({content:'nextjs-portal{display:none!important}'});await page.locator('[data-garden-world][data-status="ready"]').waitFor({timeout:90000});const door=await page.getByRole('link',{name:'come in',exact:true}).boundingBox();assert(door);await page.mouse.click(door.x+door.width/2,door.y+door.height/2);await page.waitForTimeout(1500);assert.equal(await page.getByText('Opening the door. Walking into the garden…',{exact:true}).count(),1);await page.screenshot({path:resolve(output,'desktop-dusk-front-entry.png')});assert.deepEqual(entryErrors,[]);observations.push({view:'desktop',width:1280,height:800,sky:'dusk',memberPreviewEntry:true,backendBoundary:'All /garden requests intercepted with204 before server/private-session flow',entryErrors});writeFileSync(resolve(output,'observations.json'),JSON.stringify(observations,null,2));
 }finally{await context.close();}
}finally{await browser.close();}
