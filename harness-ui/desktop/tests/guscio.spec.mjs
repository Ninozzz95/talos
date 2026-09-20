import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, totalmem, release, version } from 'node:os';
import { join } from 'node:path';
import { root, attendi, preparaRuntime } from './support.mjs';

const require = createRequire(import.meta.url);
const { _electron, request } = require('../../frontend/node_modules/playwright');
const executablePath = require('electron');

async function finche(fn, timeout = 15000) {
  const inizio = Date.now();
  while (Date.now() - inizio < timeout) { const dato = await fn(); if (dato) return dato; await attendi(100); }
  throw new Error('Condizione non raggiunta entro ' + timeout + ' ms.');
}

test('R01-GUSCIO — finestra reale, cookie, Terminale, temi, riavvio, vassoio, seconda istanza e chiusura', { timeout: 120000 }, async t => {
  const prova = preparaRuntime('guscio');
  const misure = { data: new Date().toISOString(), macchina: { sistema: version(), release: release(), arch: process.arch, cpu: cpus()[0].model.trim(), processoriLogici: cpus().length, ramByte: totalmem() }, launchPrimaFinestraMs: null, launchPaginaProntaMs: null, riposoMs: 3000, completato: false };
  let electronApp; let pidFiglio;
  const errori = [];
  const inizio = performance.now();
  try {
    electronApp = await _electron.launch({ executablePath, args: [root], env: prova.env, timeout: 20000 });
    electronApp.process().stderr.on('data', d => errori.push(String(d).replace(/([?&]token=)[^\s&'"<>]+/g, '$1[omesso]')));
    t.after(async () => { try { await electronApp.close(); } catch {} });
    await finche(async () => {
      pidFiglio = await electronApp.evaluate(() => process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess')?.pid);
      return pidFiglio;
    });
    const pagina = await electronApp.firstWindow({ timeout: 25000 });
    misure.launchPrimaFinestraMs = performance.now() - inizio;
    const erroriPagina = [];
    pagina.on('pageerror', e => erroriPagina.push(e.message));
    await pagina.waitForURL(url => url.hostname === '127.0.0.1' && url.pathname === '/' && !url.search, { timeout: 20000 });
    await pagina.locator('body').waitFor({ state: 'visible' });
    misure.launchPaginaProntaMs = performance.now() - inizio;
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.talosTheme), 'calm');
    const base = new URL(pagina.url()).origin;
    assert.notEqual(new URL(base).port, '4174');
    assert.equal((await fetch(base + '/api/v1/health')).status, 401);
    assert.equal(await pagina.evaluate(async () => (await fetch('/api/v1/health')).status), 200);
    const cookies = await electronApp.context().cookies();
    const cookie = cookies.find(c => c.name === 'talos_token');
    assert.ok(cookie?.httpOnly); assert.equal(cookie.sameSite, 'Strict');
    const protezioni = await electronApp.evaluate(({ BrowserWindow }) => {
      const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, preload: p.preload };
    });
    assert.deepEqual(protezioni, { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: undefined });
    assert.equal(await pagina.evaluate(() => typeof window.require), 'undefined');
    await attendi(misure.riposoMs);
    misure.ram = await electronApp.evaluate(async ({ app }) => {
      const figlio = process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess');
      const risposta = new Promise(resolve => figlio.once('message', resolve));
      figlio.send({ tipo: 'misura' });
      return { main: process.memoryUsage(), processiGuscio: app.getAppMetrics(), figlio: await risposta };
    });
    // Invoca la vera azione del menu e intercetta soltanto il browser OS:
    // il contesto HTTP indipendente prova redirect e cookie senza esportare il segreto.
    await electronApp.evaluate(async ({ Menu, shell }) => {
      const originale = shell.openExternal;
      shell.openExternal = async url => { globalThis.r01Ingresso = url; };
      try { await Menu.getApplicationMenu().getMenuItemById('apri-browser').click(); }
      finally { shell.openExternal = originale; }
    });
    const ingresso = await electronApp.evaluate(() => globalThis.r01Ingresso);
    const altro = await request.newContext();
    try {
      const browser = await altro.get(ingresso);
      assert.equal(browser.url(), base + '/');
      assert.equal((await altro.get(base + '/api/v1/health')).status(), 200);
    } finally { await altro.dispose(); }
    // La UI esistente offre un terminale standalone senza chiamare alcun modello.
    const controlli = []; let uscitaPty = '';
    pagina.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
      const frame = Buffer.from(payload);
      if (frame[0] === 1) { try { controlli.push(JSON.parse(frame.subarray(1).toString())); } catch {} }
      else if (frame[0] === 0) uscitaPty += frame.subarray(1).toString('utf8'); // 13/09 review: xterm con WebGL disegna su canvas, niente .xterm-rows nel DOM — si legge il flusso PTY vero
    }));
    // BOOT-03 starts on Home: reach the real conversation before its mode switch.
    await pagina.locator('.talos-sidebar [data-vaia="chat"]').first().click();
    await pagina.locator('[data-mode="terminal"]').first().click();
    const tastiera = pagina.locator('.xterm-helper-textarea').first();
    await tastiera.waitFor({ state: 'attached' });
    await tastiera.focus(); await pagina.keyboard.type('echo TALOS-R01'); await pagina.keyboard.press('Enter');
    await finche(() => /(^|\n)TALOS-R01\r?\n/.test(uscitaPty.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')));
    await pagina.reload();
    assert.equal(await pagina.evaluate(async () => (await fetch('/api/v1/health')).status), 200);
    // BOOT-03 starts on Home: reach the real conversation before its mode switch.
    await pagina.locator('.talos-sidebar [data-vaia="chat"]').first().click();
    await pagina.locator('[data-mode="terminal"]').first().click();
    await pagina.locator('.xterm-helper-textarea').first().focus();
    await pagina.keyboard.type('exit'); await pagina.keyboard.press('Enter');
    await finche(() => controlli.some(c => c.evento === 'uscita' && c.codice === 0));
    await pagina.emulateMedia({ reducedMotion: 'reduce' });
    for (const [modo, nome] of [['light', 'chiaro'], ['dark', 'scuro']]) {
      await pagina.evaluate(modo => {
        const key = 'talos.harness.desktop.settings.v1';
        const settings = JSON.parse(localStorage.getItem(key) || '{}');
        settings.appearance = { ...settings.appearance, colorMode: modo, themePreset: 'calm', themePresetVersione: 2 };
        localStorage.setItem(key, JSON.stringify(settings));
      }, modo);
      await pagina.reload();
      for (const [width, height] of [[1024, 800], [1440, 900]]) {
        await electronApp.evaluate(({ BrowserWindow }, dimensioni) => BrowserWindow.getAllWindows()[0].setContentSize(...dimensioni), [width, height]);
        await attendi(500);
        await pagina.screenshot({ path: join(root, '.prove', 'R01-' + nome + '-' + width + '.png') });
      }
    }
    await pagina.keyboard.press('Tab');
    assert.equal(await pagina.evaluate(() => document.activeElement !== document.body), true);
    // Chiusura facoltativa nel vassoio e ripristino dalla seconda istanza.
    // 13/09 review: `MenuItem.click()` di Electron INVERTE da solo `checked` per le voci checkbox prima di
    // chiamare il nostro handler: impostare `checked = true` e poi cliccare la riportava a false. Si clicca
    // una volta sola, come farebbe la persona, e si legge lo stato risultante.
    assert.equal(await electronApp.evaluate(({ Menu }) => { const voce = Menu.getApplicationMenu().getMenuItemById('resta-vassoio'); voce.click(); return voce.checked; }), true);
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await finche(() => electronApp.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return Boolean(w) && !w.isVisible(); }));
    assert.equal(JSON.parse(readFileSync(join(prova.dataDir, 'window-state.json'))).restaNelVassoio, true);
    process.kill(pidFiglio, 0);
    const secondoInizio = performance.now();
    const seconda = spawn(executablePath, [root], { env: prova.env, stdio: 'ignore', windowsHide: true });
    const [codice] = await once(seconda, 'exit');
    misure.secondaIstanzaMs = performance.now() - secondoInizio;
    assert.equal(codice, 0);
    await finche(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible() && BrowserWindow.getAllWindows()[0].isFocused()));
    assert.equal(await electronApp.evaluate(() => process._getActiveHandles().filter(h => h.constructor.name === 'ChildProcess').length), 1);
    assert.equal(await electronApp.evaluate(({ Menu }) => { const voce = Menu.getApplicationMenu().getMenuItemById('resta-vassoio'); voce.click(); return voce.checked; }), false);
    const chiusa = electronApp.waitForEvent('close');
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await chiusa;
    assert.throws(() => process.kill(pidFiglio, 0), { code: 'ESRCH' });
    assert.deepEqual(erroriPagina, []);
    misure.completato = true;
  } catch (errore) {
    misure.errore = errore.message.replace(/([?&]token=)[^\s&'"<>]+/g, '$1[omesso]');
    try { const p = await electronApp?.firstWindow({ timeout: 2000 }); await p?.screenshot({ path: join(root, '.prove', 'R01-errore.png') }); misure.htmlAlGuasto = (await p?.evaluate(() => document.body.innerText.slice(0, 1500))) ?? null; } catch {} // 13/09 review: la foto del guasto
    throw errore;
  } finally {
    if (pidFiglio) {
      try {
        await finche(() => { try { process.kill(pidFiglio, 0); return false; } catch (e) { return e.code === 'ESRCH'; } }, 6500);
        misure.figlioDopoChiusura = 'ESRCH';
      } catch { misure.figlioDopoChiusura = 'ancora presente'; }
    }
    misure.stderr = errori.join('').slice(-12000);
    writeFileSync(join(root, '.prove', 'R01-misure.json'), JSON.stringify(misure, null, 2));
  }
});

