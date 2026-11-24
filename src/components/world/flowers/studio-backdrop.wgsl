// Backdrop of the flower studio (hero close-up and gallery): a deep, softly
// brushed ground like a botanical plate, warmed or cooled by the time of day.
import { valueNoise } from "../shaders/common.wgsl";

struct Backdrop {
  top: vec3f,
  grain: f32,
  bottom: vec3f,
  pad: f32,
  glow: vec3f,
  glowY: f32,
}

@group(0) @binding(0) var<uniform> backdrop: Backdrop;

struct Out {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32) -> Out {
  let p = vec2f(f32((vertex << 1u) & 2u), f32(vertex & 2u));
  var out: Out;
  out.clip = vec4f(p * 2.0 - 1.0, 1.0, 1.0);
  out.uv = vec2f(p.x, 1.0 - p.y);
  return out;
}

@fragment fn fs_main(input: Out) -> @location(0) vec4f {
  let uv = input.uv;
  var color = mix(backdrop.top, backdrop.bottom, smoothstep(0.0, 1.0, uv.y));
  // A broad warm bloom of light behind the subject.
  let d = uv - vec2f(0.5, backdrop.glowY);
  color += backdrop.glow * exp(-dot(d, d) * 5.0);
  // Loose, layered horizontal brush passes.
  let strokes = valueNoise(vec2f(uv.x * 3.0, uv.y * 26.0)) * 0.6 + valueNoise(vec2f(uv.x * 9.0 + 3.0, uv.y * 70.0)) * 0.4;
  color *= 1.0 + (strokes - 0.5) * 0.18 * backdrop.grain;
  return vec4f(color, 1.0);
}
