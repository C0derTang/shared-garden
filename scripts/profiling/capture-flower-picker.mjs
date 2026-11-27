/** Reproducible static canonical mature-model portraits. Loopback dev gallery only. */
import {URL} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import process from 'node:process';import sharp from 'sharp';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),base=process.env.BASE_URL||'http://localhost:3226';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Loopback only');
const types=['rose','cactus','tulip','marigold','daisy','hydrangea','sunflower','snapdragon','moonflower','bluebell','dandelion','forget-me-not','peony'];
const output=resolve('public/flowers/picker');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--enable-unsafe-webgpu']});
try{const page=await browser.newPage({viewport:{width:900,height:900},reducedMotion:'reduce'});
for(const type of types){await page.goto(`${base}/dev/flowers?view=hero&type=${type}&sky=day&seed=1&framing=bloom`);await page.locator('[data-status="ready"] canvas').waitFor({timeout:90000});await page.waitForTimeout(400);const buffer=await page.locator('[data-status="ready"] canvas').screenshot();await sharp(buffer).resize(96,96,{fit:'contain',background:'#eee4ce'}).webp({quality:85}).toFile(resolve(output,`${type}.webp`));}
writeFileSync(resolve(output,'README.md'),'# Flower picker portraits\n\nStatic canonical mature models, seed1, day lighting, reduced motion. Captured from the existing dev FlowerHero renderer by `scripts/profiling/capture-flower-picker.mjs`. Dandelion uses the canonical mature seed puff; hydrangea uses the existing gallery mood palette. No private plants or live picker GPU contexts.\n');
}finally{await browser.close();}
