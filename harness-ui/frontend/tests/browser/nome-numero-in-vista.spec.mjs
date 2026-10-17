import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * 15/10/2026 sera, owner («Sì, il numero sempre visibile»): nella barra delle sessioni e nella testata il «-2» di un doppione resta in
 *   vista anche quando il nome non ci sta; si tronca la parte prima del numero (`nome-con-numero.js`).
 * ⛔ Si misura la GEOMETRIA, non le classi: il numero sta dentro il riquadro che taglia, e la base è davvero troncata.
 * ⛔ Server di prova di `playwright.config.mjs`, mai il 4174; l'elenco è intercettato, ogni scrittura si ferma e si conta.
 */
const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/nome-numero-in-vista/', import.meta.url)));
const MODELLO = 'z-ai/glm-5.3-flash';
const DOPPIONE = 'ciao leggi i due documenti nella cartella , dimmi se la mia idea e concettualmente valida e se ha-2…';
const SEMPLICE = 'ciao leggi i due documenti nella cartella , dimmi se la mia idea e concettualmente valida e se ha…';

for (const modo of ['light', 'dark']) {
  test.describe(`numero del doppione in vista · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    async function prepara(page) {
      const scritture = [];
      await page.addInitScript((colorMode) => {
        try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } })); } catch { /* sandbox */ }
      }, modo);
      await page.route('**/api/**', (rotta) => {
        if (rotta.request().method() === 'GET') return rotta.fallback();
        scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
        return rotta.abort();
      });
      const base = { taskId: 'workspace', modello: MODELLO, interrotta: false, usage: null, inAttesaApprovazione: false, conclusa: true, ultimoEsito: 'successo' };
      const righe = [
        { ...base, sessionId: 'numero-2', nome: DOPPIONE, avviataAlle: '2026-10-15T09:00:00.000Z' },
        { ...base, sessionId: 'numero-1', nome: SEMPLICE, avviataAlle: '2026-10-15T08:00:00.000Z' },
      ];
      await page.route(/\/api\/v1\/sessions(\?.*)?$/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { items: righe }, meta: { schema: 'talos.harness-ui.api.v1' } }) }));
      await page.route('**/api/v1/sessions/*/events', (route) => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' }));
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate(([nome, modello]) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione('numero-2', 'workspace', nome, modello, { conclusa: true, modello });
        r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
      }, [DOPPIONE, MODELLO]);
      await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
      await expect(page.locator('#sessionList .talos-session-item')).toHaveCount(2);
      return scritture;
    }

    /** La geometria del nome in un nodo: il numero visibile dentro il riquadro, la base troncata. */
    const misura = (locator) => locator.evaluate((nodo) => {
      const numero = nodo.querySelector('.talos-nome-numerato__numero');
      const base = nodo.querySelector('.talos-nome-numerato__base');
      const scatola = nodo.getBoundingClientRect();
      const n = numero?.getBoundingClientRect();
      return {
        testo: nodo.textContent,
        numero: numero?.textContent ?? null,
        numeroDentro: n ? n.width > 0 && n.left >= scatola.left - 0.5 && n.right <= scatola.right + 0.5 : false,
        baseTroncata: base ? base.scrollWidth > base.clientWidth : false,
        haPezzi: Boolean(numero || base),
        larghezza: scatola.width,
        /* la base e il numero si toccano: il vuoto che la prima foto mostrava è DENTRO la base (la lettera che il taglio non tiene) */
        vuoto: n && base ? n.left - base.getBoundingClientRect().right : null,
        /* i puntini del server dopo il numero: nel testo, larghi zero; a schermo li mette la base (prima foto: «se la…-2…») */
        coda: nodo.querySelector('.talos-nome-numerato__coda')?.getBoundingClientRect().width ?? null,
        dopo: base ? getComputedStyle(base, '::after').content : null,
      };
    });

    test(`NOME-NUMERO-B01 — nella barra e nella testata il «-2» resta a schermo, la base si tronca (${modo})`, async ({ page }) => {
      const scritture = await prepara(page);
      const riga = page.locator('#sessionList .talos-session-item', { hasText: '-2' }).locator('.talos-session-item__title');
      const testata = page.locator('#schermoChat .talos-topbar__title h1');
      for (const [dove, loc] of [['barra', riga], ['testata', testata]]) {
        await expect(loc).toBeVisible();
        const m = await misura(loc);
        expect(m.testo, `${dove}: il testo resta il nome intero`).toBe(DOPPIONE);
        expect(m.numero, dove).toBe('-2');
        expect(m.numeroDentro, `${dove}: il numero sta dentro il riquadro che taglia (${JSON.stringify(m)})`).toBe(true);
        expect(m.baseTroncata, `${dove}: il nome è davvero più largo del posto, o la prova non prova niente`).toBe(true);
        expect(Math.abs(m.vuoto), `${dove}: base e numero si toccano`).toBeLessThan(0.5);
        expect(m.coda, `${dove}: i puntini dopo il numero non occupano posto`).toBe(0);
        expect(m.dopo, `${dove}: i puntini li porta la base`).toBe('"…" / ""'); // NOME-NUMERO-REV-02: i puntini con testo alternativo vuoto
      }
      /* AL CONTRARIO, la base che ci sta tutta: una copia del titolo larga 1800 px, fuori dalla barra — i puntini della base restano a
         schermo, prima del numero, e la base non è troncata */
      const larga = await testata.evaluate((h1) => {
        const copia = h1.parentElement.cloneNode(true);
        copia.style.cssText = 'position:fixed; left:0; top:200px; width:1800px; max-width:none; min-width:0';
        document.body.append(copia);
        const base = copia.querySelector('.talos-nome-numerato__base');
        const esito = { intera: base.scrollWidth <= base.clientWidth + 0.5, dopo: getComputedStyle(base, '::after').content };
        copia.remove();
        return esito;
      });
      expect(larga, JSON.stringify(larga)).toEqual({ intera: true, dopo: '"…" / ""' });
      await mkdir(CARTELLA_FOTO, { recursive: true });
      await page.mouse.move(1000, 600);
      await page.screenshot({ path: path.join(CARTELLA_FOTO, `numero-in-vista-${modo}.png`) });
      expect(scritture, 'nessuna scrittura').toEqual([]);
    });

    test(`NOME-NUMERO-B02 AL CONTRARIO — un nome senza numero resta testo semplice, troncato com'era (${modo})`, async ({ page }) => {
      await prepara(page);
      const riga = page.locator('#sessionList .talos-session-item').filter({ hasNotText: '-2' }).locator('.talos-session-item__title');
      const m = await misura(riga);
      expect(m.testo).toBe(SEMPLICE);
      expect(m.haPezzi).toBe(false);
      expect(await riga.evaluate((n) => n.scrollWidth > n.clientWidth), 'troncato dal suo ellipsis di sempre').toBe(true);
    });
  });
}
