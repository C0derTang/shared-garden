import { World, valueNoise } from "../shaders/common.wgsl";
import { Shell, unpackColor } from "./fireworks-common.wgsl";

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
  return exp(-age * 2.6) + 0.22 * exp(-age * 0.55);
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> HaloOut {
  let shell = shells[instance];
  let age = halo.time - shell.time;
  var out: HaloOut;
  if (age < 0.0 || age > 8.0 || halo.fade <= 0.0) {
    out.clip = vec4f(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let c = corners[vertex];
  // The smoke spreads a little and sinks as it lingers.
  let radius = shell.radius * (1.6 + 1.0 * (1.0 - exp(-age * 1.6)));
  let center = shell.burst - vec3f(0.0, age * 0.3, 0.0);
  let position = center + (world.camRight * c.x + world.camUp * c.y) * radius;
  out.clip = world.viewProjection * vec4f(position, 1.0);
  out.quad = c;
  // A bright flash of the burst's colour, then smoke tinted by its cooling hue.
  let smoke = mix(unpackColor(shell.fade), vec3f(0.55, 0.45, 0.5), 0.35);
  let tint = mix(shell.color, smoke, smoothstep(0.2, 2.0, age));
  // It swells with the opening stars rather than flashing white at once.
  out.color = tint * flashAt(age) * smoothstep(0.0, 0.3, age) * shell.brightness * halo.fade * halo.gain * select(0.32, 0.22, shell.willow > 0.5);
  out.seed = f32(instance) * 7.31;
  return out;
}

@fragment fn fs_main(input: HaloOut) -> @location(0) vec4f {
  let r = length(input.quad);
  if (r >= 1.0) {
    discard;
  }
  // A soft falloff: lit air around the burst, not a disc.
  let falloff = exp(-r * r * 3.2) * (1.0 - r * r);
  // Brushy, smoky mottling so the glow reads as lit air, not a disc.
  let mottle = 0.65 + 0.7 * valueNoise(input.quad * 2.6 + vec2f(input.seed, input.seed * 0.37));
  return vec4f(input.color * falloff * mottle, 0.0);
}
