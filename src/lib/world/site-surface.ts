/** Query the original landing mesh's fixed triangles; never alter that mesh. */
import {landingTerrainHeight} from './site-geography';

export function originalLandingSurfaceHeight(wx:number,wz:number):number|null {
  // Invert buildLandingGroundMesh's original design grid (6f23246).
  const x=wz,z=-wx;
  if(x < -160 || x > 160 || z < -150 || z > 32)return null;
  const signed=Math.sign(x)*Math.pow(Math.abs(x)/160,1/1.7);
  const i=Math.min(219,Math.max(0,Math.floor((signed+1)*.5*220)));
  const j=Math.min(169,Math.max(0,Math.floor(Math.sqrt((32-z)/182)*170)));
  const gridX=(column:number)=>{const s=column/220*2-1;return Math.sign(s)*160*Math.abs(s)**1.7;};
  const gridZ=(row:number)=>32-182*(row/170)**2;
  const rawX0=gridX(i),rawX1=gridX(i+1),rawZ0=gridZ(j),rawZ1=gridZ(j+1);
  const x0=Math.fround(rawX0),x1=Math.fround(rawX1),z0=Math.fround(rawZ0),z1=Math.fround(rawZ1);
  const h=(px:number,pz:number)=>Math.fround(landingTerrainHeight(-pz,px)-.01);
  const a=h(rawX0,rawZ0),b=h(rawX1,rawZ0),c=h(rawX0,rawZ1),d=h(rawX1,rawZ1),u=(x-x0)/(x1-x0),v=(z0-z)/(z0-z1);
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
/** New earth overlays follow both the unchanged terrain and its rendered facets. */
export function scenicSurfaceHeight(x:number,z:number):number {
  return Math.max(landingTerrainHeight(x,z),originalLandingSurfaceHeight(x,z)??-Infinity);
}
/** A one-centimetre soil layer, stable for an address regardless of future beds. */
export function plantingSurfaceHeight(x:number,z:number):number {return scenicSurfaceHeight(x,z)+.01;}
