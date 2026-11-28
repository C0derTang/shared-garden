/** Render coverage of the same original lake, never a new shoreline/body. */
import {LANDING_WATER_EXTENT,landingShoreX} from './site-geography';
import type {ScenicRoute} from './scenic-route';
export function scenicWaterExtent(route:ScenicRoute){
 const xs=route.stops.map(stop=>stop.pose.eye[0]);
 const maxX=Math.max(LANDING_WATER_EXTENT.maxX,...xs.map(x=>Math.ceil(x+420)));
 const minZ=Math.min(LANDING_WATER_EXTENT.minZ,...xs.map(x=>Math.floor(landingShoreX(-x)-420)));
 return{...LANDING_WATER_EXTENT,maxX,minZ};
}
