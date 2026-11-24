import { World, aerial, belowMirror, distanceAlpha, fbm, srgbToLinear, valueNoise } from "./common.wgsl";

// Terrain: meadow grass, the damp shore bank, the lakebed and the far shore.
@group(0) @binding(0) var<uniform> world: World;

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
  let patches = fbm(p * 0.35);
  let fine = valueNoise(p * 9.0);
  var grass = mix(srgbToLinear(vec3f(0.2, 0.3, 0.1)), srgbToLinear(vec3f(0.36, 0.45, 0.17)), patches);
  grass = mix(grass, srgbToLinear(vec3f(0.5, 0.5, 0.24)), smoothstep(0.62, 0.8, patches) * 0.6);
  grass *= 0.85 + fine * 0.3;

  // Above the waterline: damp earth and pebbly sand along the bank.
  let height = input.worldPos.y - world.waterLevel;
  let bank = 1.0 - smoothstep(0.08, 0.32, height);
  let sand = mix(srgbToLinear(vec3f(0.36, 0.3, 0.2)), srgbToLinear(vec3f(0.55, 0.47, 0.33)), fine);
  var albedo = mix(grass, sand, bank);
  // Wet, darker just at the water's edge and below it.
  albedo *= mix(1.0, 0.55, 1.0 - smoothstep(-0.05, 0.06, height));

  let light = normalize(world.lightDir);
  let lit = max(dot(n, light) * 0.8 + 0.2, 0.0);
  let sky = world.ambient * (0.55 + 0.45 * n.y);
  var color = albedo * (sky * 0.95 + world.lightColor * world.lightIntensity * lit * 0.8);
  color = aerial(color, input.worldPos, world);
  return vec4f(color, distanceAlpha(input.worldPos, world));
}
