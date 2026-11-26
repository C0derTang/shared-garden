/* global localStorage, URL */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import console from "node:console";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.BASE_URL || "http://localhost:3221";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = resolve(process.env.PROFILE_OUTPUT || "/tmp/ccapp-220-arrival"); mkdirSync(output, { recursive: true });
const state = JSON.parse(readFileSync("scripts/profiling/fixtures/type-area-garden.json", "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ["--enable-unsafe-webgpu"] });
const observations = [];
try {
  for (const [view, viewport, deviceScaleFactor] of [["desktop", { width: 1280, height: 800 }, 1], ["phone", { width: 390, height: 844 }, 2]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: view === "phone", reducedMotion: "no-preference" });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.addInitScript(() => localStorage.setItem("garden-v2:guide-seen:1", "1"));
    await page.route("**/*", async (route) => {
      const action = route.request().headers()["next-action"];
      assert.equal(new URL(route.request().url()).origin, new URL(base).origin);
      if (!action) return route.continue();
      const name = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")).node[action]?.exportedName;
      const result = name === "refreshGardenV2" ? { state, error: null } : name === "readPrivateInteraction" ? { state: { status: "unavailable" }, error: null } : null;
      assert(result, `Unexpected synthetic action ${name}`);
      await route.fulfill({ status: 200, contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(result)}\n` });
    });
    try {
      await page.goto(`${base}/dev/garden-areas?arrival=1`);
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      await page.locator('[data-arrival-light]').waitFor();
      assert.equal(await page.getByRole("group", { name: "Walk around the garden" }).count(), 0);
      await page.screenshot({ path: resolve(output, `${view}-arrival.png`) });
      await page.locator('[data-garden-world][data-status="ready"]').waitFor();
      await page.locator('[data-garden-world]').focus(); await page.keyboard.down("w");
      await page.getByRole("group", { name: "Walk around the garden" }).waitFor();
      await page.keyboard.up("w");
      assert.equal(await page.locator('[data-arrival-light]').count(), 0);
      const title = await page.locator('[data-caption="title"]').boundingBox();
      assert(title && title.y >= 0 && title.y + title.height <= viewport.height, "Title fits arrival's settled camera");
      await page.screenshot({ path: resolve(output, `${view}-settled.png`) });
      await page.locator('[data-garden-world]').focus(); await page.keyboard.down("d"); await page.waitForTimeout(500); await page.keyboard.up("d");
      await page.screenshot({ path: resolve(output, `${view}-walking.png`) });
      assert.deepEqual(errors, []);
      observations.push({ view, motion: "normal", arrivalBlocksWalking: true, arrivalSettles: true, titleBounds: title, keyboardWalk: true, errors });
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
writeFileSync(resolve(output, "observations.json"), JSON.stringify(observations, null, 2));
console.log(JSON.stringify(observations, null, 2));
