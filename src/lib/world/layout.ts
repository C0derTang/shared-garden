import {plantingSurfaceHeight} from "./site-surface";
/**
 * Pure layout of the painted meadow: ground height and fixed planting spots
 * grouped into beds that open as they fill.
 *
 * World axes: +y up, the camera stands near z = 16 looking down -z (west,
 * across the lake toward the sunset), +x is to the right (north).
 */

export type Vec3 = [number, number, number];

/** Spots per bed. Matches the legacy garden's fixed twelve-spot beds. */
export const SPOTS_PER_BED = 12;
/** Radius of one planting bed in world units. */
export const BED_RADIUS = 1.3;
/** Where the camera stands at the start of the journey. */
export const CAMERA_HOME: Vec3 = [0, 2.5, 16];
/** Height of the lake surface. */
export const WATER_LEVEL = -0.35;
/** Rows of the bed lattice (z), nearest the camera first. */
const BED_ROWS = [7.4, 4.3, 1.2, -1.9];
const BED_SPACING = 3.3;

/** z of the lakeshore waterline at x (the meadow lies on the +z side). */
export function shorelineZ(x: number): number {
  return -6 + 1.1 * Math.sin(x * 0.07 + 0.6) + 0.5 * Math.sin(x * 0.19 - 1.1);
}

/** Level meadow that slopes gently down under the lake past the shoreline. */
export function terrainHeight(x: number, z: number): number {
  const meadow = 0.05 * Math.sin(x * 0.31 + 0.7) * Math.cos(z * 0.27 - 0.4) + 0.025 * Math.sin(x * 0.83 - z * 0.61 + 1.3);
  const intoLake = shorelineZ(x) - z;
  // Bank: ~0.15 above the water at the shore, then the lakebed falls away.
  const bank = intoLake <= -1.5 ? 0 : intoLake <= 0 ? -0.25 * ((intoLake + 1.5) / 1.5) ** 2 : -0.25 - Math.min(2.5, intoLake * 0.35);
  // The far shore rises out of the water again.
  const farShore = z < -78 ? Math.min(2.8, (-78 - z) * 0.35) : 0;
  return meadow + bank + farShore;
}

interface BedSlot {
  readonly row: number;
  readonly x: number;
  readonly cost: number;
}

const slotCache: BedSlot[] = [];

/** Lattice slots ordered so the garden grows outward from its middle, nearest rows first. */
function bedSlot(index: number): BedSlot {
  if (slotCache.length <= index) {
    const reach = index + 4;
    const candidates: BedSlot[] = [];
    BED_ROWS.forEach((_, row) => {
      const offset = row % 2 === 0 ? 0 : 0.5;
      for (let k = -reach; k <= reach; k += 1) {
        const x = (k + offset) * BED_SPACING;
        candidates.push({ row, x, cost: Math.abs(x) * 0.42 + row * 1.25 + (x > 0 ? 0.001 : 0) });
      }
    });
    candidates.sort((a, b) => a.cost - b.cost || a.row - b.row || a.x - b.x);
    slotCache.length = 0;
    slotCache.push(...candidates.slice(0, Math.max(index + 1, candidates.length >> 1)));
  }
  return slotCache[index]!;
}

export interface Bed {
  /** Zero-based bed index. */
  readonly index: number;
  readonly row: number;
  readonly center: Vec3;
  readonly radius: number;
  readonly organic?: boolean;
  readonly terrace?: boolean;
  readonly rotation?: number;
  readonly tourOrder?: number;
  readonly site?: boolean;
}

/** Fixed position of bed `index` on the meadow lattice. */
export function bedAt(index: number): Bed {
  if (!Number.isInteger(index) || index < 0) throw new RangeError(`Invalid bed ${index}`);
  const slot = bedSlot(index);
  const z = BED_ROWS[slot.row]!;
  return { index, row: slot.row, center: [slot.x, terrainHeight(slot.x, z), z], radius: BED_RADIUS };
}

export interface PlantingSpot {
  /** One-based stable spot identifier. */
  readonly spot: number;
  readonly bed: number;
  readonly position: Vec3;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Stable world position of a one-based spot identifier. */
export function spotPosition(spot: number): PlantingSpot {
  if (!Number.isInteger(spot) || spot < 1) throw new RangeError(`Invalid planting spot ${spot}`);
  const bedIndex = Math.floor((spot - 1) / SPOTS_PER_BED);
  const k = (spot - 1) % SPOTS_PER_BED;
  const bed = bedAt(bedIndex);
  const r = BED_RADIUS * 0.8 * Math.sqrt((k + 0.5) / SPOTS_PER_BED);
  const angle = k * GOLDEN_ANGLE + bedIndex * 0.9;
  const x = bed.center[0] + Math.cos(angle) * r;
  const z = bed.center[2] + Math.sin(angle) * r;
  return { spot, bed: bedIndex, position: [x, terrainHeight(x, z), z] };
}

/** Number of beds needed to show `capacity` spots (always at least one). */
export function bedCountFor(capacity: number): number {
  return Math.max(1, Math.ceil(Math.max(0, capacity) / SPOTS_PER_BED));
}

/** Positions of spots 1..capacity, rounded up to whole beds. */
export function layoutPlantingSpots(capacity: number): PlantingSpot[] {
  const total = bedCountFor(capacity) * SPOTS_PER_BED;
  return Array.from({ length: total }, (_, i) => spotPosition(i + 1));
}

/**
 * Visible capacity for a set of occupied spots: whole beds up to the highest
 * occupied spot, plus one more bed once every shown spot is filled.
 */
export function spotCapacityFor(occupied: Iterable<number>): number {
  let highest = 0;
  let count = 0;
  for (const spot of occupied) {
    count += 1;
    if (spot > highest) highest = spot;
  }
  const beds = Math.max(1, Math.ceil(highest / SPOTS_PER_BED));
  const shown = beds * SPOTS_PER_BED;
  return count >= shown ? shown + SPOTS_PER_BED : shown;
}

/** Distance from (x, z) to the nearest open bed's rim (negative inside a bed). */
export function distanceToBeds(x: number, z: number, beds: readonly Bed[]): number {
  let best = Infinity;
  for (const bed of beds) {
    best = Math.min(best, Math.hypot(x - bed.center[0], z - bed.center[2]) - bed.radius);
  }
  return best;
}

/** Stable, softly lobed pocket silhouette; legacy/default beds retain their circle. */
export function bedRimRadius(bed: Bed, angle: number): number {
 if(bed.terrace){const c=Math.abs(Math.cos(angle-(bed.rotation??0))),s=Math.abs(Math.sin(angle-(bed.rotation??0)));return bed.radius/Math.pow((c/1.07)**4+(s/.78)**4,.25)*(1+.025*Math.sin(angle*5+bed.index));}
 return bed.radius * (bed.organic ? 1 + .13*Math.sin(angle*3+bed.index*1.17) + .07*Math.cos(angle*5+bed.index*.63) : 1);
}

export function bedTerrainHeight(bed:Bed,x:number,z:number):number{return bed.site?plantingSurfaceHeight(x,z):terrainHeight(x,z);}
