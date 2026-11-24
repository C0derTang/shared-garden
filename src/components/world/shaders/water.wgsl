import { World, aerial, distanceAlpha, srgbToLinear, valueNoise } from "./common.wgsl";

// The lake: planar reflection with wind ripples, fresnel, depth tint and a
// sun glitter path.
struct WaterParams {
  // 1 / scene size in pixels (xy) and strength of ripple distortion (z).
  texel: vec2f,
  distortion: f32,
  pad: f32,
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

  // Glitter path under the sun (or moon).
  let half = normalize(normalize(world.lightDir) + view);
  let glint = pow(max(dot(n, half), 0.0), 600.0);
  let sparkle = step(0.55, valueNoise(p * vec2f(6.0, 18.0) + world.time * 0.8));
  let source = select(world.lightColor * world.lightIntensity, vec3f(0.7, 0.75, 0.9), world.night > 0.5);
  color += source * glint * (6.0 + sparkle * 14.0) * smoothstep(-0.05, 0.1, world.lightDir.y);

  color = aerial(color, input.worldPos, world);
  return vec4f(color, distanceAlpha(input.worldPos, world));
}
