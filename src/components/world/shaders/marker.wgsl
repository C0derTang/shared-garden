import { World, aerial } from "./common.wgsl";

// Empty planting spots: a soft, glowing seed mark resting on the soil that
// brightens into a warm halo under the pointer.
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
  let hovered = abs(input.spot.w - world.hoveredSpot) < 0.5;
  let size = select(0.16, 0.34, hovered);
  // Camera-facing glow, floating just above the soil.
  let center = input.spot.xyz + vec3f(0.0, 0.1, 0.0);
  let position = center + (world.camRight * corner.x + world.camUp * corner.y) * size;
  var out: MarkerOut;
  out.clip = world.viewProjection * vec4f(position, 1.0);
  out.quad = corner;
  out.worldPos = center;
  out.spotId = input.spot.w;
  return out;
}

@fragment fn fs_main(input: MarkerOut) -> @location(0) vec4f {
  let hovered = abs(input.spotId - world.hoveredSpot) < 0.5;
  let r = length(input.quad);
  let core = exp(-r * r * 22.0);
  let halo = exp(-r * r * 4.0) * 0.35;
  let pulse = 0.75 + 0.25 * sin(world.time * 1.3 + input.spotId * 0.9);
  let strength = select((core * 0.55 + halo * 0.2) * pulse * mix(0.5, 1.0, world.night), (core * 3.0 + halo * 1.4), hovered);
  if (strength < 0.003) {
    discard;
  }
  let warm = vec3f(1.0, 0.86, 0.6);
  let color = aerial(warm * strength, input.worldPos, world);
  return vec4f(color, 0.0);
}
