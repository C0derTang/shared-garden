import { World, aerial, distanceAlpha, fbm, shadowFactor, srgbToLinear, valueNoise } from "./common.wgsl";

// Soil of each planting bed: dark loam with clods and a mossy rim. Raked soil
// strokes and stone edging are painted over it.
@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;

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
  let r = length(q);
  let a = atan2(q.y, q.x);
  let edge = 0.93 + fbm(vec2f(a * 2.0 + input.local.z * 5.0, 1.0)) * 0.08;
  if (r > edge) {
    discard;
  }
  let p = input.worldPos.xz;
  let clods = valueNoise(p * 7.0) * 0.6 + valueNoise(p * 19.0) * 0.4;
  var albedo = mix(srgbToLinear(vec3f(0.17, 0.11, 0.07)), srgbToLinear(vec3f(0.33, 0.22, 0.13)), clods);
  // Moss creeping in from the rim.
  let moss = smoothstep(edge - 0.28, edge - 0.02, r) * smoothstep(0.35, 0.65, fbm(p * 3.0));
  albedo = mix(albedo, srgbToLinear(vec3f(0.24, 0.32, 0.12)), moss);

  let n = normalize(input.normal);
  let shadow = shadowFactor(shadowMap, shadowSampler, world, input.worldPos, n);
  let direct = max(dot(n, normalize(world.lightDir)), 0.0) * shadow;
  var color = albedo * (world.ambient * 0.6 + world.lightColor * world.lightIntensity * direct);
  color = aerial(color, input.worldPos, world);
  return vec4f(color, distanceAlpha(input.worldPos, world));
}
