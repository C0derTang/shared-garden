import { World, aerial, belowMirror, distanceAlpha, fbm, lampLight, shadowFactor, srgbToLinear, valueNoise } from "./common.wgsl";

// Terrain: a painted meadow of tonal patches, the damp shore bank, the lakebed
// and the far shore. Receives the key light's shadows.
@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;

struct GroundIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
}

struct GroundOut {
  @builtin(position) clip: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
}

@vertex fn vs_main(input: GroundIn) -> GroundOut {
  var out: GroundOut;
  out.clip = world.viewProjection * vec4f(input.position, 1.0);
  out.worldPos = input.position;
  out.normal = input.normal;
  return out;
}

@fragment fn fs_main(input: GroundOut) -> @location(0) vec4f {
  if (belowMirror(input.worldPos, world)) {
    discard;
  }
  let p = input.worldPos.xz;
  let n = normalize(input.normal);
  let patches = fbm(p * 0.22);
  let tufts = fbm(p * 1.1 + 7.0);
  let fine = valueNoise(p * 9.0);
  // Olive, sage, ochre and deep green patches of meadow.
  let olive = srgbToLinear(vec3f(0.36, 0.4, 0.17));
  let sage = srgbToLinear(vec3f(0.3, 0.38, 0.2));
  let ochre = srgbToLinear(vec3f(0.5, 0.45, 0.22));
  let deep = srgbToLinear(vec3f(0.16, 0.24, 0.1));
  var grass = mix(sage, olive, smoothstep(0.35, 0.65, patches));
  grass = mix(grass, ochre, smoothstep(0.6, 0.78, tufts) * 0.55);
  grass = mix(grass, deep, smoothstep(0.55, 0.3, tufts) * 0.6);
  grass *= 0.85 + fine * 0.3;

  // Damp earth and pebbly sand along the bank.
  let height = input.worldPos.y - world.waterLevel;
  let bank = 1.0 - smoothstep(0.08, 0.32, height);
  let pebbles = smoothstep(0.55, 0.75, valueNoise(p * 14.0));
  let sand = mix(srgbToLinear(vec3f(0.36, 0.31, 0.22)), srgbToLinear(vec3f(0.58, 0.52, 0.4)), max(fine, pebbles));
  var albedo = mix(grass, sand, bank);
  albedo *= mix(1.0, 0.5, 1.0 - smoothstep(-0.05, 0.06, height));

  let light = normalize(world.lightDir);
  let shadow = shadowFactor(shadowMap, shadowSampler, world, input.worldPos, n);
  // Wrapped so a low sun still rakes the meadow and long shadows read.
  let direct = clamp(dot(n, light) * 0.55 + 0.45, 0.0, 1.0) * shadow;
  let sky = world.ambient * (0.55 + 0.45 * n.y) * mix(vec3f(0.8, 0.88, 1.08), vec3f(1.0), direct);
  var color = albedo * (sky * 0.75 + world.lightColor * world.lightIntensity * direct + lampLight(input.worldPos, n, world));
  color = aerial(color, input.worldPos, world);
  return vec4f(color, distanceAlpha(input.worldPos, world));
}
