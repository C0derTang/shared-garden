/** One static site-wide understory edit. Frozen original factory remains provenance. */
import {buildLandingCasterStrokes} from './landing';
import {STROKE_KIND,type Stroke} from './strokes';
import {landingShoreX,landingTerrainHeight} from './site-geography';
/** Remove only low foliage in the obscured rear understory, retaining every trunk,
 * high crown, front framing tree, far tree, porch shrub and shoreline reed. */
export function thinRearUnderstory(stroke:Stroke):boolean {
 const [x,y,z]=stroke.origin;
 const original=x>11 && x<23 && z>9 && z<30 && y-landingTerrainHeight(x,z)<2.9;
 const shoreOffset=z-landingShoreX(-x);
 const bank=x>27 && x<88 && shoreOffset>-.5 && shoreOffset<14 && y-landingTerrainHeight(x,z)<6.2 && y+Math.min(0,stroke.axis[1])-landingTerrainHeight(x,z)<3.8;
 return stroke.kind===STROKE_KIND.foliage && (original||bank);
}
export function buildSiteCasterStrokes():Stroke[]{return buildLandingCasterStrokes().filter(s=>!thinRearUnderstory(s));}
