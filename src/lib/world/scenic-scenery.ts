/** Shared-site groundcover and bounded new backyard planting. */
import {distanceToScenicPath,type ScenicRoute} from "./scenic-route";
import {distanceToBeds,type Bed,type Vec3} from "./layout";
import {landingTerrainHeight,landingLakeDepth} from "./site-geography";
import {worldToHouse,HOUSE} from "./landing-frame";
import {buildLandingFieldStrokes,landingRocks} from "./landing";
import {buildMeadowStrokes,SCENERY_PALETTES} from "./scenery";
import {createRandom,jitterColor,STROKE_KIND,type Stroke} from "./strokes";
export function scenicRocks(){return landingRocks();}
const outsideHouse=(x:number,z:number)=>{const p=worldToHouse([x,0,z]);return p[0]<-5.5||p[0]>5.5||p[2]<-HOUSE.depth-3.3||p[2]>3.5;};
export function buildScenicMeadowStrokes(route:ScenicRoute,beds:readonly Bed[]):Stroke[]{
 const clear=(x:number,z:number)=>outsideHouse(x,z)&&landingLakeDepth(x,z)<-.3&&distanceToScenicPath(route,x,z)>.92;
 const strokes=[...buildLandingFieldStrokes(),...buildMeadowStrokes(beds).filter(s=>s.kind===STROKE_KIND.surface)].filter(s=>clear(s.origin[0],s.origin[2]));
 const random=createRandom(0x224);
 const blade=(x:number,z:number)=>{
  if(!clear(x,z)||distanceToBeds(x,z,beds)<.08)return;
  const height=.12+random()*.33;
  strokes.push({kind:STROKE_KIND.blade,origin:[x,landingTerrainHeight(x,z)-.015,z],axis:[(random()-.5)*.12,height,(random()-.5)*.1],width:.035+random()*.045,bend:random()*.2,seed:random(),normal:[0,1,0],color:jitterColor(SCENERY_PALETTES.BLADES[Math.floor(random()*SCENERY_PALETTES.BLADES.length)]!,random,.12),extra:.12});
 };
 for(const island of route.islands)for(let x=island.center[0]-island.radiusZ-7;x<island.center[0]+island.radiusZ+7;x+=.75)for(let z=island.center[2]-island.radiusX-7;z<island.center[2]+island.radiusX+7;z+=.75)if(random()>.43)blade(x+(random()-.5)*.4,z+(random()-.5)*.4);
 for(const bed of beds)for(let i=0;i<85;i++){const a=random()*Math.PI*2,r=1.4+random()*3;blade(bed.center[0]+Math.cos(a)*r,bed.center[2]+Math.sin(a)*r);}
 for(const bed of beds)for(let i=0;i<22;i++){
  const a=random()*Math.PI*2,r=1.2+random()*.5,x=bed.center[0]+Math.cos(a)*r,z=bed.center[2]+Math.sin(a)*r;if(!clear(x,z))continue;
  strokes.push({kind:STROKE_KIND.surface,origin:[x,landingTerrainHeight(x,z)+.045,z],axis:[Math.cos(a)*.24,0,Math.sin(a)*.24],width:.14+random()*.1,bend:.08,seed:random(),normal:[0,1,0],color:jitterColor(SCENERY_PALETTES.BLADES[2]!,random,.12),extra:.1});
 }
 for(let i=0;i<280;i++){
  const island=route.islands[i%route.islands.length]!,x=island.center[0]+(random()-.5)*(island.radiusZ*2+12),z=island.center[2]+(random()-.5)*(island.radiusX*2+12);if(!clear(x,z)||distanceToBeds(x,z,beds)<.3)continue;
  const color=SCENERY_PALETTES.WILDFLOWERS[Math.floor(random()*SCENERY_PALETTES.WILDFLOWERS.length)]!,origin:Vec3=[x,landingTerrainHeight(x,z)+.25,z];
  for(let petal=0;petal<4;petal++){const a=petal*Math.PI/2;strokes.push({kind:STROKE_KIND.petal,origin,axis:[Math.cos(a)*.08,Math.sin(a)*.05,.01],width:.055,bend:.02,seed:random(),normal:[0,.5,1],color,extra:.05});}
 }
 return strokes;
}
