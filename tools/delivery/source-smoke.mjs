/** REL-01: execute the extracted source application with its prepared private tools. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { stripVTControlCharacters } from 'node:util';
import { cleanEnvironment, digest, root } from './start.mjs';
const require = createRequire(join(root, 'harness-ui/frontend/package.json'));
const { _electron } = require('playwright');
const { expect } = require('@playwright/test');
const requireDesktop = createRequire(join(root, 'harness-ui/desktop/package.json'));
const out = resolve(process.env.TALOS_EVIDENCE_DIR || join(root, '.talos-runtime/source-qualification'));
await mkdir(out, { recursive: true });
assert.equal(process.platform, 'win32');
const source = (await readFile(join(root, 'SOURCE_COMMIT.txt'), 'utf8')).trim();
const prepared = JSON.parse(await readFile(join(root, '.talos-runtime/prepared.json'), 'utf8'));
const data = join(process.env.RUNNER_TEMP || tmpdir(), 'talos-source-proof-' + randomUUID());
const env = cleanEnvironment(process.env, { dataDir: data });
env.TALOS_LLAMA_SERVER_PATH = prepared.runtime.path;
const result = { source, node: process.version, type: 'extracted-source-actual-Electron', mocks: false, checks: [], errors: [], complete: false };
const check = (name, pass) => { result.checks.push({ name, passed: Boolean(pass) }); assert.ok(pass, name); };
let app, page, backendPid;
try {
  check('prepared UI equals the actual served bundle', prepared.appJsSha256 === await digest(join(root, 'harness-ui/public/app.js')));
  check('prepared native local runtime exists', await access(prepared.runtime.path).then(() => true, () => false));
  app = await _electron.launch({ executablePath: requireDesktop('electron'), args: [join(root, 'harness-ui/desktop')], env, timeout: 60000 });
  page = await app.firstWindow({ timeout: 60000 });
  page.on('pageerror', error => result.errors.push(error.message));
  await page.waitForURL(url => url.hostname === '127.0.0.1' && url.pathname === '/' && !url.search, { timeout: 45000 });
  await page.locator('#talosAvvio').waitFor({ state: 'hidden', timeout: 30000 });
  await expect(page.locator('html')).toHaveAttribute('data-workspace-ui', 'v2');
  await expect(page.locator('#schermoHome')).toBeVisible();
  check('actual home starts with neither mandatory wizard', await page.locator('#veloIntro,#introDialog,[data-apre-velo="veloIntro"]').count() === 0);
  const identity = await app.evaluate(({ app, BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { name: app.getName(), data: app.getPath('userData'), browser: app.getPath('sessionData'), sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration };
  });
  result.identity = identity;
  check('source launcher selects the isolated preview identity', identity.name === 'TALOS Preview' && identity.data === data && identity.browser === join(data, 'browser'));
  check('Electron security settings remain enabled', identity.sandbox && identity.contextIsolation && identity.nodeIntegration === false);
  const base = new URL(page.url()).origin;
  check('real backend refuses unauthenticated requests', (await fetch(base + '/api/v1/health')).status === 401);
  check('renderer authenticates to the real backend', await page.evaluate(async () => (await fetch('/api/v1/health')).status) === 200);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 960));
  await page.screenshot({ path: join(out, 'source-home-windows.png') });
  const search = page.locator('#veloComandi [role="combobox"]');
  await page.locator('[data-workspace-bar] [data-azione="comandi"]').click();
  await expect(search).toBeFocused();
  await search.fill('libreria'); await search.press('Enter');
  await expect(page.locator('#schermoLibreria')).toBeVisible();
  await page.keyboard.press('Control+k'); await expect(search).toBeFocused();
  await search.fill('home'); await search.press('Enter');
  await expect(page.locator('#schermoHome')).toBeVisible();
  check('real command registry navigates resource and home views', true);
  await page.locator('[data-workspace-density]').click();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.reload(); await page.locator('#talosAvvio').waitFor({ state: 'hidden' });
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  check('source app retains preferences on reload', true);
  let output = ''; const controls = [];
  page.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
    const frame = Buffer.from(payload);
    if (frame[0] === 0) output += frame.subarray(1).toString('utf8');
    else if (frame[0] === 1) { try { controls.push(JSON.parse(frame.subarray(1).toString())); } catch {} }
  }));
  await page.locator('#schermoHome').getByRole('button', { name: /^Terminale/ }).click();
  const terminal = page.locator('#schermoTerminale .xterm-helper-textarea').first();
  await terminal.waitFor({ state: 'attached' }); await terminal.focus();
  await page.keyboard.type('echo TALOS-ONECLICK-SOURCE-REAL'); await page.keyboard.press('Enter');
  await expect.poll(() => stripVTControlCharacters(output).split(/\r?\n/).some(line => line.trim() === 'TALOS-ONECLICK-SOURCE-REAL'), { timeout: 20000 }).toBe(true);
  check('source terminal executes a real PTY command', true);
  await page.screenshot({ path: join(out, 'source-terminal-windows.png') });
  await page.keyboard.type('exit'); await page.keyboard.press('Enter');
  await expect.poll(() => controls.some(c => c.evento === 'uscita'), { timeout: 20000 }).toBe(true);
  check('terminal exit is observed rather than inferred from typed text', true);
  check('no uncaught runtime errors in source journeys', result.errors.length === 0);
  backendPid = await app.evaluate(() => process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess')?.pid);
  assert.ok(backendPid);
  await app.close(); app = null;
  await expect.poll(() => { try { process.kill(backendPid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } }, { timeout: 20000 }).toBe(true);
  check('actual backend closes with its application', true);
  result.complete = true;
} catch (error) {
  result.error = String(error.stack || error).replace(/([?&]token=)[^\s&'"<>]+/g, '$1[redacted]');
  try { await page?.screenshot({ path: join(out, 'source-failure.png') }); } catch {}
  process.exitCode = 1;
} finally {
  try { await app?.close(); } catch {}
  result.finishedAt = new Date().toISOString();
  await writeFile(join(out, 'qualification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
