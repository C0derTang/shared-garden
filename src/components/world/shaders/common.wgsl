// Shared painterly helpers for the garden world. Pure module: no bindings.

export struct World {
  viewProjection: mat4x4f,
  inverseViewProjection: mat4x4f,
  eye: vec3f,
  time: f32,
  lightDir: vec3f,
  lightIntensity: f32,
  lightColor: vec3f,
  night: f32,
  ambient: vec3f,
  stars: f32,
  zenith: vec3f,
  glow: f32,
  horizon: vec3f,
  hoveredSpot: f32,
  fog: vec3f,
  fogDensity: f32,
  sunDir: vec3f,
  aspect: f32,
  moonDir: vec3f,
  pixelScale: f32,
  camRight: vec3f,
  // 1 while rendering the lake's mirror image: fragments under water are clipped.
  clipWater: f32,
  camUp: vec3f,
  waterLevel: f32,
}

export fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

export fn hash22(p: vec2f) -> vec2f {
  let n = hash21(p);
  return vec2f(n, hash21(p + n + 17.17));
}

export fn hash31(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}

export fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

export fn fbm(p: vec2f) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var q = p;
  for (var i = 0; i < 4; i++) {
    value += amplitude * valueNoise(q);
    q = q * 2.03 + vec2f(17.0, 9.0);
    amplitude *= 0.5;
  }
  return value;
}

export fn srgbToLinear(c: vec3f) -> vec3f {
  return pow(c, vec3f(2.2));
}

// True when this fragment must be clipped from the lake reflection.
export fn belowMirror(worldPos: vec3f, world: World) -> bool {
  return world.clipWater > 0.5 && worldPos.y < world.waterLevel - 0.01;
}

// Scene alpha carries view distance (0 near .. 1 far) to the painterly
// post-process, which abstracts distant paint more. Layers that want to keep
// botanical detail write a negative alpha instead.
export fn distanceAlpha(worldPos: vec3f, world: World) -> f32 {
  return clamp(length(worldPos - world.eye) / 140.0, 0.0, 1.0);
}

// Aerial perspective toward the sky's fog colour.
export fn aerial(color: vec3f, worldPos: vec3f, world: World) -> vec3f {
  let dist = length(worldPos - world.eye);
  let amount = 1.0 - exp(-max(dist - 12.0, 0.0) * world.fogDensity);
  return mix(color, world.fog, clamp(amount, 0.0, 0.85));
}

// Soft wrapped key light with a brushy terminator.
export fn paintedLight(n: vec3f, world: World, brush: f32) -> f32 {
  let ndl = dot(n, normalize(world.lightDir));
  return smoothstep(-0.35, 0.75, ndl + (brush - 0.5) * 0.45);
}

// Painted sky gradient for a view direction (no sun disc), shared by the sky
// underpainting and the sky strokes.
export fn skyColor(ray: vec3f, world: World) -> vec3f {
  let up = clamp(ray.y, -0.2, 1.0);
  let height = pow(clamp(up + 0.02, 0.0, 1.0), 0.55);
  var color = mix(world.horizon, world.zenith, height);
  let sunDot = max(dot(ray, normalize(world.sunDir)), 0.0);
  let sunAbove = smoothstep(-0.12, 0.05, world.sunDir.y);
  color += world.lightColor * (pow(sunDot, 6.0) * 0.4 * world.glow + pow(sunDot, 48.0) * 0.35) * sunAbove;
  let moonDot = max(dot(ray, normalize(world.moonDir)), 0.0);
  color += world.night * vec3f(0.5, 0.56, 0.78) * pow(moonDot, 60.0) * 0.3;
  return color;
}
