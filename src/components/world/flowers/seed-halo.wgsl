// The seed puff's own soft white glow (as aura.wgsl paints it) while a
// dandelion's seeds blow away (#201): it dissolves as they drift, so the
// golden head's glow takes over without a jump. Additive; never writes
// depth or alpha. Must match HALO_FLOATS / packPuffHalo in seed-drift.ts.
import { World, plotHalo } from "../shaders/common.wgsl";

struct PuffHalo {
  // Centre, radius.
  sphere: vec4f,
  // Linear colour; drift-clock second the seeds start to go.
  color: vec4f,
  // Seconds it takes to dissolve.
  timing: vec4f,
}

struct HaloView {
  // Drift-clock seconds.
  time: f32,
  // Strength of the flowers' aura.
  aura: f32,
  pad: vec2f,
}

@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var<storage, read> halos: array<PuffHalo>;
@group(0) @binding(2) var<uniform> halo: HaloView;

struct HaloOut {
  @builtin(position) clip: vec4f,
  @location(0) corner: vec2f,
  @location(1) @interpolate(flat) color: vec3f,
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> HaloOut {
  let h = halos[instance];
  let strength = 1.0 - smoothstep(h.color.w, h.color.w + max(h.timing.x, 1e-3), halo.time);
  var out: HaloOut;
  if (strength <= 0.0 || h.sphere.w <= 0.0) {
    out.clip = vec4f(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vertex];
  let toEye = normalize(world.eye - h.sphere.xyz);
  let center = h.sphere.xyz - toEye * h.sphere.w * 0.45;
  let p = center + (world.camRight * c.x + world.camUp * c.y) * h.sphere.w;
  out.clip = world.viewProjection * vec4f(p, 1.0);
  out.corner = c;
  out.color = h.color.rgb * halo.aura * strength;
  return out;
}

@fragment fn fs_main(input: HaloOut) -> @location(0) vec4f {
  // The halo profile every plot glow shares (#206), so the held puff matches its aura.
  return vec4f(input.color * plotHalo(length(input.corner)), 0.0);
}
