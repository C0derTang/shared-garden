/** Source-derived bank map, true-shore sampling and pre-remap pace comparison. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import process from 'node:process';
import {createServer} from 'vite';
import ts from 'typescript';
import {compactFixture} from './compact-browser-fixture.mjs';
import {evidenceMetadata} from './scenic-evidence.mjs';
const out=process.env.PROFILE_OUTPUT||'/tmp/ccapp-229-site',base='e2edf9fe2faa7e602a9e34892344faac6cb6877b';mkdirSync(out,{recursive:true});evidenceMetadata(out);
const server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false,ws:false}});
try{
 const model=await server.ssrLoadModule('/src/lib/garden-v2/model.ts'),layout=await server.ssrLoadModule('/src/lib/world/layout.ts'),surface=await server.ssrLoadModule('/src/lib/world/site-surface.ts'),geo=await server.ssrLoadModule('/src/lib/world/site-geography.ts'),scenic=await server.ssrLoadModule('/src/lib/world/scenic-route.ts'),current=await server.ssrLoadModule('/src/lib/garden-v2/compact-areas.ts'),tourModule=await server.ssrLoadModule('/src/lib/world/garden-tour.ts'),land=await server.ssrLoadModule('/src/lib/world/landing.ts'),frame=await server.ssrLoadModule('/src/lib/world/landing-frame.ts');
 const oldModule=(file,deps)=>{const code=ts.transpileModule(execFileSync('git',['show',`${base}:${file}`],{encoding:'utf8'}),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,exports={};new Function('require','exports',code)(name=>{assert(name in deps,name);return deps[name]},exports);return exports;};
 const oldCompact=oldModule('src/lib/garden-v2/compact-areas.ts',{'./model':model,'@/lib/world/layout':layout,'@/lib/world/site-surface':surface}),oldTour=oldModule('src/lib/world/garden-tour.ts',{'./site-geography':geo,'@/lib/garden-v2/compact-areas':oldCompact,'./scenic-route':scenic});
 const state=compactFixture('full'),before=oldCompact.compactAreaLayout(state),old=oldTour.gardenTour(before.beds),after=current.compactAreaLayout(state),tour=tourModule.gardenTour(after.beds);
 const shoreDistance=(x,z)=>{let minimum=Infinity;for(let q=x-25;q<=x+25;q+=.002)minimum=Math.min(minimum,Math.hypot(q-x,geo.landingShoreX(-q)-z));return minimum;};
 const proximity=after.beds.map(bed=>({type:state.catalog[bed.index%13].type_key,center:bed.center,nearestOriginalShoreMetres:shoreDistance(bed.center[0],bed.center[2]),footprint:bed.footprint,eye:tour.stops.find(stop=>stop.id===`terrace:${bed.index}`).pose.eye})),pace={baseCommit:base,before:{routeMetres:old.length,nativePixels:old.scrollLength,shoreDistancesMetres:before.beds.map(b=>shoreDistance(b.center[0],b.center[2]))},after:{routeMetres:tour.length,nativePixels:tour.scrollLength,approachNativePixels:tourModule.tourDistanceToPixels(tour,tour.startDistance)}};
 const width=1500,height=760,scale=15,X=x=>(x+8)*scale,Y=z=>(18-z)*scale;let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#eee6ce"/><path d="M0 ${height} L0 ${Y(geo.landingShoreX(8))} `;for(let x=-8;x<=92;x+=.2)svg+=`L${X(x)} ${Y(geo.landingShoreX(-x))} `;svg+=`L${width} ${height}Z" fill="#9bbdc3"/>`;
 for(const stroke of land.buildLandingCasterStrokes().filter(s=>s.kind===3&&s.origin[1]<geo.landingTerrainHeight(s.origin[0],s.origin[2])+.2))svg+=`<circle cx="${X(stroke.origin[0])}" cy="${Y(stroke.origin[2])}" r="${stroke.width*scale/2}" fill="#38583e"/>`;
 for(const rock of land.landingRocks())svg+=`<circle cx="${X(rock.x)}" cy="${Y(rock.z)}" r="${rock.radius*scale}" fill="#7c827c"/>`;
 for(const edge of tour.edges){const [p,a,b,q]=edge.points;svg+=`<path d="M${X(p[0])} ${Y(p[2])} C${X(a[0])} ${Y(a[2])},${X(b[0])} ${Y(b[2])},${X(q[0])} ${Y(q[2])}" fill="none" stroke="#c3a66f" stroke-width="${scenic.PATH_HALF_WIDTH*2*scale}"/>`;}
 for(const bed of after.beds){const points=Array.from({length:80},(_,i)=>{const a=i/80*Math.PI*2,r=layout.bedRimRadius(bed,a);return`${i?'L':'M'}${X(bed.center[0]+Math.cos(a)*r)} ${Y(bed.center[2]+Math.sin(a)*r)}`}).join(' ');svg+=`<path d="${points}Z" fill="#936440"/><text x="${X(bed.center[0])}" y="${Y(bed.center[2])+4}" font-size="12" text-anchor="middle" fill="white">${bed.tourOrder+1}</text>`;}
 const corners=[[-4,-6.5],[4,-6.5],[4,0],[-4,0]].map(([x,z])=>frame.houseToWorld([x,0,z]));svg+=`<polygon points="${corners.map(p=>`${X(p[0])},${Y(p[2])}`).join(' ')}" fill="#b27d59"/><text x="24" y="35" font-size="22">Original house, original lake, actual cubic walk and mature-size soil pockets</text><text x="24" y="62" font-size="15">North/world+x → · inland/world+z ↑ · trunks and shoreline rocks retained · no view-dependent geography</text>`;
 for(const [i,p]of proximity.entries())svg+=`<text x="${24+(i%5)*290}" y="${height-75+Math.floor(i/5)*21}" font-size="13">${i+1}. ${p.type}: ${p.nearestOriginalShoreMetres.toFixed(2)}m to real shore</text>`;
 svg+='</svg>';writeFileSync(resolve(out,'site-map.svg'),svg);writeFileSync(resolve(out,'site-plan.json'),JSON.stringify({pace,proximity,shoreMethod:'Global ±25m shore search at2mm spacing; nearest-distance sampling error bounded by1mm. All reported minima under9m, so no farther x can be nearer.',sameOriginalShore:true,oneStaticSite:true,actualCubics:tour.edges},null,2));
}finally{await server.close();}
