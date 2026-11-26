import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import sharp from "sharp";
const directory = resolve(process.env.PROFILE_OUTPUT || "/tmp/ccapp-218-profile");
const data = JSON.parse(readFileSync(resolve(directory, "measurements.json"), "utf8"));
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
const stats = (values) => ({ median: quantile(values, 0.5), p95: quantile(values, 0.95) });
const summary = { browser: data.browser, motion: data.motion, unit: "milliseconds unless named otherwise", cases: [] };
for (const view of ["desktop", "phone"]) {
  for (const composition of ["landing", "world"]) {
    const comparison = { view, composition, variants: {} };
    for (const variant of ["baseline", "candidate"]) {
      const cases = data.cases.filter((c) => c.view === view && c.composition === composition && c.variant === variant);
      const frames = cases.flatMap((c) => c.frames);
      comparison.variants[variant] = {
        samples: frames.length,
        gpuEnvelopeMs: stats(frames.map((f) => f.gpuEnvelopeMs)),
        kuwaharaSpanMs: stats(frames.map((f) => f.spans["10:garden-world.kuwahara.pipeline"])),
        encodeMs: stats(frames.map((f) => f.encodeMs)),
        submitIntervalMs: stats(cases.flatMap((c) => c.submitIntervalsMs)),
        runEnvelopeMedians: cases.map((c) => stats(c.frames.map((f) => f.gpuEnvelopeMs)).median),
        errors: cases.flatMap((c) => c.errors),
      };
    }
    // Deterministic fixed-motion screenshots: compare displayed RGB bytes.
    const prefix = resolve(directory, `${view}-${composition}`);
    const a = await sharp(`${prefix}-baseline-0.png`).removeAlpha().raw().toBuffer();
    const b = await sharp(`${prefix}-candidate-1.png`).removeAlpha().raw().toBuffer();
    let maximum = 0, sum = 0, changed = 0;
    for (let i = 0; i < a.length; i++) {
      const delta = Math.abs(a[i] - b[i]);
      maximum = Math.max(maximum, delta);
      sum += delta;
      if (delta) changed++;
    }
    comparison.pixels = { maximumByteDifference: maximum, meanByteDifference: sum / a.length, changedChannelFraction: changed / a.length };
    summary.cases.push(comparison);
  }
}
writeFileSync(resolve(directory, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
