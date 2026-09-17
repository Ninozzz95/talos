/** Real server and built application. No mocked API, injected session or model call. */
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { SCREEN_BY_VIEW, DESTINATION_BY_VIEW } from '../../src/domain/navigation.ts';

const root = resolve(import.meta.dirname, '../../../..');
const out = resolve(process.env.TALOS_EVIDENCE_DIR || join(root, 'harness-ui/frontend/test-results/workspace-real'));
const data = await mkdtemp(join(tmpdir(), 'talos-workspace-real-'));
const base = `http://127.0.0.1:${Number(process.env.TALOS_TEST_PORT || 5193)}`;
await mkdir(out, { recursive: true });
const result = { source: process.env.GITHUB_SHA || null, node: process.version, mockedApis: false,
  checks: [], screens: [], errors: [], warnings: [], failedCases: [], complete: false };
const check = (name, condition) => { result.checks.push({ name, passed: Boolean(condition) }); assert.ok(condition, name); };
let logs = '', browser, page;
let ptyOutput = ''; const ptyControls = [];
const server = spawn(process.execPath, [join(root, 'harness-ui/server.mjs')], {
  cwd: root, env: { ...process.env, TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: new URL(base).port,
    TALOS_DESKTOP_DATA_DIR: data, TALOS_HARNESS_UI_SESSIONS_DIR: join(data, 'sessions'),
    TALOS_HARNESS_UI_PUBLIC_DIR: join(root, 'harness-ui/frontend/dist'), TALOS_INTRO: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', d => { logs += String(d); });
server.stderr.on('data', d => { logs += String(d); });
async function scenario(name, action) {
  try { await action(); }
  catch (error) {
    result.failedCases.push({ name, error: String(error.stack || error) });
    try { await page.screenshot({ path: join(out, `failure-${name}.png`) }); } catch { /* Keep original failure. */ }
  }
}
async function navigate(destination, expectedScreen) {
  const target = page.locator(`.talos-sidebar [data-vaia="${destination}"]`).first();
  const group = await target.evaluate(el => el.closest('[id].td-nav-group')?.id || '');
  if (!await target.isVisible() && group) {
    const disclosure = page.locator(`button[aria-controls="${group}"]`).first();
    if (await disclosure.getAttribute('aria-expanded') === 'false') await disclosure.click();
  }
  await target.click();
  await expect(page.locator('html')).toHaveAttribute('data-schermo', DESTINATION_BY_VIEW[expectedScreen] || expectedScreen);
  check(`destination ${destination} renders its screen`, await page.locator(`#${SCREEN_BY_VIEW[expectedScreen]}`).isVisible());
}

try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(base + '/api/v1/health')).ok) break; } catch { /* Starting. */ }
    if (server.exitCode !== null || Date.now() > deadline) throw Error('Server unavailable: ' + logs);
    await wait(100);
  }
  browser = await chromium.launch(process.env.TALOS_TEST_CHROMIUM ? { executablePath: process.env.TALOS_TEST_CHROMIUM } : {});
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'it-IT', colorScheme: 'dark' });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  // Listen before navigation: a real terminal may connect before its view is selected.
  page.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
    const frame = Buffer.from(payload);
    if (frame[0] === 0) ptyOutput += frame.subarray(1).toString('utf8');
    if (frame[0] === 1) { try { ptyControls.push(JSON.parse(frame.subarray(1).toString('utf8'))); } catch { /* Non-control text is not a PTY result. */ } }
  }));
  page.on('pageerror', e => result.errors.push(e.message));
  page.on('console', m => { if (['warning', 'error'].includes(m.type())) result.warnings.push({ type: m.type(), text: m.text().slice(0, 600) }); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.workspaceUi === 'v2' && document.documentElement.dataset.schermo === 'home');
  await page.locator('#talosAvvio').waitFor({ state: 'hidden', timeout: 15000 });
  await page.locator('#schermoHome [aria-busy="false"]').waitFor();
  await scenario('home', async () => {
    check('fresh profile has real Home', await page.locator('#schermoHome').isVisible());
    check('neither wizard exists even when TALOS_INTRO=1', await page.locator('#veloIntro,#introDialog,[data-apre-velo="veloIntro"]').count() === 0);
    check('no unrequested modal', await page.locator('dialog[open],.overlay-layer:not([hidden])').count() === 0);
    await page.screenshot({ path: join(out, 'home-dark-1440.png') });
  });
  await scenario('preferences', async () => {
    await page.locator('[data-workspace-density]').click();
    check('density updates actual root', await page.locator('html').getAttribute('data-density') === 'compact');
    await page.getByRole('combobox', { name: 'Disposizione del workspace' }).selectOption('focus');
    check('preset applies', await page.locator('html').getAttribute('data-workspace-preset') === 'focus');
    await page.reload(); await page.locator('#talosAvvio').waitFor({ state: 'hidden' });
    check('density survives real storage reload', await page.locator('html').getAttribute('data-density') === 'compact');
    check('preset survives real storage reload', await page.locator('html').getAttribute('data-workspace-preset') === 'focus');
    await page.locator('[data-workspace-density]').click();
    await page.getByRole('combobox', { name: 'Disposizione del workspace' }).selectOption('development');
  });
  await scenario('configuration', async () => {
    await page.getByRole('button', { name: 'Scegli un modello', exact: true }).click();
    await expect(page.locator('dialog[open],.overlay-layer:not([hidden])')).not.toHaveCount(0);
    check('home opens existing model sheet', true);
    await page.keyboard.press('Escape');
    // An always-open picker has no hidden-trigger dropdown to dismiss first.
    await expect(page.locator('#veloModello')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Scegli un modello', exact: true })).toBeFocused();
    check('standalone model sheet closes with one Escape and restores its opener', true);
    await page.getByRole('button', { name: 'Apri un progetto', exact: true }).click();
    await expect(page.locator('dialog[open],.overlay-layer:not([hidden])')).not.toHaveCount(0);
    check('project uses real workspace chooser', true);
    await page.keyboard.press('Escape');
    // Closing is animated. The next scenario must not snapshot its transient inert leases.
    await expect(page.locator('#sheetDialog')).not.toHaveAttribute('open', '');
    await expect(page.locator('[data-modal-owned="true"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Apri un progetto', exact: true })).toBeFocused();
  });
  await scenario('modal-stack', async () => {
    await expect(page.locator('dialog[open],.overlay-layer:not([hidden])')).toHaveCount(0);
    await expect(page.locator('[data-modal-owned="true"]')).toHaveCount(0);
    const originalInert = await page.locator('[inert]').count();
    await page.getByRole('button', { name: 'Apri un progetto', exact: true }).click();
    await expect(page.locator('#sheetDialog')).toBeVisible();
    await expect(page.locator('#sheetDialog')).toHaveAttribute('aria-modal', 'true');
    await page.locator('#sheetDialog').evaluate(dialog => {
      const controls = [...dialog.querySelectorAll('button,input,select,textarea,[tabindex]')].filter(el => !el.matches(':disabled') && el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[hidden],[inert]'));
      controls.at(-1).focus();
    });
    await page.keyboard.press('Tab');
    check('Tab stays in the actual project dialog', await page.locator('#sheetDialog').evaluate(dialog => dialog.contains(document.activeElement)));
    await page.keyboard.press('Control+Shift+M');
    await expect(page.locator('#veloModello')).toBeVisible();
    await expect(page.locator('#sheetDialog')).toBeVisible();
    check('nested sheet leaves the project underneath', true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#veloModello')).toBeHidden();
    await expect(page.locator('#sheetDialog')).toBeVisible();
    check('closing the upper dialog restores the lower focus', await page.locator('#sheetDialog').evaluate(dialog => dialog.contains(document.activeElement)));
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheetDialog')).not.toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: 'Apri un progetto', exact: true })).toBeFocused();
    await expect.poll(() => page.locator('[inert]').count()).toBe(originalInert);
    check('all modal leases are restored after closing the stack', true);
  });
  await scenario('canonical-preferences', async () => {
    await navigate('impostazioni', 'settings');
    await page.locator('#setting-uiDensitySelect').selectOption('compatta');
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
    await expect(page.locator('[data-workspace-density]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-workspace-density]').click();
    await expect(page.locator('#setting-uiDensitySelect')).toHaveValue('comoda');
    check('settings and workspace density use one canonical preference', true);
    await page.locator('[data-workspace-restore]').uncheck();
    await page.reload(); await page.locator('#talosAvvio').waitFor({ state: 'hidden' });
    await navigate('impostazioni', 'settings');
    await expect(page.locator('[data-workspace-restore]')).not.toBeChecked();
    check('startup restoration can be disabled and survives reload', true);
    const query = page.locator('#schermoImpostazioni [data-settings-query]');
    await query.fill('riprendi');
    await expect(page.locator('[data-setting-row="workspaceRestore"]')).toBeVisible();
    check('new startup preference is discoverable through Settings search', true);
    await query.clear();
    await page.locator('[data-workspace-restore]').check();
    await navigate('home', 'home');
  });
  for (const [destination, screen] of Object.entries({ chat: 'chat', note: 'note', attivita: 'attivita', libreria: 'libreria',
    memoria: 'memoria', ricerca: 'ricerca', progetti: 'progetti', board: 'dashboard', impostazioni: 'settings',
    modelli: 'settings', capability: 'capability', officina: 'officina', automazioni: 'automations', doctor: 'doctor' })) {
    await scenario(`navigation-${destination}`, async () => {
      await page.keyboard.press('Escape');
      await navigate(destination, screen);
      result.screens.push({ name: destination, screen: await page.locator('html').getAttribute('data-schermo') });
      await page.screenshot({ path: join(out, `view-${destination}.png`) });
    });
  }
  await scenario('terminal', async () => {
    await navigate('chat', 'chat');
    const startOutput = ptyOutput.length;
    await page.locator('#schermoChat [data-vaia="terminale"]').click();
    await expect(page.locator('#schermoTerminale')).toBeVisible();
    const input = page.locator('#schermoTerminale .xterm-helper-textarea').first();
    await input.waitFor({ state: 'attached' }); await input.focus();
    // The shell command itself does not contain the contiguous expected output marker.
    // Thus the echo of the typed command cannot satisfy the assertion.
    await page.keyboard.type(process.platform === 'win32'
      ? 'echo TALOS-LEDGER-REAL'
      : "printf 'TALOS-LEDGER-%s\\n' REAL");
    await page.keyboard.press('Enter');
    await expect.poll(() => stripVTControlCharacters(ptyOutput.slice(startOutput)).replace(/\r/g, '').split('\n').some(line => line.trim() === 'TALOS-LEDGER-REAL'), { timeout: 15000 }).toBe(true);
    check('terminal executes an actual PTY command', true);
    await page.screenshot({ path: join(out, 'terminal-1440.png') });
    await page.keyboard.type('exit'); await page.keyboard.press('Enter');
  });
  await navigate('home', 'home');
  for (const width of [1920, 1280, 960, 768, 390, 320]) await scenario(`viewport-${width}`, async () => {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => {
      const el = document.getElementById('schermoHome');
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && el.scrollWidth <= el.clientWidth + 1;
    })).toBe(true);
    check(`home no document or content overflow ${width}`, true);
    await page.screenshot({ path: join(out, `home-${width}.png`) });
  });
  await scenario('accessibility-home', async () => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.keyboard.press('Tab');
    check('keyboard has focusable controls', await page.evaluate(() => document.activeElement !== document.body));
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await page.screenshot({ path: join(out, 'home-forced-colors.png') });
    await page.emulateMedia({ forcedColors: 'none', colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: join(out, 'home-light-1440.png') });
    // DevTools instrumentation: does not relax production CSP or intercept application APIs.
    await page.evaluate(await readFile(join(root, 'harness-ui/frontend/node_modules/axe-core/axe.min.js'), 'utf8'));
    result.accessibility = await page.evaluate(async () => {
      const r = await axe.run(document.getElementById('schermoHome'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
    });
    check('new Home has no automatically detected WCAG A/AA violations', result.accessibility.length === 0);
  });
  check('no page errors across tested product paths', result.errors.length === 0);
  assert.equal(result.failedCases.length, 0, result.failedCases.map(c => c.name).join(', '));
  result.complete = true;
} catch (error) { result.failure = String(error.stack || error); process.exitCode = 1; }
finally {
  await browser?.close();
  if (server.exitCode === null) {
    const exited = once(server, 'exit'); server.kill('SIGTERM');
    await Promise.race([exited, wait(5000)]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  await writeFile(join(out, 'server.log'), logs);
  await writeFile(join(out, 'pty-evidence.json'), JSON.stringify({ output: ptyOutput, controls: ptyControls }, null, 2));
  await writeFile(join(out, 'qualification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ complete: result.complete, assertions: result.checks.length, failedCases: result.failedCases, pageErrors: result.errors }));
}
