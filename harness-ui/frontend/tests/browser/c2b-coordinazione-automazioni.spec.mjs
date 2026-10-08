import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/*
 * ⛔⛔ C2b «Coordinazione» nelle AUTOMAZIONI (owner 08/10/2026 notte, «Interruttore nella scheda, ora»): nel dettaglio di
 *   un'automazione l'interruttore con la parola dello stato e la nota col tetto, che scrive `POST …/coordinazione
 *   {coordinazione}`; nel foglio «Nuova automazione» la riga a interruttore, spenta di serie, che va con la creazione.
 * ⛔ Forme del server: la voce è quella di `automation-store.mjs` (`coordinazione` booleano), la busta quella di `successEnvelope`.
 *   Server isolato della 4177, mai il 4174; ogni scrittura che la prova non risponde si ferma e si conta.
 */
const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/c2b-coordinazione/', import.meta.url)));
const voce = (extra = {}) => ({ id: 'a1', taskId: 'verifica-catalogo', nome: 'Verifica del catalogo', intervalloMinuti: 30, limiteAlGiorno: 3,
  modello: 'z-ai/glm-5.3-flash', attiva: false, creataAlle: '2026-10-08T20:00:00.000Z', ultimaEsecuzione: null, prossimaEsecuzione: null,
  eseguiteOggi: 0, giornoContatore: null, ...extra });

