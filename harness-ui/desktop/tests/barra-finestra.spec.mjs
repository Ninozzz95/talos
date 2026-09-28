/*
 * F7-1 (owner 27/09/2026) — la barra del titolo propria, provata con Electron VERO (come R01-GUSCIO).
 * Decisioni: barra propria come Hermes (`titleBarStyle:'hidden'` + `titleBarOverlay`); nella striscia SOLO il pulsante «⋯»
 * e spazio da trascinare; NESSUN ponte pagina→app (`preload` resta `undefined`): il colore passa dal `theme-color`, il menu
 * da `talos-desktop://menu`, negato e trasformato nel menu NATIVO.
 * Le misure che non si possono provare qui (i comandi disegnati da Windows) si guardano sulle foto dello schermo, che
 * questa prova salva in `TALOS_FOTO_BARRA` se la variabile c'è.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { root, attendi, preparaRuntime } from './support.mjs';

const require = createRequire(import.meta.url);
const { _electron } = require('../../frontend/node_modules/playwright');
const executablePath = require('electron');

async function finche(fn, timeout = 15000) {
  const inizio = Date.now();
  while (Date.now() - inizio < timeout) { const dato = await fn(); if (dato) return dato; await attendi(100); }
  throw new Error('Condizione non raggiunta entro ' + timeout + ' ms.');
}

/* Una foto dello SCHERMO nel rettangolo della finestra: i comandi di Windows non stanno nella pagina. */
function fotoDelloSchermo(file, { x, y, width, height }) {
  const script = `Add-Type -AssemblyName System.Drawing; $b = New-Object System.Drawing.Bitmap ${width}, ${height}; `
    + `$g = [System.Drawing.Graphics]::FromImage($b); $g.CopyFromScreen(${x}, ${y}, 0, 0, $b.Size); $b.Save('${file.replace(/'/g, "''")}'); $g.Dispose(); $b.Dispose()`;
  execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
}

