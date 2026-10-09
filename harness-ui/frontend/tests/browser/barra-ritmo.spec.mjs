import { test, expect } from '@playwright/test';

/*
 * ⛔ Taccuino (bugfixer, 08/10/2026) — LA BARRA DICEVA «IN CORSO» FINO A 15 s DOPO LA FINE di una sessione non aperta: l'elenco
 *   si rileggeva ogni 15 s (misurato sulla 4176: conclusa alla barra 1,6 s dopo il server in un giro fortunato, fino a 15 s nel
 *   caso peggiore). Hermes rilegge lo stato delle sessioni vive ogni 1,5 s («A 15s cadence made that healthy transition look
 *   finished long enough to be alarming», use-background-sync.ts:659-665). Ora: 2 s finché una sessione è in corso, 15 s da
 *   fermo, e il giro del temporizzatore NON ridisegna la barra se l'elenco non è cambiato (misurato: 1000 sessioni = un compito
 *   da 200-300 ms a ogni ridisegno).
 */
const sessione = (i, viva) => ({
  sessionId: `barra-${String(i).padStart(4, '0')}-0000-4000-8000-000000000000`, taskId: `libero:${i}`, nome: `Sessione ${i}`,
  avviataAlle: new Date(Date.UTC(2026, 9, 8, 10, 0) - i * 60_000).toISOString(), conclusa: !viva, interrotta: false,
  modello: 'z-ai/glm-5.3-flash', giri: 1, cartella: 'C:\\progetti\\prova', padreId: null,
});

async function scena(page, { viva }) {
  const stato = { elenco: [sessione(0, viva), sessione(1, false)], richieste: 0 };
  await page.route('**/api/v1/sessions', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    stato.richieste += 1;
    const vera = await route.fetch();
    const corpo = await vera.json();
    return route.fulfill({ response: vera, json: { ...corpo, data: { ...corpo.data, items: stato.elenco } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
  await expect(page.locator('#realSessionsBlock [data-real-session-id]')).toHaveCount(2);
  await page.waitForTimeout(2500); // i giri d'avvio si esauriscono
  return stato;
}

test('BARRA-RITMO-01 — con una sessione in corso l\'elenco si rilegge ogni 2 s; tutto fermo, non prima dei 15 s', async ({ page }) => {
  const viva = await scena(page, { viva: true });
  viva.richieste = 0;
  await page.waitForTimeout(6_500);
  expect(viva.richieste, 'in corso: in 6,5 s almeno tre giri da 2 s').toBeGreaterThanOrEqual(3);

  const altra = await page.context().newPage();
  const ferma = await scena(altra, { viva: false });
  ferma.richieste = 0;
  await altra.waitForTimeout(6_500);
  expect(ferma.richieste, 'tutto fermo: nessun giro prima dei 15 s').toBe(0);
});

test('BARRA-RITMO-02 — il giro del temporizzatore non ridisegna una barra che non è cambiata, e la ridisegna quando cambia', async ({ page }) => {
  const stato = await scena(page, { viva: true });
  await page.evaluate(() => {
    window.__mutazioniBarra = 0;
    new MutationObserver((voci) => { window.__mutazioniBarra += voci.length; }).observe(document.querySelector('#realSessionsBlock'), { childList: true, subtree: true });
  });
  await page.waitForTimeout(4_500); // almeno due giri da 2 s con lo stesso elenco
  expect(await page.evaluate(() => window.__mutazioniBarra), 'elenco uguale: nessun ridisegno').toBe(0);
  stato.elenco = [sessione(0, false), sessione(1, false)]; // la sessione in corso finisce
  await expect(page.locator('#realSessionsBlock [data-real-session-id]').first()).toContainText(/conclusa/i, { timeout: 3_000 });
  expect(await page.evaluate(() => window.__mutazioniBarra), 'elenco cambiato: la barra si ridisegna').toBeGreaterThan(0);
});
