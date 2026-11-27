import {evidenceMetadata} from "./scenic-evidence.mjs";
/* global localStorage,document,URL,structuredClone,getComputedStyle */
import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||"playwright");
const base=process.env.BASE_URL||"http://localhost:3224", output=resolve(process.env.PROFILE_OUTPUT||"/tmp/ccapp-224-scenic");
assert(["localhost","127.0.0.1"].includes(new URL(base).hostname));mkdirSync(output,{recursive:true});evidenceMetadata(output);
const fixture=JSON.parse(readFileSync("scripts/profiling/fixtures/type-area-garden.json","utf8"));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:["--enable-unsafe-webgpu"]});
const observations=[];
try{
 for(const [view,width,height,dpr,touch] of [["desktop",1280,800,1,false],["portrait",390,844,2,true],["landscape",844,390,2,true],["narrow",800,600,1,false]]){
  if(process.env.VIEW && view!==process.env.VIEW)continue;
  if(process.env.VIEWS && !process.env.VIEWS.split(",").includes(view))continue;
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,reducedMotion:"reduce",hasTouch:touch});
  const page=await context.newPage(),errors=[],calls=[];let state=structuredClone(fixture);
  await page.clock.setFixedTime(process.env.SKY_TIME||"2026-06-22T02:52:00Z");
  page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem("garden-v2:guide-seen:1","1"));
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
          state = { ...state, plants: [...state.plants, template], garden: { ...state.garden, next_spot: command.spot + 1, spot_capacity: Math.ceil((command.spot + 1) / 12) * 12 } };
          result = { state, saved: true, error: null };
        } else throw new Error(`Unexpected synthetic action: ${name}`);
        await route.fulfill({ status: 200, contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(result)}\n` });
      });

  await page.goto(`${base}/dev/garden-areas`);await page.addStyleTag({content:"nextjs-portal{display:none!important}"});
  await page.locator('[data-garden-world][data-status="ready"]').waitFor({timeout:90000});
  const nav=page.getByRole("navigation",{name:"Garden path"});await nav.waitFor();await page.waitForTimeout(1800);
  const selector=nav.getByRole("combobox",{name:"Scenic stop"});
  const options=await selector.locator("option").evaluateAll(es=>es.map(e=>({id:e.value,label:e.textContent})));
  const views=[];
  for(const option of options){
   if(process.env.STOPS && !process.env.STOPS.split(",").includes(option.id))continue;
   if(process.env.PRIMARY_ONLY && option.id.startsWith("pocket:")&&!option.id.endsWith(":0"))continue;
   await selector.selectOption(option.id);await page.waitForTimeout(160);
   for(const label of ["Back to ","Onward to "]){
    const button=nav.getByRole("button",{name:new RegExp(`^${label}`)});
    const bounds=await button.boundingBox();assert(bounds&&bounds.width>=44&&bounds.height>=44);
    assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height);
    assert(await button.evaluate(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;}),"Route controls remain visible/unobscured");
   }
   for(const marker of await page.locator('[data-caption^="route-"]').all()){
    if(await marker.evaluate(e=>getComputedStyle(e).visibility==='hidden'||e.hasAttribute('data-offscreen')))continue;
    const bounds=await marker.boundingBox();assert(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height,'Full visible route-marker bounds stay inside viewport');
    assert(await marker.evaluate(e=>{const b=e.getBoundingClientRect();return [...document.querySelectorAll('nav,[data-world-reserved]')].every(n=>{const r=n.getBoundingClientRect();return b.right<=r.left||b.left>=r.right||b.bottom<=r.top||b.top>=r.bottom;});}),'Visible route marker avoids product navigation and hint rectangles');
   }
   for(const name of ['memories','achievements','songs','settings'])assert(await page.locator(`[data-nav-view="${name}"]`).isVisible(),'Normal product overlay navigation stays visible');
   assert(await page.getByRole('navigation',{name:'Leave the garden'}).isVisible());
   const name=`${view}-${option.id.replaceAll(":","-")}.png`;await page.screenshot({path:resolve(output,name)});
   views.push({...option,screenshot:name,nav:await nav.boundingBox()});
  }
  assert.equal(await page.getByRole("group",{name:"Walk around the garden"}).count(),0);
  assert.equal(await page.locator('[data-plot-spot]').count(),state.plants.length+13);
  assert.deepEqual(errors,[]);observations.push({view,width,height,dpr,touch,skyTime:process.env.SKY_TIME||"2026-06-22T02:52:00Z",views,errors,calls});
  writeFileSync(resolve(output,"observations.json"),JSON.stringify(observations,null,2));await context.close();console.log(`${view}: ${views.length} scenic views captured`);
 }
}finally{await browser.close();}
