/*
 * ⛔ Lotto del diagramma delle deleghe (09/10/2026, bugfixer). Difetti visti dal collega nella foto 07 e riprodotti sulla 4176
 *   (server vero, fornitore finto, copione DELEGA), lì ancora presenti su r4 686a19f61:
 *   - 2: la scheda principale tagliata in alto. La vista di lettura la ancora a y = 16, poi la tela si accorcia (compare il
 *     pannello sotto) e l'osservatore teneva il centro come dopo un gesto della persona ⇒ y = −30 (misurato);
 *   - 3: la scheda principale diceva «Nessuna attività registrata» accanto a «1 chiamata»: i suoi passi erano sempre `[]`;
 *   - «1 nodi visibili»: un plurale per numero.
 * Si misura ciò che si VEDE, dalla stessa scena di po30 (le figlie dalla rotta `children`, gli eventi dal runtime).
 */
import { expect, test } from '@playwright/test';

const FIGLIA = { sessionId: 'dgv-figlia', task: 'Compito: controlla i test', taskCorto: 'controlla i test', conclusa: true, interrotta: false,
  avviataAlle: new Date(Date.now() - 50 * 60_000).toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'read-only', collisioni: [],
  esitoDelega: 'concluso', riassuntoDelega: 'I test passano tutti.',
  attivita: { file: [], fileTagliati: 0, attrezzoCorrente: null, chiamate: 1, passi: [{ tipo: 'fine', attrezzo: null, percorso: null, quando: null }], passiTagliati: 0 } };
const AVVIATO = Date.parse('2026-10-09T13:51:00.000Z');
const ZOOM_PIU = 'Aumenta zoom';

async function scena(page, { altezza = 1080, figlie = [FIGLIA], avviatoA = AVVIATO } = {}) {
  await page.setViewportSize({ width: 1920, height: altezza });
  await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'light', uiLanguage: 'it' } })); } catch { /* */ } });
  await page.route('**/api/v1/sessions/dgv-*/events*', () => { /* aperto e muto, come po30 */ });
  await page.route('**/api/v1/sessions/dgv-radice/children', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { figli: figlie } }) }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((avviatoA) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('dgv-radice', 'workspace', 'DGV', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g);
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9301, input: { consegna: 'Dividi il lavoro' }, contesto: { cartella: 'C:\\progetti\\talos-prova', modello: 'glm-5.3-flash' } }, g);
    r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'delega_sottotask', _sequenza: 9302, ...(avviatoA ? { avviatoA } : {}) }, g);
    r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'd1', content: 'ok', _sequenza: 9303 }, g);
    r.handleRealEvent({ type: 'RunFinished', _sequenza: 9304 }, g);
  }, avviatoA);
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await page.locator('#railAgenti').getByRole('button', { name: 'Apri visuale diagramma' }).click();
  const grafo = page.locator('[data-c="GrafoAgenti"]');
  await expect(grafo.locator('[data-nodo-id="dgv-radice"]'), 'la premessa: il diagramma mostra la sessione principale').toBeVisible();
  return grafo;
}
const dentroLaTela = (grafo) => grafo.evaluate((g) => {
  const tela = g.querySelector('.talos-grafo__canvas').getBoundingClientRect();
  const nodo = g.querySelector('[data-nodo-id="dgv-radice"]').getBoundingClientRect();
  return { sopra: Math.round(nodo.top - tela.top), sotto: Math.round(tela.bottom - nodo.bottom) };
});

