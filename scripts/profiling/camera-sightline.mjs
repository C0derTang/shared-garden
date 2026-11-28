/** Conservative one-millimetre sight corridor, audited by the exact mesh oracle.
 * @param {ArrayLike<number>} origin
 * @param {ArrayLike<number>} target
 */
export function sightlineStrip(origin,target) {
 const dx=target[0]-origin[0],dz=target[2]-origin[2],span=Math.hypot(dx,dz);
 if(!span)throw Error('A sight corridor needs distinct horizontal endpoints');
 const nx=-dz/span*.001,nz=dx/span*.001;
 return {vertices:new Float32Array([
  origin[0]-nx,origin[1],origin[2]-nz,origin[0]+nx,origin[1],origin[2]+nz,
  target[0]-nx,target[1],target[2]-nz,target[0]+nx,target[1],target[2]+nz,
 ]),indices:new Uint32Array([0,2,1,1,2,3]),stride:3};
}

/** Build audits against the actual opaque geometry factory outputs.
 * @param {Record<string,{vertices:Float32Array,indices:Uint32Array,stride:number}>} meshes
 * @param {Function} queryFactory Existing independently tested triangle-clipping oracle.
 */
export function cameraSightAudit(meshes,queryFactory) {
 const queries=Object.entries(meshes).map(([name,mesh])=>[name,queryFactory(mesh)]);
 return (eye,anchor)=>{
  const height=anchor.height??1.1,radius=anchor.radius??.32,body=Math.min(Math.max(.005,height-.03),Math.max(height*.5,height-radius*.7)),target=[anchor.position[0],anchor.position[1]+body,anchor.position[2]],strip=sightlineStrip(eye,target);
  const surfaces=queries.map(([name,query])=>({name,...query(strip)})),minimum=Math.min(...surfaces.map(s=>s.minimum));
  return {minimum,target,surfaces,clear:surfaces.some(s=>s.pairs>0)&&minimum>.0005};
 };
}
