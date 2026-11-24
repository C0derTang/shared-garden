import { hash21, valueNoise } from "../shaders/common.wgsl";

// Final pass: the Kuwahara paint, fine brush texture along the image's flow,
// canvas weave, glow/aura, grading and vignette.
struct CompositeParams {
  texel: vec2f,
  resolution: vec2f,
  glowStrength: f32,
  exposure: f32,
  night: f32,
  grain: f32,
}

@group(0) @binding(0) var paint: texture_2d<f32>;
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var tensor: texture_2d<f32>;
@group(0) @binding(3) var glow: texture_2d<f32>;
@group(0) @binding(4) var linearSampler: sampler;
@group(0) @binding(5) var<uniform> params: CompositeParams;

fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

fn linearToSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let scale = max(params.resolution.y / 1080.0, 0.5);
  let px = uv * params.resolution / scale;

  var color = textureSampleLevel(paint, linearSampler, uv, 0.0).rgb;
  let sharp = textureSampleLevel(scene, linearSampler, uv, 0.0);
  // Detailed layers (negative alpha) keep most of their crisp rendering.
  let detail = select(0.0, 0.75, sharp.a < -0.5);
  color = mix(color, aces(sharp.rgb * params.exposure), detail);

  // Brush texture: streaks of bristle marks aligned with the local flow.
  let t = textureSampleLevel(tensor, linearSampler, uv, 0.0).xyz;
  let root = sqrt(max((t.x - t.z) * (t.x - t.z) + 4.0 * t.y * t.y, 0.0));
  let lambda1 = 0.5 * (t.x + t.z + root);
  var flow = vec2f(lambda1 - t.x, -t.y);
  flow = select(vec2f(1.0, 0.0), normalize(flow), length(flow) > 1e-6);
  let across = vec2f(-flow.y, flow.x);
  let streakCoord = vec2f(dot(px, across) * 0.9, dot(px, flow) * 0.08);
  let streak = valueNoise(streakCoord) * 0.6 + valueNoise(streakCoord * vec2f(2.3, 1.7) + 7.0) * 0.4;
  color *= 1.0 + (streak - 0.5) * 0.16 * params.grain;

  // Glow and aura (screen blend keeps highlights soft).
  let bloom = aces(textureSampleLevel(glow, linearSampler, uv, 0.0).rgb * params.glowStrength);
  color = 1.0 - (1.0 - color) * (1.0 - bloom);

  // Canvas: woven tooth catching light, plus fibre noise.
  let weave = (sin(px.x * 2.1) * sin(px.y * 2.1 + sin(px.x * 0.37) * 0.8)) * 0.5;
  let fibre = valueNoise(px * vec2f(0.6, 0.15)) - 0.5;
  color *= 1.0 + (weave * 0.035 + fibre * 0.03 + (hash21(floor(px)) - 0.5) * 0.02) * params.grain;

  // Warm grade, gentle vignette.
  let luma = dot(color, vec3f(0.2126, 0.7152, 0.0722));
  color = mix(vec3f(luma), color, 1.08);
  let centered = uv - 0.5;
  color *= 1.0 - dot(centered, centered) * mix(0.5, 0.85, params.night);

  var srgb = linearToSrgb(clamp(color, vec3f(0.0), vec3f(1.0)));
  srgb += (hash21(uv * params.resolution + 0.5) - 0.5) / 255.0;
  return vec4f(srgb, 1.0);
}
