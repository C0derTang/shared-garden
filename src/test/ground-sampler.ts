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

type Point = readonly [number, number];
type Vertex = readonly [number, number, number];
function triangle(mesh: MeshData, k: number): [Vertex, Vertex, Vertex] {
 return [0, 1, 2].map(i => {
  const j = mesh.indices[k + i]! * mesh.stride;
  return [mesh.vertices[j]!, mesh.vertices[j + 1]!, mesh.vertices[j + 2]!] as const;
 }) as [Vertex, Vertex, Vertex];
}
const cross = (a: Point, b: Point, p: Point) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function height(tri: [Vertex, Vertex, Vertex], p: Point) {
 const [a,b,c]=tri,den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]),u=((b[2]-c[2])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[2]))/den,w=((c[2]-a[2])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[2]))/den;
 return u*a[1]+w*b[1]+(1-u-w)*c[1];
}
export interface ClearanceAudit {
 candidateVisits: number;
 observe?: (surfaceOffset: number, groundOffset: number, polygon: readonly (readonly number[])[]) => void;
}
export interface Clearance { minimum: number; point: readonly number[]; pairs: number }
interface GroundTriangle {
 k: number; vertices: [Vertex, Vertex, Vertex];
 minX: number; maxX: number; minZ: number; maxZ: number;
 border: Point[]; sign: number; wide: boolean;
}

/** Snapshot a test fixture's invariant triangles once. Each triangle belongs to
 * one grid level (at most 64 cells); queries visit ALL levels. Fine triangles
 * no longer share an 8m bucket with thousands of unrelated terrain triangles.
 * The exact bounding-box, clipping and height predicates below are unchanged. */
export function meshClearanceQuery(ground: MeshData) {
 const triangles: GroundTriangle[] = [];
 const levels = new Map<number, {bins: Map<string, number[]>; ids: number[]}>();
 for (let k=0;k<ground.indices.length;k+=3) {
  const vertices=triangle(ground,k),xs=vertices.map(p=>p[0]),zs=vertices.map(p=>p[2]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const border=vertices.map(p=>[p[0],p[2]] as Point),sign=Math.sign(cross(border[0]!,border[1]!,border[2]!));
  triangles.push({k,vertices,minX,maxX,minZ,maxZ,border,sign,
   wide:(Math.floor(maxX/8)-Math.floor(minX/8)+1)*(Math.floor(maxZ/8)-Math.floor(minZ/8)+1)>64});
  let size=.5;
  while ((Math.floor(maxX/size)-Math.floor(minX/size)+1)*(Math.floor(maxZ/size)-Math.floor(minZ/size)+1)>64) size*=16;
  let level=levels.get(size);if(!level){level={bins:new Map(),ids:[]};levels.set(size,level);}
  level.ids.push(k/3);const {bins}=level;
  for(let x=Math.floor(minX/size);x<=Math.floor(maxX/size);x++)for(let z=Math.floor(minZ/size);z<=Math.floor(maxZ/size);z++){
   const key=`${x}:${z}`,bucket=bins.get(key);if(bucket)bucket.push(k/3);else bins.set(key,[k/3]);
  }
 }
 return (surface: MeshData, audit?: ClearanceAudit): Clearance => {
  let minimum=Infinity,point:readonly number[]=[],pairs=0;
  for(let k=0;k<surface.indices.length;k+=3){
   const top=triangle(surface,k),xs=top.map(p=>p[0]),zs=top.map(p=>p[2]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
   const candidates=new Set<number>();
   for(const [size,{bins,ids}] of levels){
    // A very wide query must not enumerate empty fine-grid cells. Scanning
    // this level retains the same candidates after the exact box filter.
    if((Math.floor(maxX/size)-Math.floor(minX/size)+1)*(Math.floor(maxZ/size)-Math.floor(minZ/size)+1)>bins.size){for(const j of ids)candidates.add(j);}
    else for(let x=Math.floor(minX/size);x<=Math.floor(maxX/size);x++)for(let z=Math.floor(minZ/size);z<=Math.floor(maxZ/size);z++)for(const j of bins.get(`${x}:${z}`)??[])candidates.add(j);
   }
   if(audit)audit.candidateVisits+=candidates.size;
   // Keep the old 8m-grid traversal's tie-breaking order, including its wide
   // triangles first. Equal minima must retain the same actionable witness.
   const firstX=Math.floor(minX/8),firstZ=Math.floor(minZ/8),rows=Math.floor(maxZ/8)-firstZ+1;
   const order=(j:number)=>{const t=triangles[j]!;return t.wide?-1:(Math.max(firstX,Math.floor(t.minX/8))-firstX)*rows+Math.max(firstZ,Math.floor(t.minZ/8))-firstZ;};
   const overlapping=[...candidates].filter(j=>{const t=triangles[j]!;return !(t.maxX<minX||t.minX>maxX||t.maxZ<minZ||t.minZ>maxZ);}).sort((a,b)=>order(a)-order(b)||a-b);
   for(const j of overlapping){
    const {vertices:base,border,sign,k:groundOffset}=triangles[j]!;if(!sign)continue;
    let polygon:Point[]=top.map(p=>[p[0],p[2]]);
    for(let edge=0;edge<3&&polygon.length;edge++){const start=border[edge]!,end=border[(edge+1)%3]!,next:Point[]=[];for(let i=0;i<polygon.length;i++){const p=polygon[i]!,q=polygon[(i+1)%polygon.length]!,dp=cross(start,end,p)*sign,dq=cross(start,end,q)*sign,insideP=dp>=0,insideQ=dq>=0;if(insideP)next.push(p);if(insideP!==insideQ){const t=dp/(dp-dq);next.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}polygon=next;}
    if(!polygon.length)continue;pairs++;audit?.observe?.(k,groundOffset,polygon);
    for(const p of polygon){const upper=height(top,p),lower=height(base,p),clearance=upper-lower;if(clearance<minimum){minimum=clearance;point=[p[0],upper,p[1],lower,k,groundOffset];}}
   }
  }
  return {minimum,point,pairs};
 };
}

/** Exact XZ overlap: linear differences attain their minimum at a vertex of
 * each intersection polygon. This wrapper remains convenient for one query. */
export function minimumMeshClearance(surface: MeshData, ground: MeshData): Clearance {
 return meshClearanceQuery(ground)(surface);
}
