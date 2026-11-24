import { World, aerial, belowMirror, distanceAlpha, fbm, shadowFactor, srgbToLinear, valueNoise } from "./common.wgsl";

// Stones: shore boulders, foreground rocks and bed edging, with moss on top.
@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;

struct RockIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  // x: rock seed, y: mossiness
  @location(2) tone: vec2f,
}

struct RockOut {
  @builtin(position) clip: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) tone: vec2f,
}

@vertex fn vs_main(input: RockIn) -> RockOut {
  var out: RockOut;
  out.clip = world.viewProjection * vec4f(input.position, 1.0);
  out.worldPos = input.position;
  out.normal = input.normal;
  out.tone = input.tone;
  return out;
}

@fragment fn fs_main(input: RockOut) -> @location(0) vec4f {
  if (belowMirror(input.worldPos, world)) {
    discard;
  }
  let n = normalize(input.normal);
  let p = input.worldPos;
  let grain = fbm(p.xz * 3.0 + p.y * 2.0 + input.tone.x * 10.0);
  let speck = valueNoise(p.xz * 30.0 + p.y * 20.0);
  var albedo = mix(srgbToLinear(vec3f(0.46, 0.43, 0.39)), srgbToLinear(vec3f(0.68, 0.63, 0.55)), grain);
  albedo *= 0.85 + speck * 0.25;
  let moss = smoothstep(0.45, 0.85, n.y) * input.tone.y * smoothstep(0.3, 0.6, fbm(p.xz * 4.0));
  albedo = mix(albedo, srgbToLinear(vec3f(0.27, 0.34, 0.13)), moss);
  // Wet darkening near the waterline.
  albedo *= mix(0.55, 1.0, smoothstep(world.waterLevel, world.waterLevel + 0.15, p.y));

  let light = normalize(world.lightDir);
  let shadow = shadowFactor(shadowMap, shadowSampler, world, p, n);
  let direct = max(dot(n, light), 0.0) * shadow;
  // Pale stone holds sky light even in shade, so it never sinks to black.
  let fill = world.ambient * (0.75 + 0.45 * max(n.y, 0.0)) * mix(vec3f(0.85, 0.9, 1.08), vec3f(1.0), direct);
  let bounce = world.lightColor * world.lightIntensity * 0.12 * max(-n.y * 0.5 + 0.5, 0.0);
  var color = albedo * (fill + bounce + world.lightColor * world.lightIntensity * direct);
  let toCamera = normalize(world.eye - p);
  color += world.lightColor * world.lightIntensity * pow(1.0 - max(dot(n, toCamera), 0.0), 3.0) * 0.4 * albedo;
  color = aerial(color, p, world);
  return vec4f(color, distanceAlpha(p, world));
}
