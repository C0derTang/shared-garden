import { World } from "../shaders/common.wgsl";
import { KIND_COMET, KIND_CRACKLE, KIND_ROCKET, KIND_TRAIL, KIND_WILLOW, Spark, SparkState, sparkHash } from "./fireworks-common.wgsl";

// Every live particle as a soft, motion-stretched streak facing the camera:
// white-hot at the burst, its own colour as it spreads, cooling to embers as
// it falls. HDR intensity above ~1.1 blooms in the world's glow.
struct SparkView {
  // Height in pixels of the target being drawn (for a minimum streak width).
  viewportHeight: f32,
  // 0..1 overall strength (the still sky fades away with it).
  fade: f32,
  // Seconds for the crackle's twinkle (frozen for the still sky).
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

const EMBER = vec3f(1.0, 0.42, 0.14);
const HOT = vec3f(1.0, 0.93, 0.82);
const GOLD = vec3f(1.0, 0.68, 0.28);

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
  let flash = exp(-st.age * 11.0);
  var color = s.color;
  var bright = 1.0;
  var trail = s.trail;

  if (s.kind == KIND_ROCKET) {
    bright = 2.6 + 0.8 * sparkHash(floor(view.time * 30.0) + s.seed * 91.0);
  } else if (s.kind == KIND_TRAIL) {
    let twinkle = step(0.35, sparkHash(floor(view.time * 22.0) + s.seed * 53.0));
    bright = 2.2 * pow(1.0 - x, 2.0) * mix(0.25, 1.0, twinkle);
    color = mix(HOT, GOLD, x);
  } else if (s.kind == KIND_WILLOW) {
    bright = (0.9 + 3.0 * flash) * pow(1.0 - x, 1.1);
    color = mix(mix(GOLD, HOT, flash), EMBER, smoothstep(0.35, 1.0, x));
    // The streak lengthens into hanging willow strands as it slows.
    trail = s.trail * (1.0 + 2.2 * x);
  } else {
    // Stars, comets and crackle: a white flash, their colour, then embers.
    let sustain = 1.0 - smoothstep(0.5, 1.0, x);
    bright = (1.5 + 2.6 * flash) * mix(1.0, 0.45, x) * (0.25 + 0.75 * sustain) * (1.0 - smoothstep(0.85, 1.0, x));
    color = mix(color, HOT, flash * 0.6);
    color = mix(color, EMBER, smoothstep(0.55, 1.0, x) * 0.7);
    if (s.kind == KIND_COMET) {
      color = mix(color, GOLD, smoothstep(0.35, 0.8, x) * 0.6);
    }
    if (s.kind == KIND_CRACKLE && x > 0.42) {
      // Crackling: bright white pops on a dim body.
      let pop = step(0.62, sparkHash(floor(view.time * 20.0 + s.seed * 7.0) + s.seed * 131.0));
      bright *= mix(0.2, 3.2, pop);
      color = mix(EMBER, HOT, pop);
    }
  }
  bright *= 1.6 * view.fade * view.gain;
  if (bright < 0.01) {
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
  // At least ~1.3 pixels wide: |row 1 of view-projection| is the projection's y scale.
  let yScale = length(vec3f(world.viewProjection[0][1], world.viewProjection[1][1], world.viewProjection[2][1]));
  let pixel = dist * 2.0 / max(yScale * view.viewportHeight, 1.0);
  let width = max(s.size, pixel * 1.3);
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
  let core = exp(-d * d * 2.6);
  // Brightest at the head, thinning toward the tail.
  let tailFade = select(1.0, mix(0.1, 1.0, clamp(a / max(span, 1e-4), 0.0, 1.0)), span > 1e-4);
  let intensity = core * tailFade * tailFade;
  let color = input.color * intensity;
  if (max(color.r, max(color.g, color.b)) < 0.015) {
    discard;
  }
  // Alpha: a near-distance code, so the painterly filter keeps the sparks as
  // small strokes instead of smearing them like the far sky.
  return vec4f(color, 0.04);
}
