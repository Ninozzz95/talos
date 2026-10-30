/*
 * PANNELLO DI DESTRA v2 — la scheda FILE, alternativa minima (MAPPA §5): l'esploratore di oggi resta identico (le sue prove sono
 * po30-scheda-file, po30-ricerca-file, albero-senza-sfarfallio, lettore-file, po30-dettaglio-agente, NON toccate); qui le AGGIUNTE:
 * le due viste del selettore «Toccati in questa richiesta / conversazione» (scritti col giro e i +/−, letti dagli attrezzi `leggi`),
 * sotto le due di oggi, che restano le prime; il ritorno all'albero; la vista vuota detta onestamente; il conto sulla scheda.
 * Scena rigiocata dal browser con la forma degli eventi veri; ogni richiesta che non legge si ferma e si conta.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FOTO = join(import.meta.dirname, '..', '..', 'artifacts', 'pannello-file');
const ALBERO = {
  '': [{ nome: 'src', cartella: true }, { nome: 'README.md', cartella: false }],
  src: [{ nome: 'registro.mjs', cartella: false }, { nome: 'rotte.mjs', cartella: false }],
};

async function scena(page, { larghezza = 1920, altezza = 1080, tema = 'dark', conLetture = true } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); } catch { /* */ }
  }, { colorMode: tema });
  const conto = { nonGet: [], errori: [] };
  page.on('pageerror', (e) => conto.errori.push(e.message));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { conto.nonGet.push(new URL(req.url()).pathname); return route.abort(); }
    return route.fallback();
  });
  await page.route('**/api/v1/sessions/pnfi-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\ndata: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null, _sequenza: 1 })}\n\n` }));
  await page.route('**/api/v1/sessions/pnfi-*/tree?*', (r) => {
    const percorso = new URL(r.request().url()).searchParams.get('percorso') || '';
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { voci: ALBERO[percorso] ?? [] } }) });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('pnfi-uno', 'workspace', 'PNFI', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' }));
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await page.evaluate((conLetture) => {
    const r = window.__talosHarnessUiRuntime;
    const g = r.realSessionState.generation;
    let s = 10;
    const ev = (e) => r.handleRealEvent({ ...e, _sequenza: s++ }, g);
    ev({ type: 'RunStarted', input: { consegna: 'Sistema il registro' }, contesto: { cartella: 'C:\\progetti\\talos-prova' } });
    if (conLetture) {
      ev({ type: 'ToolCallStart', toolCallId: 'l1', toolCallName: 'leggi' });
      ev({ type: 'ToolCallArgs', toolCallId: 'l1', delta: JSON.stringify({ percorso: 'src/rotte.mjs' }) });
      ev({ type: 'ToolCallResult', toolCallId: 'l1', content: 'export const rotte = [];' });
    }
    ev({ type: 'StateDelta', delta: [{ op: 'replace', path: '/file/src/registro.mjs', value: 'uno\ndue\ntre\n', prima: 'uno\nvecchia\n' }] });
  }, conLetture);
  const inVista = await page.locator('#railTabs').evaluate((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="file"]').click();
  await expect(page.locator('#alberoFile .ft-node').first()).toBeVisible({ timeout: 10_000 });
  return conto;
}
async function scegliVista(page, nome) {
  await page.locator('#fileVista').click();
  await page.locator('.ft-actions-menu [role="menuitem"]', { hasText: nome }).click();
}

test('PNFI-01 — le due viste in più stanno SOTTO le due di oggi, che restano le prime e identiche', async ({ page }) => {
  await scena(page);
  await page.locator('#fileVista').click();
  const voci = await page.locator('.ft-actions-menu [role="menuitem"]').allInnerTexts();
  expect(voci.map((v) => v.trim())).toEqual(['Tutti i file', 'Modificati in questa sessione', 'Toccati in questa richiesta', 'Toccati in questa conversazione']);
  await page.keyboard.press('Escape');
});

test('PNFI-02 — «Toccati in questa conversazione»: lo scritto col giro e i +/−, il letto con chi l’ha letto; l’albero si nasconde e torna', async ({ page }) => {
  const conto = await scena(page);
  await scegliVista(page, 'Toccati in questa conversazione');
  const vista = page.locator('#fileToccati');
  await expect(vista).toBeVisible();
  await expect(page.locator('#alberoFile')).toBeHidden();
  await expect(vista.locator('[data-sezione="scritti"]')).toContainText('registro.mjs');
  await expect(vista.locator('[data-sezione="scritti"] .pn-diff')).toContainText('+');
  await expect(vista.locator('[data-sezione="letti"]')).toContainText('rotte.mjs');
  await expect(page.locator('#fileVistaNome')).toHaveText('Toccati in questa conversazione');
  await scegliVista(page, 'Tutti i file');
  await expect(page.locator('#alberoFile')).toBeVisible();
  await expect(vista).toBeHidden();
  expect(conto.nonGet).toEqual([]);
  expect(conto.errori).toEqual([]);
});

test('PNFI-03 — «Toccati in questa richiesta» con niente toccato dice la frase onesta e porta alla conversazione', async ({ page }) => {
  await scena(page);
  /* un messaggio nuovo della persona: la richiesta in corso non ha ancora toccato niente */
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'RunFinished', _sequenza: 500 }, r.realSessionState.generation);
    r.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Adesso un’altra cosa' }, _sequenza: 501 }, r.realSessionState.generation);
  });
  await scegliVista(page, 'Toccati in questa richiesta');
  const vista = page.locator('#fileToccati');
  await expect(vista.locator('.pn-vuoto')).toBeVisible();
  await vista.locator('.pn-vuoto [data-controllo="azione-vuoto"]').click();
  await expect(page.locator('#fileVistaNome')).toHaveText('Toccati in questa conversazione');
});

