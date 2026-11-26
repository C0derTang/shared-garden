// Anisotropic Kuwahara filter (polynomial sector weights, after Kyprianidis et
// al.): flattens the scene into oriented, smoothly blended dabs of paint while
// keeping edges. The kernel grows with view distance; pixels whose alpha is
// negative (detailed layers such as flowers) get a small kernel.
struct KuwaharaParams {
  texel: vec2f,
  radiusNear: f32,
  radiusFar: f32,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var tensor: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> params: KuwaharaParams;

const MAX_RADIUS: i32 = 12;

// The same variance-weighted sector reduction, called with constant sectors.
fn sectorColor(moment: vec4f, square: vec3f) -> vec4f {
  if (moment.w <= 0.0) {
    return vec4f(0.0);
  }
  let mean = moment.rgb / moment.w;
  let variance = abs(square / moment.w - mean * mean);
  let sigma2 = variance.r + variance.g + variance.b;
  let weight = 1.0 / (1.0 + pow(8000.0 * sigma2, 4.0));
  return vec4f(mean * weight, weight);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let center = textureSampleLevel(source, linearSampler, uv, 0.0);
  let t = textureSampleLevel(tensor, linearSampler, uv, 0.0).xyz;
  let root = sqrt(max((t.x - t.z) * (t.x - t.z) + 4.0 * t.y * t.y, 0.0));
  let lambda1 = 0.5 * (t.x + t.z + root);
  let lambda2 = 0.5 * (t.x + t.z - root);
  var v = vec2f(lambda1 - t.x, -t.y);
  if (length(v) > 1e-6) {
    v = normalize(v);
  } else {
    v = vec2f(0.0, 1.0);
  }
  let phi = -atan2(v.y, v.x);
  let anisotropy = select(0.0, (lambda1 - lambda2) / (lambda1 + lambda2), lambda1 + lambda2 > 1e-6);

  let detail = center.a < 0.0;
  let far = clamp(center.a, 0.0, 1.0);
  let radius = select(mix(params.radiusNear, params.radiusFar, smoothstep(0.02, 0.35, far)), 1.5, detail);
  // Large kernels sample every other texel to stay affordable at full resolution.
  let stride = select(1, 2, radius > 5.0);
  let a = radius * clamp((1.0 + anisotropy) / 1.0, 0.1, 2.0);
  let b = radius * clamp(1.0 / (1.0 + anisotropy), 0.1, 2.0);
  let cosPhi = cos(phi);
  let sinPhi = sin(phi);
  let sr = mat2x2f(0.5 / a * cosPhi, 0.5 / b * -sinPhi, 0.5 / a * sinPhi, 0.5 / b * cosPhi);
  let maxX = i32(min(ceil(sqrt(a * a * cosPhi * cosPhi + b * b * sinPhi * sinPhi)), f32(MAX_RADIUS)));
  let maxY = i32(min(ceil(sqrt(a * a * sinPhi * sinPhi + b * b * cosPhi * cosPhi)), f32(MAX_RADIUS)));

  let zeta = 2.0 / max(radius, 1.0);
  let zeroCross = 0.58;
  let sinZero = sin(zeroCross);
  let eta = (zeta + cos(zeroCross)) / (sinZero * sinZero);

  // Keep each sector in a named accumulator: dynamically indexing the moment
  // arrays inside the sample loop adds avoidable indexing and loop overhead.
  var m0 = vec4f(0.0);
  var s0 = vec3f(0.0);
  var m1 = vec4f(0.0);
  var s1 = vec3f(0.0);
  var m2 = vec4f(0.0);
  var s2 = vec3f(0.0);
  var m3 = vec4f(0.0);
  var s3 = vec3f(0.0);
  var m4 = vec4f(0.0);
  var s4 = vec3f(0.0);
  var m5 = vec4f(0.0);
  var s5 = vec3f(0.0);
  var m6 = vec4f(0.0);
  var s6 = vec3f(0.0);
  var m7 = vec4f(0.0);
  var s7 = vec3f(0.0);

  for (var y = -maxY; y <= 0; y += stride) {
    for (var x = -maxX; x <= maxX; x += stride) {
      // Each lattice point has an opposite point with the same Gaussian and
      // sector weights rotated by four. Visit one half, then accumulate both.
      if (y == 0 && x > 0) { break; }
      let p = sr * vec2f(f32(x), f32(y));
      if (dot(p, p) > 0.25) {
        continue;
      }
      let offset = vec2f(f32(x), f32(y)) * params.texel;
      let c = textureSampleLevel(source, linearSampler, uv + offset, 0.0).rgb;
      let opposite = textureSampleLevel(source, linearSampler, uv - offset, 0.0).rgb;
      var sum = 0.0;
      var vxx = zeta - eta * p.x * p.x;
      var vyy = zeta - eta * p.y * p.y;
      var z = max(0.0, p.y + vxx); let w0 = z * z; sum += w0;
      z = max(0.0, -p.x + vyy); let w2 = z * z; sum += w2;
      z = max(0.0, -p.y + vxx); let w4 = z * z; sum += w4;
      z = max(0.0, p.x + vyy); let w6 = z * z; sum += w6;
      let q = 0.70710678 * vec2f(p.x - p.y, p.x + p.y);
      vxx = zeta - eta * q.x * q.x;
      vyy = zeta - eta * q.y * q.y;
      z = max(0.0, q.y + vxx); let w1 = z * z; sum += w1;
      z = max(0.0, -q.x + vyy); let w3 = z * z; sum += w3;
      z = max(0.0, -q.y + vxx); let w5 = z * z; sum += w5;
      z = max(0.0, q.x + vyy); let w7 = z * z; sum += w7;
      let g = exp(-3.125 * dot(p, p)) / max(sum, 1e-6);
      let wk0 = w0 * g;
      m0 += vec4f(c * wk0, wk0);
      s0 += c * c * wk0;
      let wk1 = w1 * g;
      m1 += vec4f(c * wk1, wk1);
      s1 += c * c * wk1;
      let wk2 = w2 * g;
      m2 += vec4f(c * wk2, wk2);
      s2 += c * c * wk2;
      let wk3 = w3 * g;
      m3 += vec4f(c * wk3, wk3);
      s3 += c * c * wk3;
      let wk4 = w4 * g;
      m4 += vec4f(c * wk4, wk4);
      s4 += c * c * wk4;
      let wk5 = w5 * g;
      m5 += vec4f(c * wk5, wk5);
      s5 += c * c * wk5;
      let wk6 = w6 * g;
      m6 += vec4f(c * wk6, wk6);
      s6 += c * c * wk6;
      let wk7 = w7 * g;
      m7 += vec4f(c * wk7, wk7);
      s7 += c * c * wk7;
      // The origin belongs to both halves; count it only once.
      if (x != 0 || y != 0) {
        m0 += vec4f(opposite * wk4, wk4);
        s0 += opposite * opposite * wk4;
        m1 += vec4f(opposite * wk5, wk5);
        s1 += opposite * opposite * wk5;
        m2 += vec4f(opposite * wk6, wk6);
        s2 += opposite * opposite * wk6;
        m3 += vec4f(opposite * wk7, wk7);
        s3 += opposite * opposite * wk7;
        m4 += vec4f(opposite * wk0, wk0);
        s4 += opposite * opposite * wk0;
        m5 += vec4f(opposite * wk1, wk1);
        s5 += opposite * opposite * wk1;
        m6 += vec4f(opposite * wk2, wk2);
        s6 += opposite * opposite * wk2;
        m7 += vec4f(opposite * wk3, wk3);
        s7 += opposite * opposite * wk3;
      }
    }
  }

  var out = vec4f(0.0);
  out += sectorColor(m0, s0);
  out += sectorColor(m1, s1);
  out += sectorColor(m2, s2);
  out += sectorColor(m3, s3);
  out += sectorColor(m4, s4);
  out += sectorColor(m5, s5);
  out += sectorColor(m6, s6);
  out += sectorColor(m7, s7);
  let painted = select(center.rgb, out.rgb / out.w, out.w > 0.0);
  return vec4f(painted, center.a);
}
