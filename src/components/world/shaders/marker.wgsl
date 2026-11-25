import { World, plotHalo } from "./common.wgsl";

// Empty planting spots: a soft, glowing seed mark resting on the soil. It
// shares the one plot-glow rule with every flower's aura (level, halo and the
// hover boost), so an empty spot reads like a seedling.
@group(0) @binding(0) var<uniform> world: World;

// World radius of a seed mark's halo (the smallest plot glow, PLOT_GLOW.minRadius).
const SEED_RADIUS: f32 = 0.17;
// Seed-mark warmth with the shared glow luminance (SEED_GLOW in lib/world/glow.ts).
const SEED_COLOR: vec3f = vec3f(0.6234, 0.5427, 0.4056);

struct MarkerIn {
  @builtin(vertex_index) vertex: u32,
  // xyz: spot position on the ground, w: one-based spot id.
  @location(0) spot: vec4f,
}

struct MarkerOut {
  @builtin(position) clip: vec4f,
  @location(0) quad: vec2f,
  @location(1) @interpolate(flat) strength: f32,
}

@vertex fn vs_main(input: MarkerIn) -> MarkerOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let corner = corners[input.vertex];
  let lit = abs(input.spot.w - world.hoveredSpot) < 0.5;
  let size = SEED_RADIUS * select(1.0, world.plotGrow, lit);
  // Camera-facing glow, floating just above the soil.
  let center = input.spot.xyz + vec3f(0.0, 0.1, 0.0);
  let position = center + (world.camRight * corner.x + world.camUp * corner.y) * size;
  var out: MarkerOut;
  out.clip = world.viewProjection * vec4f(position, 1.0);
  out.quad = corner;
  out.strength = world.plotGlow * select(1.0, world.plotBoost, lit);
  return out;
}

@fragment fn fs_main(input: MarkerOut) -> @location(0) vec4f {
  let halo = plotHalo(length(input.quad)) * input.strength;
  if (halo < 0.002) {
    discard;
  }
  return vec4f(SEED_COLOR * halo, 0.0);
}
