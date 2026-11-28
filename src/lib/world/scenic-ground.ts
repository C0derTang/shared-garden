import {buildHeightfieldMesh,type MeshData} from "./scenery";
import {buildLandingGroundMesh} from "./landing";
import {landingTerrainHeight} from "./site-geography";
import type {Bed} from "./layout";
import {curvePoint,curveDirection,edgeParameters,edgeSamples,type ScenicRoute} from "./scenic-route";
/** Original site terrain plus bounded used-section tiles and sparse corridor strips. */
export function buildScenicGroundMesh(route:ScenicRoute,beds:readonly Bed[]):MeshData{
 const bank=route.islands.some(island=>island.id==='garden-bank');
 const meshes=[buildLandingGroundMesh(),buildHeightfieldMesh((x,z)=>landingTerrainHeight(x,z)-(bank?2:.16),{minX:-420,maxX:640,minZ:-420,maxZ:420,columns:128,rows:128})];
 const remote=route.stops.filter(stop=>stop.pose.eye[0]>150||Math.abs(stop.pose.eye[2])>160);
 for(const stop of remote){const p=stop.pose.eye;meshes.push(buildHeightfieldMesh((x,z)=>landingTerrainHeight(x,z)-(bank?.12:0),{minX:p[0]-9,maxX:p[0]+9,minZ:p[2]-9,maxZ:p[2]+9,columns:bank?36:18,rows:bank?36:18}));}
 // Separate exterior boxes never span across the original yard. Long sparse
 // extensions must not introduce coarse overlapping triangles above it.
 const exterior=(points:typeof remote,axis:'x'|'z',positive:boolean)=>{
  if(!points.length)return;
  const xs=points.map(p=>p.pose.eye[0]),zs=points.map(p=>p.pose.eye[2]);
  let minX=Math.min(-420,...xs.map(x=>x-512)),maxX=Math.max(640,...xs.map(x=>x+512)),minZ=Math.min(-420,...zs.map(z=>z-512)),maxZ=Math.max(420,...zs.map(z=>z+512));
  if(axis==='x'){if(positive)minX=620;else maxX=-400;}else{if(positive)minZ=400;else maxZ=-400;}
  meshes.push(buildHeightfieldMesh((x,z)=>landingTerrainHeight(x,z)-.35,{minX,maxX,minZ,maxZ,columns:80,rows:80}));
 };
 exterior(remote.filter(p=>p.pose.eye[0]>620),'x',true);exterior(remote.filter(p=>p.pose.eye[0]<-400),'x',false);
 exterior(remote.filter(p=>p.pose.eye[2]>400),'z',true);exterior(remote.filter(p=>p.pose.eye[2]<-400),'z',false);
 for(const bed of beds)if(bed.center[0]>150||Math.abs(bed.center[2])>160)meshes.push(buildHeightfieldMesh((x,z)=>landingTerrainHeight(x,z)-(bank?.12:0),{minX:bed.center[0]-7,maxX:bed.center[0]+7,minZ:bed.center[2]-7,maxZ:bed.center[2]+7,columns:bank?28:14,rows:bank?28:14}));
 for(const edge of route.edges)if(edgeSamples(edge).some(p=>p[0]>150||Math.abs(p[2])>160)){
  const vertices:number[]=[],indices:number[]=[];
  const parameters=edgeParameters(edge);
  for(let i=0;i<parameters.length;i++){
   const t=parameters[i]!,p=curvePoint(edge,t),direction=curveDirection(edge,t),dx=direction[0],dz=direction[2],length=1;
   for(const side of [-1,1]){const x=p[0]-dz/length*side*6,z=p[2]+dx/length*side*6;vertices.push(x,landingTerrainHeight(x,z)-(bank?.8:.17),z,0,1,0);}
   if(i<parameters.length-1){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
  }meshes.push({vertices:new Float32Array(vertices),indices:new Uint32Array(indices),stride:6});
 }
 const vertices=new Float32Array(meshes.reduce((n,m)=>n+m.vertices.length,0)),indices=new Uint32Array(meshes.reduce((n,m)=>n+m.indices.length,0));let v=0,j=0;
 for(const mesh of meshes){vertices.set(mesh.vertices,v);indices.set(mesh.indices.map(i=>i+v/6),j);v+=mesh.vertices.length;j+=mesh.indices.length;}
 return{vertices,indices,stride:6};
}
