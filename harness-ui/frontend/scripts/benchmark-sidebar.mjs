/** Reproducible before/after probe; requires built baseline and candidate frontends. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';
import { createHttpApp } from '../../src/http-app.mjs';
import { createStaticHandler } from '../../src/static-files.mjs';
import { fixtureRows, installSidebarFixture } from '../tests/fixtures/sidebar-fixture.mjs';

const baseline = process.argv[2];
if (!baseline) throw new Error('Usage: node scripts/benchmark-sidebar.mjs <baseline-dist-directory>');
const output = resolve('artifacts/sidebar-benchmark'); await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const [version, directory] of [['before', resolve(baseline)], ['after', resolve('dist')]]) {
    const temporary = await mkdtemp(join(tmpdir(), 'sidebar-benchmark-'));
    const app = createHttpApp({ staticHandler: createStaticHandler(directory), cartellaNote: join(temporary, 'notes'),
      cartellaAttivita: join(temporary, 'tasks'), cartellaMemoria: join(temporary, 'memory') });
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      for (const size of [5, 50, 200, 1000]) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Rome', reducedMotion: 'reduce' });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let rows = fixtureRows(size).map(row => ({ ...row, conclusa: true, inAttesaApprovazione: false, ultimoEsito: 'successo' }));
        await installSidebarFixture(page, { rows });
        await page.route(/\/api\/v1\/sessions(?:\?.*)?$/, route => route.fulfill({ json: { ok: true, data: { items: rows }, meta: {} } }));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(n => document.querySelectorAll('#realSessionsBlock .real-session-item').length === n, size);
        await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
        await page.evaluate(() => document.activeElement?.blur());
        if (size === 50) await page.locator('#sessionsPanel').screenshot({ path: join(output, `${version}-50-dark.png`) });
        const measurements = [];
        for (let attempt = 0; attempt < 5; attempt++) {
          rows[2] = { ...rows[2], usageSessione: { giri: rows[2].usageSessione.giri + 1 } };
          const result = await page.evaluate(async ({ version, changed }) => {
            const root = document.querySelector('#realSessionsBlock');
            const previous = [...root.querySelectorAll('.real-session-item')];
            const focus = previous[0]; focus.focus();
            const mutations = [];
            const observer = new MutationObserver(records => mutations.push(...records));
            observer.observe(root, { childList: true, subtree: true });
            const start = performance.now();
            if (version === 'before') await window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali();
            else window.__sidebarTest.delta([changed]);
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const durationMs = performance.now() - start;
            observer.disconnect();
            const current = [...root.querySelectorAll('.real-session-item')];
            const retained = new Set(current);
            return { durationMs, retainedRows: previous.filter(row => retained.has(row)).length,
              focusRetained: document.activeElement === focus, rows: current.length,
              addedDirectChildren: mutations.filter(m => m.target === root).reduce((n, m) => n + m.addedNodes.length, 0),
              removedDirectChildren: mutations.filter(m => m.target === root).reduce((n, m) => n + m.removedNodes.length, 0) };
          }, { version, changed: rows[2] });
          assert.equal(result.rows, size);
          if (version === 'after') { assert.equal(result.retainedRows, size); assert.equal(result.focusRetained, true); assert.equal(result.addedDirectChildren, 0); assert.equal(result.removedDirectChildren, 0); }
          measurements.push(result);
        }
        assert.deepEqual(errors, []);
        const durations = measurements.map(m => m.durationMs).sort((a,b) => a-b);
        results.push({ version, size, medianMs: durations[2], minMs: durations[0], maxMs: durations[4], measurements });
        await context.close();
      }
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(temporary, { recursive: true, force: true }); }
  }
} finally { await browser.close(); }
const report = { node: process.version, platform: process.platform,
  methodology: 'One changed session; 5 repetitions; real compiled frontend; includes two animation frames and, on baseline only, its required local HTTP list fetch. Not a pure CPU/paint measurement. Same browser/viewport/theme/dataset; reduced motion. No model calls.', results };
await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
