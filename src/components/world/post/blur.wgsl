// Separable 9-tap gaussian for the glow chain.
struct BlurParams {
  direction: vec2f,
  pad: vec2f,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: BlurParams;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Linear-sampled offsets/weights for a 9-tap kernel.
  let d = params.direction;
  var c = textureSampleLevel(source, sourceSampler, uv, 0.0).rgb * 0.227027;
  c += textureSampleLevel(source, sourceSampler, uv + d * 1.3846154, 0.0).rgb * 0.3162162;
  c += textureSampleLevel(source, sourceSampler, uv - d * 1.3846154, 0.0).rgb * 0.3162162;
  c += textureSampleLevel(source, sourceSampler, uv + d * 3.2307692, 0.0).rgb * 0.0702703;
  c += textureSampleLevel(source, sourceSampler, uv - d * 3.2307692, 0.0).rgb * 0.0702703;
  return vec4f(c, 1.0);
}
