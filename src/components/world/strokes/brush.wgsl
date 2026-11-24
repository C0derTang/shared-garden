// The brush: shared, pure WGSL helpers for painting a stroke quad.
// uv.x runs along the stroke (0 at touch-down, 1 at lift-off) and uv.y across
// it (-1..1). Import these from any shader that paints into the world.
import { valueNoise } from "../shaders/common.wgsl";

// Returns (alpha, bristle shade in -0.5..0.5) for a loaded brush with
// `dryness` 0 (wet, solid) .. 1 (dry, broken bristles toward the tail).
export fn bristleMask(uv: vec2f, seed: f32, dryness: f32) -> vec2f {
  let u = clamp(uv.x, 0.0, 1.0);
  // Blunt rounded head, gently swelling body, tapering tail with ragged edges.
  let head = sqrt(clamp(u / 0.12, 0.0, 1.0));
  let tail = 1.0 - smoothstep(0.55, 1.0, u) * 0.75;
  let ragged = (valueNoise(vec2f(u * 7.0 + seed * 19.0, seed * 5.0)) - 0.5) * 0.3;
  let halfWidth = max(head * tail + ragged, 0.05);
  let across = abs(uv.y) / halfWidth;
  var alpha = 1.0 - smoothstep(0.78, 1.0, across);

  // Bristle grooves run the length of the stroke.
  let lane = uv.y * 6.5 + seed * 37.0;
  let bristle = valueNoise(vec2f(lane, u * 1.2 + seed * 3.0)) * 0.65 + valueNoise(vec2f(lane * 2.7, u * 2.5 + seed)) * 0.35;

  // Dry brush: the paint runs out toward the tail and along the edges.
  let dry = dryness * (smoothstep(0.3, 1.0, u) * 0.8 + across * 0.35);
  alpha *= smoothstep(dry - 0.05, dry + 0.18, bristle);
  alpha *= smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.96, 1.0, u));
  return vec2f(alpha, bristle - 0.5);
}

// Streaky value variation within one stroke, as pigment pools in the grooves.
export fn bristleColor(color: vec3f, shade: f32, strength: f32) -> vec3f {
  return color * (1.0 + shade * strength);
}
