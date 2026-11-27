/** One complete house in its original world frame, shared by front and rear views. */
import {buildHouseMesh} from "./landing";
export function buildGardenHouseMesh(){return buildHouseMesh({rearPorch:true});}