test('DIAGRAMMA-VISTA-02 — la scheda principale resta intera nella tela, anche quando la tela si accorcia dopo l\u2019apertura', async ({ page }) => {
  const grafo = await scena(page);
  await page.waitForTimeout(400); // la tela si assesta (pannello sotto, misura dei bottoni)
  const prima = await dentroLaTela(grafo);
  expect(prima.sopra, `scheda ${JSON.stringify(prima)}`).toBeGreaterThanOrEqual(0);
  // la tela si accorcia di 150 px a vista NON toccata dalla persona: la lettura si rifà, non si tiene il centro
  await page.setViewportSize({ width: 1920, height: 930 });
  await page.waitForTimeout(400);
  const dopo = await dentroLaTela(grafo);
  expect(dopo.sopra, `scheda dopo il ridimensionamento ${JSON.stringify(dopo)}`).toBeGreaterThanOrEqual(0);
  // AL CONTRARIO: dopo un gesto della persona (il «+» dello zoom) il ridimensionamento non rifà la lettura: lo zoom scelto resta
  await grafo.getByRole('button', { name: ZOOM_PIU }).click();
  await page.waitForTimeout(400);
  const zoomato = await grafo.evaluate((g) => g.querySelector('.talos-grafo__mondo')?.style.transform ?? g.querySelector('[style*="scale("]')?.style.transform);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(400);
  const dopoGesto = await grafo.evaluate((g) => g.querySelector('.talos-grafo__mondo')?.style.transform ?? g.querySelector('[style*="scale("]')?.style.transform);
  expect(dopoGesto.match(/scale\(([^)]+)\)/u)?.[1], 'lo zoom della persona resta').toBe(zoomato.match(/scale\(([^)]+)\)/u)?.[1]);
});

test('DIAGRAMMA-VISTA-02b — Invio nella minimappa è un gesto della persona: dopo un ridimensionamento la vista resta centrata su tutto', async ({ page }) => {
  // review del desktop (09/10/2026): il ramo Invio/Spazio della minimappa non spegneva `vistaInLettura`, e il primo
  // ridimensionamento rifaceva la lettura sopra la scelta della persona. La minimappa si nasconde quando il disegno entra
  // nella tela: il tasto si consegna all'elemento com'è, che è lo stesso ascoltatore.
  const grafo = await scena(page);
  await page.waitForTimeout(400);
  const scostamento = () => grafo.evaluate((g) => {
    const tela = g.querySelector('.talos-grafo__canvas').getBoundingClientRect();
    const nodo = g.querySelector('[data-nodo-id="dgv-radice"]').getBoundingClientRect();
    return Math.round((nodo.top + nodo.height / 2) - (tela.top + tela.height / 2));
  });
  await grafo.evaluate((g) => g.querySelector('.talos-grafo__mini').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  await page.waitForTimeout(400);
  const centrato = await scostamento();
  await page.setViewportSize({ width: 1920, height: 930 });
  await page.waitForTimeout(400);
  const dopo = await scostamento();
  expect(Math.abs(dopo - centrato), `scostamento dal centro: dopo Invio ${centrato} px, dopo il ridimensionamento ${dopo} px`).toBeLessThanOrEqual(2);
});

test('DIAGRAMMA-VISTA-03 — la scheda principale dice l\u2019ultima attività dall\u2019orologio del server, mai «Nessuna attività registrata» con chiamate fatte', async ({ page }) => {
  const grafo = await scena(page);
  const operazione = grafo.locator('[data-nodo-id="dgv-radice"]');
  const ora = new Date(AVVIATO).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  await expect(operazione).toContainText(`Ultima attività alle ${ora}`);
  await expect(operazione).not.toContainText('Nessuna attività registrata');
});

test('DIAGRAMMA-VISTA-03b — AL CONTRARIO: senza un orario del server la scheda non ne inventa uno', async ({ page }) => {
  const grafo = await scena(page, { avviatoA: null });
  await expect(grafo.locator('[data-nodo-id="dgv-radice"]')).toContainText('Nessuna attività registrata');
});

test('DIAGRAMMA-VISTA-PLURALI — «1 nodo visibile», «2 nodi visibili · 1 collegamento registrato»', async ({ page }) => {
  const grafo = await scena(page);
  await expect(grafo).toContainText('2 nodi visibili · 1 collegamento registrato');
  await expect(grafo).not.toContainText('1 collegamenti');
});
