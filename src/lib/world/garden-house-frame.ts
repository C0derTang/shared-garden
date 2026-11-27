import {worldToHouse,HOUSE} from "./landing-frame";
import type {Vec3} from "./layout";
/** The house is never relocated or rotated between compositions. */
export function gardenHousePoint(original:Vec3):Vec3{return original;}
/** Caption segment occlusion in the actual house-local footprint, including both porches. */
export function gardenHouseOccludes(eye:Vec3,target:Vec3):boolean{
 const a=worldToHouse(eye),b=worldToHouse(target),lo=[-4.7,-.6,-HOUSE.depth-3.3],hi=[4.9,7.5,3.2];let near=0,far=1;
 for(let axis=0;axis<3;axis++){
  const delta=b[axis]!-a[axis]!;
  if(Math.abs(delta)<1e-8){if(a[axis]!<lo[axis]!||a[axis]!>hi[axis]!)return false;continue;}
  const u=(lo[axis]!-a[axis]!)/delta,v=(hi[axis]!-a[axis]!)/delta;near=Math.max(near,Math.min(u,v));far=Math.min(far,Math.max(u,v));if(near>far)return false;
 }return near<.999&&far>0;
}
