/* global document */
/** Synchronous polling matters: this Playwright version treats a returned Promise
 * as truthy before its value resolves. Decode status is observed on later polls. */
export async function waitForPickerPortraits(page,types,timeout=15000){
 const expected=types.map(type=>`/flowers/picker/${type}.webp`);
 await page.waitForFunction(function portraitsReady(paths){
  const images=[...document.querySelectorAll('#flower-picker img')];
  if(paths.length!==13||images.length!==13||images.some((image,i)=>image.getAttribute('src')!==paths[i]||!image.complete||image.naturalWidth<=0||image.naturalHeight<=0))return false;
  const decodes=portraitsReady.decodes??=new WeakMap();
  return images.map(image=>{
   let state=decodes.get(image);
   if(!state||state.src!==image.currentSrc){
    state={src:image.currentSrc,ready:false};decodes.set(image,state);
    image.decode().then(()=>{state.ready=true;},()=>{state.ready=false;});
   }
   return state.ready;
  }).every(Boolean);
 },expected,{timeout});
}
