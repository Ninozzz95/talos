import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

/*
 * C1b (owner 10/10/2026: «i browser devono essere estremamente affidabili, adesso aprono la pagina una volta ogni 10») — SONDA,
 * non una prova della suite: si lancia a mano con TALOS_C1B_MISURA=1 contro un server di prova vero (siti veri, rete vera).
 * Fa quello che fa la persona: scrive l'indirizzo nella barra del Browser, preme Invio, e guarda se la pagina SI VEDE:
 *   · corsia «cornice»: l'iframe della scheda è visibile e ha finito di caricare;
 *   · corsia «vivo»: la vista viva è a `data-stato="pronto"`, che `browser-vivo.js` scrive solo dopo il primo fotogramma DIPINTO.
 * Altrimenti, dopo ATTESA_MS, registra cosa dice la scheda. Ogni scheda si chiude dopo la misura (il tetto delle schede è basso).
 */
test.skip(!process.env.TALOS_C1B_MISURA, 'sonda manuale: TALOS_C1B_MISURA=1');
test.setTimeout(30 * 60_000);

const SITI = ['https://example.com/', 'https://en.wikipedia.org/wiki/Main_Page', 'https://github.com/', 'https://news.ycombinator.com/',
  'https://developer.mozilla.org/en-US/', 'https://www.bbc.com/', 'https://stackoverflow.com/', 'https://www.google.com/',
  'https://nodejs.org/en', 'https://www.python.org/', 'https://www.treatwell.it/', 'https://www.amazon.it/'];
const GIRI = Number(process.env.TALOS_C1B_GIRI || 2);
const ATTESA_MS = 20_000;

test('C1B-MISURA — aprire N pagine di fila dalla barra del Browser', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const righe = [];
  const errori = [];
  page.on('pageerror', (e) => errori.push(String(e.message).slice(0, 200)));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.locator('#schermoChat [data-vaia="browser"]').first().click();
  await page.locator('#schermoBrowser').waitFor({ state: 'visible' });
  for (let giro = 0; giro < GIRI; giro++) {
    for (const url of SITI) {
      const t0 = Date.now();
      await page.locator('#urlBrowser').fill(url);
      await page.locator('#urlBrowser').press('Enter');
      let esito = null;
      while (Date.now() - t0 < ATTESA_MS && !esito) {
        esito = await page.evaluate(() => {
          const cornice = [...document.querySelectorAll('#browserLive iframe')].find((f) => !f.hidden && f.getClientRects().length);
          const live = document.querySelector('#browserLive');
          if (cornice && live && !live.hidden && (cornice.dataset.caricata === 'si' || cornice.dataset.caricata === undefined) && cornice.dataset.misuraCaricata === 'si') return { via: 'cornice' };
          const viva = document.querySelector('#browserVistaViva .talos-vistaviva');
          if (viva && !document.querySelector('#browserVistaViva').hidden && viva.dataset.stato === 'pronto') return { via: 'vivo' };
          return null;
        });
        if (!esito) {
          // l'iframe non dice «caricato» per le schede vive: lo si marca dal suo evento `load`, una volta sola
          await page.evaluate(() => {
            for (const f of document.querySelectorAll('#browserLive iframe')) {
              if (f.dataset.sondaAgganciata) continue;
              f.dataset.sondaAgganciata = 'si';
              f.addEventListener('load', () => { f.dataset.misuraCaricata = 'si'; });
            }
          });
          await page.waitForTimeout(250);
        }
      }
      const stato = await page.evaluate(() => ({
        pannello: (() => { const p = document.querySelector('#browserStatoScheda'); return p && !p.hidden ? p.textContent.replace(/\s+/g, ' ').trim().slice(0, 220) : null; })(),
        avviso: (() => { const a = document.querySelector('#browserAvviso'); return a && !a.hidden ? a.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) : null; })(),
        vivaStato: document.querySelector('#browserVistaViva .talos-vistaviva')?.dataset.stato ?? null,
        cornici: document.querySelectorAll('#browserLive iframe').length,
        schede: document.querySelectorAll('#browserSchede [data-browser-id], #browserSchede [role="tab"]').length,
      }));
      const riga = { giro, url, ok: Boolean(esito), via: esito?.via ?? null, ms: Date.now() - t0, ...stato };
      righe.push(riga);
      console.log('C1B', JSON.stringify(riga));
      // si chiude la scheda attiva, come farebbe chi passa al sito dopo
      const chiudi = page.locator('#browserSchede [aria-selected="true"] [data-browser-chiudi], #browserSchede .is-active [data-browser-chiudi]').first();
      if (await chiudi.count()) await chiudi.click().catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  const ok = righe.filter((r) => r.ok).length;
  console.log(`C1B RIASSUNTO ${ok}/${righe.length} pagine viste · cornice ${righe.filter((r) => r.via === 'cornice').length} · vivo ${righe.filter((r) => r.via === 'vivo').length} · errori di pagina ${errori.length}`);
  if (process.env.TALOS_C1B_USCITA) writeFileSync(process.env.TALOS_C1B_USCITA, JSON.stringify({ righe, errori }, null, 1));
});
