// Structure tensor of the painted image: the local edge/flow orientation the
// Kuwahara filter and the brush texture follow.
struct TensorParams {
  texel: vec2f,
  pad: vec2f,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> params: TensorParams;

fn luma(uv: vec2f) -> f32 {
  return dot(textureSampleLevel(source, linearSampler, uv, 0.0).rgb, vec3f(0.299, 0.587, 0.114));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Sobel over a slightly widened stencil, then a small box blur of the tensor.
  var e = 0.0;
  var f = 0.0;
  var g = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let c = uv + vec2f(f32(i), f32(j)) * params.texel * 1.5;
      let t = params.texel;
      let gx = (luma(c + vec2f(t.x, -t.y)) + 2.0 * luma(c + vec2f(t.x, 0.0)) + luma(c + t))
        - (luma(c - t) + 2.0 * luma(c - vec2f(t.x, 0.0)) + luma(c + vec2f(-t.x, t.y)));
      let gy = (luma(c + vec2f(-t.x, t.y)) + 2.0 * luma(c + vec2f(0.0, t.y)) + luma(c + t))
        - (luma(c - t) + 2.0 * luma(c - vec2f(0.0, t.y)) + luma(c + vec2f(t.x, -t.y)));
      e += gx * gx;
      f += gx * gy;
      g += gy * gy;
    }
  }
  return vec4f(e / 9.0, f / 9.0, g / 9.0, 1.0);
}
