/*
 * «Segnala un problema», la prima porta, con Electron VERO (owner 29/10/2026): la voce del menu della finestra apre la finestra della
 *   segnalazione nella pagina, la diagnostica arriva dalla rotta VERA del server figlio (con la versione che il guscio gli passa), e
 *   «Apri su GitHub» passa da `setWindowOpenHandler` a `shell.openExternal` — intercettato: non si apre niente davvero.
 * ⛔ La pagina servita è la build appena fatta (`frontend/dist`), non `public/`: si prova il codice di questo ramo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, rmdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { root, attendi, preparaRuntime } from './support.mjs';

const require = createRequire(import.meta.url);
const { _electron } = require('../../frontend/node_modules/playwright');
const executablePath = require('electron');

async function finche(fn, timeout = 20000) {
  const inizio = Date.now();
  while (Date.now() - inizio < timeout) { const dato = await fn(); if (dato) return dato; await attendi(100); }
  throw new Error('Condizione non raggiunta entro ' + timeout + ' ms.');
}

test('SEGNALA-ELECTRON — menu della finestra → finestra con la diagnostica del server vero → GitHub dal browser del sistema', { timeout: 150000 }, async t => {
  const dist = join(root, '..', 'frontend', 'dist');
  assert.ok(existsSync(join(dist, 'index.html')), 'serve la build del frontend: npm run build in harness-ui/frontend');
  const prova = preparaRuntime('segnala');
  rmdirSync(join(prova.runtime, 'public')); // la giunzione verso public/, tolta senza seguirla
  symlinkSync(dist, join(prova.runtime, 'public'), 'junction');
  const electronApp = await _electron.launch({ executablePath, args: [root], env: prova.env, timeout: 20000 });
  t.after(async () => { try { await electronApp.close(); } catch {} });
  const pagina = await electronApp.firstWindow({ timeout: 25000 });
  const erroriPagina = [];
  pagina.on('pageerror', e => erroriPagina.push(e.message));
  await pagina.waitForURL(url => url.hostname === '127.0.0.1' && url.pathname === '/' && !url.search, { timeout: 25000 });
  await pagina.waitForFunction(() => window.__talosHarnessUiRuntime, null, { timeout: 25000 });
  await pagina.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });

  const voce = await electronApp.evaluate(({ app, Menu, shell }) => {
    globalThis.__aperti = [];
    shell.openExternal = async (url) => { globalThis.__aperti.push(url); };
    const item = Menu.getApplicationMenu().getMenuItemById('segnala-problema');
    return { label: item?.label ?? null, lingua: app.getLocale(), versione: app.getVersion() };
  });
  assert.equal(voce.label, /^it/u.test(voce.lingua) ? 'Segnala un problema…' : 'Report a problem…');
  await electronApp.evaluate(({ Menu }) => { Menu.getApplicationMenu().getMenuItemById('segnala-problema').click(); });

  const finestra = pagina.locator('dialog.td-modal[data-segnala-problema="menu"]');
  await finestra.waitFor({ state: 'visible', timeout: 10000 });
  const righe = finestra.locator('[data-segnala-diagnostica]');
  const testo = await finche(async () => { const x = await righe.textContent(); return /TALOS/u.test(x ?? '') ? x : null; });
  assert.match(testo, new RegExp(`TALOS desktop ${voce.versione.replaceAll('.', '\\.')} \\(Windows`, 'u'), testo);
  for (const vietato of [process.env.USERNAME, process.env.COMPUTERNAME, 'C:\\', 'Users']) {
    if (vietato) assert.equal(testo.toLowerCase().includes(String(vietato).toLowerCase()), false, `«${vietato}» nella diagnostica`);
  }
  if (process.env.TALOS_FOTO_SEGNALA) await pagina.screenshot({ path: `${process.env.TALOS_FOTO_SEGNALA}/electron-finestra.png` });

  await finestra.locator('[data-segnala-titolo]').fill('Prova dal menu');
  await finestra.locator('[data-segnala-apri]').click();
  const [url] = await finche(() => electronApp.evaluate(() => (globalThis.__aperti.length ? globalThis.__aperti : null)));
  const u = new URL(url);
  assert.equal(`${u.origin}${u.pathname}`, 'https://github.com/Ninozzz95/talos/issues/new');
  assert.equal(u.searchParams.get('template'), 'desktop.yml');
  assert.equal(u.searchParams.get('title'), '[Bug] Prova dal menu');
  assert.match(u.searchParams.get('diagnostica') ?? '', /^TALOS desktop /u);
  assert.equal(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1, 'nessuna finestra nuova');
  assert.deepEqual(erroriPagina, []);
});
