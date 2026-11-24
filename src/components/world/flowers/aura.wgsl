// The soft coloured aura behind each flower head (botanical-plate glow),
// brighter for the hovered flower. Additive; never writes depth or alpha.
import { World } from "../shaders/common.wgsl";
import { FlowerParams } from "./flower-core.wgsl";

@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var<uniform> flowers: FlowerParams;

struct AuraIn {
  @builtin(vertex_index) vertex: u32,
  // center xyz, radius
  @location(0) sphere: vec4f,
  // rgb, flower index
  @location(1) paint: vec4f,
}

struct AuraOut {
  @builtin(position) clip: vec4f,
  @location(0) corner: vec2f,
  @location(1) @interpolate(flat) color: vec3f,
}

@vertex fn vs_main(input: AuraIn) -> AuraOut {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[input.vertex];
  let toEye = normalize(world.eye - input.sphere.xyz);
  // Sit behind the head so the petals stay crisp in front of their glow.
  let center = input.sphere.xyz - toEye * input.sphere.w * 0.45;
  let p = center + (world.camRight * c.x + world.camUp * c.y) * input.sphere.w;
  var out: AuraOut;
  out.clip = world.viewProjection * vec4f(p, 1.0);
  out.corner = c;
  let hovered = select(1.0, 2.4, abs(input.paint.w - flowers.hovered) < 0.5);
  out.color = input.paint.rgb * flowers.aura * hovered;
  return out;
}

@fragment fn fs_main(input: AuraOut) -> @location(0) vec4f {
  let r = length(input.corner);
  // Gaussian with no visible rim.
  let falloff = exp(-r * r * 4.5) * (1.0 - smoothstep(0.6, 1.0, r));
  return vec4f(input.color * falloff, 0.0);
}
