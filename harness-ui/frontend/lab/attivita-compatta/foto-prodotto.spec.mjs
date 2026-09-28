import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { SCENE_ATTIVITA, ORDINE_SCENE_ATTIVITA } from '../fixtures/attivita-compatta.js';

/*
 * R4 — ATTIVITÀ COMPATTA, fase 2 (24/09/2026) · FOTO «DOPO»: il PRODOTTO con la cura, con le STESSE cinque scene
 * date al prodotto di prima (`foto-attuale.spec.mjs`) e al prototipo (`foto-proposta.spec.mjs`): stessi eventi,
 * stessi stati — S0 come arriva, S1 dopo un clic sulla riga, S2 con tutti i ragionamenti aperti (dal menu «⋯»).
 *
 * Le misure (altezze da `getBoundingClientRect`, nodi montati, clic) vanno in `misure-prodotto-*.json` accanto alle
 * foto, per la tabella prima/dopo del rapporto. Tre larghezze: 1024×800, 1440×900, 1920×1080; due temi.
 * ⛔ Nessuna richiesta non-GET verso il server: si ferma, si conta, e il conteggio deve essere 0.
 */
const QUI = fileURLToPath(new URL('.', import.meta.url));
const FOTO = resolve(QUI, '..', '..', '..', 'docs', 'foto-attivita');
mkdirSync(FOTO, { recursive: true });

const VIEWPORTS = [[1920, 1080], [1440, 900], [1024, 800]];
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const SEG = '#conversation .talos-activity--segment';

async function dueFotogrammi(page) {
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}
async function chiudiToast(page) {
  for (const x of await page.locator('#regioneToast [data-toast-chiudi]').all()) {
    if (await x.isVisible().catch(() => false)) await x.click().catch(() => {});
  }
}
async function misura(page) {
  return page.evaluate(() => {
    const r = (el) => el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null;
    const segmenti = [...document.querySelectorAll('#conversation .talos-activity--segment')];
    const nudi = [...document.querySelectorAll('#conversation .talos-activity--nuda')].filter((n) => !n.parentElement?.closest('.talos-activity--segment'));
    const turno = [...document.querySelectorAll('#conversation .talos-turn[data-turno="talos"]')].at(-1);
    return {
      segmenti: segmenti.map((s) => ({
        altezza: r(s),
        testaAltezza: r(s.querySelector(':scope > .talos-activity__head')),
        testa: s.querySelector(':scope > .talos-activity__head')?.textContent.replace(/\s+/g, ' ').trim() || '',
        forma: s.querySelector('.talos-activity__conteggi')?.dataset.forma || '',
        voci: s.querySelectorAll('[data-voce]').length,
        rigaAltezza: r(s.querySelector('[data-voce]')),
        nodi: s.querySelectorAll('*').length,
        fissate: s.querySelectorAll('.talos-activity__fissata').length,
        aperto: s.querySelector(':scope > .talos-activity__head')?.getAttribute('aria-expanded'),
      })),
      nudi: nudi.map((n) => ({ altezza: r(n) })),
      turnoTalos: r(turno),
      prosa: Math.round([...(turno?.querySelectorAll('.talos-message__copy') || [])].reduce((s, c) => s + c.getBoundingClientRect().height, 0)),
      segmentiTotale: Math.round([...segmenti, ...nudi].reduce((s, c) => s + c.getBoundingClientRect().height, 0)),
    };
  });
}
async function scattaEMisura(page, misure, nome, stato, extra = {}) {
  await chiudiToast(page);
  await dueFotogrammi(page);
  await page.screenshot({ path: join(FOTO, `${nome}.png`), animations: 'disabled' });
  misure.push({ foto: `${nome}.png`, stato, ...extra, ...(await misura(page)) });
}
async function portaInVista(page) {
  await page.evaluate(() => {
    const utente = [...document.querySelectorAll('#conversation .talos-turn[data-turno="utente"]')].at(-1);
    const s = utente || document.querySelector('#conversation .talos-turn[data-turno="talos"]');
    s?.scrollIntoView({ block: 'start' });
    document.querySelector('#conversation')?.scrollBy(0, -24);
  });
}