test('R01-ARRESO — sei avvii reali falliti, dialogo italiano, registro e Riprova', { timeout: 60000 }, async t => {
  const prova = preparaRuntime('guasto');
  copyFileSync(join(root, 'tests', 'fixtures', 'figlio-guasto.mjs'), join(prova.runtime, 'server.mjs'));
  const electronApp = await _electron.launch({ executablePath, args: [join(root, 'tests', 'fixtures', 'avvio-guasto.mjs')], env: prova.env, timeout: 15000 });
  t.after(async () => { try { await electronApp.close(); } catch {} });
  await finche(() => electronApp.evaluate(() => globalThis.r01Dialoghi?.length), 30000);
  const primo = await electronApp.evaluate(() => globalThis.r01Dialoghi[0]);
  assert.deepEqual(primo.buttons, ['Riprova', 'Apri il registro', 'Esci']);
  assert.equal((readFileSync(join(prova.dataDir, 'registro.log'), 'utf8').match(/Servizio locale avviato/g) || []).length, 6);
  await electronApp.evaluate(() => globalThis.r01Rispondi(1));
  await finche(() => electronApp.evaluate(() => globalThis.r01RegistroAperto && globalThis.r01Dialoghi.length === 2));
  copyFileSync(join(root, '..', 'server.mjs'), join(prova.runtime, 'server.mjs'));
  await electronApp.evaluate(() => globalThis.r01Rispondi(0));
  await finche(() => /Stato: pronto/.test(readFileSync(join(prova.dataDir, 'registro.log'), 'utf8')), 20000);
});
