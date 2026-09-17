/*
 * ⛔⛔ PO-30, fetta 2 (18/09/2026) — IL DETTAGLIO DI UN AGENTE nella colonna destra, col disegno del laboratorio della PR #33,
 * sui dati VERI di `GET …/children` (la forma è quella che il backend dà davvero: `tests/attivita-figlia.test.mjs`).
 * Si misura ciò che si VEDE; ogni prova asserisce la sua premessa (le figlie sono arrivate, il dettaglio si è aperto).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FOTO = join(import.meta.dirname, '..', '..', 'artifacts', 'po30-dettaglio-agente');
const ALBERO = { '': [{ nome: 'src', cartella: true }, { nome: 'README.md', cartella: false }], src: [{ nome: 'registro.mjs', cartella: false }] };
const FIGLIE = [
  { sessionId: 'po30d-figlia-a', task: 'Sei un agente delegato.\nCompito: leggi il registro e correggi la guardia di stallo', taskCorto: 'leggi il registro e correggi la guardia', conclusa: false, interrotta: false,
    avviataAlle: new Date(Date.now() - 6 * 60_000).toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'workspace-write', collisioni: [], esitoDelega: null,
    attivita: { file: [{ percorso: 'src/registro.mjs', letto: true, scritto: true, creato: false }, { percorso: 'README.md', letto: true, scritto: false, creato: false }], fileTagliati: 0, attrezzoCorrente: 'leggi', chiamate: 3,
      passi: [{ tipo: 'avvio', attrezzo: null, percorso: null, quando: '2026-09-18T01:00:00.000Z' }, { tipo: 'attrezzo', attrezzo: 'leggi', percorso: 'src/registro.mjs', quando: '2026-09-18T01:00:05.000Z' }, { tipo: 'attrezzo', attrezzo: 'shell', percorso: null, quando: '2026-09-18T01:00:20.000Z' }], passiTagliati: 0 } },
  { sessionId: 'po30d-figlia-b', task: 'Compito: controlla i test', taskCorto: 'controlla i test', conclusa: true, interrotta: false, avviataAlle: new Date(Date.now() - 50 * 60_000).toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'read-only',
    collisioni: [], esitoDelega: 'I test passano tutti.', attivita: { file: [], fileTagliati: 0, attrezzoCorrente: null, chiamate: 1, passi: [{ tipo: 'fine', attrezzo: null, percorso: null, quando: null }], passiTagliati: 0 } },
];

async function scena(page, { larghezza = 1440, altezza = 900, tema = 'dark' } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); } catch { /* */ } }, { colorMode: tema });
  await page.route('**/api/v1/sessions/po30d-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/po30d-uno/tree?*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { voci: ALBERO[new URL(r.request().url()).searchParams.get('percorso') || ''] ?? [] } }) }));
  await page.route('**/api/v1/sessions/po30d-uno/children', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { figli: FIGLIE } }) }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('po30d-uno', 'workspace', 'PO30D', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9301, input: { consegna: 'Dividi il lavoro' }, contesto: { cartella: 'C:\\progetti\\talos-prova', modello: 'glm-5.3-flash' } }, g);
    r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'delega_sottotask', _sequenza: 9302 }, g);
    r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'd1', content: 'ok', _sequenza: 9303 }, g);
  });
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await expect(page.locator('#railAgenti [data-c="AgentRow"]').first(), 'la scena non si è formata: le figlie non sono arrivate alla scheda Agenti').toBeVisible({ timeout: 10_000 });
}
const apri = (page, quale = 0) => page.locator('#railAgenti [data-c="AgentRow"]').nth(quale).click();
const dettaglio = (page) => page.locator('[data-c="DettaglioAgente"]');

test('PO30-AGENTE-01 — si apre sulla Panoramica: compito intero, fatti veri in parole umane, niente righe vuote', async ({ page }) => {
  await scena(page);
  await apri(page);
  const d = dettaglio(page);
  await expect(d).toBeVisible();
  await expect(d).toHaveAttribute('data-sezione', 'panoramica');
  await expect(d.locator('.talos-agente__nome')).toHaveText('leggi il registro e correggi la guardia');
  await expect(d.locator('.talos-agente__chi [role="status"]')).toHaveText('In corso');
  await expect(d.locator('.talos-agente__compito').first()).toContainText('correggi la guardia di stallo');
  const fatti = await d.locator('[data-pannello="panoramica"] .talos-kv').evaluateAll((righe) => Object.fromEntries(righe.map((r) => [r.querySelector('.talos-kv__k').textContent, r.querySelector('.talos-kv__v').textContent])));
  expect(fatti.Modello).toBe('z-ai/glm-5.3-flash');
  expect(fatti.Permessi).toBe('Scrive nel progetto');
  expect(fatti['Attrezzi usati']).toBe('3');
  expect(fatti.Partito).toMatch(/min fa$/);
  expect(fatti['Sta usando'], 'il nome dell’attrezzo è quello UMANO, mai quello tecnico').not.toBe('leggi');
  expect(Object.values(fatti).every((v) => v && v.trim() !== '' && v.trim() !== '—'), `una riga senza dato non si disegna: ${JSON.stringify(fatti)}`).toBe(true);
  await expect(d.getByText(/dimostrativ|demo|fixture/i), 'niente stati «demo» nel prodotto').toHaveCount(0);
});

