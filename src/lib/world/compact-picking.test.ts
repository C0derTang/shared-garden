import{expect,it}from'vitest';
import{v2GardenFixture}from'@/test/garden-v2-fixture';
import{flowerTypes}from'@/lib/garden-v2/model';
import{compactAreaLayout}from'@/lib/garden-v2/compact-areas';
import{gardenTour,tourPose,tourFovY}from'./garden-tour';
import{generateFlower}from'./flowers/generate';
import{lookAt,multiply,perspective}from'./camera';
import{pickOnScreen,plotFootprints}from'./picking';
import{buildSiteCasterStrokes}from'./site-woodland';
import{STROKE_KIND}from'./strokes';
import{curvePoint,PATH_HALF_WIDTH}from'./scenic-route';import{bedRimRadius}from'./layout';
function fullGarden(){const state=v2GardenFixture(),p=state.plants[0]!;state.plants=flowerTypes.flatMap((type,t)=>Array.from({length:6},(_,i)=>({...structuredClone(p),flower:{...p.flower,type_key:type,id:`p${t*6+i}`,spot:t*6+i+1,seed:i+1,planted_at:`2026-06-01T00:00:0${i}Z`}})));state.garden.next_spot=79;return state;}
it.each([[1280,800],[390,844],[844,390],[800,600]])('keeps every mature crown and seed visible and directly pickable at %ix%i',(width,height)=>{
 const state=fullGarden(),layout=compactAreaLayout(state),tour=gardenTour(layout.beds),positions=new Map(layout.spots.map(s=>[s.spot,s.position])),flowers=state.plants.map(p=>{const model=generateFlower({type:p.flower.type_key,seed:p.flower.seed,growth:1});return{id:p.flower.id,position:positions.get(p.flower.spot)!,height:model.height+.03,radius:Math.min(.45,model.radius*.9)};}),empty=layout.areas.map(a=>a.target);
 for(let type=0;type<13;type++){
  const pose=tourPose(tour,tour.anchors.get(type)!),fov=tourFovY(pose,width/height),view={width,height,viewProjection:multiply(perspective(fov,width/height,.1,420),lookAt(pose.eye,pose.look,[0,1,0]))},footprints=plotFootprints(view,empty,flowers);
  for(const spot of layout.spots.filter(s=>s.spot<0?-s.spot-1===type:state.plants.find(p=>p.flower.spot===s.spot)?.flower.type_key===flowerTypes[type])){
   const id=state.plants.find(p=>p.flower.spot===spot.spot)?.flower.id,footprint=footprints.find(f=>spot.spot<0?f.target.kind==='spot'&&f.target.spot===spot.spot:f.target.kind==='flower'&&f.target.id===id)!;expect(footprint,`type${type}, spot${spot.spot}`).toBeDefined();
   const candidates=footprint.parts.flatMap(part=>[.25,.5,.75].map(t=>[part.a[0]+(part.b[0]-part.a[0])*t,part.a[1]+(part.b[1]-part.a[1])*t]));
   expect(candidates.some(([x,y])=>x!>=0&&x!<=width&&y!>=64&&y!<height&&(()=>{const picked=pickOnScreen(view,x!,y!,empty,flowers);return picked?.kind===footprint.target.kind&&(picked?.kind==='flower'?picked.id===(footprint.target as {id:string}).id:picked?.spot===(footprint.target as {spot:number}).spot);})()),`direct pick type${type},spot${spot.spot}`).toBe(true);
  }
 }
});
it('keeps the actual sampled camera clear of retained original solid trunks and branches',()=>{
 const capsules=buildSiteCasterStrokes().filter(s=>s.kind===STROKE_KIND.trunk).map(s=>{const length=Math.hypot(...s.axis),radius=s.width/2+Math.abs(s.bend)*length;return{a:s.origin,d:s.axis,radius,length2:length*length,min:s.origin.map((v,i)=>Math.min(v,v+s.axis[i]!)-radius-.2),max:s.origin.map((v,i)=>Math.max(v,v+s.axis[i]!)+radius+.2)};});
 const state=fullGarden(),p=state.plants[0]!;for(let k=0;k<8;k++)state.plants.push({...structuredClone(p),flower:{...p.flower,id:`overflow${k}`,spot:12001+k,planted_at:`2099-01-01T00:00:0${k}Z`}});const beds=compactAreaLayout(state).beds,route=gardenTour(beds);for(const edge of route.edges)for(let i=0;i<=100;i++){const p=curvePoint(edge,i/100);for(const bed of beds){const dx=p[0]-bed.center[0],dz=p[2]-bed.center[2];expect(Math.hypot(dx,dz),`${edge.id} bed${bed.index}`).toBeGreaterThan(bedRimRadius(bed,Math.atan2(dz,dx))+PATH_HALF_WIDTH+.2);}for(const body of capsules){if(p.some((v,k)=>v<body.min[k]!||v>body.max[k]!))continue;const t=Math.max(0,Math.min(1,p.reduce((sum,v,k)=>sum+(v-body.a[k]!)*body.d[k]!,0)/(body.length2||1)));expect(Math.hypot(...p.map((v,k)=>v-body.a[k]!-body.d[k]!*t)),`${edge.id},t${i/100},solid${body.a}`).toBeGreaterThan(body.radius+.2);}}
});
it.each([[1280,800],[390,844]])('keeps occupied overflow plants and the next target directly pickable at %ix%i',(width,height)=>{
 const state=fullGarden(),p=state.plants[0]!,before=compactAreaLayout(state);for(let i=0;i<2;i++)state.plants.push({...structuredClone(p),flower:{...p.flower,id:`overflow${i}`,spot:12001+i,planted_at:`2099-01-01T00:00:0${i}Z`}});const layout=compactAreaLayout(state),tour=gardenTour(layout.beds);for(const old of before.spots.filter(s=>s.spot>0))expect(layout.spots.find(s=>s.spot===old.spot)).toEqual(old);
 const spots=layout.spots.filter(s=>s.spot>=12001||s.spot===-1),flowers=spots.filter(s=>s.spot>0).map(s=>({id:String(s.spot),position:s.position,height:1.1,radius:.4})),empty=layout.areas.map(a=>a.target),leg=tour.legs.find(l=>l.edge.to==='terrace:13')!,pose=tourPose(tour,leg.start+leg.length),fov=tourFovY(pose,width/height),view={width,height,viewProjection:multiply(perspective(fov,width/height,.1,420),lookAt(pose.eye,pose.look,[0,1,0]))};for(const s of spots){const footprint=plotFootprints(view,empty,flowers).find(f=>s.spot<0?f.target.kind==='spot'&&f.target.spot===-1:f.target.kind==='flower'&&f.target.id===String(s.spot))!;expect(footprint).toBeDefined();const [x,y]=footprint.parts.at(-1)!.a;expect(x).toBeGreaterThan(0);expect(x).toBeLessThan(width);expect(y).toBeGreaterThan(64);expect(y).toBeLessThan(height);expect(pickOnScreen(view,x,y,empty,flowers)).toMatchObject(footprint.target);}
});
