/* global localStorage, URL, structuredClone, document, window, PointerEvent */
// Runs the real GardenV2 UI/GPU layers with synthetic action responses only.
// No authentication, cookies, database operations or production state are used.
import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = resolve(process.env.PROFILE_OUTPUT || "/tmp/ccapp-219-interactions");
const fixture = JSON.parse(readFileSync("scripts/profiling/fixtures/type-area-garden.json", "utf8"));
const base = process.env.BASE_URL || "http://localhost:3219";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Synthetic actions are loopback-only");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ["--enable-unsafe-webgpu"] });
const observations = [];
try {
  for (const [view, viewport, dpr] of [["desktop", { width: 1280, height: 800 }, 1], ["phone", { width: 390, height: 844 }, 2]]) {
    for (const empty of [true, false]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, reducedMotion: "reduce", hasTouch: view === "phone" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      let state = structuredClone(fixture);
      if (empty) { state.plants = []; state.garden.next_spot = 1; state.garden.spot_capacity = 12; }
      const preserved = structuredClone(state.plants);
      const calls = [];
      await page.addInitScript(() => localStorage.setItem("garden-v2:guide-seen:1", "1"));
      // Server action IDs are build-specific; read their exported names from the
      // running dev build, and fail closed for any unexpected request.
      await page.route("**/*", async (route) => {
        const request = route.request();
        const action = request.headers()["next-action"];
        if (!action) {
          assert.equal(new URL(request.url()).origin, new URL(base).origin, "Unexpected external request");
          return route.continue();
        }
        const manifest = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8"));
        const name = manifest.node[action]?.exportedName;
        const args = JSON.parse(request.postData());
        calls.push({ name, args });
        let result;
        if (name === "refreshGardenV2") result = { state, error: null };
        else if (name === "readPrivateInteraction") result = { state: { status: "unavailable" }, error: null };
        else if (name === "readRepliesV2") result = { replies: [], error: null };
        else if (name === "loadFlowerHistoryV2") result = { entries: [{ id: 901, flower_id: args[0], author_id: 1, garden_day: "2026-11-25", original_posted_at: "2026-11-25T20:00:00Z", updated_at: "2026-11-25T20:00:00Z", payload: { text: "An earlier synthetic memory." }, daisy_assignment_day: null }], error: null };
        else if (name === "mutateGardenV2") {
          const command = args[0];
          assert.equal(command.kind, "plant");
          assert.equal(command.spot, state.garden.next_spot);
          const template = structuredClone(fixture.plants.find((plant) => plant.flower.type_key === command.type));
          template.flower = { ...template.flower, id: `00000000-0000-4000-8000-${String(100 + command.spot).padStart(12, "0")}`, spot: command.spot, growth_units: 0, first_bloom_at: null, first_bloom_day: null, shared_wish: command.wish ?? null };
          state = { ...state, plants: [...state.plants, template], garden: { ...state.garden, next_spot: command.spot + 1, spot_capacity: Math.ceil((command.spot + 1) / 12) * 12 } };
          result = { state, saved: true, error: null };
        } else throw new Error(`Unexpected synthetic action: ${name}`);
        await route.fulfill({ status: 200, contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(result)}\n` });
      });
      try {
        await page.goto(`${base}/dev/garden-areas${empty ? "?empty=1" : ""}`);
        await page.locator('[data-garden-world][data-status="ready"]').waitFor();
        await page.locator('[data-plot-spot="-13"]').waitFor({ state: "attached" });
        await page.waitForTimeout(1500);
        const prefix = `${view}-${empty ? "empty" : "populated"}`;
        await page.screenshot({ path: resolve(output, `${prefix}-overview.png`) });
        assert.equal(await page.locator('[data-caption^="area-"]').count(), 13);
        assert.equal(await page.locator('[data-plot-spot]').count(), state.plants.length + 13);
        // All named areas remain reachable by the retained keyboard controls.
        for (let type = 0; type < 13; type += 1) {
          const button = page.locator(`[data-plot-spot="-${type + 1}"]`);
          await button.focus();
          await page.keyboard.press("Enter");
          const dialog = page.getByRole("dialog", { name: "plant a seed", exact: true });
          await dialog.waitFor();
          assert.equal(await dialog.getByRole("radio", { name: new RegExp(`^${fixture.catalog[type].type_key} `) }).isChecked(), true, `${view} empty=${empty} type=${type}`);
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "detached" });
          await page.waitForTimeout(200);
        }
        // Repeated roses use the selected area and the original next global spot.
        for (let repeat = 0; repeat < 2; repeat += 1) {
          await page.locator('[data-plot-spot="-1"]').focus();
          await page.keyboard.press("Enter");
          await page.getByRole("button", { name: "plant the rose", exact: true }).click();
          await page.getByRole("dialog", { name: "rose", exact: true }).waitFor();
          await page.keyboard.press("Escape");
          await page.getByRole("dialog").waitFor({ state: "detached" });
        }
        assert.deepEqual(state.plants.slice(0, preserved.length), preserved);
        if (!empty) {
          await page.locator('[data-plot-spot="1"]').focus();
          await page.keyboard.press("Enter");
          const dialog = page.getByRole("dialog", { name: "rose", exact: true });
          await dialog.waitFor();
          await dialog.getByRole("button", { name: "read earlier days", exact: true }).click();
          await dialog.getByText("An earlier synthetic memory.", { exact: true }).waitFor();
          assert(calls.some((call) => call.name === "loadFlowerHistoryV2" && call.args[0] === fixture.plants[0].flower.id));
          await page.screenshot({ path: resolve(output, `${prefix}-history.png`) });
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "detached" });
          await page.waitForTimeout(200);
        }
        // Exercise actual camera input at both lateral extremes and expanded depth.
        const world = page.locator('[data-garden-world]');
        // Let the dialog's scheduled focus restoration finish before taking
        // keyboard control of the world; otherwise it can steal the first key.
        await page.waitForTimeout(150);
        await world.focus();
        assert.equal(await world.evaluate((element) => document.activeElement === element), true);
        const beforePan = await page.locator('[data-caption="area-sunflower"]').getAttribute("style");
        for (let i = 0; i < 15; i += 1) await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(output, `${prefix}-left.png`) });
        const leftPan = await page.locator('[data-caption="area-sunflower"]').getAttribute("style");
        assert.notEqual(leftPan, beforePan, "Left arrow must change projected caption position");
        for (let i = 0; i < 30; i += 1) await page.keyboard.press("ArrowRight");
        for (let i = 0; i < 5; i += 1) await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(output, `${prefix}-right-close.png`) });
        const rightPan = await page.locator('[data-caption="area-sunflower"]').getAttribute("style");
        assert.notEqual(rightPan, leftPan, "Right/up arrows must change the painted camera");
        let pointerSeedPicked = false;
        if (empty) {
          // The pan clamp includes the bed rim; step back from that outer
          // edge to center its seed on a narrow viewport.
          if (view === "phone") { await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(150); }
          const seed = await page.evaluate(() => {
            const canvas = document.querySelector("canvas");
            for (let y = window.innerHeight * 0.2; y < window.innerHeight * 0.95; y += 8) {
              for (let x = window.innerWidth * 0.05; x < window.innerWidth * 0.95; x += 8) {
                if (document.elementFromPoint(x, y) !== canvas) continue;
                canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y }));
                if (canvas.style.cursor === "pointer") return { x, y };
              }
            }
            return null;
          });
          assert(seed, "A seed mark must be pointer-reachable at the outer area");
          await page.mouse.click(seed.x, seed.y);
          await page.getByRole("dialog", { name: "plant a seed", exact: true }).waitFor();
          pointerSeedPicked = true;
          await page.keyboard.press("Escape");
        }
        assert.deepEqual(errors, []);
        observations.push({ view, empty, namedAreas: 13, keyboardAreasOpened: 13, repeatedRosePlantings: 2, preservedPlants: preserved.length, historyReadWithOriginalId: !empty, pointerSeedPicked, camera: "left/right limits and full retained scroll journey", errors });
        writeFileSync(resolve(output, "observations.json"), JSON.stringify(observations, null, 2));
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }
console.log(JSON.stringify(observations, null, 2));
