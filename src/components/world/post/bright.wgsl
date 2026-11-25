// Bright-pass downsample feeding the soft glow.
struct BrightParams {
  texel: vec2f,
  threshold: f32,
  knee: f32,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: BrightParams;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let o = params.texel;
  var c = textureSampleLevel(source, sourceSampler, uv + vec2f(-o.x, -o.y), 0.0).rgb;
  c += textureSampleLevel(source, sourceSampler, uv + vec2f(o.x, -o.y), 0.0).rgb;
  c += textureSampleLevel(source, sourceSampler, uv + vec2f(-o.x, o.y), 0.0).rgb;
  c += textureSampleLevel(source, sourceSampler, uv + vec2f(o.x, o.y), 0.0).rgb;
  c *= 0.25;
  let luma = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  let soft = clamp(luma - params.threshold + params.knee, 0.0, 2.0 * params.knee);
  let weight = max(soft * soft / (4.0 * params.knee + 1e-4), luma - params.threshold) / max(luma, 1e-4);
  return vec4f(c * max(weight, 0.0), 1.0);
}
