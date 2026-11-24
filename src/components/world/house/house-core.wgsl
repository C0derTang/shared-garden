// Shared pieces of the landing's house: its uniform block and the door hinge.
// Pure module: no bindings.

export const MAT_SIDING: f32 = 0.0;
export const MAT_TRIM: f32 = 1.0;
export const MAT_STONE: f32 = 2.0;
export const MAT_ROOF: f32 = 3.0;
export const MAT_GLASS: f32 = 4.0;
export const MAT_DOOR: f32 = 5.0;
export const MAT_PLANK: f32 = 6.0;
export const MAT_INTERIOR: f32 = 7.0;
export const MAT_LANTERN: f32 = 8.0;
export const MAT_FRAME: f32 = 9.0;

export struct House {
  // World position of the door's hinge (at the sill).
  hinge: vec3f,
  // Door swing into the house, radians.
  doorAngle: f32,
  // Invitation glow around the door for members (0 = none).
  glow: f32,
  // Warm light pouring out of the open doorway, 0..1.
  spill: f32,
  // Warmth of the lit windows and lanterns (HDR multiplier).
  windows: f32,
  // Seconds of animation time (frozen under reduced motion).
  time: f32,
}

export fn isMaterial(material: f32, wanted: f32) -> bool {
  return abs(material - wanted) < 0.5;
}

// Rotates door vertices about the vertical hinge axis; everything else is unchanged.
export fn swingDoor(p: vec3f, material: f32, house: House) -> vec3f {
  if (!isMaterial(material, MAT_DOOR)) {
    return p;
  }
  let c = cos(house.doorAngle);
  let s = sin(house.doorAngle);
  let rel = p - house.hinge;
  return house.hinge + vec3f(rel.x * c + rel.z * s, rel.y, -rel.x * s + rel.z * c);
}

export fn swingDoorNormal(n: vec3f, material: f32, house: House) -> vec3f {
  if (!isMaterial(material, MAT_DOOR)) {
    return n;
  }
  let c = cos(house.doorAngle);
  let s = sin(house.doorAngle);
  return vec3f(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);
}
