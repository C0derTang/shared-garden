import { World, fbm, hash21, skyColor, valueNoise } from "./common.wgsl";

// Sky: gradient, sun and moon, soft layered clouds lit by the low sun, stars.
@group(0) @binding(0) var<uniform> world: World;

struct SkyOut {
  @builtin(position) clip: vec4f,
  @location(0) ndc: vec2f,
}

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> SkyOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: SkyOut;
  out.clip = vec4f(corners[index], 1.0, 1.0);
  out.ndc = corners[index];
  return out;
}

fn viewRay(ndc: vec2f) -> vec3f {
  let near = world.inverseViewProjection * vec4f(ndc, 0.0, 1.0);
  let far = world.inverseViewProjection * vec4f(ndc, 1.0, 1.0);
  return normalize(far.xyz / far.w - near.xyz / near.w);
}

@fragment fn fs_main(input: SkyOut) -> @location(0) vec4f {
  let ray = viewRay(input.ndc);
  let az = atan2(ray.x, -ray.z);
  var color = skyColor(ray, world);
  let sunDot = max(dot(ray, normalize(world.sunDir)), 0.0);
  let sunAbove = smoothstep(-0.1, 0.03, world.sunDir.y);

  // Sun disc.
  let disc = smoothstep(0.99955, 0.9998, sunDot) * sunAbove * (1.0 - world.night);
  color = mix(color, vec3f(5.0, 4.2, 3.1) * mix(vec3f(1.0), world.lightColor, 0.6), disc);

  // Clouds: a stretched, drifting deck lit warm toward the sun.
  if (ray.y > -0.02) {
    let plane = ray.xz / (max(ray.y, 0.0) + 0.06);
    let drift = vec2f(world.time * 0.006, world.time * 0.002);
    let uv = vec2f(plane.x * 0.11, plane.y * 0.32) + drift;
    let base = fbm(uv * 1.3 + fbm(uv * 2.0) * 0.6);
    let wisps = fbm(vec2f(uv.x * 3.5, uv.y * 9.0) + 11.0);
    let density = smoothstep(0.42, 0.78, base + wisps * 0.2) * smoothstep(-0.02, 0.12, ray.y) * (1.0 - smoothstep(0.5, 0.95, ray.y));
    let toward = pow(sunDot, 4.0);
    let underside = world.ambient * mix(0.7, 0.45, world.night) + world.horizon * 0.2;
    let litEdge = world.lightColor * world.lightIntensity * (0.6 + toward * (1.4 + world.glow * 2.2)) + world.lightColor * world.glow * 0.35;
    let cloudColor = mix(underside, litEdge, clamp(0.35 + wisps * 0.5 + toward * 0.4, 0.0, 1.0));
    color = mix(color, cloudColor, density * mix(0.85, 0.5, world.night));
  }

  // Stars.
  if (world.stars > 0.0 && ray.y > 0.0) {
    let grid = vec2f(az * 90.0, asin(clamp(ray.y, -1.0, 1.0)) * 90.0);
    let cell = floor(grid);
    let h = hash21(cell);
    let offset = vec2f(hash21(cell + 3.3), hash21(cell + 7.1)) * 0.6 + 0.2;
    let d = length(fract(grid) - offset);
    let twinkle = 0.7 + 0.3 * sin(world.time * (1.0 + h * 3.0) + h * 40.0);
    let star = step(0.9, h) * smoothstep(0.1, 0.0, d) * twinkle * (0.5 + h);
    color += vec3f(1.0, 0.96, 0.88) * star * 2.0 * world.stars * smoothstep(0.02, 0.2, ray.y);
  }

  // Moon.
  let moonDot = max(dot(ray, normalize(world.moonDir)), 0.0);
  let moonDisc = smoothstep(0.99962, 0.99982, moonDot);
  let mottle = valueNoise(ray.xy * 900.0) * 0.15;
  color = mix(color, vec3f(2.2, 2.1, 1.8) * (1.0 - mottle), moonDisc * world.night);
  color += vec3f(0.4, 0.45, 0.65) * pow(moonDot, 300.0) * world.night * 0.6;
  return vec4f(color, 1.0);
}
