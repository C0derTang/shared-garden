/* global document,window,MutationObserver,performance,getComputedStyle,innerWidth,innerHeight,requestAnimationFrame */
import process from 'node:process';
import console from 'node:console';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = process.cwd(), { installReadOnlyFixture } = await import(root + '/scripts/profiling/scenic-browser-fixture.mjs'), { evidenceMetadata } = await import(root + '/scripts/profiling/scenic-evidence.mjs'), out = process.env.PROFILE_OUTPUT || '/tmp/ccapp-230-visible-latency', base = process.env.BASE_URL || 'http://127.0.0.1:3234';
mkdirSync(out, { recursive: true });
const meta = evidenceMetadata(out), fixture = JSON.parse(readFileSync(root + '/scripts/profiling/fixtures/type-area-garden.json', 'utf8'));
const manifest = () => Object.fromEntries(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { encoding: 'utf8' }).trim().split('\n').filter(f => !f.includes('.test.')).sort().map(f => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]));
const source = manifest();
writeFileSync(out + '/source-start.json', JSON.stringify(source, null, 2));
const results = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ['--enable-unsafe-webgpu'] });
try {
    for (const [view, width, height] of [['desktop', 1280, 800], ['phone', 390, 844], ['landscape', 844, 390], ['narrow', 800, 600]])
        for (const motion of ['no-preference', 'reduce']) {
            const context = await browser.newContext({ viewport: { width, height }, reducedMotion: motion }), page = await context.newPage();
            const calls = await installReadOnlyFixture(page, base, fixture);
            await page.goto(base + '/dev/garden-areas');
            await page.locator('[data-garden-world][data-status="ready"]').waitFor({ timeout: 90000 });
            await page.waitForTimeout(1500);
            for (let i = 0; i < 4; i++) {
                await page.locator('[data-plot-spot="1"]').focus();
                await page.evaluate(() => { window.__sample = {}; document.querySelector('[data-plot-spot="1"]').addEventListener('click', () => { const s = window.__sample; s.started = performance.now(); let observer = new MutationObserver(() => { if (document.querySelector('[role="dialog"] textarea')) {
                    s.domMs = performance.now() - s.started;
                    observer.disconnect();
                } }); observer.observe(document.body, { childList: true, subtree: true }); const hit = () => { const field = document.querySelector('[role="dialog"] textarea'); if (field) {
                    const r = field.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
                    let opacity = 1;
                    for (let n = field; n && n !== document.body; n = n.parentElement)
                        opacity *= Number(getComputedStyle(n).opacity);
                    if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y) === field && opacity >= .95) {
                        s.visibleHitMs = performance.now() - s.started;
                        return;
                    }
                } requestAnimationFrame(hit); }; requestAnimationFrame(hit); }, { once: true }); });
                await page.keyboard.press('Enter');
                const field = page.getByRole('dialog', { name: 'rose', exact: true }).getByRole('textbox');
                await field.click();
                await page.keyboard.type('x');
                assert.equal(await field.inputValue(), 'x');
                await page.waitForFunction(() => window.__sample.visibleHitMs !== undefined, undefined, { timeout: 10000 }).catch(async (error) => { await page.screenshot({ path: out + '/failure.png' }); writeFileSync(out + '/failure.json', JSON.stringify(await page.evaluate(() => { const f = document.querySelector('[role="dialog"] textarea'), r = f?.getBoundingClientRect(); return { sample: window.__sample, rect: r?.toJSON(), hit: r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML, style: f && getComputedStyle(f).cssText }; }), null, 2)); throw error; });
                const sample = await page.evaluate(() => ({ ...window.__sample, trustedTypedMs: performance.now() - window.__sample.started, focused: document.activeElement?.tagName }));
                assert(sample.domMs >= 0 && sample.visibleHitMs >= 0);
                results.push({ view, width, height, motion, i, ...sample });
                await page.keyboard.press('Escape');
                await page.getByRole('button', { name: 'Choose a flower' }).waitFor({ timeout: 15000 });
                await page.waitForTimeout(50);
            }
            assert(!calls.some(name => name?.startsWith('mutate')));
            writeFileSync(out + '/latency.json', JSON.stringify({ meta, method: 'Replay from recorded source; real trusted Enter on ordinary plot, DOM appearance via MutationObserver; first center within viewport/elementFromPoint===textarea and cumulative opacity>=.95; trusted Playwright field.click waits stable/scrolls and real keyboard x verified. Native frames/timers; world ready before every sample. All retain existing650ms+80ms panel transition; loopback mocked read-only network. Not universal device/FPS claim.', results, calls }, null, 2));
            await context.close();
            console.log(view, motion, 'passed');
        }
}
finally {
    await browser.close();
    writeFileSync(out + '/source-end.json', JSON.stringify(manifest(), null, 2));
    assert.deepEqual(manifest(), source);
}
console.log('complete', results.length);
