/** Local camera navigation only: no avatar, persisted position or garden mutation. */
import { shoreRocks } from "./landforms";
import { NEAR_SHORE_TREES } from "./scenery";
import type { Ray } from "./camera";
import { portraitTilt } from "./garden-camera";
import { blendPoses, focusPose, type FocusTarget, type JourneyPose } from "./journey";
import { shorelineZ, terrainHeight } from "./layout";
export interface WalkBounds { minX: number; maxX: number; maxZ: number }
export interface WalkObstacle { x: number; z: number; radius: number }
export type WalkPoint = readonly [number, number];
export type WalkDirection = "forward" | "back" | "left" | "right";
const SPEED = 4;
const VECTOR = { forward: [0, -1], back: [0, 1], left: [-1, 0], right: [1, 0] } as const;

/** Match the actual shared shoreline stones and framing trunks; low bed edging is step-over ground. */
export function gardenWalkObstacles(): WalkObstacle[] {
  return [...shoreRocks().map((rock) => ({ x: rock.x, z: rock.z, radius: rock.radius * 1.2 + 0.25 })), ...NEAR_SHORE_TREES.map(([x, z, size]) => ({ x, z, radius: size * 0.35 + 0.25 }))];
}
export function walkingBounds(beds: readonly { center: readonly number[]; radius: number }[], maxZ: number): WalkBounds {
  const reach = Math.max(3, ...beds.map((b) => Math.abs(b.center[0]!) + b.radius + 2));
  return { minX: -reach, maxX: reach, maxZ: Math.max(18, maxZ + 10) };
}
export function walkable(p: WalkPoint, bounds: WalkBounds, obstacles: readonly WalkObstacle[]): boolean {
  const [x, z] = p;
  return Number.isFinite(x) && Number.isFinite(z) && x >= bounds.minX && x <= bounds.maxX && z <= bounds.maxZ && z >= shorelineZ(x) + 1.2 && !obstacles.some((o) => Math.hypot(x - o.x, z - o.z) <= o.radius);
}
/** Ray/heightfield intersection, refined against the same height used by the ground. */
export function groundTarget(ray: Ray, bounds: WalkBounds, obstacles: readonly WalkObstacle[]): WalkPoint | null {
  if (ray.direction[1] >= -0.001) return null;
  let distance = -ray.origin[1] / ray.direction[1];
  for (let i = 0; i < 12; i++) {
    const x = ray.origin[0] + ray.direction[0] * distance;
    const z = ray.origin[2] + ray.direction[2] * distance;
    distance = (terrainHeight(x, z) - ray.origin[1]) / ray.direction[1];
  }
  if (distance < 0 || distance > 420) return null;
  const p: WalkPoint = [ray.origin[0] + ray.direction[0] * distance, ray.origin[2] + ray.direction[2] * distance];
  return walkable(p, bounds, obstacles) ? p : null;
}
export function walkingPose(p: WalkPoint, aspect: number, fov: number, focus?: FocusTarget | null, weight = 0): JourneyPose {
  const y = terrainHeight(p[0], p[1]);
  let pose: JourneyPose = { eye: [p[0], y + 2.5, p[1]], look: [p[0], y + 0.4, p[1] - 12] };
  const w = focus ? Math.max(0, Math.min(1, weight)) : 0;
  if (focus && w) pose = blendPoses(pose, focusPose(focus, aspect, fov), w);
  return { eye: pose.eye, look: [pose.look[0], pose.look[1] - portraitTilt(aspect) * (1 - w), pose.look[2]] };
}
export function createWalk(initial: WalkPoint, bounds: WalkBounds, obstacles: readonly WalkObstacle[]) {
  let position: WalkPoint = [...initial];
  let target: WalkPoint | null = null;
  const held = new Map<string, WalkDirection>();
  const stop = () => { held.clear(); target = null; };
  // Swept segment: bounded terrain samples plus analytic circle entry prevent
  // even large deltas from jumping through scenery. Stop at the first contact.
  const moveBy = (dx: number, dz: number) => {
    if (!Number.isFinite(dx + dz)) return;
    const length = Math.hypot(dx, dz);
    if (!length) return;
    let fraction = 1;
    for (const o of obstacles) {
      const ox = position[0] - o.x, oz = position[1] - o.z;
      const b = ox * dx + oz * dz;
      const c = ox * ox + oz * oz - o.radius * o.radius;
      const discriminant = b * b - length * length * c;
      if (discriminant < 0 || b >= 0) continue;
      const entry = (-b - Math.sqrt(discriminant)) / (length * length);
      if (entry >= 0) fraction = Math.min(fraction, Math.max(0, entry - 0.0001 / length));
    }
    // At most the garden's diagonal is relevant before leaving its bounds.
    const travel = Math.min(length * fraction, Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ + 9));
    const steps = Math.ceil(travel / 0.08);
    const start = position;
    for (let i = 1; i <= steps; i++) {
      const t = (travel / length) * i / steps;
      const next: WalkPoint = [start[0] + dx * t, start[1] + dz * t];
      if (!walkable(next, bounds, obstacles)) { target = null; break; }
      position = next;
    }
    if (fraction < 1) target = null;
  };
  return {
    get position() { return position; },
    press(direction: WalkDirection, source: string) { held.set(source, direction); target = null; },
    release(source: string) { held.delete(source); },
    stop,
    moveBy,
    walkTo(p: WalkPoint) { if (!walkable(p, bounds, obstacles)) return false; held.clear(); target = p; return true; },
    tick(dt: number) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      let x = 0, z = 0;
      for (const d of held.values()) { x += VECTOR[d][0]; z += VECTOR[d][1]; }
      if (target) { x = target[0] - position[0]; z = target[1] - position[1]; }
      const length = Math.hypot(x, z);
      if (!length) { target = null; return; }
      const distance = target ? Math.min(SPEED * dt, length) : SPEED * dt;
      moveBy(x / length * distance, z / length * distance);
      if (target && Math.hypot(target[0] - position[0], target[1] - position[1]) < 0.0001) target = null;
    },
  };
}
export type Walk = ReturnType<typeof createWalk>;
