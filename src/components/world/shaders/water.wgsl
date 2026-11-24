import { World, aerial, distanceAlpha, srgbToLinear, valueNoise } from "./common.wgsl";

// The lake: planar reflection with wind ripples, fresnel, depth tint and a
// sun glitter path.
struct WaterParams {
  // 1 / scene size in pixels (xy) and strength of ripple distortion (z).
  texel: vec2f,
  distortion: f32,
  // Which composition's shoreline to foam along: 0 garden, 1 landing.
  shore: f32,
}

@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var reflection: texture_2d<f32>;
@group(0) @binding(2) var reflectionSampler: sampler;
@group(0) @binding(3) var<uniform> water: WaterParams;

struct WaterIn {
  @location(0) position: vec3f,
}

struct WaterOut {
  @builtin(position) clip: vec4f,
  @location(0) worldPos: vec3f,
}

@vertex fn vs_main(input: WaterIn) -> WaterOut {
  var out: WaterOut;
  let position = vec3f(input.position.x, world.waterLevel, input.position.z);
  out.clip = world.viewProjection * vec4f(position, 1.0);
  out.worldPos = position;
  return out;
}

// Must match shorelineZ() in src/lib/world/layout.ts.
fn shorelineZ(x: f32) -> f32 {
  return -6.0 + 1.1 * sin(x * 0.07 + 0.6) + 0.5 * sin(x * 0.19 - 1.1);
}

// Must match landingShoreX/landingLakeDepth in src/lib/world/landing.ts: the
// landing's design space is the world turned a quarter (design x = world z,
// design z = -world x).
fn landingLakeDepth(p: vec2f) -> f32 {
  let dx = p.y;
  let dz = -p.x;
  let shoreX = -7.6 + 0.9 * sin(0.23 * dz + 0.5) + 0.4 * sin(0.61 * dz - 1.2) - 0.3 * max(0.0, dz - 6.0) + 0.18 * min(0.0, dz + 12.0);
  return shoreX - dx;
}

fn ripples(p: vec2f, t: f32) -> vec2f {
  let a = vec2f(valueNoise(p * vec2f(0.9, 2.6) + vec2f(t * 0.25, 0.0)), valueNoise(p * vec2f(0.9, 2.6) + vec2f(5.0, t * 0.2)));
  let b = vec2f(valueNoise(p * vec2f(2.7, 7.5) - vec2f(t * 0.5, 0.0)), valueNoise(p * vec2f(2.7, 7.5) + vec2f(9.0, -t * 0.4)));
  return (a - 0.5) * 0.6 + (b - 0.5) * 0.4;
}

@fragment fn fs_main(input: WaterOut) -> @location(0) vec4f {
  let fragCoord = input.clip;
  let p = input.worldPos.xz;
  let toEye = world.eye - input.worldPos;
  let dist = length(toEye);
  let view = toEye / dist;
  let slope = ripples(p, world.time) * mix(0.22, 0.05, smoothstep(10.0, 90.0, dist));
  let n = normalize(vec3f(slope.x, 1.0, slope.y));

  // Planar reflection, nudged by the ripples.
  let screen = fragCoord.xy * water.texel;
  let uv = screen + slope * water.distortion;
  let reflected = textureSampleLevel(reflection, reflectionSampler, clamp(uv, vec2f(0.001), vec2f(0.999)), 0.0).rgb;

  let cosTheta = max(dot(n, view), 0.0);
  let fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);
  let deep = srgbToLinear(vec3f(0.07, 0.13, 0.14)) * (world.ambient * 0.8 + world.lightColor * world.lightIntensity * 0.15);
  var color = mix(deep, reflected, clamp(fresnel * 1.15 + 0.25, 0.0, 1.0));

  // Glitter path under the sun, or the moon at night.
  let glitterDir = normalize(mix(normalize(world.sunDir), normalize(world.moonDir), world.night));
  let half = normalize(glitterDir + view);
  let glint = pow(max(dot(n, half), 0.0), 500.0);
  let sparkle = step(0.55, valueNoise(p * vec2f(6.0, 18.0) + world.time * 0.8));
  let source = mix(world.lightColor * world.lightIntensity, vec3f(0.75, 0.82, 1.0) * 0.9, world.night);
  color += source * glint * (6.0 + sparkle * 16.0) * smoothstep(-0.05, 0.1, glitterDir.y);

  // Lapping foam and a wet sheen along our shoreline.
  let fromShore = select(shorelineZ(p.x) - p.y, landingLakeDepth(p), water.shore > 0.5);
  let lap = 0.5 + 0.5 * sin(world.time * 0.9 + p.x * 0.6);
  let foamBand = (1.0 - smoothstep(0.0, 0.35 + lap * 0.25, fromShore)) * smoothstep(-0.2, 0.05, fromShore);
  let foamBreak = smoothstep(0.4, 0.75, valueNoise(vec2f(p.x * 3.0, fromShore * 9.0 - world.time * 0.4)));
  let foamColor = world.ambient * 0.9 + world.lightColor * world.lightIntensity * 0.6;
  color = mix(color, foamColor, foamBand * foamBreak * 0.7);

  color = aerial(color, input.worldPos, world);
  return vec4f(color, distanceAlpha(input.worldPos, world));
}