test('F7-BARRA-ELECTRON — striscia propria, comandi nel colore del tema, menu nativo dal «⋯», nessun ponte', { timeout: 120000 }, async t => {
  const prova = preparaRuntime('barra');
  const electronApp = await _electron.launch({ executablePath, args: [root], env: prova.env, timeout: 20000 });
  t.after(async () => { try { await electronApp.close(); } catch {} });
  const pagina = await electronApp.firstWindow({ timeout: 25000 });
  const erroriPagina = [];
  pagina.on('pageerror', e => erroriPagina.push(e.message));
  await pagina.waitForURL(url => url.hostname === '127.0.0.1' && url.pathname === '/' && !url.search, { timeout: 20000 });
  await pagina.locator('#talosBarraFinestra').waitFor({ state: 'visible', timeout: 20000 });

  // Nessun ponte: la prova R01 resta vera.
  const protezioni = await electronApp.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, preload: p.preload };
  });
  assert.deepEqual(protezioni, { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: undefined });

  // La striscia: alta quanto la zona di Windows, un solo pulsante, niente doppioni del marchio.
  const striscia = await pagina.evaluate(() => {
    const barra = document.getElementById('talosBarraFinestra');
    const r = barra.getBoundingClientRect();
    const stile = getComputedStyle(barra);
    const pulsante = barra.querySelector('[data-azione="menu-finestra"]');
    return {
      wco: navigator.windowControlsOverlay?.visible === true,
      finestra: document.documentElement.dataset.talosFinestra,
      top: r.top, altezza: Math.round(r.height), prima: barra.nextElementSibling?.classList.contains('talos-shell'),
      pulsanti: barra.querySelectorAll('button').length, marchi: barra.querySelectorAll('.talos-brand').length,
      glifo: pulsante?.querySelector('use')?.getAttribute('href'),
      trascina: stile.getPropertyValue('-webkit-app-region') || stile.getPropertyValue('app-region'),
      trascinaPulsante: getComputedStyle(pulsante).getPropertyValue('-webkit-app-region') || getComputedStyle(pulsante).getPropertyValue('app-region'),
      meta: document.querySelector('meta[name="theme-color"]')?.content,
      fondo: stile.backgroundColor,
      larghezza: window.innerWidth,
      zona: Math.round(navigator.windowControlsOverlay.getTitlebarAreaRect().height),
    };
  });
  assert.equal(striscia.wco, true, 'Windows lascia lo spazio per la striscia (Window Controls Overlay)');
  assert.equal(striscia.finestra, 'app');
  assert.equal(striscia.top, 0);
  assert.equal(striscia.altezza, 34, '33 px di comandi + 1 px di bordo');
  assert.equal(striscia.zona, 33, 'la zona dei comandi di Windows');
  assert.equal(striscia.prima, true, 'sta sopra la shell');
  assert.equal(striscia.pulsanti, 1);
  assert.equal(striscia.marchi, 0);
  assert.equal(striscia.glifo, '#i-more', 'il menu azioni di casa, non il «≡» della barra laterale');
  assert.equal(striscia.trascina, 'drag');
  assert.equal(striscia.trascinaPulsante, 'no-drag');
  assert.match(striscia.meta, /^#[0-9a-f]{6}$/u, `theme-color: ${striscia.meta}`);

  // I colori dei comandi seguono il tema: si registra ciò che arriva a setTitleBarOverlay.
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    globalThis.__overlay = [];
    const originale = win.setTitleBarOverlay.bind(win);
    win.setTitleBarOverlay = (opzioni) => { globalThis.__overlay.push(opzioni); return originale(opzioni); };
  });
  const temi = {};
  let precedente = null;
  for (const tema of ['light', 'dark']) {
    await pagina.evaluate((t) => { if (t === 'light') document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme; }, tema);
    const meta = await finche(() => pagina.evaluate((prima) => {
      const m = document.querySelector('meta[name="theme-color"]')?.content;
      return /^#[0-9a-f]{6}$/u.test(m ?? '') && m !== prima ? m : null;
    }, precedente));
    precedente = meta;
    const ultimo = await finche(() => electronApp.evaluate((_e, colore) => globalThis.__overlay.findLast((o) => o.color === colore) ?? null, meta));
    temi[tema] = { meta, ultimo };
    assert.equal(ultimo.height, 33, 'i comandi lasciano libero il bordo di 1 px');
    if (process.env.TALOS_FOTO_BARRA) {
      await attendi(400);
      /* In cima per la durata della foto: una foto dello schermo prende ciò che sta davanti, e il 28/09 una foto «fatta
         per l'installer» ha preso un'altra finestra. */
      const bounds = await electronApp.evaluate(({ BrowserWindow, screen }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.setAlwaysOnTop(true);
        win.focus();
        const b = win.getContentBounds();
        const s = screen.getDisplayMatching(b).scaleFactor;
        return { x: Math.round(b.x * s), y: Math.round(b.y * s), width: Math.round(b.width * s), height: Math.round(b.height * s), s };
      });
      await attendi(500);
      fotoDelloSchermo(`${process.env.TALOS_FOTO_BARRA}/barra-${tema}.png`, { ...bounds, height: Math.min(bounds.height, Math.round(140 * bounds.s)) });
      fotoDelloSchermo(`${process.env.TALOS_FOTO_BARRA}/finestra-${tema}.png`, bounds);
      await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setAlwaysOnTop(false));
    }
  }
  assert.notEqual(temi.light.meta, temi.dark.meta, 'chiaro e scuro danno due colori diversi');
  assert.notEqual(temi.light.ultimo.symbolColor, temi.dark.ultimo.symbolColor, 'e simboli leggibili su tutti e due');

  // Il «⋯» apre il menu NATIVO nel punto del pulsante, e nessuna finestra nuova nasce.
  await electronApp.evaluate(({ Menu }) => {
    globalThis.__popup = [];
    const menu = Menu.getApplicationMenu();
    menu.popup = (opzioni) => { globalThis.__popup.push({ x: opzioni?.x, y: opzioni?.y, conFinestra: Boolean(opzioni?.window), voci: menu.items.map((i) => i.label) }); };
  });
  const rett = await pagina.locator('[data-azione="menu-finestra"]').boundingBox();
  await pagina.click('[data-azione="menu-finestra"]');
  const popup = await finche(() => electronApp.evaluate(() => globalThis.__popup[0] ?? null));
  assert.equal(popup.conFinestra, true);
  assert.deepEqual(popup.voci, ['TALOS', 'Modifica', 'Visualizza'], 'lo stesso menu di prima, intero');
  assert.ok(Math.abs(popup.x - Math.round(rett.x)) <= 1 && Math.abs(popup.y - Math.round(rett.y + rett.height)) <= 1, JSON.stringify({ popup, rett }));
  assert.equal(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1, 'nessuna finestra nuova');
  assert.deepEqual(erroriPagina, []);
});
