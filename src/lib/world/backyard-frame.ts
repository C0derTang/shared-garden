/** Backyard coordinates are derived from the actual house rear and site cardinal axes. */
import { HOUSE,houseToWorld,designToWorld,worldToDesign } from "./landing-frame";
import {landingTerrainHeight} from "./site-geography";
import type {Vec3} from "./layout";
export const BACKYARD_ORIGIN=houseToWorld([0,0,-HOUSE.depth]);
const origin=worldToDesign(BACKYARD_ORIGIN);
export const BACKYARD_RIGHT:Vec3=designToWorld([1,0,0]);
export const BACKYARD_FORWARD:Vec3=designToWorld([0,0,-1]);
export function backyardToWorld(local:Vec3):Vec3{return designToWorld([origin[0]+local[0],local[1],origin[2]-local[2]]);}
export function worldToBackyard(world:Vec3):Vec3{const p=worldToDesign(world);return[p[0]-origin[0],p[1],origin[2]-p[2]];}
export function backyardGround(x:number,z:number):number{const p=backyardToWorld([x,0,z]);return landingTerrainHeight(p[0],p[2]);}
export function backyardPoint(x:number,z:number,height=0):Vec3{const p=backyardToWorld([x,0,z]);return[p[0],landingTerrainHeight(p[0],p[2])+height,p[2]];}
