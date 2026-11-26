/* global window, document */
// Immutable pre218 shader versus optimized walking, then retained219 camera
// versus walking. Camera comparison changes framing, not quality settings.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = resolve(process.env.PROFILE_OUTPUT || "/tmp/ccapp-220-profile");
mkdirSync(output, { recursive: true });
const baseline = readFileSync(new URL("../fixtures/kuwahara-reference.wgsl", import.meta.url), "utf8");
const shader = readFileSync(new URL("../../src/components/world/post/kuwahara.wgsl", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ["--enable-unsafe-webgpu"] });
const results = { browser: browser.version(), motion: "reduce", comparison: "ABBA shader comparison against immutable pre218 shader in the walking scene; ABBA camera comparison against219 type-area journey, same26flowers and quality settings; camera framing differs", cases: [] };
try {
  for (const [view, viewport, dpr] of [["desktop", { width: 1280, height: 800 }, 1], ["phone", { width: 390, height: 844 }, 2]]) {
    for (const [run, layout] of ["baseline", "walking", "walking", "baseline", "areas", "walking", "walking", "areas"].entries()) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        await page.addInitScript((source) => { window.__profileShader = source; }, layout === "baseline" ? baseline : shader);
        await page.addInitScript({ path: new URL("./world-gpu-hook.js", import.meta.url).pathname });
        await page.goto(`${process.env.BASE_URL || "http://localhost:3221"}/dev/world?sky=dusk&planted=26&areas=1${layout !== "areas" ? "&walking=1" : ""}`);
        await page.waitForFunction(() => window.__profileDevice && document.querySelector('[data-status="ready"]'));
        await page.waitForTimeout(4000);
        await page.evaluate(() => { window.__gpuFrames = []; window.__submitIntervals = []; window.__profileCapture = true; });
        await page.waitForFunction(() => window.__gpuFrames.length >= 90);
        const data = await page.evaluate(() => {
          window.__profileCapture = false;
          return { adapter: window.__profileAdapter, frames: window.__gpuFrames.slice(10, 90), submitIntervalsMs: window.__submitIntervals.slice(10, 90), canvas: [document.querySelector("canvas").width, document.querySelector("canvas").height] };
        });
        await page.screenshot({ path: resolve(output, `${view}-${layout}-${run}.png`) });
        results.cases.push({ view, layout, pair: run < 4 ? "shader" : "camera", run, viewport, dpr, errors, ...data });
        writeFileSync(resolve(output, "measurements.json"), JSON.stringify(results, null, 2));
        console.log(view, layout, run, data.frames.length, errors);
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }
