/* global localStorage,URL,structuredClone,document,window,GPUAdapter,requestAnimationFrame,Event */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import process from 'node:process';
import console from 'node:console';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.cwd(), base = process.env.BASE_URL || 'http://127.0.0.1:3234', out = process.env.PROFILE_OUTPUT || '/tmp/ccapp-230-browser';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Synthetic fixture requires loopback');
mkdirSync(out, { recursive: true });
const { compactFixture } = await import(root + '/scripts/profiling/compact-browser-fixture.mjs'), { evidenceMetadata } = await import(root + '/scripts/profiling/scenic-evidence.mjs'), meta = evidenceMetadata(out);
const source = () => Object.fromEntries(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { encoding: 'utf8' }).trim().split('\n').filter(f => !f.includes('.test.')).sort().map(f => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]));
const start = source();
writeFileSync(out + '/source-start.json', JSON.stringify(start, null, 2));
const modules = await createServer({ configFile: false, resolve: { alias: { '@': resolve('src') } }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } }), { compactAreaLayout } = await modules.ssrLoadModule('/src/lib/garden-v2/compact-areas.ts'), { gardenTour, tourPose, tourFovY } = await modules.ssrLoadModule('/src/lib/world/garden-tour.ts'), { lookAt, perspective, multiply } = await modules.ssrLoadModule('/src/lib/world/camera.ts'), { plotFootprints, pickOnScreen } = await modules.ssrLoadModule('/src/lib/world/picking.ts'), { worldFlowerAnchors } = await modules.ssrLoadModule('/src/components/world/flowers/flower-models.ts'), { plantSpec, catalogItem } = await modules.ssrLoadModule('/src/lib/garden-v2/flowers.ts');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ['--enable-unsafe-webgpu'] });
const results = [];
async function fixture(page, initial) { let state = initial, failed = false; const calls = []; await page.addInitScript(() => localStorage.setItem('garden-v2:guide-seen:1', '1')); await page.route('**/*', async (route) => { const request = route.request(); assert.equal(new URL(request.url()).origin, new URL(base).origin, 'External request refused'); const action = request.headers()['next-action']; if (!action)
    return route.continue(); const manifest = JSON.parse(readFileSync('.next/dev/server/server-reference-manifest.json', 'utf8')), name = manifest.node[action]?.exportedName, args = JSON.parse(request.postData()); calls.push({ name, args }); let result; if (name === 'refreshGardenV2')
    result = failed ? { state: null, error: 'Synthetic refresh failed' } : { state, error: null };
else if (name === 'readPrivateInteraction')
    result = { state: { status: 'unavailable' }, error: null };
else if (name === 'readRepliesV2')
    result = { replies: [], error: null };
else if (name === 'loadFlowerHistoryV2')
    result = { entries: [{ id: 901, flower_id: args[0], author_id: 1, garden_day: '2026-11-25', original_posted_at: '2026-11-25T20:00:00Z', updated_at: '2026-11-25T20:00:00Z', payload: { text: 'Earlier synthetic memory' }, daisy_assignment_day: null }], error: null };
else if (name === 'readPeonyV2') {
    assert(state.plants.find(p => p.flower.id === args[0] && p.flower.type_key === 'peony'));
    result = { state: { server_now: state.server_now, garden_day: state.garden_day, next_rollover_at: state.next_rollover_at, member_id: 1, stage: 0, next_milestone: 1, contributions: [], plan: null, completed_milestones: [] }, error: null };
}
else if (name === 'mutateGardenV2') {
    assert.equal(args[0].kind, 'submit');
    assert.equal(args[0].flowerId, state.plants[0].flower.id);
    assert.equal(args[0].payload.text, 'Synthetic explicit error witness');
    result = { state: null, saved: false, error: 'Synthetic save failed' };
}
else
    throw Error('Unexpected synthetic action: ' + name); await route.fulfill({ status: 200, contentType: 'text/x-component', body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(result)}\n` }); }); return { calls, get state() { return state; }, set state(next) { state = next; }, set failed(value) { failed = value; } }; }
const save = () => writeFileSync(out + '/observations.json', JSON.stringify({ meta, results }, null, 2));
async function close(page) { await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' }); }
async function refresh(page) { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(150); }
try {
    for (const [view, width, height, touch] of [['desktop', 1280, 800, false], ['portrait', 390, 844, true], ['landscape', 844, 390, true], ['narrow', 800, 600, false]]) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [];
        page.setDefaultTimeout(15000);
        page.on('pageerror', e => errors.push(e.message));
        const mock = await fixture(page, compactFixture('mixed'));
        await page.addInitScript({ path: resolve('scripts/profiling/world-camera-hook.js') });
        await page.addInitScript(() => { window.__worldDevices = []; const request = GPUAdapter.prototype.requestDevice; GPUAdapter.prototype.requestDevice = async function (...args) { const device = await request.apply(this, args), shader = device.createShaderModule.bind(device); let world = false; device.createShaderModule = d => { if (!world && d.label?.startsWith('garden-world.')) {
            world = true;
            window.__worldDevices.push(device);
        } return shader(d); }; return device; }; const native = requestAnimationFrame, held = []; window.__holdFrames = false; window.requestAnimationFrame = callback => native(time => { if (window.__holdFrames)
            held.push(callback);
        else
            callback(time); }); window.__resumeFrames = () => { window.__holdFrames = false; for (const callback of held.splice(0))
            native(callback); }; });
        await page.goto(base + '/dev/garden-areas?scope=1');
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
        const trigger = page.getByRole('button', { name: 'Choose a flower' }), scroll = page.locator('[data-garden-scroll]'), invite = page.locator('[data-garden-invitation]');
        await trigger.waitFor({ timeout: 90000 });
        await page.waitForTimeout(250);
        assert(await invite.isVisible());
        let r = await invite.boundingBox();
        assert(r.width >= 44 && r.height >= 44 && r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height);
        assert(await invite.evaluate(e => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }));
        await page.screenshot({ path: out + '/' + view + '-overview.png', style: 'button[style*="position: fixed"]{visibility:hidden!important}' });
        const d = () => scroll.getAttribute('data-distance'), cam = () => page.evaluate(() => window.__actualCamera && ({ eye: window.__actualCamera.eye, matrix: window.__actualCamera.matrix }));
        let route = gardenTour(compactAreaLayout(mock.state).beds);
        const parity = async () => { const distance = Number(await d()), pose = tourPose(route, distance), matrix = multiply(perspective(tourFovY(pose, width / height), width / height, .1, 420), lookAt(pose.eye, pose.look, [0, 1, 0])); await page.waitForFunction(expected => window.__actualCamera?.eye.every((v, i) => Math.abs(v - expected.eye[i]) < .001) && window.__actualCamera.matrix.every((v, i) => Math.abs(v - expected.matrix[i]) < .002), { eye: pose.eye, matrix: [...matrix] }, { timeout: 10000 }); };
        console.log(view, 'overview-ready');
        await parity();
        const before = await cam(), distance = await d();
        await invite.click();
        let field = page.getByRole('dialog', { name: 'rose', exact: true }).getByRole('textbox');
        await field.click();
        await page.keyboard.type('Synthetic explicit error witness');
        await page.mouse.wheel(0, 150);
        await field.press('ArrowLeft');
        assert.equal(await d(), distance);
        assert.equal(mock.calls.filter(c => c.name === 'mutateGardenV2').length, 0);
        await page.getByRole('button', { name: 'share', exact: true }).click();
        await page.getByText('Synthetic save failed', { exact: true }).waitFor();
        assert.equal(await field.inputValue(), 'Synthetic explicit error witness');
        assert.equal(mock.calls.filter(c => c.name === 'mutateGardenV2').length, 1);
        await page.screenshot({ path: out + '/' + view + '-form.png' });
        await close(page);
        await trigger.waitFor();
        await parity();
        assert.deepEqual(await cam(), before);
        assert.equal(await d(), distance);
        await page.waitForTimeout(50);
        assert(await page.evaluate(() => document.activeElement?.matches('[data-garden-invitation],[data-garden-world]')));
        console.log(view, 'invitation-error-return-pass');
        // Real physical canvas target, original UUID, with exact pose/lens after return.
        await trigger.click();
        let picker = page.getByRole('dialog', { name: 'Choose a flower' });
        assert.equal(await picker.getByRole('button').count(), 13);
        assert.deepEqual(await picker.getByRole('button').allTextContents(), mock.state.catalog.map(c => c.display_name));
        assert((await picker.getByRole('button').evaluateAll(nodes => nodes.every(n => n.children.length === 2 && n.querySelectorAll('img').length === 1))));
        assert.equal(await invite.count(), 0);
        await picker.getByRole('button', { name: 'rose', exact: true }).click();
        await page.waitForTimeout(150);
        await parity();
        const physicalBefore = await cam(), physicalDistance = await d(), layout = compactAreaLayout(mock.state), positions = new Map(layout.spots.map(s => [s.spot, s.position])), anchors = worldFlowerAnchors(mock.state.plants.map(p => ({ id: p.flower.id, spec: plantSpec(p, catalogItem(mock.state, p.flower.type_key)), position: positions.get(p.flower.spot) }))), camera = await cam(), screen = { width, height, viewProjection: camera.matrix };
        let target;
        for (const p of plotFootprints(screen, layout.areas.map(a => a.target), anchors).filter(p => p.target.kind === 'flower')) {
            for (const part of p.parts) {
                const x = (part.a[0] + part.b[0]) / 2, y = (part.a[1] + part.b[1]) / 2;
                if (x > 0 && y > 64 && x < width && y < height && pickOnScreen(screen, x, y, layout.areas.map(a => a.target), anchors)?.kind === 'flower' && await page.evaluate(({ x, y }) => document.elementFromPoint(x, y) === document.querySelector('[data-garden-world] canvas'), { x, y })) {
                    target = { x, y };
                    break;
                }
            }
            if (target)
                break;
        }
        assert(target, 'Physical flower unobscured');
        await page.mouse.click(target.x, target.y);
        await page.getByRole('dialog').waitFor();
        await close(page);
        await trigger.waitFor();
        await parity();
        assert.deepEqual(await cam(), physicalBefore);
        assert.equal(await d(), physicalDistance);
        console.log(view, 'physical-pass');
        // Each real individual activity, including media and milestones, opens directly.
        const active = structuredClone(mock.state);
        active.moonflower_open = true;
        for (const p of active.plants) {
            p.flower.first_bloom_at = null;
            p.flower.first_bloom_day = null;
            p.flower.growth_units = 0;
            p.member1_submitted = false;
            p.entries = [];
            if (p.flower.type_key === 'daisy')
                p.daisy_question = { garden_day: active.garden_day, ordinal: 1, question_id: 'light-1', category: 'light', prompt: 'A synthetic daily question?', assigned_at: active.server_now };
        }
        mock.state = active;
        await refresh(page);
        const forms = [];
        for (const type of active.catalog.map(c => c.type_key)) {
            const plant = active.plants.find(p => p.flower.type_key === type);
            await page.locator(`[data-plot-spot="${plant.flower.spot}"]`).focus();
            await page.keyboard.press('Enter');
            const dialog = page.getByRole('dialog', { name: type, exact: true });
            await dialog.waitFor();
            assert(new URL(page.url()).searchParams.get('flower') === plant.flower.id);
            if (type === 'peony')
                await dialog.getByRole('heading', { name: /Step 1/ }).waitFor();
            else if (type === 'sunflower')
                await dialog.getByRole('form', { name: 'Share a Sunflower photo' }).waitFor();
            else if (type === 'bluebell')
                await dialog.getByRole('form', { name: 'Share a Bluebell voice memo' }).waitFor();
            else if (type === 'tulip')
                await dialog.getByRole('textbox', { name: 'Song title' }).waitFor();
            else if (type === 'hydrangea')
                await dialog.getByRole('checkbox').first().waitFor();
            else if (type === 'cactus')
                await dialog.getByRole('button', { name: 'I’m here', exact: true }).waitFor();
            else
                await dialog.getByRole('textbox').first().waitFor();
            forms.push({ type, id: plant.flower.id });
            await close(page);
            await trigger.waitFor();
        }
        assert.equal(mock.calls.filter(c => c.name === 'mutateGardenV2').length, 1);
        console.log(view, 'all13-pass');
        const invitations = [];
        for (const type of active.catalog.map(c => c.type_key).filter(t => t !== 'peony')) {
            const next = structuredClone(active), target = next.plants.find(p => p.flower.type_key === type);
            for (const p of next.plants)
                p.member1_submitted = p.flower.id !== target.flower.id;
            mock.state = next;
            await refresh(page);
            assert(await invite.isVisible(), type + ' invitation visible');
            const box = await invite.boundingBox();
            assert(box.height >= 44 && box.width >= 44 && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, type + ' invitation safe bounds');
            assert(await invite.evaluate(e => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }));
            const label = await invite.innerText();
            await invite.click();
            await page.getByRole('dialog', { name: type, exact: true }).waitFor();
            assert.equal(new URL(page.url()).searchParams.get('flower'), target.flower.id);
            await close(page);
            await trigger.waitFor();
            invitations.push({ type, label, id: target.flower.id, box });
        }
        const quiet = structuredClone(active);
        for (const p of quiet.plants)
            p.member1_submitted = true;
        mock.state = quiet;
        await refresh(page);
        assert.equal(await invite.count(), 0, 'No partner-only false all-clear action');
        quiet.plants.find(p => p.flower.type_key === 'moonflower').member1_submitted = false;
        quiet.moonflower_open = false;
        await refresh(page);
        assert.equal(await invite.count(), 0, 'Closed Moonflower not due');
        quiet.moonflower_open = true;
        await refresh(page);
        assert.match(await invite.innerText(), /late-night thought/);
        mock.state = active;
        await refresh(page);
        // A held world frame never owns ordinary form entry or a newer invitation intent.
        await page.evaluate(() => window.__holdFrames = true);
        await invite.click();
        field = page.getByRole('dialog', { name: 'rose', exact: true }).getByRole('textbox');
        await field.click();
        await page.keyboard.type('Held-frame draft');
        assert.equal(await field.inputValue(), 'Held-frame draft');
        await close(page);
        await invite.click();
        await page.getByRole('dialog', { name: 'rose', exact: true }).waitFor();
        await close(page);
        await page.evaluate(() => window.__resumeFrames());
        await trigger.waitFor();
        await parity();
        console.log(view, 'held-frame-pass');
        // Quiet no-next distinctions, window/day refresh, original sparse identity.
        const states = [];
        for (const kind of ['empty', 'full', 'sparse', 'boundary', 'occupied']) {
            let next = compactFixture(kind === 'occupied' ? 'full' : kind);
            if (kind === 'occupied') {
                const p = structuredClone(next.plants[0]);
                p.flower = { ...p.flower, id: '00000000-0000-4000-8000-000000009001', spot: 9001, first_bloom_at: null, first_bloom_day: null, planted_at: '2026-11-26T20:01:00Z' };
                next.plants.push(p);
            }
            mock.state = next;
            await refresh(page);
            route = gardenTour(compactAreaLayout(next).beds);
            await trigger.waitFor();
            await parity();
            if (kind === 'empty')
                assert.equal(await invite.count(), 0);
            else
                assert.equal(await invite.count(), 1);
            await page.screenshot({ path: out + '/' + view + '-' + kind + '.png', style: 'button[style*="position: fixed"]{visibility:hidden!important}' });
            states.push({ kind, plants: next.plants.length, distance: await d() });
        }
        mock.failed = true;
        await refresh(page);
        assert.equal(await invite.count(), 0);
        await page.getByText('Synthetic refresh failed', { exact: true }).waitFor();
        mock.failed = false;
        mock.state = active;
        await refresh(page);
        route = gardenTour(compactAreaLayout(active).beds);
        await parity();
        // GPU loss/recreation leaves direct activities available and returns to actual accepted tour.
        const previous = await d(), count = await page.evaluate(() => window.__worldDevices.length);
        await page.evaluate(() => window.__worldDevices.at(-1).destroy());
        await page.waitForFunction(n => window.__worldDevices.length > n && document.querySelector('[data-garden-world][data-status="ready"]'), count, { timeout: 90000 });
        await trigger.waitFor();
        await parity();
        assert.equal(await d(), previous);
        assert.deepEqual(errors, []);
        results.push({ view, width, height, touchEmulation: touch, motion: 'reduce', invitation44px: true, explicitOnlyMutationErrorDraft: true, exactReturn: true, physicalCanvas: true, all13Forms: forms, all12Invitations: invitations, truthfulQuietAndMoonStates: true, heldFrames: true, states, gpuRecovery: true, calls: mock.calls, errors });
        save();
        await context.close();
        console.log(view, 'passed');
    }
}
finally {
    await browser.close();
    await modules.close();
    writeFileSync(out + '/source-end.json', JSON.stringify(source(), null, 2));
    assert.deepEqual(source(), start);
    save();
}