for (const modo of ['light', 'dark']) {
  test.describe(`C2b Coordinazione nelle automazioni · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    async function apri(page, { elenco = [voce()], lingua = 'it' } = {}) {
      const stato = { elenco: elenco.map((v) => ({ ...v })), creazioni: [], coordinazioni: [], scritture: [] };
      await page.addInitScript(({ colorMode, uiLanguage }) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage } }));
      }, { colorMode: modo, uiLanguage: lingua });
      await page.route('**/api/**', (rotta) => {
        if (rotta.request().method() === 'GET') return rotta.fallback();
        stato.scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
        return rotta.abort();
      });
      await page.route('**/api/v1/tasks', (route) => route.fulfill({ json: { ok: true, data: { items: [{ id: 'verifica-catalogo', difficolta: 'facile' }] } } }));
      await page.route((url) => url.pathname === '/api/v1/automations', (route) => {
        if (route.request().method() === 'POST') {
          const corpo = route.request().postDataJSON();
          stato.creazioni.push(corpo);
          return route.fulfill({ json: { ok: true, data: voce({ id: 'a2', ...corpo }) } });
        }
        return route.fulfill({ json: { ok: true, data: { items: stato.elenco } } });
      });
      await page.route((url) => /^\/api\/v1\/automations\/[^/]+\/coordinazione$/u.test(url.pathname), (route) => {
        const corpo = route.request().postDataJSON();
        stato.coordinazioni.push({ path: new URL(route.request().url()).pathname, corpo });
        stato.elenco = stato.elenco.map((v) => (v.id === 'a1' ? { ...v, coordinazione: corpo.coordinazione } : v));
        return route.fulfill({ json: { ok: true, data: stato.elenco[0] } });
      });
      await page.goto('/');
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
      await page.locator('[data-vaia="automazioni"]').evaluate((el) => el.click());
      await expect(page.locator('#schermoAutomazioni [data-automation-action="new"]')).toBeEnabled();
      return stato;
    }
    async function foto(page, nome) {
      await mkdir(CARTELLA_FOTO, { recursive: true });
      await page.evaluate(() => Promise.race([
        Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).map((a) => a.finished.catch(() => null))),
        new Promise((ok) => setTimeout(ok, 3000)),
      ]));
      await writeFile(path.join(CARTELLA_FOTO, nome), await page.screenshot());
    }
    /* 08/10/2026: la pagina è l'impianto di Libreria e Note (owner): la Coordinazione sta nel PANNELLO a destra della scheda */
    const riga = (page) => page.locator('#schermoAutomazioni .td-detail');
    const apriPannello = async (page) => { await page.locator('#schermoAutomazioni .td-card[data-item="a1"] .td-card-open').click(); await expect(riga(page)).toBeVisible(); };
    async function compila(foglio) {
      await foglio.locator('[data-auto-foglio-nome]').fill('Verifica del catalogo');
      await foglio.locator('[data-auto-foglio-istruzioni]').fill('Controlla il catalogo e dimmi se manca qualcosa.');
      await foglio.locator('[data-auto-foglio-cartella]').fill('C:\\progetto-di-prova');
    }

    test('C2B-AUTO-01 — nel dettaglio: spenta di serie; l\'interruttore scrive la sola Coordinazione e la riga dice «Accesa»', async ({ page }) => {
      const stato = await apri(page);
      await apriPannello(page);
      const interruttore = riga(page).locator('[data-auto-coordinazione]');
      await expect(interruttore).toHaveAttribute('aria-checked', 'false');
      await expect(riga(page).locator('[data-auto-coordinazione-stato]')).toHaveText('Spenta');
      await expect(riga(page)).toContainText('Accesa: avvia agenti da sola, al massimo 20 per esecuzione. Spenta: non ne avvia nessuno.');
      await foto(page, `c2b-auto-01-spenta-${modo}.png`);
      await interruttore.click();
      await expect.poll(() => stato.coordinazioni.length).toBe(1);
      expect(stato.coordinazioni[0]).toEqual({ path: '/api/v1/automations/a1/coordinazione', corpo: { coordinazione: true } });
      // la riga si ridisegna dall'elenco riletto, col dettaglio ancora aperto
      await expect(riga(page).locator('[data-auto-coordinazione-stato]')).toHaveText('Accesa');
      await expect(riga(page).locator('[data-auto-coordinazione]')).toHaveAttribute('aria-checked', 'true');
      await foto(page, `c2b-auto-01-accesa-${modo}.png`);
      expect(stato.scritture, 'nessun\'altra scrittura').toEqual([]);
    });

    test('C2B-AUTO-02 — il foglio «Nuova automazione»: la riga a interruttore, spenta di serie, va con la creazione', async ({ page }) => {
      const stato = await apri(page, { elenco: [] });
      await page.locator('#schermoAutomazioni [data-automation-action="new"]').click();
      const foglio = page.locator('#sheetBody');
      const interruttore = foglio.locator('[data-nuova-automazione-coordinazione]');
      await expect(interruttore).not.toBeChecked();
      await expect(foglio).toContainText('Avvia agenti da sola, al massimo 20 per esecuzione. Spenta di serie: non ne avvia nessuno.');
      await interruttore.check();
      await compila(foglio); // automazioni a due porte (08/10/2026): il foglio v2 vuole nome, istruzioni e cartella
      await foto(page, `c2b-auto-02-foglio-${modo}.png`);
      await foglio.getByRole('button', { name: 'Crea automazione' }).click();
      await expect.poll(() => stato.creazioni.length).toBe(1);
      expect(stato.creazioni[0].coordinazione).toBe(true);
    });

    test('C2B-AUTO-02b — al contrario: senza toccarla, la creazione dice «spenta» (false), mai assente o accesa', async ({ page }) => {
      const stato = await apri(page, { elenco: [] });
      await page.locator('#schermoAutomazioni [data-automation-action="new"]').click();
      await compila(page.locator('#sheetBody'));
      await page.locator('#sheetBody').getByRole('button', { name: 'Crea automazione' }).click();
      await expect.poll(() => stato.creazioni.length).toBe(1);
      expect(stato.creazioni[0].coordinazione).toBe(false);
    });

    test('C2B-AUTO-03 — in inglese (la sorgente)', async ({ page }) => {
      await apri(page, { elenco: [voce({ coordinazione: true })], lingua: 'en' });
      await apriPannello(page);
      await expect(riga(page).locator('[data-auto-coordinazione-stato]')).toHaveText('On');
      await expect(riga(page)).toContainText('On: it starts agents on its own, at most 20 per run. Off: it starts none.');
      await expect(riga(page).locator('[data-auto-coordinazione]')).toHaveAttribute('aria-label', 'Coordination for Verifica del catalogo');
    });
  });
}
