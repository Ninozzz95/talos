import { test, expect } from '@playwright/test';

/*
 * Difetto (2) delle foto di Ask e del Piano (24/09): nell'Indice dei giri il giro interrotto dal riavvio del server restava
 * «in corso…» anche dopo che la ripresa era finita. Nel journal un giro interrotto non ha un evento terminale — il processo
 * che lo eseguiva non esiste più — e le sue chiamate restano senza esito; la ripresa è un giro NUOVO (`RunStarted`).
 * Hermes, `rewind.ts:422-445`: la chiamata rimasta senza esito si dice «interrotta» — né riuscita, né «in corso».
 * Due scene: giro interrotto con DUE chiamate (ha il suo segmento) e con UNA sola (riga nuda, senza segmento).
 * Rigiocate dal server finto (porta 4176): ogni richiesta non-GET si ferma e si conta.
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const RIPRESA = [
  { type: 'RunStarted', threadId: 't', runId: 'r2', input: { consegna: 'continua', seguito: true } },
  { type: 'ToolCallStart', toolCallId: 'b1', toolCallName: 'cerca' },
  { type: 'ToolCallArgs', toolCallId: 'b1', delta: '{"testo":"describe"}' },
  { type: 'ToolCallResult', toolCallId: 'b1', content: 'tests/a.test.mjs:3 describe(' },
  { type: 'TextMessageStart', messageId: 'm2', role: 'assistant' },
  { type: 'TextMessageContent', messageId: 'm2', delta: 'Ripresa finita: il file ha un describe.' },
  { type: 'TextMessageEnd', messageId: 'm2' },
  { type: 'RunFinished', threadId: 't', runId: 'r2' },
];
const LETTURA_SENZA_ESITO = [
  { type: 'ToolCallStart', toolCallId: 'a1', toolCallName: 'leggi' },
  { type: 'ToolCallArgs', toolCallId: 'a1', delta: '{"percorso":"tests/a.test.mjs"}' },
  // ⛔ qui il server si è riavviato: nessun esito, nessun RunFinished
];
const numera = (eventi) => eventi.map((e, i) => ({ ...e, _sequenza: i + 1 }));
const SCENE = {
  'giro-interrotto-due': numera([
    { type: 'RunStarted', threadId: 't', runId: 'r1', input: { consegna: 'Leggi il file dei test' } },
    { type: 'ToolCallStart', toolCallId: 'a0', toolCallName: 'elenca' },
    { type: 'ToolCallArgs', toolCallId: 'a0', delta: '{"percorso":"tests"}' },
    { type: 'ToolCallResult', toolCallId: 'a0', content: 'a.test.mjs  1,2 KB' },
    ...LETTURA_SENZA_ESITO, ...RIPRESA,
  ]),
  'giro-interrotto-uno': numera([{ type: 'RunStarted', threadId: 't', runId: 'r1', input: { consegna: 'Leggi il file dei test' } }, ...LETTURA_SENZA_ESITO, ...RIPRESA]),
};

async function apri(page, sessione) {
  const contatore = { nonGet: 0 };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } }));
  });
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    const nome = Object.keys(SCENE).find((s) => new URL(req.url()).pathname.endsWith(`/sessions/${s}/events`));
    if (nome) return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...SCENE[nome], CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Giro interrotto', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), sessione);
  await expect(page.locator('#conversation')).toContainText('Ripresa finita', { timeout: 10_000 });
  // VELO-SPEC-2 (08/10/2026, bugfixer): `toContainText` legge anche una chat sotto il velo (`visibility:hidden`): la foto aspetta che si tolga
  await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'));
  await page.locator('#railTabs [data-rail="contesto"]').click();
  return contatore;
}

const indice = (page) => page.locator('#railContesto [data-c="TurnIndex"]');
const righe = (page, stato) => page.locator(`#conversation [data-c="ToolRow"][data-tool-state="${stato}"]`);

test('TURN-INDEX-INTERRUPTED-02 — a ripresa finita, nell\'Indice dei giri niente resta «in corso» (giro con segmento)', async ({ page }) => {
  const c = await apri(page, 'giro-interrotto-due');
  await expect(indice(page)).toContainText('2 · 1 cartella elencata, 1 attivi');
  await expect(indice(page), 'la ripresa ha il SUO gruppo, non quello del giro interrotto').toContainText('4 · 1 ricerca');
  await expect(indice(page), 'nessun giro «in corso» dopo la fine della ripresa').not.toContainText(/in corso|lettura di/u);
  const interrotta = righe(page, 'interrupted');
  await expect(interrotta).toHaveCount(1);
  /* dentro il segmento la riga la scrive il segmento: l'azione al presente (si è fermata), «interrotta» accanto, mai «Letto» */
  await expect(interrotta).toContainText(/Legge/u);
  await expect(interrotta).toContainText(/interrotta/u);
  await expect(interrotta).not.toContainText(/Letto|…/u);
  /* il segmento del giro interrotto lo dice anche lui, e non lo conta fra le riuscite */
  await expect(page.locator('#conversation .talos-activity--segment .talos-activity__descrizione').first()).toHaveText(/1 attività interrotta/u);
  /* e la riga dell'attrezzo solo della ripresa parla con le specie (D1): «1 ricerca», non «1 ricerca completata» */
  await expect(page.locator('#conversation [data-c="ToolRow"][data-tool-state="complete"] .tool-note-summary-text').last()).toHaveText('1 ricerca');
  await expect(righe(page, 'running')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/giro-interrotto-indice-1440-dark.png' });
  expect(c.nonGet).toBe(0);
});

test('TURN-INDEX-INTERRUPTED-02b — giro interrotto con UNA chiamata: la riga nuda dice «interrotta», non «…»', async ({ page }) => {
  const c = await apri(page, 'giro-interrotto-uno');
  await expect(indice(page)).toContainText('2 · 1 attività interrotta');
  await expect(indice(page)).not.toContainText(/in corso|lettura di/u);
  const interrotta = righe(page, 'interrupted');
  await expect(interrotta).toHaveCount(1);
  await expect(interrotta.locator('.tool-note-summary-text')).toHaveText(/ · interrotta$/u);
  await expect(righe(page, 'running')).toHaveCount(0);
  expect(c.nonGet).toBe(0);
});
