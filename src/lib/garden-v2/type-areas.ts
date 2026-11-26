/** Immutable presentation addresses; never rewrite the persisted garden. See decision 0070. */
import { BED_RADIUS, SPOTS_PER_BED, terrainHeight, type Bed, type PlantingSpot, type Vec3 } from "@/lib/world/layout";
import { flowerTypes, type FlowerType, type GardenState, type Plant } from "./model";

type LayoutPlant = { readonly flower: Pick<Plant["flower"], "spot" | "type_key"> };

export interface TypeArea<P = Plant> {
  readonly type: FlowerType;
  readonly name: string;
  readonly plants: readonly P[];
  /** Negative view-only pick ID; persistedSpot alone is sent to the server. */
  readonly target: PlantingSpot & { readonly persistedSpot: number };
}
export interface TypeAreaLayout<P = Plant> {
  readonly areas: readonly TypeArea<P>[];
  readonly beds: readonly Bed[];
  readonly spots: readonly PlantingSpot[];
  readonly maxZ: number;
}
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FIRST_Z = 7.4;

/** One type owns a fixed-width lane, expanding away from the lake. */
function areaBed(typeIndex: number, section: number): Bed {
  const x = (typeIndex - 6) * 3.3;
  const z = FIRST_Z + section * 3.1;
  return { index: section * flowerTypes.length + typeIndex, row: section, radius: BED_RADIUS, center: [x, terrainHeight(x, z), z] };
}
function address(typeIndex: number, persistedSpot: number, pickId = persistedSpot): PlantingSpot {
  const section = Math.floor((persistedSpot - 1) / SPOTS_PER_BED);
  const k = (persistedSpot - 1) % SPOTS_PER_BED;
  const bed = areaBed(typeIndex, section);
  const r = BED_RADIUS * 0.8 * Math.sqrt((k + 0.5) / SPOTS_PER_BED);
  const a = k * GOLDEN_ANGLE + typeIndex * 0.9;
  const x = bed.center[0] + Math.cos(a) * r;
  const z = bed.center[2] + Math.sin(a) * r;
  return { spot: pickId, bed: bed.index, position: [x, terrainHeight(x, z), z] };
}

/**
 * One shared mapping for geometry, anchors, picking, care/seeds and access.
 * Sparse old spot IDs stay sparse: allocating a lower hole cannot shift plants.
 * Only occupied and next-planting sections get geometry, O(plants + 13).
 */
export function typeAreaLayout<P extends LayoutPlant>(state: {
  readonly plants: readonly P[];
  readonly garden: Pick<GardenState["garden"], "next_spot">;
  readonly catalog: readonly Pick<GardenState["catalog"][number], "type_key" | "display_name">[];
}): TypeAreaLayout<P> {
  const beds = new Map<number, Bed>();
  const spots: PlantingSpot[] = [];
  const areas = flowerTypes.map((type, index): TypeArea<P> => {
    const plants = state.plants.filter((plant) => plant.flower.type_key === type).sort((a, b) => a.flower.spot - b.flower.spot);
    const target = { ...address(index, state.garden.next_spot, -index - 1), persistedSpot: state.garden.next_spot };
    for (const plant of plants) spots.push(address(index, plant.flower.spot));
    spots.push(target);
    // No decorative sections for unoccupied gaps, even with old sparse addresses.
    for (const section of new Set([...plants.map((plant) => Math.floor((plant.flower.spot - 1) / SPOTS_PER_BED)), Math.floor((state.garden.next_spot - 1) / SPOTS_PER_BED)])) {
      const bed = areaBed(index, section);
      beds.set(bed.index, bed);
    }
    return { type, name: (state.catalog.find((item) => item.type_key === type)?.display_name ?? type).toLowerCase(), plants, target };
  });
  return { areas, beds: [...beds.values()], spots, maxZ: Math.max(FIRST_Z, ...[...beds.values()].map((bed) => bed.center[2])) };
}

export function areaLabelPosition(area: Pick<TypeArea, "target">): Vec3 {
  const [x, y, z] = area.target.position;
  // Above the back rim; the seed itself remains a generous pick target.
  return [x, y + 1.3, z - 0.8];
}
