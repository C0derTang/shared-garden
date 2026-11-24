import { DriftSeed, DriftState, MODE_OFF, MODE_STILL, qmul, qrotate } from "./seed-drift-common.wgsl";

// One thread per seed. Attached seeds wait; as each lets go it is pushed
// outward, then eases into the breeze (a pappus is mostly drag), is lifted
// as it climbs, curls through gentle turbulence and tumbles: its pappus
// swings toward the air streaming past it, overshoots and rights itself,
// spinning slowly about its own axis. It fades into the sky late in its flight.
struct DriftSim {
  // Drift-clock seconds after this step.
  time: f32,
  // Seconds advanced by this step.
  dt: f32,
  // Seed slots to simulate.
  count: f32,
  pad: f32,
}

@group(0) @binding(0) var<storage, read> seeds: array<DriftSeed>;
@group(0) @binding(1) var<storage, read_write> states: array<DriftState>;
@group(0) @binding(2) var<uniform> sim: DriftSim;

// Smooth, divergence-light swirls on the scale of the plant.
fn eddies(p: vec3f, t: f32) -> vec3f {
  return vec3f(
    sin(p.y * 7.1 + t * 1.3) + 0.5 * sin(p.z * 5.3 - t * 0.9),
    0.6 * sin(p.x * 6.1 - t * 1.1) + 0.4 * sin(p.z * 8.3 + t * 0.7),
    cos(p.x * 5.7 + p.y * 6.9 + t * 1.0) + 0.4 * sin(p.y * 4.3 - t * 1.4),
  );
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (f32(i) >= sim.count) {
    return;
  }
  let s = seeds[i];
  var st = states[i];
  let mode = s.motion.w;
  if (abs(mode - MODE_OFF) < 0.5) {
    st.spin.w = 0.0;
    states[i] = st;
    return;
  }
  let release = s.pivot.w;
  if (st.position.w != release) {
    // A new blow in this slot: start at rest, attached.
    st.position = vec4f(s.pivot.xyz, release);
    st.velocity = vec4f(0.0, 0.0, 0.0, -1.0);
    st.rotation = vec4f(0.0, 0.0, 0.0, 1.0);
    st.spin = vec4f(0.0, 0.0, 0.0, 1.0);
  }
  let age = sim.time - release;
  let life = s.axis.w;
  if (abs(mode - MODE_STILL) < 0.5) {
    // Reduced motion: no drift; the puff fades away over the golden head.
    st.spin.w = 1.0 - smoothstep(0.0, life, max(age, 0.0));
    states[i] = st;
    return;
  }
  if (age < 0.0) {
    states[i] = st;
    return;
  }
  let dt = sim.dt;
  let axis = normalize(s.axis.xyz);
  var v = st.velocity.xyz;
  if (st.velocity.w < 0.0) {
    // Letting go: a little push outward, already leaning with the breeze.
    v = axis * s.pappusShape.w + s.wind.xyz * 0.3;
  }
  let speed = max(length(s.wind.xyz), 1e-4);
  let rand = s.pappusBase.w;
  // The breeze freshens after the first seeds go, then carries them up and away.
  var air = s.wind.xyz * (0.55 + 0.45 * smoothstep(0.0, 1.2, age));
  air += eddies(st.position.xyz * (1.0 / max(s.extra.y, 1e-3)) + vec3f(rand * 3.0), sim.time * 0.8 + rand * 6.0) * s.extra.x * speed;
  air.y += s.wind.w * smoothstep(0.15, 1.8, age);
  v += (air - v) * (1.0 - exp(-dt / max(s.front.w, 0.05)));
  st.position = vec4f(st.position.xyz + v * dt, release);
  st.velocity = vec4f(v, age);

  // Tumbling: the pappus swings toward the air streaming past it (and up).
  var q = st.rotation;
  var w = st.spin.xyz;
  let now = qrotate(q, axis);
  let flow = (air - v) / speed;
  let goal = normalize(vec3f(0.0, 1.0, 0.0) + flow * 0.9);
  var torque = cross(now, goal) * 4.0;
  if (dot(now, goal) < -0.9) {
    // Hanging upside down: tip over sideways instead of balancing.
    torque += normalize(cross(now, s.front.xyz) + vec3f(1e-4, 0.0, 0.0)) * 3.0;
  }
  let wobble = s.motion.z;
  torque += vec3f(sin(sim.time * 1.7 + rand * 31.0), sin(sim.time * 1.3 + rand * 17.0), sin(sim.time * 2.1 + rand * 7.0)) * wobble * 2.2;
  w += (torque - w * 1.4) * dt;
  // A slow spin about its own axis.
  w += now * (s.motion.y - dot(w, now)) * min(1.0, dt * 2.0);
  q = normalize(q + qmul(vec4f(w, 0.0), q) * (0.5 * dt));
  st.rotation = q;
  st.spin = vec4f(w, 1.0 - smoothstep(life * 0.42, life, age));
  states[i] = st;
}
