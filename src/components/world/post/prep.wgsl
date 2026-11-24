// Half-resolution tone-mapped copy of the scene that the painterly filter works
// on. Alpha keeps the scene's distance code (negative = keep detail).
struct PrepParams {
  texel: vec2f,
  exposure: f32,
  pad: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> params: PrepParams;

fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let o = params.texel * 0.5;
  var c = textureSampleLevel(scene, linearSampler, uv + vec2f(-o.x, -o.y), 0.0);
  c += textureSampleLevel(scene, linearSampler, uv + vec2f(o.x, -o.y), 0.0);
  c += textureSampleLevel(scene, linearSampler, uv + vec2f(-o.x, o.y), 0.0);
  c += textureSampleLevel(scene, linearSampler, uv + vec2f(o.x, o.y), 0.0);
  c *= 0.25;
  return vec4f(aces(c.rgb * params.exposure), c.a);
}
