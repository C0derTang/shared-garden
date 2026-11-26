/* global window, document, GPUAdapter, PointerEvent */
// Synthetic development-scene smoke checks. Uses the same optional Playwright
// environment variables as profile-world.mjs; changes no backend state.
import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = resolve(process.env.PROFILE_OUTPUT || "/tmp/ccapp-218-interactions");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ["--enable-unsafe-webgpu"] });
const observations = [];
try {
  for (const [view, viewport, dpr] of [["desktop", { width: 1280, height: 800 }, 1], ["phone", { width: 390, height: 844 }, 2]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, reducedMotion: "no-preference", hasTouch: view === "phone" });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.addInitScript(() => {
        window.__devices = [];
        const request = GPUAdapter.prototype.requestDevice;
        GPUAdapter.prototype.requestDevice = async function (...args) {
          const device = await request.apply(this, args);
          window.__devices.push(device);
          return device;
        };
      });
      const base = process.env.BASE_URL || "http://localhost:3218";
      await page.goto(`${base}/dev/world?sky=dusk&planted=26`);
      await page.locator('[data-garden-world][data-status="ready"]').waitFor();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: resolve(output, `${view}-garden-motion.png`) });
      // Known synthetic sunflower in bed 1, away from development controls.
      await page.mouse.click(view === "desktop" ? 604 : 175, view === "desktop" ? 556 : 440);
      await page.getByText(/picked flower-/).waitFor();
      const picked = await page.locator("ol").innerText();
      const world = page.locator("[data-garden-world]");
      await world.focus();
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(1500);
      await page.screenshot({ path: resolve(output, `${view}-garden-journey.png`) });
      // Physical drag traverses the same pointer path used by touch input.
      await page.mouse.move(viewport.width * 0.5, viewport.height * 0.45);
      await page.mouse.down();
      await page.mouse.move(viewport.width * 0.25, viewport.height * 0.3, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(1000);
      for (const stage of ["seedling", "bud", "opening", "bloom"]) {
        await page.getByRole("button", { name: stage, exact: true }).click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: resolve(output, `${view}-${stage}.png`) });
      }
      await page.goto(`${base}/dev/world?sky=dusk&planted=26`);
      await page.locator('[data-garden-world][data-status="ready"]').waitFor();
      await page.getByRole("button", { name: "clear", exact: true }).click();
      await page.waitForTimeout(600);
      const seed = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        for (let y = window.innerHeight * 0.3; y < window.innerHeight * 0.95; y += 8) {
          for (let x = window.innerWidth * 0.05; x < window.innerWidth * 0.95; x += 8) {
            if (document.elementFromPoint(x, y) !== canvas) continue;
            canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y }));
            if (canvas.style.cursor === "pointer") return { x, y };
          }
        }
        return null;
      });
      assert(seed, "No reachable empty seed mark");
      await page.mouse.click(seed.x, seed.y);
      await page.getByText(/picked empty spot/).waitFor();
      const planted = await page.locator("ol").innerText();
      await page.screenshot({ path: resolve(output, `${view}-seed-picked.png`) });
      if (view === "phone") {
        await page.evaluate(() => {
          const canvas = document.querySelector("canvas");
          canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", clientX: 195, clientY: 380 }));
          canvas.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", clientX: 140, clientY: 270 }));
          canvas.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", clientX: 140, clientY: 270 }));
        });
        await page.waitForTimeout(500);
        await page.screenshot({ path: resolve(output, `${view}-touch-journey.png`) });
      }
      await page.getByRole("button", { name: "night", exact: true }).click();
      await page.getByRole("button", { name: "still fireworks", exact: true }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: resolve(output, `${view}-night-fireworks.png`) });
      // Real GPU destruction exercises the application's one-restart policy.
      const before = await page.evaluate(() => window.__devices.length);
      await page.evaluate(() => window.__devices.at(-1).destroy());
      await page.waitForFunction((count) => window.__devices.length > count && document.querySelector('[data-garden-world][data-status="ready"]'), before);
      await page.waitForTimeout(500);
      await page.screenshot({ path: resolve(output, `${view}-recovered.png`) });
      await page.evaluate(() => window.__devices.at(-1).destroy());
      await page.getByText("The painted garden stopped.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Reload", exact: true }).waitFor();
      await page.getByRole("link", { name: "Open the earlier garden" }).waitFor();
      await page.screenshot({ path: resolve(output, `${view}-stopped.png`) });
      observations.push({ view, garden: { picked, planted, navigation: view === "phone" ? "keyboard, pointer drag and synthetic touch-pointer swipe" : "keyboard and pointer drag", stages: 4, fireworks: "night still", recovery: "first loss recovered; second loss stopped with Reload and legacy link" }, errors: [...errors] });
      assert.deepEqual(errors, []);
      await page.goto(`${base}/dev/landing?sky=dusk&member=1`);
      await page.locator('[data-garden-world][data-status="ready"]').waitFor();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: resolve(output, `${view}-landing-motion.png`) });
      await page.getByRole("link", { name: "come in", exact: true }).click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: resolve(output, `${view}-landing-walk.png`) });
      observations.push({ view, landing: "member caption starts normal-motion door/camera walk; screenshot taken before the authenticated garden route boundary" });
      console.log(view, "garden picking, journeys, stages, night/fireworks, loss recovery and landing walk passed");
    } finally { await context.close(); }
  }
  writeFileSync(resolve(output, "observations.json"), JSON.stringify(observations, null, 2));
} finally { await browser.close(); }
