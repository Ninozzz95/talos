/** REL-01 / ISOL-01: packaged preview, real backend and PTY; no intercepted app APIs. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { stripVTControlCharacters } from 'node:util';
const require = createRequire(import.meta.url);
const { _electron } = require('../../frontend/node_modules/playwright');
const { expect } = require('../../frontend/node_modules/@playwright/test');
const desktop = resolve(import.meta.dirname, '..');
const executablePath = resolve(process.argv[2] || '');
const out = resolve(process.env.TALOS_EVIDENCE_DIR || 'harness-ui/desktop/.prove/ledger-preview');
const unique = randomUUID();
const dataRoot = resolve(process.env.RUNNER_TEMP || tmpdir(), `talos-ledger-${unique}`);
await mkdir(out, { recursive: true });
assert.equal(process.platform, 'win32');
const result = { source: process.env.TALOS_BUILD_SOURCE_COMMIT, mockedApis: false, startedAt: new Date().toISOString(), checks: [], complete: false, pageErrors: [] };
const check = (name, value) => { result.checks.push({ name, passed: Boolean(value) }); assert.ok(value, name); };
const envFor = name => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(TALOS_|OPENROUTER_|OPENAI_|ANTHROPIC_|GOOGLE_API_KEY|NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE)/i.test(k)));
  return { ...env, TALOS_DESKTOP_DATA_DIR: join(dataRoot, name), TALOS_INTRO: '1' };
};
let preview, stable, page, previewPid, stablePid;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeout = 20000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await wait(100); } throw Error('Timed out waiting for real application state.'); }
try {
  const env = envFor('preview');
  env.OPENROUTER_API_KEY = 'test-environment-credential-that-must-not-be-imported';
  // No TALOS_DESKTOP_PROFILE variable: baked package identity must select preview on direct launch.
  preview = await _electron.launch({ executablePath, env, timeout: 60000 });
  page = await preview.firstWindow({ timeout: 60000 });
  page.on('pageerror', error => result.pageErrors.push(error.message));
  await page.waitForURL(url => url.hostname === '127.0.0.1' && url.pathname === '/' && !url.search, { timeout: 45000 });
  await expect(page.locator('html')).toHaveAttribute('data-workspace-ui', 'v2');
  await page.locator('#talosAvvio').waitFor({ state: 'hidden', timeout: 30000 });
  await expect(page.locator('#schermoHome')).toBeVisible();
  check('first launch shows new Home without either wizard', await page.locator('#veloIntro,#introDialog').count() === 0);
  result.identity = await preview.evaluate(({ app }) => ({ name: app.getName(), data: app.getPath('userData'), browser: app.getPath('sessionData'), packaged: app.isPackaged }));
  check('preview identity is baked into the actual executable package', result.identity.name === 'TALOS Preview' && result.identity.packaged);
  check('separate data and browser stores', result.identity.data === env.TALOS_DESKTOP_DATA_DIR && result.identity.browser === join(env.TALOS_DESKTOP_DATA_DIR, 'browser'));
  const base = new URL(page.url()).origin;
  check('backend refuses unauthenticated client', (await fetch(base + '/api/v1/health')).status === 401);
  check('rendered app authenticates to actual backend', await page.evaluate(async () => (await fetch('/api/v1/health')).status) === 200);
  const cookies = await preview.context().cookies(); const cookie = cookies.find(c => c.name === 'talos_token');
  check('session cookie retains HttpOnly and SameSite protection', cookie?.httpOnly && cookie.sameSite === 'Strict');
  result.protections = await preview.evaluate(({ BrowserWindow }) => { const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration }; });
  check('renderer isolation preserved', result.protections.sandbox && result.protections.contextIsolation && !result.protections.nodeIntegration);
  const providers = await page.evaluate(async () => (await (await fetch('/api/v1/providers')).json()).data);
  check('environment credential never configures the preview provider store', Array.isArray(providers?.items) && providers.items.every(p => !p.keyConfigured) && !JSON.stringify(providers).includes(env.OPENROUTER_API_KEY));
  check('preview does not run legacy credential migration', await access(join(env.TALOS_DESKTOP_DATA_DIR, '.chiavi-migrate.json')).then(() => false, () => true));
  await preview.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 960));
  await page.screenshot({ path: join(out, 'home-preview-windows.png') });
  const commandField = page.locator('#veloComandi [role="combobox"]');
  await page.locator('[data-workspace-bar] [data-azione="comandi"]').click();
  await expect(commandField).toBeFocused();
  await commandField.click();
  await expect(page.locator('#risultatiComandi')).toBeVisible();
  await expect(page.locator('#risultatiComandi [role="option"]')).toHaveCount(30);
  await expect.poll(() => page.locator('#veloComandi [role="dialog"]').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  await page.screenshot({ path: join(out, 'commands-preview-windows.png') });
  await commandField.fill('libreria'); await commandField.press('Enter');
  await expect(page.locator('#schermoLibreria')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(commandField).toBeFocused();
  await commandField.fill('home'); await commandField.press('Enter');
  await expect(page.locator('#schermoHome')).toBeVisible();
  check('packaged command registry navigates real views with mouse and keyboard', true);
  await page.getByRole('button', { name: 'Scegli un modello', exact: true }).click();
  await expect(page.locator('#veloModello')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#veloModello')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Scegli un modello', exact: true })).toBeFocused();
  check('real model sheet closes and restores keyboard focus', true);
  await page.locator('[data-workspace-density]').click();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.getByRole('combobox', { name: 'Disposizione del workspace' }).selectOption('research');
  await page.reload(); await page.locator('#talosAvvio').waitFor({ state: 'hidden' });
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-workspace-preset', 'research');
  check('real Chromium preferences survive reload', true);
  await page.locator('[data-workspace-density]').click();
  await page.getByRole('combobox', { name: 'Disposizione del workspace' }).selectOption('development');
  let output = ''; const controls = [];
  page.on('websocket', ws => ws.on('framereceived', ({ payload }) => { const frame = Buffer.from(payload); if (frame[0] === 0) output += frame.subarray(1).toString('utf8'); else if (frame[0] === 1) { try { controls.push(JSON.parse(frame.subarray(1).toString())); } catch {} } }));
  await page.locator('#schermoHome').getByRole('button', { name: /^Terminale/ }).click();
  const input = page.locator('#schermoTerminale .xterm-helper-textarea').first();
  await input.waitFor({ state: 'attached' }); await input.focus();
  await page.keyboard.type('echo TALOS-REFACTOR-REAL'); await page.keyboard.press('Enter');
  await until(() => stripVTControlCharacters(output).split(/\r?\n/).some(line => line.trim() === 'TALOS-REFACTOR-REAL'));
  check('packaged terminal executes actual command', true);
  await page.screenshot({ path: join(out, 'terminal-preview-windows.png') });
  await page.keyboard.type('exit'); await page.keyboard.press('Enter');
  await until(() => controls.some(c => c.evento === 'uscita'));
  // A second normal source shell runs at the same time in its own temporary profile.
  stable = await _electron.launch({ executablePath: require('electron'), args: [desktop], env: envFor('stable'), timeout: 60000 });
  const stablePage = await stable.firstWindow({ timeout: 60000 });
  await stablePage.waitForURL(url => url.hostname === '127.0.0.1' && url.pathname === '/' && !url.search, { timeout: 45000 });
  await stablePage.locator('#talosAvvio').waitFor({ state: 'hidden', timeout: 30000 });
  const stableIdentity = await stable.evaluate(({ app }) => ({ name: app.getName(), data: app.getPath('userData'), browser: app.getPath('sessionData') }));
  check('normal TALOS and preview coexist without sharing the single-instance lock', stableIdentity.name === 'TALOS' && await page.locator('.talos-shell').count() === 1);
  check('profiles have distinct data, browser and HTTP origins', stableIdentity.data !== result.identity.data && stableIdentity.browser !== result.identity.browser && new URL(stablePage.url()).origin !== base);
  await stablePage.evaluate(() => localStorage.setItem('talos.isolation.probe', 'stable'));
  check('preview cannot see stable browser state', await page.evaluate(() => localStorage.getItem('talos.isolation.probe')) === null);
  await page.evaluate(() => localStorage.setItem('talos.isolation.probe', 'preview'));
  check('preview writes leave normal browser state unchanged', await stablePage.evaluate(() => localStorage.getItem('talos.isolation.probe')) === 'stable');
  // The Playwright evaluation VM has no ESM dynamic-import callback. Use the
  // Node built-in loader in the *main process*, not a renderer bridge or eval bypass.
  // This still loads and tests the actual native keyring shipped in the package.
  result.keyring = await preview.evaluate((_electron, account) => {
    const { createRequire } = process.getBuiltinModule('module');
    const { join } = process.getBuiltinModule('path');
    const req = createRequire(join(process.resourcesPath, 'harness-ui', 'package.json'));
    const { Entry } = req('@napi-rs/keyring');
    const stable = new Entry('talos-ledger-isolation-probe-desktop', account);
    const preview = new Entry('talos-ledger-isolation-probe-desktop-preview', account);
    try {
      stable.setPassword('synthetic-stable'); preview.setPassword('synthetic-preview');
      const distinct = stable.getPassword() === 'synthetic-stable' && preview.getPassword() === 'synthetic-preview';
      preview.deletePassword(); return { distinct, stablePreserved: stable.getPassword() === 'synthetic-stable' };
    } finally { try { stable.deletePassword(); } catch {} try { preview.deletePassword(); } catch {} }
  }, unique);
  check('OS credential namespaces are distinct and preview deletion preserves stable sentinel', result.keyring.distinct && result.keyring.stablePreserved);
  check('no uncaught page errors during packaged journeys', result.pageErrors.length === 0);
  previewPid = await preview.evaluate(() => process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess')?.pid);
  stablePid = await stable.evaluate(() => process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess')?.pid);
  assert.ok(previewPid && stablePid && previewPid !== stablePid);
  await stable.close(); stable = null; await preview.close(); preview = null;
  for (const pid of [previewPid, stablePid]) await until(() => { try { process.kill(pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } });
  check('both actual backends terminate with their application', true);
  result.exeSha256 = createHash('sha256').update(await readFile(executablePath)).digest('hex');
  result.complete = true;
} catch (error) {
  result.error = String(error.stack || error).replace(/([?&]token=)[^\s&'"<>]+/g, '$1[redacted]');
  try { await page?.screenshot({ path: join(out, 'failure.png') }); } catch {}
  process.exitCode = 1;
} finally {
  try { await stable?.close(); } catch {} try { await preview?.close(); } catch {}
  result.finishedAt = new Date().toISOString();
  await writeFile(join(out, 'qualification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