for (const tema of ['dark', 'light']) {
  for (const [w, h] of VIEWPORTS) {
    test(`prodotto ${tema} ${w}x${h}`, async ({ page }) => {
      const errori = [];
      page.on('pageerror', (e) => errori.push(e.message));
      const misure = [];
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
      await page.addInitScript((colorMode) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
      }, tema);
      let nonGet = 0;
      await page.route('**/api/v1/**', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const m = url.pathname.match(/\/api\/v1\/sessions\/att-(\w+)-[a-z]+\/(events|metrics)/);
        if (m) {
          const scena = SCENE_ATTIVITA[m[1]];
          if (m[2] === 'metrics') {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: scena.ragionamentiMs }, meta: { schema: 'talos.harness-ui.api.v1' } }) });
          }
          const storia = scena.vivo ? [CONFINE] : [...scena.eventi, CONFINE];
          return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${storia.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
        }
        if (req.method() !== 'GET') { nonGet += 1; return route.abort(); }
        return route.continue();
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });

      for (const chiave of ORDINE_SCENE_ATTIVITA) {
        const scena = SCENE_ATTIVITA[chiave];
        const id = `att-${chiave}-${tema}`;
        await page.evaluate(({ id, titolo }) => {
          window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', titolo, 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
        }, { id, titolo: scena.titolo });
        await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
        if (scena.vivo) {
          for (const evento of scena.eventi) {
            await page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, evento);
            if (evento.type === 'ReasoningMessageStart') await page.waitForTimeout(2_300);
            if (evento.type === 'ToolCallResult') await page.waitForTimeout(300);
          }
          await page.waitForTimeout(1_600);
        } else {
          const ultimo = scena.eventi.filter((e) => e.type === 'TextMessageContent').at(-1).delta.replace(/[*`]/g, '').slice(0, 24);
          await expect(page.locator('#conversation')).toContainText(ultimo, { timeout: 10_000 });
          await page.waitForTimeout(500);
        }
        await portaInVista(page);
        await scattaEMisura(page, misure, `prodotto-${chiave}-S0-${w}x${h}-${tema}`, 'S0', { scena: chiave, tema, viewport: `${w}x${h}`, clic: 0 });

        const testa = page.locator(`${SEG} > .talos-activity__head`).first();
        if (await testa.count()) {
          await testa.click();
          await portaInVista(page);
          await scattaEMisura(page, misure, `prodotto-${chiave}-S1-${w}x${h}-${tema}`, 'S1', { scena: chiave, tema, viewport: `${w}x${h}`, clic: 1 });
          /* S2: tutti i ragionamenti aperti dal menu «⋯» (due clic); se non ci sono ragionamenti resta S1. */
          const altro = page.locator(`${SEG} > .talos-activity__altro`).first();
          await altro.click();
          const voce = page.locator('[role="menu"].talos-menu-azioni').getByRole('menuitem', { name: 'Apri tutti i ragionamenti' });
          await voce.click();
          await page.waitForTimeout(250);
          await portaInVista(page);
          await scattaEMisura(page, misure, `prodotto-${chiave}-S2-${w}x${h}-${tema}`, 'S2', { scena: chiave, tema, viewport: `${w}x${h}`, clic: 3, clicViaMenu: 2 });
        }
      }
      /* Le misure si scrivono PRIMA delle asserzioni: una corsa che cade all'ultima riga deve lasciare i numeri (24/09,
         prima corsa: sei foto scattate e zero JSON). Gli errori di pagina vanno nel JSON, e quelli di un documento in
         SANDBOX («The document is sandboxed and lacks the 'allow-same-origin' flag», da una cornice terza: vedi
         `components/browser.js:288-299`) non riguardano il segmento, che vive nel documento principale: si contano a parte. */
      const erroriSandbox = errori.filter((e) => /sandboxed/.test(e));
      const erroriVeri = errori.filter((e) => !/sandboxed/.test(e));
      writeFileSync(join(FOTO, `misure-prodotto-${w}x${h}-${tema}.json`), `${JSON.stringify({ tema, viewport: `${w}x${h}`, nonGet, erroriPagina: erroriVeri, erroriSandbox: erroriSandbox.length, foto: misure }, null, 2)}\n`);
      expect(nonGet, 'nessuna scrittura verso il server').toBe(0);
      expect(erroriVeri, 'nessun errore JavaScript nella pagina (fuori dalle cornici in sandbox)').toEqual([]);
    });
  }
}
