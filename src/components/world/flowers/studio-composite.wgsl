// Final pass of the flower studio: filmic tone map, soft bloom (the aura),
// canvas tooth, vignette and dither. No painterly abstraction, so botanical
// detail stays crisp.
import { hash21, valueNoise } from "../shaders/common.wgsl";

struct StudioParams {
  resolution: vec2f,
  exposure: f32,
  glowStrength: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var glow: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> params: StudioParams;

fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

fn linearToSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var color = aces(textureSampleLevel(scene, linearSampler, uv, 0.0).rgb * params.exposure);
  let bloom = aces(textureSampleLevel(glow, linearSampler, uv, 0.0).rgb * params.glowStrength);
  color = 1.0 - (1.0 - color) * (1.0 - bloom);
  let px = uv * params.resolution / max(params.resolution.y / 1080.0, 0.5);
  let weave = sin(px.x * 1.7) * sin(px.y * 1.7 + sin(px.x * 0.31) * 0.6);
  let fibre = valueNoise(px * vec2f(0.45, 0.12)) - 0.5;
  color *= 1.0 + weave * 0.015 + fibre * 0.02;
  let centered = uv - 0.5;
  color *= 1.0 - dot(centered, centered) * 0.5;
  var srgb = linearToSrgb(clamp(color, vec3f(0.0), vec3f(1.0)));
  srgb += (hash21(uv * params.resolution + 0.5) - 0.5) / 255.0;
  return vec4f(srgb, 1.0);
}
