/* global localStorage, document, URL */
// Responsive controls regression against the actual GardenV2 synthetic fixture.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import console from "node:console";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.BASE_URL || "http://localhost:3221";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = resolve(process.env.PROFILE_OUTPUT || "/tmp/ccapp-220-responsive"); mkdirSync(output, { recursive: true });
const state = JSON.parse(readFileSync("scripts/profiling/fixtures/type-area-garden.json", "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ["--enable-unsafe-webgpu"] });
const observations = [], failures = [];
try {
  for (const [view, viewport, deviceScaleFactor, hasTouch] of [
    ["desktop", { width: 1280, height: 800 }, 1, false],
    ["phone-portrait", { width: 390, height: 844 }, 2, true],
    ["phone-landscape", { width: 844, height: 390 }, 2, true],
    ["narrow-desktop", { width: 800, height: 600 }, 1, false],
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch, reducedMotion: "reduce" });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.addInitScript(() => localStorage.setItem("garden-v2:guide-seen:1", "1"));
    await page.route("**/*", async (route) => {
      assert.equal(new URL(route.request().url()).origin, new URL(base).origin);
      const action = route.request().headers()["next-action"];
      if (!action) return route.continue();
      const name = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")).node[action]?.exportedName;
      const result = name === "refreshGardenV2" ? { state, error: null } : name === "readPrivateInteraction" ? { state: { status: "unavailable" }, error: null } : null;
      assert(result, `Unexpected synthetic action ${name}`);
      await route.fulfill({ status: 200, contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(result)}\n` });
    });
    try {
      await page.goto(`${base}/dev/garden-areas`);
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      await page.locator('[data-garden-world][data-status="ready"]').waitFor();
      const group = page.getByRole("group", { name: "Walk around the garden" });
      await group.waitFor(); await page.waitForTimeout(200);
      const hint = await page.getByText("WASD / arrows to walk · tap ground to wander · tap a flower to visit", { exact: true }).boundingBox();
      const pad = await group.boundingBox();
      assert(hint && pad);
      const gaps = { above: pad.y - (hint.y + hint.height), below: hint.y - (pad.y + pad.height), left: pad.x - (hint.x + hint.width), right: hint.x - (pad.x + pad.width) };
      const separated = Math.max(...Object.values(gaps)) >= 8;
      if (!separated) failures.push(`${view}: hint overlaps or crowds pad: ${JSON.stringify({ hint, pad, gaps })}`);
      assert(hint.x >= 0 && hint.y >= 0 && hint.x + hint.width <= viewport.width && hint.y + hint.height <= viewport.height, `${view}: hint must fit viewport`);
      const buttons = [];
      for (const direction of ["forward", "backward", "left", "right"]) {
        const button = page.getByRole("button", { name: `Walk ${direction}`, exact: true });
        const bounds = await button.boundingBox();
        assert(bounds && bounds.width >= 44 && bounds.height >= 44 && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height, `${view}/${direction}: 44px target must fit viewport`);
        assert.equal(await button.evaluate((element) => { const r = element.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === element; }), true, `${view}/${direction}: target must be unobscured`);
        buttons.push({ direction, bounds });
      }
      await page.screenshot({ path: resolve(output, `${view}-overview.png`) });
      const cdp = hasTouch ? await context.newCDPSession(page) : null;
      const titleStyle = () => page.locator('[data-caption="title"]').getAttribute("style");
      for (const { direction, bounds } of buttons) {
        const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
        const before = await titleStyle();
        if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
        else { await page.mouse.move(x, y); await page.mouse.down(); }
        await page.waitForTimeout(200);
        if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        else await page.mouse.up();
        await page.waitForTimeout(50);
        const stopped = await titleStyle(); assert.notEqual(stopped, before, `${view}/${direction}: held control moves camera`);
        await page.waitForTimeout(100); assert.equal(await titleStyle(), stopped, `${view}/${direction}: release stops camera`);
      }
      assert.deepEqual(errors, []);
      observations.push({ view, viewport, dpr: deviceScaleFactor, input: hasTouch ? "trusted CDP touch on Mac" : "mouse on Mac", hint, pad, gaps, separated, buttons, allControlsMoveAndStop: true, errors });
      writeFileSync(resolve(output, "observations.json"), JSON.stringify(observations, null, 2));
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log(JSON.stringify(observations, null, 2));
assert.deepEqual(failures, [], "Hint/pad need at least 8 CSS pixels of separation at every supported viewport");
