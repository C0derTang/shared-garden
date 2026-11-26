// Run explicitly with npm run test:paint on a machine with a native WebGPU adapter.
// Compare the shipped WGSL with the immutable pre-optimization shader on the GPU.
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import console from "node:console";
import assert from "node:assert/strict";
import { init, effect, target, sampler, frame } from "vgpu/node";
import { prepareShader } from "@vgpu/wgsl/prepare";

const gpu = await init();
try {
  const size = [64, 64];
  const source = target(gpu, { size, format: "rgba16float" });
  const tensor = target(gpu, { size, format: "rgba16float" });
  // Edges/noise, protected detail alpha, near/far pixels and image boundaries.
  const sourcePattern = effect(gpu, prepareShader(`
    @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
      let cell = floor(uv * 64.0);
      let n = fract(sin(dot(cell, vec2f(12.9898, 78.233))) * 43758.5453);
      return vec4f(uv.x, select(0.15, 0.85, uv.x > uv.y), 0.2 + n * 0.6,
        select(uv.y, -0.3, uv.x < 0.25));
    }
  `));
  // Degenerate zero tensors and rank-one tensors at all orientations.
  const tensorPattern = effect(gpu, prepareShader(`
    @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
      let angle = uv.x * 6.2831853;
      let axis = vec2f(cos(angle), sin(angle));
      let strength = select(uv.y, 0.0, uv.y < 0.1);
      return vec4f(strength * axis.x * axis.x, strength * axis.x * axis.y,
        strength * axis.y * axis.y, 1.0);
    }
  `));
  frame(gpu, (f) => { f.pass(source, sourcePattern); f.pass(tensor, tensorPattern); });
  const linearSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
  const shaders = [
    new URL("./fixtures/kuwahara-reference.wgsl", import.meta.url),
    new URL("../src/components/world/post/kuwahara.wgsl", import.meta.url),
  ];
  // DPR 1/2 kernels, the stride transition, and the protected-detail radius.
  for (const [radiusNear, radiusFar] of [[2.5, 5.5], [5, 11], [4.99, 5.01], [1.5, 1.5]]) {
    const outputs = [];
    for (const file of shaders) {
      // Float readback catches differences hidden by display quantization.
      const out = target(gpu, { size, format: "rgba32float" });
      const paint = effect(gpu, prepareShader(readFileSync(file, "utf8")), {
        set: { source, tensor, linearSampler, params: { texel: [1 / 64, 1 / 64], radiusNear, radiusFar } },
      });
      paint.draw(out);
      const bytes = await out.color.read({ mipLevel: 0, region: "all" });
      outputs.push(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4));
    }
    let maxError = 0;
    for (let i = 0; i < outputs[0].length; i++) {
      const delta = Math.abs(outputs[0][i] - outputs[1][i]);
      assert(Number.isFinite(delta), `Nonfinite output at channel ${i}`);
      maxError = Math.max(maxError, delta);
      if (i % 4 === 3) assert.equal(outputs[0][i], outputs[1][i], "Depth/detail alpha changed");
    }
    // Pairing changes floating-point accumulation order. This absolute bound
    // (linear color units) is substantially smaller than one 8-bit color step.
    assert(maxError <= 2e-5, `Kuwahara mismatch: ${maxError}`);
    console.log(JSON.stringify({ radiusNear, radiusFar, maxError, tolerance: 2e-5 }));
  }
} finally {
  gpu.dispose();
}
