import { World } from "../shaders/common.wgsl";
import { KIND_COMET, KIND_CRACKLE, KIND_ROCKET, KIND_TRAIL, KIND_WILLOW, Spark, SparkState, sparkHash, unpackColor } from "./fireworks-common.wgsl";

// Every live particle as a luminous, motion-stretched streak facing the
// camera: white-hot at the burst, its own colour drifting to a second hue as
// it spreads, glittering, then cooling to embers. HDR intensity far above the
// night sky blooms into soft halos in the world's glow. The cores opt out of
// the painterly filter (scene alpha -1, like the flowers' close-up detail) so
// they stay crisp; the canvas streaks and the bloom still paint over them.
struct SparkView {
  // Height in pixels of the target being drawn (for a minimum streak width).
  viewportHeight: f32,
  // 0..1 overall strength (the still sky fades away with it).
  fade: f32,
  // Seconds for the twinkles (frozen for the still sky).
  time: f32,
  // Extra brightness for the lake's mirror image (it is darkened by fresnel).
  gain: f32,
}

@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var<storage, read> sparks: array<Spark>;
@group(0) @binding(2) var<storage, read> states: array<SparkState>;
@group(0) @binding(3) var<uniform> view: SparkView;

struct SparkOut {
  @builtin(position) clip: vec4f,
  // Along the streak from its tail (x) and across it (y), in world units.
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  // Streak length (x) and half width (y).
  @location(2) shape: vec2f,
}

const EMBER = vec3f(1.0, 0.38, 0.12);
const HOT = vec3f(1.0, 0.95, 0.86);
const GOLD = vec3f(1.0, 0.68, 0.26);
// Overall HDR level: sparks sit far above the night sky so they bloom.
const INTENSITY = 4.2;

fn hidden() -> SparkOut {
  var out: SparkOut;
  out.clip = vec4f(2.0, 2.0, 2.0, 1.0);
  return out;
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> SparkOut {
  let s = sparks[instance];
  let st = states[instance];
  if (st.age < 0.0 || view.fade <= 0.0) {
    return hidden();
  }
  let x = clamp(st.age / max(s.life, 1e-3), 0.0, 1.0);
  let flash = exp(-st.age * 9.0);
  // The star's own hue drifts toward its second colour as it burns.
  let drift = smoothstep(s.shift, min(s.shift + 0.4, 1.0), x);
  var color = mix(s.color, unpackColor(s.fade), drift);
  var bright = 1.0;
  var trail = s.trail;
  // Glitter: late, quick white twinkles on some stars.
  let glint = step(0.7, sparkHash(floor(view.time * 26.0 + s.seed * 13.0) + s.seed * 77.0));

  if (s.kind == KIND_ROCKET) {
    // Kindles as it climbs, so the launch does not flare on the water.
    bright = (2.0 + 0.8 * sparkHash(floor(view.time * 30.0) + s.seed * 91.0)) * smoothstep(0.0, 0.35, x);
    color = mix(HOT, GOLD, 0.35);
  } else if (s.kind == KIND_TRAIL) {
    bright = 1.6 * pow(1.0 - x, 1.6) * mix(0.3, 1.4, glint);
    color = mix(HOT, color, x);
  } else if (s.kind == KIND_WILLOW) {
    bright = (1.0 + 3.0 * flash) * pow(1.0 - x, 0.9);
    color = mix(mix(color, HOT, flash), EMBER, smoothstep(0.55, 1.0, x) * 0.6);
    // The streak lengthens into hanging willow strands as it slows.
    trail = s.trail * (1.0 + 2.4 * x);
    bright *= mix(1.0, mix(0.55, 1.8, glint), s.flicker * smoothstep(0.35, 0.6, x));
  } else {
    // Stars, comets and crackle: a white flash, their colours, then embers.
    let sustain = 1.0 - smoothstep(0.55, 1.0, x);
    bright = (1.3 + 1.8 * flash) * mix(1.0, 0.55, x) * (0.3 + 0.7 * sustain) * (1.0 - smoothstep(0.88, 1.0, x));
    color = mix(color, HOT, flash * 0.4);
    color = mix(color, EMBER, smoothstep(0.7, 1.0, x) * 0.55);
    if (s.kind == KIND_COMET) {
      color = mix(color, GOLD, smoothstep(0.4, 0.85, x) * 0.5);
    }
    if (s.kind == KIND_CRACKLE && x > 0.4) {
      // Crackling: bright white pops on a dim ember body.
      let pop = step(0.6, sparkHash(floor(view.time * 20.0 + s.seed * 7.0) + s.seed * 131.0));
      bright *= mix(0.25, 3.0, pop);
      color = mix(EMBER, HOT, pop);
    } else if (s.flicker > 0.0 && x > 0.45) {
      bright *= mix(0.5, 2.2, glint);
      color = mix(color, HOT, glint * 0.6);
    }
  }
  // Deepen the hues so HDR tone mapping keeps them coloured instead of washing to white.
  color = pow(max(color, vec3f(0.0)), vec3f(1.7));
  bright *= INTENSITY * view.fade * view.gain;
  if (bright < 0.02) {
    return hidden();
  }

  // Camera-facing streak from where the spark was `trail` seconds ago to where it is.
  let head = st.position;
  let tail = head - st.velocity * trail;
  let toEye = world.eye - head;
  let dist = max(length(toEye), 1e-3);
  let viewDir = toEye / dist;
  var along = head - tail;
  along -= viewDir * dot(along, viewDir);
  let reach = length(along);
  let axis = select(world.camUp, along / max(reach, 1e-5), reach > 1e-4);
  let side = normalize(cross(axis, viewDir));
  // At least ~1.8 pixels wide: |row 1 of view-projection| is the projection's y scale.
  let yScale = length(vec3f(world.viewProjection[0][1], world.viewProjection[1][1], world.viewProjection[2][1]));
  let pixel = dist * 2.0 / max(yScale * view.viewportHeight, 1.0);
  let width = max(s.size, pixel * 1.8);
  let span = select(reach, 0.0, reach <= 1e-4);

  var corners = array<vec2f, 6>(
    vec2f(0.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(0.0, -1.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
  );
  let c = corners[vertex];
  let a = mix(-width, span + width, c.x);
  let b = c.y * width;
  let tailEnd = head - axis * span;
  let position = tailEnd + axis * a + side * b;

  var out: SparkOut;
  out.clip = world.viewProjection * vec4f(position, 1.0);
  out.local = vec2f(a, b);
  out.color = color * bright;
  out.shape = vec2f(span, width);
  return out;
}

@fragment fn fs_main(input: SparkOut) -> @location(0) vec4f {
  let span = input.shape.x;
  let width = input.shape.y;
  let a = input.local.x;
  let b = input.local.y;
  // Distance to the streak's segment, as a fraction of its width.
  let beyond = max(max(-a, a - span), 0.0);
  let d = length(vec2f(beyond, b)) / width;
  let core = exp(-d * d * 2.4);
  // Brightest at the head, thinning toward the tail.
  let tailFade = select(1.0, mix(0.12, 1.0, clamp(a / max(span, 1e-4), 0.0, 1.0)), span > 1e-4);
  let intensity = core * tailFade * tailFade;
  let color = input.color * intensity;
  if (max(color.r, max(color.g, color.b)) < 0.05) {
    discard;
  }
  // Alpha -1: keep this crisp through the painterly filter (see distanceAlpha).
  return vec4f(color, -1.0);
}
