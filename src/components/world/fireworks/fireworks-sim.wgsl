import { KIND_ROCKET, KIND_WILLOW, Spark, SparkState, rocketPosition } from "./fireworks-common.wgsl";

// One thread per particle: rockets follow their analytic flight; every other
// spark is born at its spawn time and then integrates gravity, air drag and
// a slow breeze that carries embers as they lose speed.
struct SimParams {
  // Show seconds after this step.
  time: f32,
  // Seconds advanced by this step.
  dt: f32,
  // Particles in this show.
  count: f32,
  gravity: f32,
  wind: vec3f,
  turbulence: f32,
}

@group(0) @binding(0) var<storage, read> sparks: array<Spark>;
@group(0) @binding(1) var<storage, read_write> states: array<SparkState>;
@group(0) @binding(2) var<uniform> sim: SimParams;

fn breeze(p: vec3f, t: f32) -> vec3f {
  return vec3f(
    sin(p.y * 0.9 + t * 0.6) + 0.5 * sin(p.z * 1.7 - t * 0.4),
    0.35 * sin(p.x * 1.1 - t * 0.7),
    cos(p.x * 0.8 + p.y * 1.3 + t * 0.5),
  );
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (f32(i) >= sim.count) {
    return;
  }
  let s = sparks[i];
  var st = states[i];
  let age = sim.time - s.spawn;
  if (age < 0.0 || age > s.life) {
    st.age = -1.0;
    states[i] = st;
    return;
  }

  if (s.kind == KIND_ROCKET) {
    let flight = s.life;
    let p = rocketPosition(s.origin, s.velocity, s.spawn, flight, age);
    let ahead = rocketPosition(s.origin, s.velocity, s.spawn, flight, min(age + 0.02, flight));
    st.position = p;
    st.velocity = (ahead - p) / 0.02;
    st.age = age;
    st.heat = 1.0;
  } else if (st.age < 0.0) {
    // Born this step (or caught up after a jump): ballistic from its origin.
    st.position = s.origin + s.velocity * age;
    st.velocity = s.velocity;
    st.age = age;
    st.heat = 1.0;
  } else {
    let dt = sim.dt;
    var v = st.velocity;
    v.y -= sim.gravity * s.gravity * dt;
    let slow = 1.0 - clamp(length(v) / 5.0, 0.0, 1.0);
    let sway = select(1.0, 1.8, s.kind == KIND_WILLOW);
    v += (sim.wind + breeze(st.position * 0.4, sim.time) * sim.turbulence * sway) * slow * dt;
    v *= exp(-s.drag * dt);
    st.position += v * dt;
    st.velocity = v;
    st.age = age;
    st.heat = clamp(1.0 - age / s.life, 0.0, 1.0);
  }
  states[i] = st;
}
