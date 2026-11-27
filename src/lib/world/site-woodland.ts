/** One static site-wide understory edit. Frozen original factory remains provenance. */
import {buildLandingCasterStrokes} from './landing';
import {STROKE_KIND,type Stroke} from './strokes';
import {landingTerrainHeight} from './site-geography';
/** Remove only low foliage in the obscured rear understory, retaining every trunk,
 * high crown, front framing tree, far tree, porch shrub and shoreline reed. */
export function thinRearUnderstory(stroke:Stroke):boolean {
 const [x,y,z]=stroke.origin;
 return stroke.kind===STROKE_KIND.foliage && x>11 && x<23 && z>9 && z<30 && y-landingTerrainHeight(x,z)<2.9;
}
export function buildSiteCasterStrokes():Stroke[]{return buildLandingCasterStrokes().filter(s=>!thinRearUnderstory(s));}
