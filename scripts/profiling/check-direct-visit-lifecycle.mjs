/* global localStorage,URL,document,window,Event */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.cwd(), { compactFixture } = await import(root + '/scripts/profiling/compact-browser-fixture.mjs'), { evidenceMetadata } = await import(root + '/scripts/profiling/scenic-evidence.mjs'), out = process.env.PROFILE_OUTPUT || '/tmp/ccapp-230-lifecycle';
mkdirSync(out, { recursive: true });
const meta = evidenceMetadata(out), base = process.env.BASE_URL || 'http://127.0.0.1:3234', results = [];
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Synthetic fixture requires loopback');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ['--enable-unsafe-webgpu'] });
async function mock(page, state) { const calls = []; await page.addInitScript(() => localStorage.setItem('garden-v2:guide-seen:1', '1')); await page.route('**/*', async (r) => { const req = r.request(); assert.equal(new URL(req.url()).origin, new URL(base).origin); const action = req.headers()['next-action']; if (!action)
    return r.continue(); const name = JSON.parse(readFileSync('.next/dev/server/server-reference-manifest.json', 'utf8')).node[action]?.exportedName, args = JSON.parse(req.postData()); calls.push({ name, args }); let result; if (name === 'refreshGardenV2')
    result = { state, error: null };
else if (name === 'readPrivateInteraction')
    result = { state: { status: 'unavailable' }, error: null };
else if (name === 'readRepliesV2')
    result = { replies: [], error: null };
else if (name === 'mutateGardenV2') {
    assert.equal(args[0].kind, 'fulfillDandelion');
    const p = state.plants.find(p => p.flower.id === args[0].flowerId);
    assert(p?.flower.type_key === 'dandelion');
    p.flower.fulfilled_at = state.server_now;
    p.flower.fulfilled_by = 1;
    result = { state, saved: true, error: null };
}
else
    throw Error('Unexpected lifecycle action ' + name); await r.fulfill({ status: 200, contentType: 'text/x-component', body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(result)}\n` }); }); return calls; }
try {
    for (const motion of ['no-preference', 'reduce']) {
        const context = await browser.newContext({ viewport: motion === 'reduce' ? { width: 390, height: 844 } : { width: 1280, height: 800 }, reducedMotion: motion }), page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        const state = compactFixture('mixed');
        for (const p of state.plants) {
            p.flower.first_bloom_at = null;
            p.flower.first_bloom_day = null;
            p.flower.growth_units = 0;
            p.member1_submitted = p.flower.type_key !== 'rose';
            p.entries = [];
        }
        const calls = await mock(page, state);
        await page.addInitScript({ content: readFileSync(resolve('scripts/profiling/world-camera-hook.js'), 'utf8') + `\n(()=>{let release;const gate=new Promise(r=>release=r);window.__releaseGpu=release;const request=GPUAdapter.prototype.requestDevice;GPUAdapter.prototype.requestDevice=async function(...args){await gate;return request.apply(this,args);};})();` });
        await page.goto(base + '/dev/garden-areas');
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
        const invitation = page.locator('[data-garden-invitation]');
        await invitation.waitFor();
        assert.equal(await page.locator('[data-garden-world]').getAttribute('data-status'), 'loading');
        const distance = await page.locator('[data-garden-scroll]').getAttribute('data-distance');
        await invitation.click();
        const rose = page.getByRole('dialog', { name: 'rose', exact: true }), field = rose.getByRole('textbox');
        await field.click();
        await page.keyboard.type('Before any GPU device or frame');
        assert.equal(await field.inputValue(), 'Before any GPU device or frame');
        assert.equal(calls.filter(c => c.name === 'mutateGardenV2').length, 0);
        for (const p of state.plants)
            p.member1_submitted = p.flower.type_key !== 'tulip';
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await page.waitForTimeout(100);
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await invitation.click();
        const song = page.getByRole('dialog', { name: 'tulip', exact: true }).getByRole('textbox', { name: 'Song title' });
        await song.click();
        await page.keyboard.type('Newer synthetic intent');
        await page.evaluate(() => window.__releaseGpu());
        await page.locator('[data-garden-world][data-status="ready"]').waitFor({ timeout: 90000 });
        assert.equal(await song.inputValue(), 'Newer synthetic intent');
        assert(await song.evaluate(e => document.activeElement === e));
        // Another client finishes the remaining daily care while this view is open.
        // Closing now has no invitation target, so focus must return to the world.
        for (const plant of state.plants) plant.member1_submitted = true;
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await page.getByRole('dialog').locator('[data-who="you"][data-cared]').waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page.getByRole('button', { name: 'Choose a flower' }).waitFor({ timeout: 15000 });
        assert.equal(await page.locator('[data-garden-scroll]').getAttribute('data-distance'), distance);
        assert.equal(await invitation.count(), 0);
        await page.waitForFunction(() => document.activeElement?.matches('[data-garden-world]'));
        assert.deepEqual(errors, []);
        results.push({ motion, delayedGpu: true, realTrustedTypingBeforeDevice: true, newerRealUuidAndFocus: true, nextDisappearedReturnsWorldFocus: true, returnDistancePreserved: true, noAutomaticMutation: true, calls });
        await page.screenshot({ path: out + '/' + motion + '-preframe-return.png' });
        await context.close();
        console.log(motion, 'delayedGPU passed');
    }
    // Native normal arrival remains bounded and withholds ordinary invitation until settled.
    {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' }), page = await context.newPage();
        page.setDefaultTimeout(15000);
        const calls = await mock(page, compactFixture('mixed'));
        await page.goto(base + '/dev/garden-areas?arrival=1');
        const start = Date.now();
        await page.locator('[data-arrival-light]').waitFor();
        assert.equal(await page.locator('[data-garden-invitation]').count(), 0);
        await page.getByRole('button', { name: 'Choose a flower' }).waitFor({ timeout: 15000 });
        assert(await page.locator('[data-garden-invitation]').isVisible());
        results.push({ motion: 'no-preference', arrivalRetained: true, settledWithinMs: Date.now() - start, calls });
        await context.close();
    }
    for (const motion of ['no-preference', 'reduce']) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: motion }), page = await context.newPage();
        page.setDefaultTimeout(15000);
        const state = compactFixture('mixed'), p = state.plants.find(p => p.flower.type_key === 'dandelion');
        p.flower.first_bloom_at = state.server_now;
        p.flower.first_bloom_day = state.garden_day;
        p.flower.fulfilled_at = null;
        const calls = await mock(page, state);
        await page.goto(base + '/dev/garden-areas');
        await page.getByRole('button', { name: 'Choose a flower' }).waitFor({ timeout: 90000 });
        await page.locator(`[data-plot-spot="${p.flower.spot}"]`).focus();
        await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'our wish came true', exact: true }).click();
        await page.getByRole('button', { name: 'blow the seeds', exact: true }).click();
        await page.getByText(/You blew the seeds on/).waitFor();
        const started = Date.now();
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        assert.equal(await page.getByRole('button', { name: 'Choose a flower' }).count(), 0);
        await page.getByRole('button', { name: 'Choose a flower' }).waitFor({ timeout: 15000 });
        results.push({ motion, boundedDandelionHold: true, elapsedUntilNativeNavigationMs: Date.now() - started, exactlyOneExplicitMutation: calls.filter(c => c.name === 'mutateGardenV2').length === 1, calls });
        await context.close();
        console.log(motion, 'seed ritual passed');
    }
}
finally {
    await browser.close();
    writeFileSync(out + '/observations.json', JSON.stringify({ meta, results }, null, 2));
}
console.log('lifecycle done');
