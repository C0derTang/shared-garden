import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import console from "node:console";
const directory = resolve(process.env.PROFILE_OUTPUT || "/tmp/ccapp-219-profile");
const data = JSON.parse(readFileSync(resolve(directory, "measurements.json"), "utf8"));
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
const stats = (values) => ({ median: quantile(values, 0.5), p95: quantile(values, 0.95) });
const summary = { browser: data.browser, comparison: data.comparison, motion: data.motion, unit: "milliseconds unless named otherwise", cases: [] };
for (const view of ["desktop", "phone"]) {
  for (const layout of ["mixed", "areas"]) {
    const cases = data.cases.filter((c) => c.view === view && c.layout === layout);
    const frames = cases.flatMap((c) => c.frames);
    summary.cases.push({
      view, layout, samples: frames.length, adapter: cases[0].adapter,
      gpuEnvelopeMs: stats(frames.map((f) => f.gpuEnvelopeMs)),
      kuwaharaSpanMs: stats(frames.map((f) => f.spans["10:garden-world.kuwahara.pipeline"])),
      encodeMs: stats(frames.map((f) => f.encodeMs)),
      submitIntervalMs: stats(cases.flatMap((c) => c.submitIntervalsMs)),
      runEnvelopeMedians: cases.map((c) => stats(c.frames.map((f) => f.gpuEnvelopeMs)).median),
      errors: cases.flatMap((c) => c.errors),
    });
  }
}
writeFileSync(resolve(directory, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
