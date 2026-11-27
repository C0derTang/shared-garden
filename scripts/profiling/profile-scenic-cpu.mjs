/* global structuredClone */
import {createServer} from "vite";import{readFileSync,writeFileSync}from"node:fs";import{resolve}from"node:path";import{performance}from"node:perf_hooks";import process from"node:process";import console from"node:console";
const server=await createServer({configFile:false,resolve:{alias:{"@":resolve("src")}},server:{middlewareMode:true}});
try{
 const{scenicRoute,createScenicNavigator}=await server.ssrLoadModule('/src/lib/world/scenic-route.ts'),{typeAreaLayout}=await server.ssrLoadModule('/src/lib/garden-v2/type-areas.ts'),{buildScenicPath}=await server.ssrLoadModule('/src/lib/world/scenic-path.ts'),{buildScenicGroundMesh}=await server.ssrLoadModule('/src/lib/world/scenic-ground.ts'),{buildScenicMeadowStrokes}=await server.ssrLoadModule('/src/lib/world/scenic-scenery.ts');
 const fixture=JSON.parse(readFileSync('scripts/profiling/fixtures/type-area-garden.json','utf8')),results=[];
 for(const kind of ['empty','populated','sparse'])for(let run=0;run<3;run++){
  const state=structuredClone(fixture);if(kind==='empty'){state.plants=[];state.garden.next_spot=1;}if(kind==='sparse'){state.plants[0].flower.spot=12001;state.garden.next_spot=1;}
  const start=performance.now(),layout=typeAreaLayout(state),afterLayout=performance.now(),route=scenicRoute(layout.beds),afterRoute=performance.now(),path=buildScenicPath(route),afterPath=performance.now(),ground=buildScenicGroundMesh(route,layout.beds),afterGround=performance.now(),strokes=buildScenicMeadowStrokes(route,layout.beds),afterMeadow=performance.now();
  const result={kind,run,plants:state.plants.length,beds:layout.beds.length,edges:route.edges.length,strokes:strokes.length,pathVertices:path.vertices.length/path.stride,groundVertices:ground.vertices.length/ground.stride,ms:{layout:afterLayout-start,route:afterRoute-afterLayout,path:afterPath-afterRoute,ground:afterGround-afterPath,meadow:afterMeadow-afterGround,total:afterMeadow-start}};results.push(result);console.log(JSON.stringify(result));
 }
 const {buildLandingCasterStrokes}=await server.ssrLoadModule('/src/lib/world/landing.ts'),{buildGardenHouseMesh}=await server.ssrLoadModule('/src/lib/world/garden-house.ts');const staticSite=[];for(let run=0;run<3;run++){const start=performance.now(),trees=buildLandingCasterStrokes(),afterTrees=performance.now(),house=buildGardenHouseMesh(),end=performance.now();staticSite.push({run,treeStrokes:trees.length,houseVertices:house.vertices.length/house.stride,ms:{trees:afterTrees-start,house:end-afterTrees,total:end-start}});}
 const updates=[];let state=structuredClone(fixture);
 for(let planting=0;planting<3;planting++){
  const oldRoute=scenicRoute(typeAreaLayout(state).beds),navigator=createScenicNavigator(oldRoute,'overview:0');
  const start=performance.now();navigator.select('house-rear',false);const afterSelect=performance.now();navigator.tick(.1);
  const plant=structuredClone(fixture.plants[0]);plant.flower.spot=state.garden.next_spot;plant.flower.id=`synthetic-profile-${planting}`;
  state={...state,plants:[...state.plants,plant],garden:{...state.garden,next_spot:state.garden.next_spot+1}};
  const buildStart=performance.now(),layout=typeAreaLayout(state),route=scenicRoute(layout.beds),path=buildScenicPath(route),ground=buildScenicGroundMesh(route,layout.beds),strokes=buildScenicMeadowStrokes(route,layout.beds),built=performance.now();navigator.update(route);const end=performance.now();
  updates.push({planting,plants:state.plants.length,beds:layout.beds.length,edges:route.edges.length,pathVertices:path.vertices.length/path.stride,groundVertices:ground.vertices.length/ground.stride,strokes:strokes.length,ms:{navigationSelect:afterSelect-start,plantingGeometry:built-buildStart,navigatorUpdate:end-built}});
 }
 writeFileSync(resolve(process.env.PROFILE_OUTPUT||'/tmp/ccapp-224-cpu.json'),JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,method:'3 fresh route/layout builds per scenario; exact current pure production geometry/stroke functions; Vite module setup excluded; single process, no browser GPU workload; pure components exclude GPUupload/shadercompile/floral mesh creation; separate static caster+house timings and actual UI planting elapsed are recorded',results,updates,staticSite},null,2));
}finally{await server.close();}
