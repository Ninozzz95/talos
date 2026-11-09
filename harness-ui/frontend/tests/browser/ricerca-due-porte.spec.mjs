import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/*
 * ⭐ RICERCA APPROFONDITA — «New research» della sezione nel browser (bozzetto approvato dall'owner il 22/10/2026, foto E-G).
 *   ⛔ Owner 01/11/2026 sera: «niente pillola ricerca approfondita nel composer, solo sezione o richiesta al modello».
 *   ⛔ DA ESEGUIRE: scritta il 01/11/2026 durante la campagna di Performance (niente browser), mai lanciata.
 * Forma del server, dal sorgente: `POST /api/v1/sessions/custom` `{…, consegna, ricerca: {profondita}}` (`src/http-app.mjs`,
 *   `src/ricerca-due-porte.mjs`). Ogni altra scrittura si ferma e si conta; i WebSocket si chiudono (lezione del 03/10: se gira sul 4174).
 */
const FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/ricerca-due-porte/', import.meta.url)));
const SID = 'sessione-ricerca';
const CARTELLA = 'C:/progetti/AVM';
const DOMANDA = 'Compare llama.cpp, MLC LLM and ExecuTorch on Snapdragon 8 Elite';

/* Revisione del blocco 25, R5: senza conversazione aperta lo stato non ha un modello, e «New research» apre giustamente il selettore dei modelli (`app.js`,
   `apriNuovaRicercaDallaSezione`) invece della modale. Chi prova la strada «senza conversazione» semina il modello come lo salva l'app, nelle preferenze della chat. */
