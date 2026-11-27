import {expect,it} from "vitest";
import {landingTerrainHeight,landingLakeDepth,landingShoreX} from "./landing";
it('preserves the authoritative landing terrain and shoreline at recorded world positions',()=>{
 const points=[[0,0],[-10,-8],[20,-10],[40,0],[0,-80],[80,50],[-20,20]];
 expect(points.map(([x,z])=>[landingTerrainHeight(x!,z!),landingLakeDepth(x!,z!)])).toMatchInlineSnapshot(`
   [
     [
       0.04905775391837864,
       -7.541332649643108,
     ],
     [
       -0.009473571551379768,
       -0.8914917099094186,
     ],
     [
       -0.7594409020514117,
       1.4002990439769913,
     ],
     [
       0.14315217482320128,
       -13.41684854478412,
     ],
     [
       -2.068251881379733,
       72.45866735035689,
     ],
     [
       1.863151464051231,
       -69.00320865802308,
     ],
     [
       0.3677323092883426,
       -33.03322929671524,
     ],
   ]
 `);
 expect([-80,-30,0,30].map(z=>landingShoreX(z))).toMatchInlineSnapshot(`
   [
     -19.00320865802309,
     -11.187110232253284,
     -7.541332649643108,
     -14.384788715802193,
   ]
 `);
});
