import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { SCENE_ATTIVITA, ORDINE_SCENE_ATTIVITA } from '../fixtures/attivita-compatta.js';

/*
 * R4 — ATTIVITÀ COMPATTA · FOTO «PRIMA»: il prodotto ATTUALE con le quattro scene del laboratorio.
 *
 * Gli eventi sono gli stessi che il prototipo proietta (`lab/fixtures/attivita-compatta.js`), dati a
 * `handleRealEvent` per la strada vera della rigiocata (`/events` finto + `talos.fine-rigiocata`, come
 * `R4-CHAT-ACTIVITY-REPLAY-07`) e con le durate dei ragionamenti da `/metrics` (come
 * `RAGIONAMENTO-SCHERMO-06`). La scena «vivo» passa invece dalla strada DIRETTA, con pause vere fra gli
 * eventi, perché il prodotto cronometra solo dal vivo.
 *
 * Tre stati per scena: S0 come arriva, S1 dopo UN clic sulla testa del segmento, S2 con ogni disclosure
 * interno aperto (gruppi e ragionamenti) — cioè tutte le voci leggibili. Le misure (altezze da
 * `getBoundingClientRect`, clic contati) vanno in `misure-attuale.json` accanto alle foto.
 * ⛔ Nessuna richiesta non-GET parte verso il server: le sessioni non esistono sul disco, esistono solo
 *   nelle rotte finte di questa pagina.
 */

const QUI = fileURLToPath(new URL('.', import.meta.url));
const FOTO = resolve(QUI, '..', '..', '..', 'docs', 'foto-attivita');
mkdirSync(FOTO, { recursive: true });

const VIEWPORTS = [[1920, 1080], [1440, 900]];
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const misure = [];

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
    const segmenti = [...document.querySelectorAll('#conversation .talos-activity--segment')];
    /* ⛔ Solo i nudi FUORI da un segmento: quelli dentro sono già nell'altezza del segmento (contati due volte nella prima corsa). */
    const nudi = [...document.querySelectorAll('#conversation .talos-activity--nuda')].filter((n) => !n.parentElement?.closest('.talos-activity--segment'));
    const turno = [...document.querySelectorAll('#conversation .talos-turn[data-turno="talos"]')].at(-1);
    const r = (el) => el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null;
    return {
      segmenti: segmenti.map((s) => ({
        altezza: r(s),
        testa: s.querySelector(':scope > .talos-activity__head')?.textContent.replace(/\s+/g, ' ').trim() || '',
        gruppiInterni: s.querySelectorAll(':scope > .talos-activity__body > [data-c="ActivityBundle"]').length,
        righeAttrezzo: s.querySelectorAll('[data-c="ToolRow"]').length,
      })),
      nudi: nudi.map((n) => ({ altezza: r(n) })),
      turnoTalos: r(turno),
      prosa: Math.round([...(turno?.querySelectorAll('.talos-message__copy') || [])].reduce((s, c) => s + c.getBoundingClientRect().height, 0)),
      segmentiTotale: Math.round([...segmenti, ...nudi].reduce((s, c) => s + c.getBoundingClientRect().height, 0)),
    };
  });
}

async function scattaEMisura(page, nome, stato, extra = {}) {
  await chiudiToast(page);
  await dueFotogrammi(page);
  const file = join(FOTO, `${nome}.png`);
  await page.screenshot({ path: file, animations: 'disabled' });
  const m = await misura(page);
  misure.push({ foto: `${nome}.png`, stato, ...extra, ...m });
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
    test(`attuale ${tema} ${w}x${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
      await page.addInitScript((colorMode) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
      }, tema);
      /* ⛔ Ogni non-GET si ferma e si conta: questa pagina non deve scrivere niente sul server. */
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
          /* La strada diretta, con pause VERE: il prodotto misura le durate solo dal vivo. */
          const passi = scena.eventi;
          for (const evento of passi) {
            await page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, evento);
            if (evento.type === 'ReasoningMessageStart') await page.waitForTimeout(2_300);
            if (evento.type === 'ToolCallResult') await page.waitForTimeout(300);
          }
          await page.waitForTimeout(1_600);
        } else {
          const ultimo = scena.eventi.filter((e) => e.type === 'TextMessageContent').at(-1).delta.replace(/[*`]/g, '').slice(0, 24);
          await expect(page.locator('#conversation')).toContainText(ultimo, { timeout: 10_000 });
          await page.waitForTimeout(500); // le durate da `/metrics` arrivano DOPO la rigiocata
        }
        await portaInVista(page);
        await scattaEMisura(page, `attuale-${chiave}-S0-${w}x${h}-${tema}`, 'S0', { scena: chiave, tema, viewport: `${w}x${h}`, clic: 0 });

        const testa = page.locator('#conversation .talos-activity--segment > .talos-activity__head').first();
        if (await testa.count()) {
          /* ⛔ Col fallimento il prodotto APRE da solo il segmento: il clic lo richiuderebbe. Si clicca solo se è chiuso. */
          const giaAperto = (await testa.getAttribute('aria-expanded')) === 'true';
          if (!giaAperto) await testa.click();
          await portaInVista(page);
          await scattaEMisura(page, `attuale-${chiave}-S1-${w}x${h}-${tema}`, 'S1', { scena: chiave, tema, viewport: `${w}x${h}`, clic: giaAperto ? 0 : 1, apertoDaSolo: giaAperto });
          /* S2: ogni disclosure interno ancora chiuso si apre — gruppi di attrezzi e ragionamenti. Si contano i clic. */
          const interni = page.locator('#conversation .talos-activity--segment > .talos-activity__body > [data-c="ActivityBundle"] > .talos-activity__head[aria-expanded="false"]:visible');
          let clic = giaAperto ? 0 : 1;
          for (let i = 0; i < 20; i += 1) {
            const prossimo = interni.first();
            if (!(await prossimo.count())) break;
            await prossimo.click();
            clic += 1;
          }
          await portaInVista(page);
          await scattaEMisura(page, `attuale-${chiave}-S2-${w}x${h}-${tema}`, 'S2', { scena: chiave, tema, viewport: `${w}x${h}`, clic });
        }
      }
      expect(nonGet, 'nessuna scrittura verso il server').toBe(0);
      writeFileSync(join(FOTO, `misure-attuale-${w}x${h}-${tema}.json`), `${JSON.stringify(misure.filter((m) => m.tema === tema && m.viewport === `${w}x${h}`), null, 2)}\n`);
    });
  }
}
