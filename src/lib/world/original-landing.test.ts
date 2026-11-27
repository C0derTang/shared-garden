import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import authority from '../../../scripts/profiling/fixtures/original-landing-6f23246.json';
import {buildLandingCasterStrokes,buildLandingFieldStrokes,buildLandingGroundMesh,buildHouseMesh,landingRocks} from './landing';
import type {MeshData} from './scenery';
function digest(values:readonly unknown[]){const hash=createHash('sha256');hash.update('[');values.forEach((value,i)=>{if(i)hash.update(',');hash.update(JSON.stringify(value));});hash.update(']');return hash.digest('hex');}
function meshDigest(mesh:MeshData){return createHash('sha256').update(new Uint8Array(mesh.vertices.buffer,mesh.vertices.byteOffset,mesh.vertices.byteLength)).update(new Uint8Array(mesh.indices.buffer,mesh.indices.byteOffset,mesh.indices.byteLength)).digest('hex');}
it('preserves frozen prerequisite original landing caster RNG/output without clearing or appended trees',()=>{const strokes=buildLandingCasterStrokes();expect(strokes).toHaveLength(authority.caster.count);expect(digest(strokes)).toBe(authority.caster.sha256);});
it('preserves frozen prerequisite original low field RNG/output without backyard filtering',()=>{const strokes=buildLandingFieldStrokes();expect(strokes).toHaveLength(authority.field.count);expect(digest(strokes)).toBe(authority.field.sha256);});
it('preserves frozen original landing ground, default house and shoreline rock geometry',()=>{expect(meshDigest(buildLandingGroundMesh())).toBe(authority.ground.sha256);expect(meshDigest(buildHouseMesh())).toBe(authority.house.sha256);expect(digest(landingRocks())).toBe(authority.rocks.sha256);});
