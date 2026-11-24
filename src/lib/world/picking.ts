import { rayHitsUprightCapsule, type Ray } from "./camera";
import type { Vec3 } from "./layout";

/** Something the flower renderer placed in the world that can be picked. */
export interface FlowerAnchor {
  readonly id: string;
  /** Base of the stem in world space (usually a spot position). */
  readonly position: Vec3;
  /** Pickable height above the base; defaults to {@link DEFAULT_FLOWER_HEIGHT}. */
  readonly height?: number;
  /** Pickable radius around the stem; defaults to {@link DEFAULT_FLOWER_RADIUS}. */
  readonly radius?: number;
}

export interface SpotTarget {
  readonly spot: number;
  readonly position: Vec3;
}

export type PickResult =
  | { readonly kind: "flower"; readonly id: string; readonly distance: number }
  | { readonly kind: "spot"; readonly spot: number; readonly distance: number }
  | { readonly kind: "door"; readonly distance: number };

export const DEFAULT_FLOWER_HEIGHT = 1.1;
export const DEFAULT_FLOWER_RADIUS = 0.32;
/** Pick radius of an empty spot's marker on the ground. */
export const SPOT_PICK_RADIUS = 0.32;

/** Ray against a horizontal disc centred on `center`; distance or null. */
export function rayHitsGroundDisc(ray: Ray, center: Vec3, radius: number): number | null {
  const dy = ray.direction[1];
  if (Math.abs(dy) < 1e-6) return null;
  const s = (center[1] - ray.origin[1]) / dy;
  if (s <= 0) return null;
  const x = ray.origin[0] + ray.direction[0] * s - center[0];
  const z = ray.origin[2] + ray.direction[2] * s - center[2];
  return x * x + z * z <= radius * radius ? s : null;
}

/** Nearest flower or empty spot along the ray. Flowers win ties because they stand in front. */
export function pickAlongRay(
  ray: Ray,
  emptySpots: readonly SpotTarget[],
  flowers: readonly FlowerAnchor[],
): PickResult | null {
  let best: PickResult | null = null;
  for (const flower of flowers) {
    const distance = rayHitsUprightCapsule(
      ray,
      flower.position,
      flower.height ?? DEFAULT_FLOWER_HEIGHT,
      flower.radius ?? DEFAULT_FLOWER_RADIUS,
    );
    if (distance !== null && (!best || distance < best.distance)) {
      best = { kind: "flower", id: flower.id, distance };
    }
  }
  for (const target of emptySpots) {
    const distance = rayHitsGroundDisc(ray, target.position, SPOT_PICK_RADIUS);
    if (distance !== null && (!best || distance < best.distance - 1e-3)) {
      best = { kind: "spot", spot: target.spot, distance };
    }
  }
  return best;
}
