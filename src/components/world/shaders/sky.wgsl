import { World, fbm, hash21, skyColor, valueNoise } from "./common.wgsl";

// Painted sky: warm/cool gradient, layered cumulus lit by the sun angle, high
// cirrus streaks, sun disc (HDR, so it blooms), moon with halo, stars.
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

fn cloudDensity(p: vec2f) -> f32 {
  let warp = vec2f(fbm(p * 0.7 + 3.1), fbm(p * 0.7 + 8.7)) * 1.6;
  return fbm(p + warp);
}

@fragment fn fs_main(input: SkyOut) -> @location(0) vec4f {
  let ray = viewRay(input.ndc);
  let az = atan2(ray.x, -ray.z);
  var color = skyColor(ray, world);
  let sun = normalize(world.sunDir);
  let sunDot = max(dot(ray, sun), 0.0);
  let sunAbove = smoothstep(-0.1, 0.03, world.sunDir.y);
  let toward = pow(sunDot, 3.0);

  // Sun disc: bright enough to bloom into a soft halo.
  let disc = smoothstep(0.99955, 0.9998, sunDot) * sunAbove * (1.0 - world.night);
  color = mix(color, vec3f(9.0, 7.2, 5.0) * mix(vec3f(1.0), world.lightColor, 0.5), disc);

  if (ray.y > -0.02) {
    let lift = max(ray.y, 0.0) + 0.05;
    let drift = vec2f(world.time * 0.004, world.time * 0.0015);

    // High cirrus: long streaks combed across the sky.
    let cirrusUv = ray.xz / lift * vec2f(0.08, 0.5) + drift * 0.5;
    let cirrus = smoothstep(0.55, 0.85, fbm(cirrusUv + vec2f(fbm(cirrusUv * 3.0) * 0.5, 0.0))) * smoothstep(0.05, 0.3, ray.y);

    // Cumulus banks: domain-warped, soft-edged, thicker toward the horizon.
    let cumulusUv = ray.xz / lift * vec2f(0.16, 0.42) + drift;
    let d = cloudDensity(cumulusUv);
    let coverage = mix(0.5, 0.42, smoothstep(0.35, 0.02, ray.y));
    let body = smoothstep(coverage, coverage + 0.22, d) * smoothstep(-0.02, 0.06, ray.y) * (1.0 - smoothstep(0.55, 0.92, ray.y));
    // Self-shadow: sample the density a little toward the sun.
    let towardSun = normalize(sun.xz + vec2f(1e-4)) * 0.18;
    let occlusion = smoothstep(coverage, coverage + 0.35, cloudDensity(cumulusUv + towardSun));
    let base = world.ambient * mix(0.75, 0.55, world.night) + world.horizon * 0.15;
    let silver = world.lightColor * world.lightIntensity * (0.9 + toward * (2.0 + world.glow * 3.0));
    let litCloud = mix(silver, base, occlusion * 0.75);
    color = mix(color, litCloud, body * mix(0.95, 0.55, world.night));
    let cirrusColor = mix(world.horizon, world.lightColor * world.lightIntensity * (1.0 + toward * 2.0), 0.6);
    color = mix(color, cirrusColor, cirrus * 0.35 * (1.0 - body));
  }

  // Stars, fading toward the horizon haze.
  if (world.stars > 0.0 && ray.y > 0.0) {
    let grid = vec2f(az * 110.0, asin(clamp(ray.y, -1.0, 1.0)) * 110.0);
    let cell = floor(grid);
    let h = hash21(cell);
    let offset = vec2f(hash21(cell + 3.3), hash21(cell + 7.1)) * 0.6 + 0.2;
    let dd = length(fract(grid) - offset);
    let twinkle = 0.7 + 0.3 * sin(world.time * (1.0 + h * 3.0) + h * 40.0);
    let star = step(0.88, h) * smoothstep(0.12, 0.0, dd) * twinkle * (0.4 + h);
    color += vec3f(1.0, 0.96, 0.9) * star * 2.4 * world.stars * smoothstep(0.03, 0.25, ray.y);
  }

  // Moon: cream disc, soft halo.
  let moonDot = max(dot(ray, normalize(world.moonDir)), 0.0);
  let moonDisc = smoothstep(0.99955, 0.99975, moonDot);
  let mottle = valueNoise(ray.xy * 700.0) * 0.12 + valueNoise(ray.xy * 2100.0) * 0.06;
  color += world.night * vec3f(0.55, 0.65, 0.95) * pow(moonDot, 90.0) * 0.45;
  color = mix(color, vec3f(3.2, 3.05, 2.7) * (1.0 - mottle), moonDisc * world.night);

  // Fine dither against banding in the smooth gradient.
  color += (hash21(input.clip.xy) - 0.5) * 0.004;
  return vec4f(color, 1.0);
}
