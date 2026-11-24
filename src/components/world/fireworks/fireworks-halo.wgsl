import { World, valueNoise } from "../shaders/common.wgsl";
import { Shell } from "./fireworks-common.wgsl";

// The glow each burst throws into the night air around it: a large, soft,
// slightly mottled bloom of its colour that flares at the burst and lingers
// as lit smoke. Additive into the HDR scene (colour only).
struct HaloView {
  // Show seconds.
  time: f32,
  fade: f32,
  gain: f32,
  pad: f32,
}

@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var<storage, read> shells: array<Shell>;
@group(0) @binding(2) var<uniform> halo: HaloView;

struct HaloOut {
  @builtin(position) clip: vec4f,
  @location(0) quad: vec2f,
  @location(1) color: vec3f,
  @location(2) seed: f32,
}

// Must match flashAt() in src/lib/world/fireworks.ts.
fn flashAt(age: f32) -> f32 {
  return exp(-age * 2.4) + 0.18 * exp(-age * 0.7);
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> HaloOut {
  let shell = shells[instance];
  let age = halo.time - shell.time;
  var out: HaloOut;
  if (age < 0.0 || age > 7.0 || halo.fade <= 0.0) {
    out.clip = vec4f(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let c = corners[vertex];
  // The smoke spreads a little and sinks as it lingers.
  let radius = shell.radius * (1.5 + 0.9 * (1.0 - exp(-age * 2.0)));
  let center = shell.burst - vec3f(0.0, age * 0.25, 0.0);
  let position = center + (world.camRight * c.x + world.camUp * c.y) * radius;
  out.clip = world.viewProjection * vec4f(position, 1.0);
  out.quad = c;
  let tint = mix(shell.color, vec3f(1.0, 0.7, 0.4), 0.2);
  out.color = tint * flashAt(age) * shell.brightness * halo.fade * halo.gain * select(0.45, 0.32, shell.willow > 0.5);
  out.seed = f32(instance) * 7.31;
  return out;
}

@fragment fn fs_main(input: HaloOut) -> @location(0) vec4f {
  let r = length(input.quad);
  if (r >= 1.0) {
    discard;
  }
  // A broad, flat-topped falloff: lit air around the burst, not a bright core.
  let edge = 1.0 - smoothstep(0.15, 1.0, r);
  let falloff = edge * edge;
  // Brushy, smoky mottling so the glow reads as lit air, not a disc.
  let mottle = 0.65 + 0.7 * valueNoise(input.quad * 2.6 + vec2f(input.seed, input.seed * 0.37));
  return vec4f(input.color * falloff * mottle, 0.0);
}
