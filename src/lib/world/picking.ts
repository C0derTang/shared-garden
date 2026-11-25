import { projectToNdc, type Mat4 } from "./camera";
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
/** World radius of an empty spot's body for picking (its glowing seed mark's bright middle). */
export const SPOT_PICK_RADIUS = 0.11;
/** World radius of a flower's stalk for picking; its head is as wide as the flower. */
export const STEM_PICK_RADIUS = 0.05;
/** The seed mark floats this far above the soil. */
const SPOT_LIFT = 0.1;
/**
 * Smallest on-screen hit target of any plot, in CSS pixels (a diameter): a
 * sprout or a far seed mark is as easy to select as a bloom, at any zoom.
 */
export const MIN_TARGET_PX = 48;

/** The camera as the pointer sees it: the view-projection and the canvas size in CSS pixels. */
export interface ScreenView {
  readonly viewProjection: Mat4;
  readonly width: number;
  readonly height: number;
}

/** A capsule on the screen from `a` to `b` (CSS px) of radius `core`. */
export interface ScreenCapsule {
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
  readonly core: number;
}

/**
 * One plot's body on the screen: a flower is a thin stalk from its base to
 * its top and a head as wide as the flower near the top; an empty spot is its
 * seed mark.
 */
export interface PlotFootprint {
  readonly target: { readonly kind: "flower"; readonly id: string } | { readonly kind: "spot"; readonly spot: number };
  readonly parts: readonly ScreenCapsule[];
  /** Where the plot sits on screen (a flower's middle, a spot's seed mark). */
  readonly centre: readonly [number, number];
  /** View depth (world units) of its middle, for breaking ties in favour of the nearer plot. */
  readonly depth: number;
}

function toScreen(view: ScreenView, p: Vec3): { x: number; y: number; depth: number } | null {
  const ndc = projectToNdc(view.viewProjection, p);
  if (!ndc || ndc[2] > 1) return null;
  const m = view.viewProjection;
  const depth = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
  return { x: ((ndc[0] + 1) / 2) * view.width, y: ((1 - ndc[1]) / 2) * view.height, depth };
}

/** On-screen size of a world radius around `centre` (the larger of its sideways and depthwise extent). */
function screenRadius(view: ScreenView, centre: Vec3, at: { x: number; y: number }, radius: number): number {
  let best = 0;
  for (const offset of [[radius, 0, 0], [0, 0, radius]] as const) {
    const p = toScreen(view, [centre[0] + offset[0], centre[1], centre[2] + offset[2]]);
    if (p) best = Math.max(best, Math.hypot(p.x - at.x, p.y - at.y));
  }
  return best;
}

/** Screen footprints of every flower and empty spot in front of the camera. */
export function plotFootprints(view: ScreenView, emptySpots: readonly SpotTarget[], flowers: readonly FlowerAnchor[]): PlotFootprint[] {
  const list: PlotFootprint[] = [];
  for (const flower of flowers) {
    const [x, y, z] = flower.position;
    const height = flower.height ?? DEFAULT_FLOWER_HEIGHT;
    const radius = flower.radius ?? DEFAULT_FLOWER_RADIUS;
    const headY = y + Math.max(height * 0.5, height - radius * 0.7);
    const base = toScreen(view, flower.position);
    const top = toScreen(view, [x, y + height, z]);
    const head = toScreen(view, [x, headY, z]);
    const middle: Vec3 = [x, y + height / 2, z];
    const mid = toScreen(view, middle);
    if (!base || !top || !head || !mid) continue;
    const stem: ScreenCapsule = { a: [base.x, base.y], b: [top.x, top.y], core: screenRadius(view, middle, mid, STEM_PICK_RADIUS) };
    const bloom: ScreenCapsule = { a: [head.x, head.y], b: [head.x, head.y], core: screenRadius(view, [x, headY, z], head, radius) };
    list.push({
      target: { kind: "flower", id: flower.id },
      parts: [stem, bloom],
      centre: [mid.x, mid.y],
      depth: mid.depth,
    });
  }
  for (const spot of emptySpots) {
    const centre: Vec3 = [spot.position[0], spot.position[1] + SPOT_LIFT, spot.position[2]];
    const at = toScreen(view, centre);
    if (!at) continue;
    const core = screenRadius(view, centre, at, SPOT_PICK_RADIUS);
    list.push({ target: { kind: "spot", spot: spot.spot }, parts: [{ a: [at.x, at.y], b: [at.x, at.y], core }], centre: [at.x, at.y], depth: at.depth });
  }
  return list;
}

/** Distance from (px, py) to the segment a–b. */
export function distanceToSegment(px: number, py: number, a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq < 1e-9 ? 0 : Math.min(1, Math.max(0, ((px - a[0]) * dx + (py - a[1]) * dy) / lengthSq));
  return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t));
}

/** How far (CSS px) the pointer is from a plot's spine: its stalk up to its head, or its seed mark. */
export function spineDistance(footprint: PlotFootprint, x: number, y: number): number {
  let distance = Infinity;
  for (const part of footprint.parts) distance = Math.min(distance, distanceToSegment(x, y, part.a, part.b));
  return distance;
}

/**
 * Whether the pointer is within a plot's target: within a part's body, or
 * within half the minimum target of a part's axis, whichever is larger.
 */
export function withinTarget(footprint: PlotFootprint, x: number, y: number, minTarget = MIN_TARGET_PX): boolean {
  return footprint.parts.some((part) => distanceToSegment(x, y, part.a, part.b) <= Math.max(part.core, minTarget / 2));
}

/**
 * The plot under a pointer at (x, y) CSS px. Every plot answers within its
 * own body or within half of {@link MIN_TARGET_PX} of its spine, whichever
 * is larger, so there are no misses between petals and a sprout is as easy to
 * hit as a bloom. Among the plots that answer, the one whose spine is nearest
 * the pointer wins (a sprout at the foot of a bloom's leaves stays a sprout);
 * a tie goes to the plot nearer the camera.
 */
export function pickOnScreen(
  view: ScreenView,
  x: number,
  y: number,
  emptySpots: readonly SpotTarget[],
  flowers: readonly FlowerAnchor[],
  minTarget = MIN_TARGET_PX,
): PickResult | null {
  let best: { footprint: PlotFootprint; distance: number } | null = null;
  for (const footprint of plotFootprints(view, emptySpots, flowers)) {
    if (!withinTarget(footprint, x, y, minTarget)) continue;
    const distance = spineDistance(footprint, x, y);
    if (!best || distance < best.distance - 0.25 || (distance <= best.distance + 0.25 && footprint.depth < best.footprint.depth)) best = { footprint, distance };
  }
  if (!best) return null;
  const { target, depth } = best.footprint;
  return target.kind === "flower" ? { kind: "flower", id: target.id, distance: depth } : { kind: "spot", spot: target.spot, distance: depth };
}
