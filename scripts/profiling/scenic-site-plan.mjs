import {evidenceMetadata} from "./scenic-evidence.mjs";
import {Buffer} from "node:buffer";
// Synthetic source-frame geography artifact, using the actual route and house mesh.
import {createServer} from "vite";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import process from "node:process";
import sharp from "sharp";
const output=resolve(process.env.PROFILE_OUTPUT||"/tmp/ccapp-224-site");mkdirSync(output,{recursive:true});evidenceMetadata(output);
const server=await createServer({configFile:false,resolve:{alias:{"@":resolve("src")}},server:{middlewareMode:true}});
try{
 const {scenicRoute,curvePoint}=await server.ssrLoadModule("/src/lib/world/scenic-route.ts");
 const {typeAreaLayout}=await server.ssrLoadModule("/src/lib/garden-v2/type-areas.ts");
 const {houseToWorld,worldToHouse,HOUSE}=await server.ssrLoadModule("/src/lib/world/landing-frame.ts");
 const {landingShoreX}=await server.ssrLoadModule("/src/lib/world/site-geography.ts");
 const {landingHomePose,landingRocks,buildLandingCasterStrokes,landingTerrainHeight}=await server.ssrLoadModule("/src/lib/world/landing.ts");
 const {STROKE_KIND}=await server.ssrLoadModule('/src/lib/world/strokes.ts');
 const {buildGardenHouseMesh}=await server.ssrLoadModule("/src/lib/world/garden-house.ts");
 const fixture=JSON.parse(readFileSync("scripts/profiling/fixtures/type-area-garden.json","utf8")),layout=typeAreaLayout(fixture),route=scenicRoute(layout.beds),mesh=buildGardenHouseMesh();
 const local=[];for(let i=0;i<mesh.vertices.length;i+=mesh.stride)local.push({p:worldToHouse([...mesh.vertices.slice(i,i+3)]),material:mesh.vertices[i+8]});
 const bound=points=>({minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[2])),maxZ:Math.max(...points.map(p=>p[2]))});
 const front=bound(local.filter(v=>v.material===6&&v.p[2]>0).map(v=>v.p)),rear=bound(local.filter(v=>v.material===6&&v.p[2]<-HOUSE.depth).map(v=>v.p));
 for(const [name,bounds]of [["site",{minX:-28,maxX:100,minZ:-45,maxZ:260}],["house-detail",{minX:-14,maxX:44,minZ:-22,maxZ:42}]]){
  const width=name==='site'?1800:1400,height=1200,pad=70,scale=Math.min((width-pad*2)/(bounds.maxZ-bounds.minZ),(height-pad*2)/(bounds.maxX-bounds.minX));
  const at=p=>[pad+(p[2]-bounds.minZ)*scale,pad+(bounds.maxX-p[0])*scale],xy=p=>at(p).map(v=>v.toFixed(2)).join(',');
  const polygon=(points,fill,stroke="#48543b",line=1)=>`<polygon points="${points.map(xy).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${line}"/>`;
  const text=(p,label,color="#293723",size=15)=>{const [x,y]=at(p);return `<text x="${x+7}" y="${y-7}" fill="${color}" font-size="${size}" paint-order="stroke" stroke="#f7f2df" stroke-width="4">${label}</text>`;};
  const shore=Array.from({length:301},(_,i)=>{const x=bounds.minX+(bounds.maxX-bounds.minX)*i/300;return[x,0,landingShoreX(-x)];});
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#e4e8c5"/><style>text{font-family:Arial,sans-serif}</style><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8" fill="#275b85"/></marker></defs>`;
  svg+=polygon([[bounds.minX,0,bounds.minZ],[bounds.maxX,0,bounds.minZ],...shore.reverse()],"#bad8df","#8db7bf",2);
  svg+=text([bounds.maxX-10,0,bounds.minZ+8],'shared lake / western shore','#286278',18);
  for(const rock of landingRocks()){const [x,y]=at([rock.x,0,rock.z]);svg+=`<circle cx="${x}" cy="${y}" r="${rock.radius*scale}" fill="#807c68" opacity=".8"/>`;}
  const trunks=buildLandingCasterStrokes().filter(s=>s.kind===STROKE_KIND.trunk&&s.origin[1]<landingTerrainHeight(s.origin[0],s.origin[2])+.2);
  for(const trunk of trunks){const [x,y]=at(trunk.origin);svg+=`<circle cx="${x}" cy="${y}" r="${Math.max(1.4,trunk.width/2*scale)}" fill="#45613c" opacity=".8"/>`;}
  svg+=text([60,0,30],'ORIGINAL forest (unchanged)','#3e5a36',18);
  for(const island of route.islands){const [cx,cy]=at(island.center);svg+=`<ellipse cx="${cx}" cy="${cy}" rx="${island.radiusX*scale}" ry="${island.radiusZ*scale}" fill="#bbce91" stroke="none"/>`;svg+=text([island.center[0]+4,0,island.center[2]],island.section?`used meadow section ${island.section+1}`:`island ${Number(island.id.split('-')[1])+1}`,'#456137',18);}
  for(const edge of route.edges){const points=Array.from({length:49},(_,i)=>curvePoint(edge,i/48));svg+=`<polyline points="${points.map(xy).join(' ')}" fill="none" stroke="${edge.primary?'#a77c4b':'#c2a67b'}" stroke-width="${(edge.primary?1.44:.96)*scale}" stroke-linejoin="round" stroke-linecap="round"/>`;}
  for(const bed of layout.beds){const [x,y]=at(bed.center);svg+=`<circle cx="${x}" cy="${y}" r="${bed.radius*scale}" fill="#79583b" stroke="#ece1bd" stroke-width="1"/>`;}
  for(const area of layout.areas){const base=layout.beds.find(b=>b.index%13===-area.target.spot-1&&b.row===0);if(base)svg+=text(base.center,area.name,'#3c5630',name==='site'?13:15);}
  const houseRect=(b,fill)=>polygon([[b.minX,0,b.minZ],[b.maxX,0,b.minZ],[b.maxX,0,b.maxZ],[b.minX,0,b.maxZ]].map(houseToWorld),fill,"#453c34",2);
  svg+=houseRect({minX:-HOUSE.halfWidth,maxX:HOUSE.halfWidth,minZ:-HOUSE.depth,maxZ:0},"#b56643")+houseRect(front,"#d7bd95")+houseRect(rear,"#d7bd95");
  svg+=text(houseToWorld([-4,0,1.5]),'front porch / door','#642d20',16)+text(houseToWorld([-4,0,-HOUSE.depth-1.8]),'rear porch / steps','#642d20',16);
  const camera=(id,pose,color)=>{const p=at(pose.eye),dx=pose.look[0]-pose.eye[0],dz=pose.look[2]-pose.eye[2],length=Math.hypot(dx,dz),end=[pose.eye[0]+dx/length*6,0,pose.eye[2]+dz/length*6];svg+=`<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${color}"/><line x1="${p[0]}" y1="${p[1]}" x2="${at(end)[0]}" y2="${at(end)[1]}" stroke="${color}" stroke-width="2" marker-end="url(#arrow)"/>`+text(pose.eye,id,color,14);};
  camera('landing front view',landingHomePose(1.6),'#275b85');
  for(const id of ['house-rear','lake','overview:0','overview:1']){const s=route.stops.find(s=>s.id===id);camera(s.label,s.pose,'#275b85');}
  svg+=`<rect x="12" y="12" width="760" height="48" rx="10" fill="#f7f2df"/><text x="26" y="43" font-size="24" fill="#293723">Original front preserved · rear garden on the same unchanged site</text><text x="${width-190}" y="40" font-size="20">↑ N (+world x)</text><text x="${width-190}" y="68" font-size="16">E → (+world z)</text><text x="26" y="${height-30}" font-size="16">Synthetic source geometry · original trunks/rocks fixed · primary islands + used rounded sections · original shoreline</text></svg>`;
  writeFileSync(resolve(output,`${name}.svg`),svg);await sharp(Buffer.from(svg)).png().toFile(resolve(output,`${name}.png`));
 }
 writeFileSync(resolve(output,'geometry.json'),JSON.stringify({houseRear:houseToWorld([0,0,-HOUSE.depth]),frontPorch:front,rearPorch:rear,islands:route.islands,stops:route.stops.filter(s=>!s.transit).map(s=>({id:s.id,pose:s.pose})),bedCount:layout.beds.length,edgeCount:route.edges.length},null,2));
}finally{await server.close();}
