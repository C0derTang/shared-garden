import {scenicSurfaceHeight as terrainHeight} from "./site-surface";
import type { MeshData } from "./scenery";
import { curvePoint, curveDirection, edgeParameters, PATH_HALF_WIDTH, type ScenicRoute } from "./scenic-route";

/** Earth/gravel ribbon. Fixed tessellation per edge keeps sparse gaps bounded. */
export function buildScenicPath(route:ScenicRoute):MeshData {
 const vertices:number[]=[],indices:number[]=[];
 for(const edge of route.edges){
  const start=vertices.length/8,width=edge.primary?PATH_HALF_WIDTH:.48;
  const parameters=edgeParameters(edge);
  for(let i=0;i<parameters.length;i++){
   const t=parameters[i]!,p=curvePoint(edge,t),direction=curveDirection(edge,t),dx=direction[0],dz=direction[2],length=1;
   for(const sign of [-1,1]){const x=p[0]-dz/length*width*sign,z=p[2]+dx/length*width*sign;
    vertices.push(x,terrainHeight(x,z)+.025,z,0,1,0,sign,t);
   }
   if(i<parameters.length-1){const j=start+i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
  }
 }
 return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices),stride:8};
}
