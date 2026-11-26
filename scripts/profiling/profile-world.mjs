/* global window, document */
// Optional local harness; install/provide Playwright outside app dependencies.
// Start npm run dev. Set PLAYWRIGHT_MODULE to its index.mjs if not installed here,
// and CHROMIUM_EXECUTABLE to use a specific cached Chromium binary.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = resolve(process.env.PROFILE_OUTPUT || "/tmp/ccapp-218-profile");
mkdirSync(output, { recursive: true });
const shaders = {
  baseline: readFileSync(new URL("../fixtures/kuwahara-reference.wgsl", import.meta.url), "utf8"),
  candidate: readFileSync(new URL("../../src/components/world/post/kuwahara.wgsl", import.meta.url), "utf8"),
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ["--enable-unsafe-webgpu"] });
const results = { browser: browser.version(), motion: "reduce", cases: [] };
try {
  for (const [view, viewport, dpr] of [["desktop", { width: 1280, height: 800 }, 1], ["phone", { width: 390, height: 844 }, 2]]) {
    for (const composition of ["landing", "world"]) {
      // ABBA limits order/thermal bias while comparing one shader at a time.
      for (const [run, variant] of ["baseline", "candidate", "candidate", "baseline"].entries()) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, reducedMotion: "reduce" });
        try {
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
          await page.addInitScript((shader) => { window.__profileShader = shader; }, shaders[variant]);
          await page.addInitScript({ path: new URL("./world-gpu-hook.js", import.meta.url).pathname });
          await page.goto(`${process.env.BASE_URL || "http://localhost:3218"}/dev/${composition}?sky=dusk&member=1&planted=26`, { timeout: 180000, waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => window.__profileDevice && document.querySelector("canvas")?.width > 0, { timeout: 90000 });
          await page.waitForTimeout(4000);
          await page.evaluate(() => { window.__gpuFrames = []; window.__submitIntervals = []; window.__profileCapture = true; });
          await page.waitForFunction(() => window.__gpuFrames.length >= 90, { timeout: 90000 });
          const data = await page.evaluate(() => {
            window.__profileCapture = false;
            return { adapter: window.__profileAdapter, frames: window.__gpuFrames.slice(10, 90), submitIntervalsMs: window.__submitIntervals.slice(10, 90), canvas: [document.querySelector("canvas").width, document.querySelector("canvas").height] };
          });
          const screenshot = `${view}-${composition}-${variant}-${run}.png`;
          await page.screenshot({ path: resolve(output, screenshot) });
          results.cases.push({ view, composition, variant, run, viewport, dpr, errors, screenshot, ...data });
          writeFileSync(resolve(output, "measurements.json"), JSON.stringify(results, null, 2));
          console.log(view, composition, variant, run, data.frames.length, errors);
        } finally { await context.close(); }
      }
    }
  }
} finally { await browser.close(); }
