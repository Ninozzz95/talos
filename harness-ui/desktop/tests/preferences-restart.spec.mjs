import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { preparaRuntime, root } from './support.mjs';

const require = createRequire(import.meta.url);
const { _electron } = require('../../frontend/node_modules/playwright');
const executablePath = require('electron');
const settingsKey = 'talos.harness.desktop.settings.v1';

async function launch(env) {
  const app = await _electron.launch({ executablePath, args: [root], env, timeout: 25_000 });
  const page = await app.firstWindow({ timeout: 30_000 });
  await page.waitForURL((url) => url.hostname === '127.0.0.1' && url.pathname === '/' && !url.search, { timeout: 25_000 });
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 20_000 });
  return { app, page };
}

test('PREFS-ORIGIN-RESTART: real Electron process restart preserves system settings and panel widths', { timeout: 120_000 }, async () => {
  const fixture = preparaRuntime('prefs-restart');
  const first = await launch(fixture.env);
  let origin;
  let saved;
  try {
    origin = new URL(first.page.url()).origin;
    await first.page.locator('.talos-sidebar [data-vaia="impostazioni"]').first().click();
    await first.page.evaluate(() => {
      for (const [id, value] of [
        ['uiFontScaleSelect', 'small'], ['chatFontScaleSelect', 'expanded'], ['setting-uiDensitySelect', 'comoda'],
        ['colorModeSelect', 'dark'], ['messageStyleSelect', 'bubbles'], ['streamingAnimationSelect', 'typewriter'],
        ['windowPresentationSelect', 'fullscreen'], ['composerPlusSelect', 'menu'],
      ]) {
        const control = document.getElementById(id);
        if (!control) throw new Error(`Controllo mancante: ${id}`);
        control.value = value; control.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const toggle = document.getElementById('chatFullWidthToggle');
      if (!toggle) throw new Error('Controllo mancante: chatFullWidthToggle');
      toggle.checked = true; toggle.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await first.page.evaluate(() => {
      localStorage.setItem('talos-harness-panel-widths', JSON.stringify({ sessions: 352, inspector: 520 }));
    });
    await first.page.reload();
    await first.page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 20_000 });
    saved = await first.page.evaluate((key) => ({ settings: JSON.parse(localStorage.getItem(key)),
      workspace: JSON.parse(localStorage.getItem('talos.desktop.workspace.v2')),
      panel: JSON.parse(localStorage.getItem('talos-harness-panel-widths')),
      localKeys: Object.fromEntries(Object.keys(localStorage).filter((name) => /^talos[.-]/u.test(name)).sort().map((name) => [name, localStorage.getItem(name)])),
    }), settingsKey);
    assert.equal(saved.settings.appearance.uiFontScale, 'small');
    assert.equal(saved.settings.appearance.chatFontScale, 'expanded');
    assert.equal(saved.settings.appearance.colorMode, 'dark');
    assert.equal(saved.settings.appearance.messageStyle, 'bubbles');
    assert.equal(saved.settings.appearance.streamingAnimation, 'typewriter');
    assert.equal(saved.settings.appearance.windowPresentation, 'fullscreen');
    assert.equal(saved.settings.appearance.composerPlus, 'menu');
    assert.equal(saved.settings.appearance.chatFullWidth, true);
    assert.equal(saved.workspace.density, 'comfortable');
    assert.deepEqual(saved.panel, { sessions: 352, inspector: 520 });
  } finally { await first.app.close(); }

  const file = join(fixture.dataDir, 'desktop-origin.json');
  assert.equal(new URL(origin).port, String(JSON.parse(readFileSync(file, 'utf8')).port));
  const second = await launch(fixture.env);
  try {
    assert.equal(new URL(second.page.url()).origin, origin, 'the desktop origin must remain stable across processes');
    await second.page.locator('.talos-sidebar [data-vaia="impostazioni"]').first().click();
    assert.equal(await second.page.locator('#uiFontScaleSelect').inputValue(), 'small');
    assert.equal(await second.page.locator('#chatFontScaleSelect').inputValue(), 'expanded');
    assert.equal(await second.page.locator('#setting-uiDensitySelect').inputValue(), 'comoda');
    for (const [id, value] of [['colorModeSelect', 'dark'], ['messageStyleSelect', 'bubbles'], ['streamingAnimationSelect', 'typewriter'],
      ['windowPresentationSelect', 'fullscreen'], ['composerPlusSelect', 'menu']]) assert.equal(await second.page.locator(`#${id}`).inputValue(), value);
    assert.equal(await second.page.locator('#chatFullWidthToggle').isChecked(), true);
    const restored = await second.page.evaluate((key) => ({ settings: JSON.parse(localStorage.getItem(key)),
      workspace: JSON.parse(localStorage.getItem('talos.desktop.workspace.v2')),
      panel: JSON.parse(localStorage.getItem('talos-harness-panel-widths')),
      localKeys: Object.fromEntries(Object.keys(localStorage).filter((name) => /^talos[.-]/u.test(name)).sort().map((name) => [name, localStorage.getItem(name)])),
    }), settingsKey);
    assert.deepEqual(restored, saved, 'all persisted TALOS settings keys must survive the process restart');
    const panel = await second.page.evaluate(() => ({ saved: JSON.parse(localStorage.getItem('talos-harness-panel-widths')),
      sidebar: getComputedStyle(document.documentElement).getPropertyValue('--talos-sidebar-w').trim(),
      inspector: getComputedStyle(document.documentElement).getPropertyValue('--talos-inspector-w').trim() }));
    assert.deepEqual(panel.saved, { sessions: 352, inspector: 520 });
    assert.equal(panel.sidebar, '352px');
    assert.equal(panel.inspector, '520px');
  } finally { await second.app.close(); }
});

test('PREFS-LEGACY-ONE: settings at a previous random-port origin survive the first upgrade launch', { timeout: 120_000 }, async (t) => {
  const fixture = preparaRuntime('prefs-legacy');
  const first = await launch(fixture.env);
  let oldOrigin;
  try {
    oldOrigin = new URL(first.page.url()).origin;
    await first.page.locator('.talos-sidebar [data-vaia="impostazioni"]').first().click();
    await first.page.evaluate(() => {
      const control = document.getElementById('uiFontScaleSelect');
      control.value = 'small'; control.dispatchEvent(new Event('change', { bubbles: true }));
      localStorage.setItem('talos-harness-panel-widths', JSON.stringify({ sessions: 351, inspector: 519 }));
    });
    assert.equal(await first.page.evaluate(() => JSON.parse(localStorage.getItem('talos.harness.desktop.settings.v1')).appearance.uiFontScale), 'small');
  } finally { await first.app.close(); }

  // Only the disposable fixture file is removed: 0.1.18 had no origin pin.
  rmSync(join(fixture.dataDir, 'desktop-origin.json'));
  const second = await launch(fixture.env);
  try {
    assert.equal(new URL(second.page.url()).origin, oldOrigin, 'the last logged desktop origin must be reused on upgrade');
    await second.page.locator('.talos-sidebar [data-vaia="impostazioni"]').first().click();
    assert.equal(await second.page.locator('#uiFontScaleSelect').inputValue(), 'small');
    assert.deepEqual(await second.page.evaluate(() => JSON.parse(localStorage.getItem('talos-harness-panel-widths'))),
      { sessions: 351, inspector: 519 });
    t.diagnostic('The historical origin and its localStorage remained intact');
  } finally { await second.app.close(); }
});

test('PREFS-LEGACY-BINARY: the 0.1.18 executable upgrades its last Chromium origin without losing preferences', { timeout: 120_000 }, async (t) => {
  const oldRoot = join(root, 'dist', 'win-unpacked');
  let oldVersion;
  try { oldVersion = JSON.parse(readFileSync(join(oldRoot, 'resources', 'app', 'package.json'), 'utf8')).version; }
  catch { t.skip('The historical unpacked 0.1.18 artifact is unavailable'); return; }
  if (oldVersion !== '0.1.18') { t.skip(`Historical artifact is ${oldVersion}, not 0.1.18`); return; }

  const fixture = preparaRuntime('prefs-binary-upgrade');
  const oldEnv = { ...fixture.env };
  delete oldEnv.TALOS_DESKTOP_HARNESS_DIR;
  const old = await _electron.launch({ executablePath: join(oldRoot, 'TALOS.exe'), args: [], env: oldEnv, timeout: 30_000 });
  let oldOrigin;
  try {
    const page = await old.firstWindow({ timeout: 30_000 });
    await page.waitForURL((url) => url.hostname === '127.0.0.1' && url.pathname === '/' && !url.search, { timeout: 25_000 });
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 20_000 });
    oldOrigin = new URL(page.url()).origin;
    await page.locator('.talos-sidebar [data-vaia="impostazioni"]').first().click();
    await page.evaluate(() => {
      const control = document.getElementById('uiFontScaleSelect');
      control.value = 'small'; control.dispatchEvent(new Event('change', { bubbles: true }));
      localStorage.setItem('talos-harness-panel-widths', JSON.stringify({ sessions: 353, inspector: 521 }));
    });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('talos.harness.desktop.settings.v1')).appearance.uiFontScale), 'small');
  } finally { await old.close(); }

  const upgraded = await launch(fixture.env);
  try {
    assert.equal(new URL(upgraded.page.url()).origin, oldOrigin);
    await upgraded.page.locator('.talos-sidebar [data-vaia="impostazioni"]').first().click();
    assert.equal(await upgraded.page.locator('#uiFontScaleSelect').inputValue(), 'small');
    assert.deepEqual(await upgraded.page.evaluate(() => JSON.parse(localStorage.getItem('talos-harness-panel-widths'))),
      { sessions: 353, inspector: 521 });
    assert.equal(JSON.parse(readFileSync(join(fixture.dataDir, 'desktop-origin.json'), 'utf8')).port, Number(new URL(oldOrigin).port));
  } finally { await upgraded.app.close(); }
});
