/* global localStorage, URL, structuredClone, document, window, PointerEvent, Event */
// Runs the real GardenV2 UI/GPU layers with synthetic action responses only.
// No authentication, cookies, database operations or production state are used.
import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = resolve(process.env.PROFILE_OUTPUT || "/tmp/ccapp-220-interactions");
const fixture = JSON.parse(readFileSync("scripts/profiling/fixtures/type-area-garden.json", "utf8"));
const base = process.env.BASE_URL || "http://localhost:3221";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Synthetic actions are loopback-only");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ["--enable-unsafe-webgpu"] });
const observations = [];
try {
  for (const [view, viewport, dpr] of [["desktop", { width: 1280, height: 800 }, 1], ["phone", { width: 390, height: 844 }, 2]]) {
    for (const empty of [true, false]) {
      if (process.env.EMPTY_ONLY === "1" && !empty) continue;
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
        await page.goto(`${base}/dev/garden-areas?scope=1&arrival=1${empty ? "&empty=1" : ""}`);
        // Hide only Next.js's development debug badge, which sits over the pad.
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
        await page.locator('[data-arrival-light]').waitFor();
        assert.equal(await page.getByRole("group", { name: "Walk around the garden" }).count(), 0, "Walking waits for arrival");
        await page.locator('[data-garden-world][data-status="ready"]').waitFor();
        await page.locator('[data-plot-spot="-13"]').waitFor({ state: "attached" });
        await page.waitForTimeout(1500);
        const prefix = `${view}-${empty ? "empty" : "populated"}`;
        const instructions = page.getByText("WASD / arrows to walk · tap ground to wander · tap a flower to visit", { exact: true });
        const hintBox = await instructions.boundingBox();
        const padBox = await page.getByRole("group", { name: "Walk around the garden" }).boundingBox();
        assert(hintBox && padBox);
        assert(hintBox.x + hintBox.width <= padBox.x || hintBox.x >= padBox.x + padBox.width || hintBox.y + hintBox.height <= padBox.y || hintBox.y >= padBox.y + padBox.height, "Hint must not overlap walking pad");
        for (const direction of ["forward", "backward", "left", "right"]) {
          assert.equal(await page.getByRole("button", { name: `Walk ${direction}`, exact: true }).evaluate((button) => { const r = button.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === button; }), true, "Every touch button must be unobscured");
        }
        await page.screenshot({ path: resolve(output, `${prefix}-overview.png`) });
        assert.equal(await page.locator('[data-caption^="area-"]').count(), 13);
        assert.equal(await page.locator('[data-plot-spot]').count(), state.plants.length + 13);
        const worldInput = page.locator('[data-garden-world]');
        const titleStyle = () => page.locator('[data-caption="title"]').getAttribute("style");
        await worldInput.focus();
        const stationary = await titleStyle();
        await page.keyboard.down("d"); await page.waitForTimeout(250); await page.keyboard.up("d");
        await page.waitForTimeout(50);
        const released = await titleStyle(); assert.notEqual(released, stationary, "Held key moves the real painted camera");
        await page.waitForTimeout(250); assert.equal(await titleStyle(), released, "Key release stops the camera");
        for (const interruption of ["blur", "world-blur", "visibilitychange"]) {
          await worldInput.focus(); await page.keyboard.down("d"); await page.waitForTimeout(100);
          await page.evaluate((kind) => { if (kind === "world-blur") document.querySelector("[data-garden-world]").blur(); else (kind === "blur" ? window : document).dispatchEvent(new Event(kind)); }, interruption);
          await page.waitForTimeout(50); const stopped = await titleStyle();
          await page.waitForTimeout(250); assert.equal(await titleStyle(), stopped, `${interruption} stops held input`);
          await page.keyboard.up("d");
        }
        await worldInput.focus(); await page.keyboard.down("d");
        await page.locator('[data-nav-view="settings"]').click();
        await page.getByRole("dialog").waitFor(); await page.keyboard.up("d");
        const overlayFrozen = await titleStyle();
        await worldInput.focus(); await page.keyboard.down("w"); await page.waitForTimeout(250); await page.keyboard.up("w");
        assert.equal(await titleStyle(), overlayFrozen, "Overlay blocks held movement");
        await page.getByRole("button", { name: "Close settings", exact: true }).click();
        await page.getByRole("dialog").waitFor({ state: "detached" }); await page.waitForTimeout(250);
        const overlayReturn = await titleStyle(); await page.waitForTimeout(250); assert.equal(await titleStyle(), overlayReturn);
        await page.getByRole("button", { name: "synthetic scoped sheet", exact: true }).click();
        await page.getByRole("dialog", { name: "Synthetic scoped draft" }).waitFor();
        assert.equal(await page.getByRole("group", { name: "Walk around the garden" }).count(), 0, "Scoped sheets block walking too");
        const scopedBefore = await titleStyle();
        await page.getByRole("textbox", { name: "Synthetic draft" }).fill("wasd stays in a scoped draft");
        await page.getByRole("textbox", { name: "Synthetic draft" }).press("ArrowUp");
        await page.waitForTimeout(250); assert.equal(await titleStyle(), scopedBefore, "Scoped typing cannot move camera");
        await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached" }); await page.waitForTimeout(250);
        // A real phone touch holds the directional pad; desktop uses a mouse hold.
        const pad = page.getByRole("button", { name: "Walk left", exact: true });
        const rect = await pad.boundingBox(); const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        const cdp = view === "phone" ? await context.newCDPSession(page) : null;
        const begin = async () => {
          await pad.evaluate((button) => button.addEventListener("pointerdown", (event) => { button.dataset.pointer = String(event.pointerId); }, { once: true }));
          if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
          else { await page.mouse.move(x, y); await page.mouse.down(); }
        };
        const end = async () => { if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await page.mouse.up(); };
        for (const interruption of ["release", "pointercancel", "lostpointercapture"]) {
          const before = await titleStyle(); await begin(); await page.waitForTimeout(200);
          if (interruption !== "release") await pad.evaluate((button, type) => button.dispatchEvent(new PointerEvent(type, { pointerId: Number(button.dataset.pointer), bubbles: true })), interruption);
          else await end();
          await page.waitForTimeout(50); const stopped = await titleStyle(); assert.notEqual(stopped, before, `${view} ${empty} ${interruption}: held pad moves camera`);
          await page.waitForTimeout(200); assert.equal(await titleStyle(), stopped, `${interruption} stops pad`);
          if (interruption !== "release") await end();
        }
        for (const direction of ["right", "forward", "backward"]) {
          const button = page.getByRole("button", { name: `Walk ${direction}`, exact: true });
          const r = await button.boundingBox(); const at = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          const before = await titleStyle();
          if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...at, id: 1 }] });
          else { await page.mouse.move(at.x, at.y); await page.mouse.down(); }
          await page.waitForTimeout(200); await end(); await page.waitForTimeout(50);
          assert.notEqual(await titleStyle(), before, `${direction} pad hold moves real camera`);
        }
        // Keyboard activation remains meaningful on the directional buttons.
        await pad.focus(); const beforeActivate = await titleStyle(); await page.keyboard.press("Enter"); await page.waitForTimeout(50);
        assert.notEqual(await titleStyle(), beforeActivate, "Accessible pad activation moves one short step");
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
          const plantedDialog = page.getByRole("dialog", { name: "rose", exact: true });
          await plantedDialog.waitFor();
          const draft = plantedDialog.locator("textarea");
          assert.equal(await draft.count(), 1); await draft.fill("wasd arrow keys stay in this synthetic draft");
          await draft.press("ArrowLeft"); await draft.press("w");
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
        await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(6000); await page.keyboard.up("ArrowLeft");
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(output, `${prefix}-left.png`) });
        const leftPan = await page.locator('[data-caption="area-sunflower"]').getAttribute("style");
        assert.notEqual(leftPan, beforePan, "Left arrow must change projected caption position");
        await page.keyboard.down("d"); await page.waitForTimeout(12000); await page.keyboard.up("d");
        await page.keyboard.down("a"); await page.waitForTimeout(750); await page.keyboard.up("a");
        await page.keyboard.down("w"); await page.waitForTimeout(750); await page.keyboard.up("w");
        await page.waitForTimeout(400);
        await page.screenshot({ path: resolve(output, `${prefix}-right-close.png`) });
        const rightPan = await page.locator('[data-caption="area-sunflower"]').getAttribute("style");
        assert.notEqual(rightPan, leftPan, "Right/up arrows must change the painted camera");
        let pointerSeedPicked = null;
        if (empty) {
          // The pan clamp includes the bed rim; step back from that outer
          // edge to center its seed on a narrow viewport.

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
          const dragBefore = await titleStyle();
          if (cdp) {
            await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: seed.x, y: seed.y, id: 1 }] });
            await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: seed.x + 30, y: seed.y - 30, id: 1 }] });
            await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: seed.x, y: seed.y, id: 1 }] });
            await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          } else {
            await page.mouse.move(seed.x, seed.y); await page.mouse.down();
            await page.mouse.move(seed.x + 30, seed.y - 30); await page.mouse.move(seed.x, seed.y); await page.mouse.up();
          }
          await page.waitForTimeout(150); assert.equal(await page.getByRole("dialog").count(), 0, "Out-and-back drag must not visit a seed");
          assert.equal(await titleStyle(), dragBefore, "Dragging does not start ground walking");
          if (cdp) await page.touchscreen.tap(seed.x, seed.y); else await page.mouse.click(seed.x, seed.y);
          await page.getByRole("dialog", { name: "plant a seed", exact: true }).waitFor();
          pointerSeedPicked = true;
          await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached" }); await page.waitForTimeout(250);
        }
        const ground = await page.evaluate(() => {
          const canvas = document.querySelector("canvas");
          for (let y = window.innerHeight * 0.5; y < window.innerHeight * 0.85; y += 12) for (let x = window.innerWidth * 0.25; x < window.innerWidth * 0.85; x += 12) {
            if (document.elementFromPoint(x, y) !== canvas) continue;
            canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y }));
            if (canvas.style.cursor === "crosshair") return { x, y };
          }
          return null;
        });
        assert(ground, "Walkable ground must be targetable");
        const beforeGround = await titleStyle();
        if (cdp) await page.touchscreen.tap(ground.x, ground.y); else await page.mouse.click(ground.x, ground.y);
        await page.waitForTimeout(350); assert.notEqual(await titleStyle(), beforeGround, "Ground tap moves camera");
        assert.equal(await page.getByRole("dialog").count(), 0, "Ground walking does not open a visit");
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await page.screenshot({ path: resolve(output, `${prefix}-ground-walk.png`) });
        assert.deepEqual(errors, []);
        observations.push({ view, empty, namedAreas: 13, keyboardAreasOpened: 13, repeatedRosePlantings: 2, preservedPlants: preserved.length, historyReadWithOriginalId: empty ? null : true, pointerSeedPicked, lifecycle: "arrival, key release, blur, visibility, overlay, scoped-sheet draft typing, actual held pad touch/mouse, pointercancel, lost capture, accessible pad activation, flower draft typing", groundWalk: true, dragDoesNotVisit: empty ? true : null, camera: "held WASD/arrows through left/right terrain bounds and expanded depth", errors });
        writeFileSync(resolve(output, "observations.json"), JSON.stringify(observations, null, 2));
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }
console.log(JSON.stringify(observations, null, 2));
