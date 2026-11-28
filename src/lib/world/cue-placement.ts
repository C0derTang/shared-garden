/** Passive note placement only; none of these rectangles can affect world input. */
export interface CueRect {readonly x:number;readonly y:number;readonly width:number;readonly height:number}
export function placeGardenCue(bounds:{left:number;top:number;right:number;bottom:number},size:{width:number;height:number},chrome:readonly CueRect[],targets:readonly CueRect[],previous?:CueRect|null):CueRect|null {
 const intersects=(a:CueRect,b:CueRect,gap:number)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
 const safe=(rect:CueRect,gap:number)=>rect.x>=bounds.left&&rect.y>=bounds.top&&rect.x+rect.width<=bounds.right&&rect.y+rect.height<=bounds.bottom&&chrome.every(other=>!intersects(rect,other,8))&&targets.every(other=>!intersects(rect,other,gap));
 // Keep a safe slot rather than jumping back when an obstacle leaves. A new
 // slot has a wider cushion, so a moving silhouette cannot cause edge chatter.
 if(previous){const retained={...previous,...size};if(safe(retained,8))return retained;}
 const top=Math.max(bounds.top,...chrome.filter(rect=>rect.y<=bounds.top+size.height).map(rect=>rect.y+rect.height+12));
 const left=bounds.left,right=bounds.right-size.width,centre=(bounds.left+bounds.right-size.width)/2,bottom=bounds.bottom-size.height,middle=(top+bottom)/2;
 for(const [x,y] of [[left,bottom],[right,bottom],[left,top],[right,top],[centre,bottom],[centre,top],[left,middle],[right,middle]]){
  const rect={x:x!,y:y!,...size};if(safe(rect,20))return rect;
 }
 return null;
}

import {plotFootprints,DEFAULT_FLOWER_HEIGHT,DEFAULT_FLOWER_RADIUS,type ScreenView,type SpotTarget,type FlowerAnchor} from './picking';
import {transformPoint} from './camera';
import type {Vec3} from './layout';
/** A distant near-plane offset can make a screen-radius estimate enormous even
 * when every vertex is outside the frustum. Cull only a wholly clipped world
 * envelope first; a stem/head crossing the viewport is retained. This affects
 * note reservation only, never picking or the renderer's actual visibility.
 */
export function visibleCueFootprints(view:ScreenView,seeds:readonly SpotTarget[],flowers:readonly FlowerAnchor[]){
 const intersects=(position:Vec3,radius:number,height:number)=>{
  const corners=[-radius,radius].flatMap(dx=>[-.1,height+.1].flatMap(dy=>[-radius,radius].map(dz=>transformPoint(view.viewProjection,[position[0]+dx,position[1]+dy,position[2]+dz,1]))));
  return ![0,1,2,3,4,5].some(plane=>corners.every(([x,y,z,w])=>[x+w,w-x,y+w,w-y,z,w-z][plane]!<0));
 };
 return plotFootprints(view,seeds.filter(seed=>intersects(seed.position,.3,.2)),flowers.filter(flower=>intersects(flower.position,(flower.radius??DEFAULT_FLOWER_RADIUS)/.9+.1,flower.height??DEFAULT_FLOWER_HEIGHT)));
}