test('PO30-AGENTE-02 — un file coinvolto porta AL FILE: scheda File scelta, riga selezionata', async ({ page }) => {
  await scena(page);
  await apri(page);
  const file = dettaglio(page).locator('[data-pannello="panoramica"] .talos-agente__file');
  await expect(file).toHaveCount(2);
  await expect(file.first().locator('.talos-agente__file-segno')).toHaveText('Modificato');
  await expect(file.nth(1).locator('.talos-agente__file-segno')).toHaveText('Letto');
  await file.first().click();
  await expect(page.locator('#railTabs [data-rail="file"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#alberoFile .ft-row.ft-selected'), 'il file dell’agente è stato portato in vista e selezionato nell’albero').toContainText('registro.mjs');
  await expect(dettaglio(page), 'cambiando scheda il dettaglio NON resta a schermo (guardia della PR #33)').toBeHidden();
});

test('PO30-AGENTE-03 — le sezioni: File ed Eventi dai dati veri, la Conversazione è quella di sempre, e la sezione si RICORDA', async ({ page }) => {
  await scena(page);
  await apri(page);
  const d = dettaglio(page);
  await d.locator('[data-sezione="eventi"]').click();
  await expect(d.locator('[data-pannello="panoramica"]')).toBeHidden();
  const frasi = await d.locator('[data-pannello="eventi"] .talos-agente__frase').allTextContents();
  expect(frasi[0]).toBe('Compito assegnato');
  expect(frasi[1]).toMatch(/· src\/registro\.mjs$/);
  expect(frasi.join(' '), 'nessun nome tecnico di attrezzo a schermo').not.toMatch(/\b(leggi|shell|delega_sottotask)\b/);
  await d.locator('[data-sezione="file"]').click();
  await expect(d.locator('[data-pannello="file"] .talos-agente__file')).toHaveCount(2);
  await d.locator('[data-sezione="conversazione"]').click();
  await expect(d.locator('.talos-figlia')).toBeVisible();
  await expect(d.locator('.talos-figlia__head'), 'dentro il dettaglio la testata della conversazione non si ripete').toBeHidden();

  await d.locator('[data-azione="tutti-gli-agenti"]').click();
  await expect(page.locator('#railAgenti')).toBeVisible();
  await expect(dettaglio(page)).toHaveCount(0);
  await apri(page);
  await expect(dettaglio(page), 'riaprendo lo stesso agente si torna alla sezione che si stava guardando').toHaveAttribute('data-sezione', 'conversazione');
  await dettaglio(page).locator('[data-azione="tutti-gli-agenti"]').click();
  await apri(page, 1);
  await expect(dettaglio(page), 'un ALTRO agente si apre sulla Panoramica').toHaveAttribute('data-sezione', 'panoramica');
  await expect(dettaglio(page).locator('.talos-agente__chi [role="status"]')).toHaveText('Concluso');
  await expect(dettaglio(page).getByText('I test passano tutti.')).toBeVisible();
  await expect(dettaglio(page).getByText('Non ha letto né scritto file.')).toBeVisible();
});

for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
  for (const tema of ['dark', 'light']) {
    test(`PO30-AGENTE-FOTO ${larghezza}x${altezza} ${tema}`, async ({ page }) => {
      await scena(page, { larghezza, altezza, tema });
      await apri(page);
      await expect(dettaglio(page)).toBeVisible();
      await page.waitForTimeout(300);
      mkdirSync(FOTO, { recursive: true });
      await page.screenshot({ path: join(FOTO, `panoramica-${larghezza}x${altezza}-${tema}.png`) });
      await dettaglio(page).locator('[data-sezione="eventi"]').click();
      await page.screenshot({ path: join(FOTO, `eventi-${larghezza}x${altezza}-${tema}.png`) });
      const sfonda = await page.evaluate(() => { const p = document.querySelector('[data-c="DettaglioAgente"]'); const c = p.closest('.talos-inspector'); return { largo: p.scrollWidth > p.clientWidth + 1, alto: Math.round(p.getBoundingClientRect().bottom) > Math.round(c.getBoundingClientRect().bottom) + 1 }; });
      expect(sfonda, 'il dettaglio non sfonda la colonna, né in larghezza né in altezza').toEqual({ largo: false, alto: false });
    });
  }
}
