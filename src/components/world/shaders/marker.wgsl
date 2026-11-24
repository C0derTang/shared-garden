import { World, aerial, valueNoise } from "./common.wgsl";

@group(0) @binding(0) var<uniform> world: World;

struct MarkerIn {
  @builtin(vertex_index) vertex: u32,
  // xyz: spot position on the ground, w: one-based spot id.
  @location(0) spot: vec4f,
}

struct MarkerOut {
  @builtin(position) clip: vec4f,
  @location(0) quad: vec2f,
  @location(1) worldPos: vec3f,
  @location(2) spotId: f32,
}

@vertex fn vs_main(input: MarkerIn) -> MarkerOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let corner = corners[input.vertex];
  let size = 0.22;
  let position = input.spot.xyz + vec3f(corner.x * size, 0.12, corner.y * size);
  var out: MarkerOut;
  out.clip = world.viewProjection * vec4f(position, 1.0);
  out.quad = corner;
  out.worldPos = position;
  out.spotId = input.spot.w;
  return out;
}

@fragment fn fs_main(input: MarkerOut) -> @location(0) vec4f {
  let hovered = abs(input.spotId - world.hoveredSpot) < 0.5;
  let r = length(input.quad);
  let a = atan2(input.quad.y, input.quad.x);
  // A hand-dabbed ring: wobbly radius, broken stroke.
  let wobble = valueNoise(vec2f(a * 2.5 + input.spotId * 3.1, input.spotId)) * 0.12;
  let ringRadius = 0.62 + wobble;
  let ring = smoothstep(0.16, 0.04, abs(r - ringRadius));
  let gaps = smoothstep(0.15, 0.4, valueNoise(vec2f(a * 3.0, input.spotId * 7.0)));
  let pulse = 0.5 + 0.5 * sin(world.time * 1.6 + input.spotId * 0.7);
  let seedDot = smoothstep(0.2, 0.1, r) * 0.7;
  let alpha = clamp(ring * mix(0.55, 1.0, gaps) + seedDot, 0.0, 1.0) * select(0.55 + 0.15 * pulse, 1.0, hovered);
  if (alpha < 0.01) {
    discard;
  }
  let cream = vec3f(1.0, 0.9, 0.7);
  let glow = select(0.35 + world.night * 0.4, 2.6, hovered);
  var color = cream * glow;
  color = aerial(color, input.worldPos, world);
  return vec4f(color * alpha, alpha);
}
