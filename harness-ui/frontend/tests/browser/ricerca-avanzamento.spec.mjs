import { expect, test } from '@playwright/test';

/*
 * ⛔ 24/09/2026 — decisione owner («Barra + fase e conteggi», memoria `ricerca-approfondita-barra-di-avanzamento`): nella
 * sezione Ricerca approfondita una ricerca in corso mostra la barra (passi fatti sui previsti, mai piena prima della fine),
 * la fase e i conteggi; una conclusa no. Numeri della ricerca vera dell'owner 92536781…. Mai sul 4174.
 */
const SID = 'ricerca-avanzamento';
const IN_CORSO = { id: '92536781-a9e1-4ed6-9e3e-08706f85825d', domanda: 'Qual è la capitale dell’Australia e perché non è Sydney?',
  stato: 'running', avviataAlle: '2026-09-24T17:36:35.184Z', conclusaAlle: null, reportLibraryId: null, padreId: SID,
  avanzamento: { fase: 'ricerca', frazione: 0.375, passiFatti: 4, passiFalliti: 1, passiStimati: 12, lineeTotali: 2,
    lineeIniziate: 2, lineaCorrente: 2, fontiLette: 2, partiRapporto: 0 } };
const CONCLUSA = { id: '85f80311-3c18-4df5-9b2f-9404a1059c4a', domanda: 'Quanti stati ha l’Unione Europea oggi?', stato: 'cancelled',
  avviataAlle: '2026-09-24T17:36:35.250Z', conclusaAlle: '2026-09-24T17:41:34.111Z', reportLibraryId: null, padreId: SID };

test('R4-RES-PROGRESS-CARD: la ricerca in corso mostra barra, fase e conteggi; la conclusa no', async ({ page }) => {
  await page.route(`**/api/v1/sessions/${SID}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' }));
  await page.route(`**/api/v1/sessions/${SID}/research`, (route) => route.fulfill({ json: { ok: true, data: { ricerche: [IN_CORSO, CONCLUSA], totale: 2 } } }));
  const scritture = [];
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET') { scritture.push(r.method() + ' ' + r.url()); return route.abort(); }
    return route.fallback();
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((sid) => window.__talosHarnessUiRuntime.passaASessione(sid, 'workspace', 'Ricerche', 'z-ai/glm-5.3-flash', { conclusa: true }), SID);
  await page.locator('.talos-nav-item[data-vaia="ricerca"]').click();
  const avanzamento = page.locator('#schermoRicerca .talos-research-progress');
  await expect(avanzamento).toHaveCount(1);
  const barra = avanzamento.locator('progress');
  await expect(barra).toHaveAttribute('value', '38');
  await expect(barra).toHaveAttribute('aria-valuetext', /5 passi su circa 12 previsti dal piano/u);
  await expect(avanzamento).toContainText('Cerca e legge le fonti · linea 2 di 2 · 2 fonti lette');
  expect(await barra.evaluate((n) => n.getBoundingClientRect().height)).toBeGreaterThan(0);
  // Il dettaglio (vista «Come è andata») mostra l'avanzamento più fresco, quello della sua rotta.
  await page.route(`**/api/v1/sessions/${SID}/research/${IN_CORSO.id}`, (route) => route.fulfill({ json: { ok: true, data: {
    ricerca: { ...IN_CORSO, avanzamento: { ...IN_CORSO.avanzamento, fase: 'scrittura', frazione: 0.93, partiRapporto: 1 }, piano: [], passi: [] } } } }));
  await page.locator(`#schermoRicerca .td-card[data-item="${IN_CORSO.id}"] .td-card-open`).click();
  const nelDettaglio = page.locator('#schermoRicerca .td-detail .talos-research-progress');
  await expect(nelDettaglio).toContainText('Scrive il rapporto · 2 fonti lette · 1 parte del rapporto scritta');
  await expect(nelDettaglio.locator('progress')).toHaveAttribute('value', '93');
  expect(scritture).toEqual([]);
});