async function apri(page, { modo = 'dark', conSessione = true, progetti = [{ id: 'p1', nome: 'AVM' }], modello = null } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const stato = { scritture: [], avvii: [] };
  const sessione = { sessionId: SID, taskId: 'libero:full-access', nome: 'Ricerca', avviataAlle: '2026-11-01T07:00:00.000Z', conclusa: true,
    modello: 'z-ai/glm-5.3-flash', modelId: 'z-ai/glm-5.3-flash', provider: 'cloud' };
  await page.addInitScript(({ colorMode, model }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'en' }, ...(model ? { chat: { model } } : {}) }));
  }, { colorMode: modo, model: modello });
  await page.routeWebSocket('**/*', (ws) => ws.close());
  await page.route('**/api/**', (rotta) => {
    const r = rotta.request();
    if (r.method() === 'GET') return rotta.fallback();
    stato.scritture.push(`${r.method()} ${new URL(r.url()).pathname}`);
    return rotta.abort();
  });
  await page.route('**/api/v1/sessions', (route) => route.fulfill({ json: { ok: true, data: { items: conSessione ? [sessione] : [] } } }));
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: { ok: true, data: { items: progetti } } }));
  const eventi = [
    { type: 'RunStarted', threadId: 't', runId: 'r1', contesto: { cartella: CARTELLA, cartellaBase: CARTELLA } },
    { type: 'RunFinished', threadId: 't', runId: 'r1' },
    { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null },
  ];
  await page.route(`**/api/v1/sessions/${SID}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream',
    body: `retry: 3600000\n${eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` }));
  await page.route(`**/api/v1/sessions/${SID}/research`, (route) => route.fulfill({ json: { ok: true, data: { ricerche: [] } } }));
  await page.route('**/api/v1/sessions/custom', (route) => { stato.avvii.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true, data: { sessionId: 'nuova-1' } } }); });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  if (conSessione) {
    await page.locator('.talos-nav-item[data-vaia="chat"]').click();
    await page.locator(`[data-real-session-id="${SID}"]`).click();
  }
  return stato;
}

test.describe('ricerca approfondita — la porta della sezione', () => {
  test("RDP-B00 (owner 01/11 sera): nel compositore non c'è niente della ricerca — né pillola, né voce nel «+», né `/research`", async ({ page }) => {
    await apri(page);
    await expect(page.locator('#pillRicerca')).toHaveCount(0);
    await page.locator('#capabilityBtn').click();
    await expect(page.locator('#menuAllega [data-voce-ricerca]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.locator('#composerInput').fill('/res');
    await expect(page.locator('#suggerimentoComandiResearch')).toHaveCount(0);
  });

  for (const modo of ['dark', 'light']) {
    test(`RDP-B06 (${modo}, E-G): «New research» in testa, la modale con l'occhiello e «Advanced» chiuso, l'avvio apre una chat nuova del progetto con la ricerca`, async ({ page }) => {
      const stato = await apri(page, { modo });
      await page.locator('.talos-nav-item[data-vaia="ricerca"]').click();
      const nuova = page.locator('#schermoRicerca .td-intro [data-nuova]');
      await expect(nuova).toHaveText('New research');
      // difetto della foto E: niente parola orfana — il testo d'apertura va a capo «pretty»
      expect(await page.locator('#schermoRicerca .td-intro p').first().evaluate((el) => getComputedStyle(el).textWrap || getComputedStyle(el).textWrapStyle)).toMatch(/pretty/u);
      await mkdir(FOTO, { recursive: true });
      await page.screenshot({ path: path.join(FOTO, `E-sezione-${modo}.png`) });
      await nuova.click();
      const modale = page.locator('dialog[data-nuova-ricerca]');
      await expect(modale).toBeVisible();
      await expect(modale.locator('.talos-eyebrow').first()).toHaveText('Deep research');
      await expect(modale.locator('h2')).toHaveText('New research');
      await expect(modale.locator('[data-nuova-ricerca-avanzate]')).toHaveText(/Advanced · depth: Deep/u);
      await modale.locator('[data-nuova-ricerca-domanda]').fill(DOMANDA);
      await expect(modale.locator('[data-nuova-ricerca-conto]')).toHaveText(`${DOMANDA.length} of 500`);
      await page.screenshot({ path: path.join(FOTO, `F-modale-${modo}.png`) });
      await modale.locator('[data-nuova-ricerca-avanzate]').click();
      await modale.locator('[role="radio"][data-profondita="quick"]').click();
      await page.screenshot({ path: path.join(FOTO, `G-modale-avanzate-${modo}.png`) });
      await modale.locator('[data-nuova-ricerca-avvia]').click();
      await expect.poll(() => stato.avvii.length).toBe(1);
      expect(stato.avvii[0]).toMatchObject({ cartellaLibera: CARTELLA, consegna: DOMANDA, ricerca: { profondita: 'quick' } });
    });
  }

  test('RDP-B07 (revisione S2-2): Ctrl+Invio tenuto premuto nella modale avvia UNA ricerca sola', async ({ page }) => {
    const stato = await apri(page);
    await page.locator('.talos-nav-item[data-vaia="ricerca"]').click();
    await page.locator('#schermoRicerca .td-intro [data-nuova]').click();
    const campo = page.locator('dialog[data-nuova-ricerca] [data-nuova-ricerca-domanda]');
    await campo.fill(DOMANDA);
    await page.keyboard.down('Control');
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Enter', { delay: 20 }); // la ripetizione del tasto dentro l'uscita animata
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);
    expect(stato.avvii.length).toBe(1);
  });

  test('RDP-B08 (revisione S3-3): senza una conversazione aperta e con un progetto solo, «New research» apre la chat nuova lì e parte — nessun avviso', async ({ page }) => {
    const stato = await apri(page, { conSessione: false, modello: 'z-ai/glm-5.3-flash', progetti: [{ id: 'p1', nome: 'AVM' }] });
    await page.locator('.talos-nav-item[data-vaia="ricerca"]').click();
    await page.locator('#schermoRicerca .td-intro [data-nuova]').click();
    await page.locator('dialog[data-nuova-ricerca] [data-nuova-ricerca-domanda]').fill(DOMANDA);
    await page.locator('dialog[data-nuova-ricerca] [data-nuova-ricerca-avvia]').click();
    await expect.poll(() => stato.avvii.length).toBe(1);
    expect(stato.avvii[0]).toMatchObject({ cartellaId: 'p1', consegna: DOMANDA, ricerca: { profondita: 'deep' } });
  });

  test('RDP-B09 (revisione S3-3): con più progetti si apre la scelta del progetto; chiusa senza sceglierne uno, la ricerca non parte più', async ({ page }) => {
    const stato = await apri(page, { conSessione: false, modello: 'z-ai/glm-5.3-flash', progetti: [{ id: 'p1', nome: 'AVM' }, { id: 'p2', nome: 'Altro' }] });
    await page.locator('.talos-nav-item[data-vaia="ricerca"]').click();
    await page.locator('#schermoRicerca .td-intro [data-nuova]').click();
    await page.locator('dialog[data-nuova-ricerca] [data-nuova-ricerca-domanda]').fill(DOMANDA);
    await page.locator('dialog[data-nuova-ricerca] [data-nuova-ricerca-avvia]').click();
    await expect(page.locator('#sheetDialog')).toBeVisible();
    await page.keyboard.press('Escape'); // chiusa senza progetto: la ricerca in attesa si butta
    await page.waitForTimeout(300);
    expect(stato.avvii).toEqual([]);
  });
});
