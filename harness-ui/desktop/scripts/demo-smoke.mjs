/** Smoke of the packaged application, not a fixture, showcase or intercepted API. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
const { _electron } = require('../../frontend/node_modules/playwright');
const executablePath = resolve(process.argv[2] || '');
const evidence = resolve('harness-ui/desktop/.prove/harness-demo');
const profile = resolve(process.env.RUNNER_TEMP || evidence, 'talos-harness-demo-profile');
await mkdir(evidence, { recursive: true });
assert.equal(process.platform, 'win32', 'This smoke exercises the Windows package.');
assert.ok(executablePath.endsWith('TALOS.exe'), 'Pass the packaged TALOS.exe.');
const result = { sourceCommit: process.env.TALOS_DEMO_SOURCE_SHA || null, startedAt: new Date().toISOString(), mockedApis: false, checks: {}, completed: false };
const pageErrors = [];
let electronApp;
let page;
let childPid;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await wait(100); }
  throw new Error('Packaged application did not reach the expected state.');
}
const clean = value => String(value).replace(/([?&]token=)[^\s&'"<>]+/g, '$1[redacted]');
try {
  const env = { ...process.env, TALOS_DESKTOP_DATA_DIR: profile, TALOS_INTRO: '0' };
  for (const name of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'TALOS_DESKTOP_HARNESS_DIR', 'TALOS_OWNER_RUNTIME_MODULE', 'TALOS_HARNESS_UI_PUBLIC_DIR']) delete env[name];
  electronApp = await _electron.launch({ executablePath, env, timeout: 60000 });
  page = await electronApp.firstWindow({ timeout: 60000 });
  page.on('pageerror', error => pageErrors.push(clean(error.message)));
  await page.waitForURL(url => url.hostname === '127.0.0.1' && url.pathname === '/' && !url.search, { timeout: 45000 });
  await page.locator('.talos-shell').waitFor({ state: 'visible', timeout: 45000 });
  assert.equal(await page.locator('#schermoChat').count(), 1);
  result.checks.realHarnessShell = true;
  const base = new URL(page.url()).origin;
  assert.equal((await fetch(base + '/api/v1/health')).status, 401);
  assert.equal(await page.evaluate(async () => (await fetch('/api/v1/health')).status), 200);
  result.checks.authenticatedBackend = true;
  const cookie = (await electronApp.context().cookies()).find(c => c.name === 'talos_token');
  assert.ok(cookie?.httpOnly);
  assert.equal(cookie.sameSite, 'Strict');
  const protections = await electronApp.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration };
  });
  assert.deepEqual(protections, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  result.checks.rendererProtections = protections;
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
  await wait(700);
  await page.screenshot({ path: join(evidence, 'harness-real-home.png') });
  let output = '';
  page.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
    const frame = Buffer.from(payload);
    if (frame[0] === 0) output += frame.subarray(1).toString('utf8');
  }));
  await page.locator('[data-mode="terminal"]').first().click();
  const input = page.locator('.xterm-helper-textarea').first();
  await input.waitFor({ state: 'attached', timeout: 20000 });
  await input.focus();
  await page.keyboard.type('echo TALOS-HARNESS-DEMO-REAL');
  await page.keyboard.press('Enter');
  await until(() => /(^|\n)TALOS-HARNESS-DEMO-REAL\r?\n/.test(output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')));
  result.checks.realPtyCommand = true;
  await page.screenshot({ path: join(evidence, 'harness-real-terminal.png') });
  await page.keyboard.type('exit');
  await page.keyboard.press('Enter');
  await page.reload();
  assert.equal(await page.evaluate(async () => (await fetch('/api/v1/health')).status), 200);
  result.checks.reloadWithSessionCookie = true;
  assert.deepEqual(pageErrors, []);
  result.checks.pageErrors = [];
  childPid = await electronApp.evaluate(() => process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess')?.pid);
  assert.ok(childPid, 'The actual local backend must be a child process.');
  result.exeSha256 = createHash('sha256').update(await readFile(executablePath)).digest('hex');
  await electronApp.close();
  electronApp = null;
  await until(() => { try { process.kill(childPid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } }, 10000);
  result.checks.backendStopsWithApplication = true;
  result.completed = true;
} catch (error) {
  result.error = clean(error?.stack || error);
  try { await page?.screenshot({ path: join(evidence, 'harness-real-failure.png') }); } catch { /* Preserve the primary failure. */ }
  throw error;
} finally {
  try { await electronApp?.close(); } catch { /* The result records the primary failure. */ }
  result.finishedAt = new Date().toISOString();
  await writeFile(join(evidence, 'smoke.json'), JSON.stringify(result, null, 2) + '\n');
}
