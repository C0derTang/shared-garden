// Backdrop of the flower studio (hero close-up and gallery): a deep, softly
// brushed ground like a botanical plate, warmed or cooled by the time of day.
// Style 1 ("sky") paints a darkened, colour-graded impression of the garden
// behind the flower instead: the sky for the time of day over a hazy horizon
// and a dim meadow, in loose dabs and brush passes.
import { valueNoise } from "../shaders/common.wgsl";

struct Backdrop {
  top: vec3f,
  grain: f32,
  bottom: vec3f,
  /** 0: botanical plate; 1: painted sky and meadow. */
  style: f32,
  glow: vec3f,
  glowY: f32,
  ground: vec3f,
  horizonY: f32,
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
  if (backdrop.style > 0.5) {
    // Sky to a hazy horizon, then a dim meadow, with a ragged painted edge.
    let edge = backdrop.horizonY + (valueNoise(vec2f(uv.x * 7.0, 3.1)) - 0.5) * 0.05 + (valueNoise(vec2f(uv.x * 23.0, 8.7)) - 0.5) * 0.015;
    let sky = mix(backdrop.top, backdrop.bottom, smoothstep(0.0, backdrop.horizonY, uv.y));
    let field = mix(backdrop.bottom * 0.55 + backdrop.ground * 0.45, backdrop.ground, smoothstep(edge, 1.0, uv.y));
    color = mix(sky, field, smoothstep(edge - 0.012, edge + 0.03, uv.y));
    // Broad impressionist dabs of lighter and warmer paint.
    let dab = valueNoise(uv * vec2f(5.0, 8.0) + vec2f(1.7, 4.2)) - 0.5;
    let warm = valueNoise(uv * vec2f(3.0, 5.0) + vec2f(9.1, 0.4)) - 0.5;
    color *= 1.0 + dab * 0.35;
    color += vec3f(warm * 0.5, warm * 0.25, -warm * 0.1) * length(backdrop.bottom) * 0.25;
  }
  // A broad warm bloom of light behind the subject.
  let d = uv - vec2f(0.5, backdrop.glowY);
  color += backdrop.glow * exp(-dot(d, d) * 5.0);
  // Loose, layered horizontal brush passes.
  // In the sky style the passes lean a little, like quick diagonal strokes.
  let lean = uv.x * backdrop.style * 0.35;
  let strokes = valueNoise(vec2f(uv.x * 3.0, (uv.y + lean) * 26.0)) * 0.6 + valueNoise(vec2f(uv.x * 9.0 + 3.0, (uv.y + lean) * 70.0)) * 0.4;
  color *= 1.0 + (strokes - 0.5) * (0.18 + 0.12 * backdrop.style) * backdrop.grain;
  return vec4f(color, 1.0);
}
