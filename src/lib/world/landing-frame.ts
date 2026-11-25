/**
 * The landing house's frame: design space, the house's yaw and size, and the
 * world anchors the landing page needs (the door and its floating caption).
 * Tiny and dependency-free so the landing page can import its anchors without
 * pulling the landing geometry (./landing) into its first bundle.
 */
import type { Vec3 } from "./layout";

/*
 * The landing is laid out in a "design" space where the viewer looks down -z
 * with the lake on the left. The world turns that design to face north, so
 * the lake and the sunset lie to the viewer's left (west) and the low sun
 * rakes across the house front at golden hour.
 */

/** Design space to world space (a quarter turn: design -z is north, design -x is west). */
export function designToWorld(p: Vec3): Vec3 {
  return [-p[2], p[1], p[0]];
}

/** World space to design space. */
export function worldToDesign(p: Vec3): Vec3 {
  return [p[2], p[1], -p[0]];
}

/** Yaw of the house: its front turns toward the lake on the viewer's left. */
export const HOUSE_YAW = (-22 * Math.PI) / 180;
const COS = Math.cos(HOUSE_YAW);
const SIN = Math.sin(HOUSE_YAW);

/** House-local dimensions in metres. Local +z points out of the front wall; x = 0 is the door's centre. */
export const HOUSE = {
  halfWidth: 4,
  depth: 6.5,
  floor: 0.6,
  eaves: 3.65,
  ridge: 6.15,
  door: { minX: -0.55, maxX: 0.55, minY: 0.6, maxY: 2.75, z: -0.07 },
  porchDepth: 2.2,
} as const;

/** House-local point (or direction) to design space. */
export function houseToDesign(local: Vec3): Vec3 {
  return [local[0] * COS + local[2] * SIN, local[1], -local[0] * SIN + local[2] * COS];
}

/** Design-space point (or direction) to house-local space. */
export function designToHouse(design: Vec3): Vec3 {
  return [design[0] * COS - design[2] * SIN, design[1], design[0] * SIN + design[2] * COS];
}

/** House-local point to world space. */
export function houseToWorld(local: Vec3): Vec3 {
  return designToWorld(houseToDesign(local));
}

/** House-local direction to world space. */
export function houseDirection(local: Vec3): Vec3 {
  return designToWorld(houseToDesign(local));
}

/** World point (or direction) to house-local space. */
export function worldToHouse(world: Vec3): Vec3 {
  return designToHouse(worldToDesign(world));
}

/** Outward normal of the front wall (world space). */
export const FRONT_NORMAL: Vec3 = houseDirection([0, 0, 1]);
/** World position of the door's hinge (its left edge, at the sill). */
export const DOOR_HINGE: Vec3 = houseToWorld([HOUSE.door.minX, 0, HOUSE.door.z]);
/** Where the porch lanterns' combined warm light is centred. */
export const PORCH_LIGHT: Vec3 = houseToWorld([0, 2.15, 0.55]);
/** Anchor for the floating text above the porch steps. */
export const DOOR_CAPTION: Vec3 = houseToWorld([0.3, 3.55, 1.6]);
