/** Screenshot inventory for SET-01 / MODEL-01. Uses the real server; never runs inference. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
const root = resolve(import.meta.dirname, '../../../..');
const out = resolve(process.env.TALOS_EVIDENCE_DIR || join(root, 'harness-ui/frontend/test-results/settings-models'));
const data = await mkdtemp(join(tmpdir(), 'talos-settings-models-'));
const base = 'http://127.0.0.1:5196';
await mkdir(out, { recursive: true });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(TALOS_|OPENAI_|ANTHROPIC_|OPENROUTER_|GOOGLE_API_KEY|GEMINI_API_KEY|NODE_OPTIONS)/i.test(key)));
const result = { source: process.env.GITHUB_SHA || null, node: process.version, mockedApis: false, paidInference: false, screenshots: [], errors: [], warnings: [], failures: [], inspectedVisually: false };
const server = spawn(process.execPath, [join(root, 'harness-ui/server.mjs')], { cwd: root, env: { ...env, TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: '5196', TALOS_DESKTOP_PROFILE: 'preview', TALOS_DESKTOP_DATA_DIR: data, TALOS_HARNESS_UI_SESSIONS_DIR: join(data, 'sessions'), TALOS_HARNESS_UI_PUBLIC_DIR: join(root, 'harness-ui/frontend/dist') }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', browser, page;
server.stdout.on('data', d => { logs += d; });
server.stderr.on('data', d => { logs += d; });
async function capture(name) {
  await wait(150);
  const file = name + '.png';
  await page.screenshot({ path: join(out, file), fullPage: true });
  result.screenshots.push({ name, file, viewport: page.viewportSize(), overflow: await page.evaluate(() => ({ document: document.documentElement.scrollWidth > innerWidth + 1 })) });
}
async function scenario(name, fn) {
  try { await fn(); } catch (e) { result.failures.push({ name, error: String(e.stack || e) }); try { await capture('failure-' + name); } catch { /* Preserve the first error. */ } }
}
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(base + '/api/v1/health')).ok) break; } catch { /* Server startup. */ }
    if (server.exitCode !== null || Date.now() > deadline) throw Error('Server unavailable: ' + logs.slice(-4000));
    await wait(100);
  }
  browser = await chromium.launch(process.env.TALOS_TEST_CHROMIUM ? { executablePath: process.env.TALOS_TEST_CHROMIUM } : {});
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', locale: 'it-IT' });
  page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', e => result.errors.push(e.message));
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) result.warnings.push({ type: m.type(), text: m.text().slice(0, 500) }); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#talosAvvio').waitFor({ state: 'hidden', timeout: 20000 });
  await page.locator('.talos-sidebar [data-vaia="impostazioni"]').first().click();
  await page.locator('#schermoImpostazioni').waitFor({ state: 'visible' });
  const ids = await page.locator('#schermoImpostazioni [data-settings-tab]').evaluateAll(nodes => nodes.map(n => n.dataset.settingsTab));
  if (ids.length !== 10 || new Set(ids).size !== 10) throw Error('Expected the ten existing settings destinations.');
  result.sections = ids;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const id of ids) await scenario('settings-' + id + '-' + width, async () => {
      await page.locator('#schermoImpostazioni [data-settings-tab="' + id + '"]').click();
      await page.locator('[data-settings-panel="' + id + '"]').waitFor({ state: 'visible' });
      await capture('settings-' + id + '-dark-' + width);
      if (width === 1440) await writeFile(join(out, 'settings-' + id + '.html'), await page.locator('#schermoImpostazioni').innerHTML());
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#schermoImpostazioni [data-settings-tab="models"]').click();
  const keys = await page.locator('#setting-panel-models [data-model-lab-tab]').evaluateAll(nodes => nodes.map(n => n.dataset.modelLabTab));
  result.modelSections = keys;
  if (keys.length !== 6 || new Set(keys).size !== 6) throw Error('Expected six model laboratory destinations.');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const key of keys) await scenario('models-' + key + '-' + width, async () => {
      await page.locator('#setting-panel-models [data-model-lab-tab="' + key + '"]').click();
      await page.locator('#setting-panel-models [data-model-lab-panel="' + key + '"]').waitFor({ state: 'visible' });
      await capture('models-' + key + '-dark-' + width);
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#schermoImpostazioni [data-settings-tab="appearance"]').click();
  for (const [name, query] of [['search-motion', 'elastica'], ['search-provider', 'provider'], ['search-empty', 'zz-no-setting']]) await scenario(name, async () => {
    await page.locator('[data-settings-query]').fill(query);
    await capture(name);
  });
  await page.locator('[data-settings-query]').fill('');
  await writeFile(join(out, 'settings-dom.html'), await page.locator('#schermoImpostazioni').innerHTML());
  result.controls = await page.locator('#schermoImpostazioni input,#schermoImpostazioni select,#schermoImpostazioni textarea').evaluateAll(nodes => nodes.map(n => ({ id: n.id, type: n.type, row: n.closest('[data-setting-row]')?.dataset.settingRow || null, hidden: !n.getClientRects().length })));
} catch (e) { result.failures.push({ name: 'setup', error: String(e.stack || e) }); }
finally {
  await browser?.close();
  if (server.exitCode === null) { const exit = once(server, 'exit'); server.kill('SIGTERM'); const ended = await Promise.race([exit.then(() => true), wait(8000).then(() => false)]); if (!ended) { server.kill('SIGKILL'); result.failures.push({ name: 'shutdown', error: 'Graceful shutdown timed out.' }); } }
  await writeFile(join(out, 'capture.json'), JSON.stringify(result, null, 2));
  await writeFile(join(out, 'server.log'), logs);
}
console.log(JSON.stringify({ screenshots: result.screenshots.length, sections: result.sections, modelSections: result.modelSections, failures: result.failures, errors: result.errors }, null, 2));
if (result.failures.length || result.errors.length) process.exitCode = 1;
