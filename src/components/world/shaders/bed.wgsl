import { World, aerial, distanceAlpha, paintedLight, srgbToLinear, valueNoise } from "./common.wgsl";

// Soil underpainting for each bed; raked soil strokes are painted over it.
@group(0) @binding(0) var<uniform> world: World;

struct BedIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  // xy: position inside the bed (unit disc), z: bed index.
  @location(2) local: vec3f,
}

struct BedOut {
  @builtin(position) clip: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) local: vec3f,
}

@vertex fn vs_main(input: BedIn) -> BedOut {
  var out: BedOut;
  out.clip = world.viewProjection * vec4f(input.position, 1.0);
  out.worldPos = input.position;
  out.normal = input.normal;
  out.local = input.local;
  return out;
}

@fragment fn fs_main(input: BedOut) -> @location(0) vec4f {
  let q = input.local.xy;
  let a = atan2(q.y, q.x);
  let edge = 0.94 + valueNoise(vec2f(a * 5.0 + input.local.z * 5.0, 1.0)) * 0.06;
  if (length(q) > edge) {
    discard;
  }
  let mottle = valueNoise(input.worldPos.xz * 4.0);
  let lit = paintedLight(normalize(input.normal), world, mottle);
  let albedo = mix(srgbToLinear(vec3f(0.16, 0.1, 0.07)), srgbToLinear(vec3f(0.28, 0.18, 0.11)), mottle);
  var color = albedo * (world.ambient * 0.55 + world.lightColor * world.lightIntensity * lit * 0.7);
  color = aerial(color, input.worldPos, world);
  return vec4f(color, distanceAlpha(input.worldPos, world));
}