for (const [larghezza, altezza, tema] of [[1920, 1080, 'dark'], [1920, 1080, 'light'], [900, 600, 'dark']]) {
  test(`PNFI-FOTO ${larghezza}×${altezza} ${tema} — la vista dei toccati`, async ({ page }) => {
    await scena(page, { larghezza, altezza, tema });
    await scegliVista(page, 'Toccati in questa conversazione');
    await page.waitForTimeout(400);
    mkdirSync(FOTO, { recursive: true });
    await page.screenshot({ path: join(FOTO, `file-toccati-${tema}-${larghezza}x${altezza}.png`) });
  });
}

/* ⭐ passo 7 (MAPPA §0 #23): il numero sulla scheda File = i file toccati dalla richiesta in corso (scritti e letti), senza aprirla */
test('PNFI-04 — il conto sulla scheda File: i file toccati da questa richiesta, anche a scheda chiusa; zero = niente numero', async ({ page }) => {
  await scena(page);
  const scheda = page.locator('#railTabs [data-rail="file"]');
  await page.locator('#railTabs [data-rail="contesto"]').click();
  await expect(scheda.locator('.talos-tabs__count')).toHaveText('2'); // registro.mjs scritto + rotte.mjs letto
  await expect(scheda).toHaveAttribute('aria-description', /2/u);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'RunFinished', _sequenza: 600 }, r.realSessionState.generation);
    r.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Altro' }, _sequenza: 601 }, r.realSessionState.generation);
  });
  await expect(scheda.locator('.talos-tabs__count'), 'la richiesta nuova non ha toccato niente').toHaveCount(0);
});

/*
 * ⭐ Owner 29/10/2026 sera: il punto (b) del kit, ADESSO, sui segni di oggi dell'albero (le loro parole restano):
 *   · il giro nel suggerimento della lettera A/M; · il robot col tono d'attenzione quando due hanno scritto lo stesso file;
 *   · sulla cartella CHIUSA il numero dei file toccati dentro (sparisce aperta, lo dicono le righe).
 */
test('PNFI-05 — l’albero di oggi dice il giro sulla lettera, il conto sulla cartella chiusa, e la collisione sul robot', async ({ page }) => {
  await page.route('**/api/v1/sessions/pnfi-uno/children', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { figli: [
    { sessionId: 'pnfi-figlia', task: 'Compito: riscrivi il registro', taskCorto: 'riscrivi il registro', conclusa: false, interrotta: false, collisioni: [], attivita: { file: [{ percorso: 'src/registro.mjs', letto: true, scritto: true, creato: false }], fileTagliati: 0, attrezzoCorrente: null, chiamate: 2 } },
  ] } }) }));
  await page.route('**/api/v1/sessions/pnfi-figlia/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await scena(page);
  const cartella = page.locator('#alberoFile .ft-row-folder', { hasText: 'src' });
  await expect(cartella.locator('.pn-segno-albero--conto'), 'sulla cartella chiusa: due toccati dentro (uno scritto, uno letto)').toHaveText('2');
  await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'delega_sottotask', _sequenza: 9200 }, r.realSessionState.generation); r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'd1', content: 'ok', _sequenza: 9201 }, r.realSessionState.generation); });
  await cartella.click();
  await expect(cartella.locator('.pn-segno-albero--conto'), 'aperta, il conto non si vede').toBeHidden();
  const riga = page.locator('#alberoFile .ft-row', { hasText: 'registro.mjs' });
  await expect(riga.locator('.talos-file-row__state')).toHaveAttribute('title', /giro 1/u);
  const robot = riga.locator('.talos-file-row__agente');
  await expect(robot, 'premessa: l’agente sta scrivendo lo stesso file').toBeVisible({ timeout: 10_000 });
  await expect(robot).toHaveClass(/pn-agente-collisione/);
  await expect(robot).toHaveAttribute('aria-label', /Lo sta modificando: «riscrivi il registro».*Scritto anche da/u);
  /* al contrario: un file solo letto dall'agente e mai scritto da due non prende il tono */
  await expect(page.locator('#alberoFile .ft-row', { hasText: 'rotte.mjs' }).locator('.pn-agente-collisione')).toHaveCount(0);
});
