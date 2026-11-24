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

const SECTORS: i32 = 8;
const MAX_RADIUS: i32 = 6;

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
  let radius = select(mix(params.radiusNear, params.radiusFar, smoothstep(0.02, 0.6, far)), 1.5, detail);
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

  var m: array<vec4f, 8>;
  var s: array<vec3f, 8>;
  for (var k = 0; k < SECTORS; k++) {
    m[k] = vec4f(0.0);
    s[k] = vec3f(0.0);
  }

  for (var y = -maxY; y <= maxY; y++) {
    for (var x = -maxX; x <= maxX; x++) {
      var p = sr * vec2f(f32(x), f32(y));
      if (dot(p, p) > 0.25) {
        continue;
      }
      let c = textureSampleLevel(source, linearSampler, uv + vec2f(f32(x), f32(y)) * params.texel, 0.0).rgb;
      var w: array<f32, 8>;
      var sum = 0.0;
      var vxx = zeta - eta * p.x * p.x;
      var vyy = zeta - eta * p.y * p.y;
      var z = max(0.0, p.y + vxx); w[0] = z * z; sum += w[0];
      z = max(0.0, -p.x + vyy); w[2] = z * z; sum += w[2];
      z = max(0.0, -p.y + vxx); w[4] = z * z; sum += w[4];
      z = max(0.0, p.x + vyy); w[6] = z * z; sum += w[6];
      let q = 0.70710678 * vec2f(p.x - p.y, p.x + p.y);
      vxx = zeta - eta * q.x * q.x;
      vyy = zeta - eta * q.y * q.y;
      z = max(0.0, q.y + vxx); w[1] = z * z; sum += w[1];
      z = max(0.0, -q.x + vyy); w[3] = z * z; sum += w[3];
      z = max(0.0, -q.y + vxx); w[5] = z * z; sum += w[5];
      z = max(0.0, q.x + vyy); w[7] = z * z; sum += w[7];
      let g = exp(-3.125 * dot(p, p)) / max(sum, 1e-6);
      for (var k = 0; k < SECTORS; k++) {
        let wk = w[k] * g;
        m[k] += vec4f(c * wk, wk);
        s[k] += c * c * wk;
      }
    }
  }

  var out = vec4f(0.0);
  for (var k = 0; k < SECTORS; k++) {
    if (m[k].w <= 0.0) {
      continue;
    }
    let mean = m[k].rgb / m[k].w;
    let variance = abs(s[k] / m[k].w - mean * mean);
    let sigma2 = variance.r + variance.g + variance.b;
    let wk = 1.0 / (1.0 + pow(8000.0 * sigma2, 4.0));
    out += vec4f(mean * wk, wk);
  }
  let painted = select(center.rgb, out.rgb / out.w, out.w > 0.0);
  return vec4f(painted, center.a);
}
