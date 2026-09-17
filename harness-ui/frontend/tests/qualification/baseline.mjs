/** BASE-02: real frontend and real HTTP server, with an isolated data directory. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
const root = resolve(import.meta.dirname, '../../../..');
const out = resolve(process.env.TALOS_EVIDENCE_DIR || join(root, 'harness-ui/frontend/test-results/ledger'));
const data = await mkdtemp(join(tmpdir(), 'talos-ledger-baseline-'));
const port = Number(process.env.TALOS_TEST_PORT || 5191);
const base = `http://127.0.0.1:${port}`;
await mkdir(out, { recursive: true });
let logs = '';
const server = spawn(process.execPath, [join(root, 'harness-ui/server.mjs')], {
  cwd: root,
  env: { ...process.env, TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(port), TALOS_DESKTOP_DATA_DIR: data, TALOS_HARNESS_UI_SESSIONS_DIR: join(data, 'sessions'), TALOS_HARNESS_UI_PUBLIC_DIR: join(root, 'harness-ui/frontend/dist'), TALOS_INTRO: process.env.TALOS_EXPECT_REFACTOR ? '1' : '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', d => { logs += String(d); });
server.stderr.on('data', d => { logs += String(d); });
const result = { source: process.env.GITHUB_SHA || null, node: process.version, platform: process.platform, mockedApis: false, screens: [], overlays: [], pageErrors: [], completed: false };
let browser;
try {
  const end = Date.now() + 20000;
  for (;;) {
    try { if ((await fetch(base + '/api/v1/health')).ok) break; } catch {}
    if (server.exitCode !== null || Date.now() > end) throw new Error('Server did not become ready: ' + logs);
    await wait(100);
  }
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'it-IT' });
  page.on('pageerror', error => result.pageErrors.push(String(error.message)));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.talos-shell').waitFor();
  await page.locator('#talosAvvio').waitFor({ state: 'hidden', timeout: 15000 });
  await page.screenshot({ path: join(out, 'startup.png') });
  result.startup = { screen: await page.locator('html').getAttribute('data-schermo'), introCount: await page.locator('#veloIntro,#introDialog').count(), text: (await page.locator('body').innerText()).slice(0, 4000) };
  for (const name of ['home', 'chat', 'note', 'attivita', 'libreria', 'memoria', 'ricerca', 'progetti', 'board', 'impostazioni', 'modelli', 'capability', 'officina', 'automazioni', 'doctor', 'browser', 'terminale']) {
    const target = page.locator(`[data-vaia="${name}"]`).first();
    if (!await target.count()) { result.screens.push({ name, status: 'not-present' }); continue; }
    try {
      await target.evaluate(el => el.click());
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(out, `view-${name}.png`) });
      result.screens.push({ name, screen: await page.locator('html').getAttribute('data-schermo'), status: 'captured', text: (await page.locator('body').innerText()).slice(-2000) });
    } catch (e) { result.screens.push({ name, status: 'failed', error: e.message }); }
  }
  result.completed = true;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await writeFile(join(out, 'server.log'), logs);
  await writeFile(join(out, 'baseline.json'), JSON.stringify(result, null, 2));
}
