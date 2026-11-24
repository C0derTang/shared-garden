// Shared stroke expansion: turns one stroke instance plus a vertex index into
// a bent, wind-swayed, oriented ribbon. Used by the lit stroke pass and the
// shadow-caster pass. Pure module: no bindings.
import { World } from "../shaders/common.wgsl";

export const STROKE_SEGMENTS: u32 = 4u;
export const KIND_SURFACE: f32 = 0.0;
export const KIND_BLADE: f32 = 1.0;
export const KIND_FOLIAGE: f32 = 2.0;
export const KIND_TRUNK: f32 = 3.0;
export const KIND_SKY: f32 = 4.0;
export const KIND_STAR: f32 = 5.0;
export const KIND_PETAL: f32 = 6.0;

export fn isKind(kind: f32, wanted: f32) -> bool {
  return abs(kind - wanted) < 0.5;
}

export struct StrokeVertex {
  position: vec3f,
  center: vec3f,
  uv: vec2f,
}

// `facing` is the point the ribbon turns toward (the eye, or far along the light).
export fn expandStroke(vertex: u32, origin: vec3f, axis: vec3f, shape: vec4f, normal: vec3f, facing: vec3f, world: World) -> StrokeVertex {
  var cornerU = array<f32, 6>(0.0, 1.0, 1.0, 0.0, 1.0, 0.0);
  var cornerV = array<f32, 6>(-1.0, -1.0, 1.0, -1.0, 1.0, 1.0);
  let segment = vertex / 6u;
  let corner = vertex % 6u;
  let u = (f32(segment) + cornerU[corner]) / f32(STROKE_SEGMENTS);
  let v = cornerV[corner];

  let width = shape.x;
  let bend = shape.y;
  let seed = shape.z;
  let kind = shape.w;
  let len = max(length(axis), 1e-5);
  let dir = axis / len;

  var center = origin + axis * u;
  if (isKind(kind, KIND_BLADE) || isKind(kind, KIND_PETAL)) {
    let gust = sin(world.time * 1.1 + origin.x * 0.35 + origin.z * 0.2) * 0.5 + sin(world.time * 2.3 + seed * 6.283) * 0.2;
    center += vec3f(gust * 0.12, 0.0, gust * 0.04) * len * u * u;
  }
  if (isKind(kind, KIND_FOLIAGE)) {
    // Leaves flutter; higher canopy moves more.
    let sway = sin(world.time * 1.4 + origin.x * 0.7 + origin.y * 0.9 + seed * 9.0) * 0.5 + sin(world.time * 0.6 + origin.z * 0.3) * 0.5;
    center += vec3f(sway, sway * 0.3, sway * 0.4) * 0.035 * clamp(origin.y * 0.25, 0.0, 1.5) * (0.4 + u);
  }
  let toFacing = normalize(facing - center);
  let lies = isKind(kind, KIND_SURFACE) || isKind(kind, KIND_FOLIAGE);
  var side = select(cross(dir, toFacing), cross(dir, normal), lies);
  if (length(side) < 1e-4) {
    side = cross(dir, vec3f(0.0, 0.0, 1.0));
  }
  side = normalize(side);
  center += side * bend * len * u * u;

  var halfWidth = width * 0.5;
  if (isKind(kind, KIND_STAR)) {
    halfWidth *= step(0.01, world.stars);
  }
  var out: StrokeVertex;
  out.position = center + side * v * halfWidth;
  out.center = center;
  out.uv = vec2f(u, v);
  return out;
}
