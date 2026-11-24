import { hash21, valueNoise } from "../shaders/common.wgsl";

// Final pass: the Kuwahara paint, flow-aligned brush streaks (line integral
// convolution along the image's structure), canvas weave, glow/aura, warm/cool
// grade, vignette and dither.
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

// Dominant edge-tangent direction (the way a painter would drag the brush).
fn flowAt(uv: vec2f) -> vec2f {
  let t = textureSampleLevel(tensor, linearSampler, uv, 0.0).xyz;
  let root = sqrt(max((t.x - t.z) * (t.x - t.z) + 4.0 * t.y * t.y, 0.0));
  let lambda1 = 0.5 * (t.x + t.z + root);
  let v = vec2f(lambda1 - t.x, -t.y);
  let edge = vec2f(v.y, -v.x);
  return select(vec2f(1.0, 0.0), normalize(edge), length(edge) > 1e-6);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let scale = max(params.resolution.y / 1080.0, 0.5);
  let px = uv * params.resolution / scale;

  var color = textureSampleLevel(paint, linearSampler, uv, 0.0).rgb;
  let sharp = textureSampleLevel(scene, linearSampler, uv, 0.0);
  // Detailed layers (negative alpha) keep most of their crisp rendering.
  let detail = select(0.0, 0.75, sharp.a < -0.5);
  color = mix(color, aces(sharp.rgb * params.exposure), detail);

  // Brush streaks: integrate bristle noise along the flow in both directions.
  var lic = 0.0;
  var forward = px;
  var backward = px;
  var dirF = flowAt(uv);
  var dirB = -dirF;
  for (var i = 0; i < 7; i++) {
    lic += valueNoise(forward * vec2f(0.9, 0.9)) + valueNoise(backward * vec2f(0.9, 0.9));
    forward += dirF * 1.6;
    backward += dirB * 1.6;
    let nf = flowAt(forward * scale / params.resolution);
    let nb = flowAt(backward * scale / params.resolution);
    dirF = select(-nf, nf, dot(nf, dirF) >= 0.0);
    dirB = select(-nb, nb, dot(nb, dirB) >= 0.0);
  }
  lic = lic / 14.0 - 0.5;
  // Long, gentle pigment ridges plus the fine bristle streaks.
  let ridge = valueNoise(vec2f(dot(px, vec2f(-dirF.y, dirF.x)) * 0.12, dot(px, dirF) * 0.015)) - 0.5;
  color *= 1.0 + (lic * 0.32 + ridge * 0.06) * params.grain;

  // Glow and aura (screen blend keeps highlights soft).
  let bloom = aces(textureSampleLevel(glow, linearSampler, uv, 0.0).rgb * params.glowStrength);
  color = 1.0 - (1.0 - color) * (1.0 - bloom);

  // Canvas: woven tooth catching light, plus fibre.
  let weave = sin(px.x * 1.7) * sin(px.y * 1.7 + sin(px.x * 0.31) * 0.6);
  let fibre = valueNoise(px * vec2f(0.45, 0.12)) - 0.5;
  color *= 1.0 + (weave * 0.022 + fibre * 0.025) * params.grain;

  // Warm highlights, cool shadows.
  let luma = dot(color, vec3f(0.2126, 0.7152, 0.0722));
  let split = mix(vec3f(0.94, 0.98, 1.06), vec3f(1.05, 1.0, 0.92), smoothstep(0.15, 0.7, luma));
  color = mix(vec3f(luma), color * mix(split, vec3f(1.0), params.night * 0.6), 1.05);
  let centered = uv - 0.5;
  color *= 1.0 - dot(centered, centered) * mix(0.45, 0.75, params.night);

  var srgb = linearToSrgb(clamp(color, vec3f(0.0), vec3f(1.0)));
  srgb += (hash21(uv * params.resolution + 0.5) - 0.5) / 255.0;
  return vec4f(srgb, 1.0);
}
