// Frozen pre-#233 oracle from d55aec6b2c5074deedf8c91965ec08f6fbfda2ec.
// Only additions: optional candidate counter and overlap observer (no predicates changed).
import type {ClearanceAudit} from "@/test/ground-sampler";
import type {MeshData} from "@/lib/world/scenery";
/** Independent barycentric queries over ALL rendered ground triangles/layers. */
export function groundSampler(mesh:MeshData){
 const v=mesh.vertices,s=mesh.stride,bins=new Map<string,number[]>(),wide:number[]=[];
 for(let k=0;k<mesh.indices.length;k+=3){
  const ids=[mesh.indices[k]!*s,mesh.indices[k+1]!*s,mesh.indices[k+2]!*s],xs=ids.map(i=>v[i]!),zs=ids.map(i=>v[i+2]!),minX=Math.floor(Math.min(...xs)/8),maxX=Math.floor(Math.max(...xs)/8),minZ=Math.floor(Math.min(...zs)/8),maxZ=Math.floor(Math.max(...zs)/8);
  if((maxX-minX+1)*(maxZ-minZ+1)>64){wide.push(k);continue;}
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const key=`${x}:${z}`,bucket=bins.get(key);if(bucket)bucket.push(k);else bins.set(key,[k]);}
 }
 return(x:number,z:number)=>{
  let top:number|null=null;
  for(const k of [...(bins.get(`${Math.floor(x/8)}:${Math.floor(z/8)}`)??[]),...wide]){
   const a=mesh.indices[k]!*s,b=mesh.indices[k+1]!*s,c=mesh.indices[k+2]!*s,ax=v[a]!,az=v[a+2]!,bx=v[b]!,bz=v[b+2]!,cx=v[c]!,cz=v[c+2]!;
   if(x<Math.min(ax,bx,cx)-1e-5||x>Math.max(ax,bx,cx)+1e-5||z<Math.min(az,bz,cz)-1e-5||z>Math.max(az,bz,cz)+1e-5)continue;
   const d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz),u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,w=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d,t=1-u-w;
   if(u>=-1e-5&&w>=-1e-5&&t>=-1e-5)top=Math.max(top??-Infinity,u*v[a+1]!+w*v[b+1]!+t*v[c+1]!);
  }return top;
 };
}

/** Exact XZ overlap of piecewise-linear mesh triangles. Height differences are
 * linear on each intersection polygon, so its vertices contain the minimum. */
export function minimumMeshClearance(surface:MeshData,ground:MeshData,audit?:ClearanceAudit):{minimum:number;point:readonly number[];pairs:number}{
 type Point=readonly [number,number];
 const bins=new Map<string,number[]>(),wide:number[]=[],v=ground.vertices,stride=ground.stride;
 const triangle=(mesh:MeshData,k:number)=>[0,1,2].map(i=>{const j=mesh.indices[k+i]!*mesh.stride;return[mesh.vertices[j]!,mesh.vertices[j+1]!,mesh.vertices[j+2]!] as const;});
 for(let k=0;k<ground.indices.length;k+=3){const tri=triangle(ground,k),xs=tri.map(p=>p[0]),zs=tri.map(p=>p[2]),minX=Math.floor(Math.min(...xs)/8),maxX=Math.floor(Math.max(...xs)/8),minZ=Math.floor(Math.min(...zs)/8),maxZ=Math.floor(Math.max(...zs)/8);if((maxX-minX+1)*(maxZ-minZ+1)>64){wide.push(k);continue;}for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const key=`${x}:${z}`,bucket=bins.get(key);if(bucket)bucket.push(k);else bins.set(key,[k]);}}
 const height=(tri:ReturnType<typeof triangle>,p:Point)=>{const[a,b,c]=tri as [typeof tri[number],typeof tri[number],typeof tri[number]],den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]),u=((b[2]-c[2])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[2]))/den,w=((c[2]-a[2])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[2]))/den;return u*a[1]+w*b[1]+(1-u-w)*c[1];};
 const cross=(a:Point,b:Point,p:Point)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
 let minimum=Infinity,point:readonly number[]=[],pairs=0;
 for(let k=0;k<surface.indices.length;k+=3){const top=triangle(surface,k),xs=top.map(p=>p[0]),zs=top.map(p=>p[2]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),candidates=new Set(wide);for(let x=Math.floor(minX/8);x<=Math.floor(maxX/8);x++)for(let z=Math.floor(minZ/8);z<=Math.floor(maxZ/8);z++)for(const j of bins.get(`${x}:${z}`)??[])candidates.add(j);
  if(audit)audit.candidateVisits+=candidates.size;
  for(const j of candidates){const a=ground.indices[j]!*stride,b=ground.indices[j+1]!*stride,c=ground.indices[j+2]!*stride;if(Math.max(v[a]!,v[b]!,v[c]!)<minX||Math.min(v[a]!,v[b]!,v[c]!)>maxX||Math.max(v[a+2]!,v[b+2]!,v[c+2]!)<minZ||Math.min(v[a+2]!,v[b+2]!,v[c+2]!)>maxZ)continue;
   const base=triangle(ground,j),border=base.map(p=>[p[0],p[2]] as Point),sign=Math.sign(cross(border[0]!,border[1]!,border[2]!));if(!sign)continue;let polygon:Point[]=top.map(p=>[p[0],p[2]]);
   for(let edge=0;edge<3&&polygon.length;edge++){const start=border[edge]!,end=border[(edge+1)%3]!,next:Point[]=[];for(let i=0;i<polygon.length;i++){const p=polygon[i]!,q=polygon[(i+1)%polygon.length]!,dp=cross(start,end,p)*sign,dq=cross(start,end,q)*sign,insideP=dp>=0,insideQ=dq>=0;if(insideP)next.push(p);if(insideP!==insideQ){const t=dp/(dp-dq);next.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}polygon=next;}
   if(!polygon.length)continue;pairs++;audit?.observe?.(k,j,polygon);for(const p of polygon){const upper=height(top,p),lower=height(base,p),clearance=upper-lower;if(clearance<minimum){minimum=clearance;point=[p[0],upper,p[1],lower,k,j];}}
  }
 }
 return{minimum,point,pairs};
}
