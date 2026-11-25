import { World, hash21 } from "./common.wgsl";

@group(0) @binding(0) var<uniform> world: World;

struct MoteOut {
  @builtin(position) clip: vec4f,
  @location(0) quad: vec2f,
  @location(1) brightness: f32,
}

// Drifting pollen by day, glowing fireflies by night. No buffers: each
// instance derives its home and drift from its index.
@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> MoteOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let id = f32(instance);
  let home = vec3f(
    (hash21(vec2f(id, 1.0)) - 0.5) * 18.0,
    0.3 + hash21(vec2f(id, 2.0)) * 2.2,
    4.0 - hash21(vec2f(id, 3.0)) * 26.0,
  );
  let t = world.time * (0.15 + hash21(vec2f(id, 4.0)) * 0.2) + id * 1.7;
  let drift = vec3f(sin(t) * 0.6, sin(t * 1.3 + 2.0) * 0.25, cos(t * 0.8) * 0.5);
  let center = home + drift;

  // Camera-facing billboard.
  let right = world.camRight;
  let up = world.camUp;
  let size = mix(0.025, 0.05, hash21(vec2f(id, 5.0))) * (1.0 + world.night * 0.6);
  let corner = corners[vertex];
  let position = center + (right * corner.x + up * corner.y) * size;

  var out: MoteOut;
  out.clip = world.viewProjection * vec4f(position, 1.0);
  out.quad = corner;
  let blink = 0.5 + 0.5 * sin(world.time * (0.8 + hash21(vec2f(id, 6.0))) + id);
  out.brightness = mix(0.35, 0.4 + 1.6 * blink, world.night);
  return out;
}

@fragment fn fs_main(input: MoteOut) -> @location(0) vec4f {
  let falloff = smoothstep(1.0, 0.0, length(input.quad));
  let dayColor = vec3f(1.0, 0.93, 0.72);
  let nightColor = vec3f(0.85, 1.0, 0.45);
  let color = mix(dayColor, nightColor, world.night) * input.brightness * falloff * falloff;
  return vec4f(color, falloff * 0.6);
}
