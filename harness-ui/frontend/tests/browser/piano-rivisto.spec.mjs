import { expect, test } from '@playwright/test';
import { chiudiToastAperti } from './aiuto-toast.mjs';

/*
 * ⛔⛔ Owner 27/10/2026, «gravissima»: «quando un piano viene modificato, mi porta al piano originale in cima alla conversazione… è
 *   impensabile». Decisione «In fondo, il vecchio si chiude» (bozzetto B approvato, handoff mockup-server-locali-e-piano-2026-10-27):
 *   la revisione nuova nasce dove la persona sta leggendo, con «Cosa è cambiato»; la vecchia diventa una riga sola, al suo posto,
 *   riapribile. Uguale dal vivo e in rigiocata. Logica in `components/piano-rivisto.js`, cablaggio in `app.js` (`talos.plan`).
 */
const PIANO_1 = '1. Leggo `src/rotte/utenti.mjs` e le sue prove.\n2. Aggiungo una cache in memoria alle rotte degli utenti.\n3. Migro il database alla versione 4.';
const PIANO_2 = '1. Leggo `src/rotte/utenti.mjs` e le sue prove.\n2. Aggiungo una cache in memoria alle rotte degli utenti.\n3. Aggiungo i test della cache: scadenza e invalidazione.\n4. Lancio la suite e ti mostro i numeri.';
const fatto = (sid, revision, content, extra = {}) => ({
  schema: 'talos.plan.v1', planId: 'piano-cache', sessionId: sid, revision, status: 'proposed', content,
  model: 'z-ai/glm-5.3-flash', at: `2026-10-27T14:0${revision}:00.000Z`,
  requestId: `req-${revision}`, hash: 'sha256:' + String(revision).repeat(64), ...extra,
});
const giri = (sid) => [
  { type: 'RunStarted', _sequenza: 9601, input: { consegna: 'Pianifica la cache delle rotte' }, contesto: { modalitaOperativa: 'piano', pianoConAttrezzo: true } },
  { type: 'TextMessageContent', messageId: 'pr-1', delta: 'Ecco il piano.', _sequenza: 9602 },
  { type: 'CUSTOM', name: 'talos.plan', _sequenza: 9603, value: fatto(sid, 1, PIANO_1) },
  { type: 'RunFinished', _sequenza: 9604, result: { detto: 'Ecco il piano.' } },
  { type: 'RunStarted', _sequenza: 9605, input: { consegna: 'Niente migrazione: aggiungi i test della cache' }, contesto: { modalitaOperativa: 'piano', pianoConAttrezzo: true } },
  { type: 'TextMessageContent', messageId: 'pr-2', delta: Array.from({ length: 12 }, (_, i) => `Riga ${i + 1} della spiegazione, abbastanza lunga da occupare spazio.`).join('\n\n'), _sequenza: 9606 },
  { type: 'CUSTOM', name: 'talos.plan', _sequenza: 9607, value: fatto(sid, 2, PIANO_2) },
  { type: 'RunFinished', _sequenza: 9608, result: { detto: 'Piano aggiornato.' } },
];

async function apri(page, sid, storia = []) {
  const erroriPagina = [];
  page.on('pageerror', (e) => erroriPagina.push(String(e?.message || e)));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'light', uiLanguage: 'it' } }));
  });
  const fine = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
  const corpo = [...storia, fine].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  await page.route(`**/api/v1/sessions/${sid}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${corpo}` }));
  await page.route(`**/api/v1/sessions/${sid}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route(`**/api/v1/sessions/${sid}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((sid) => window.__talosHarnessUiRuntime.passaASessione(sid, 'workspace', 'Cache delle rotte', 'z-ai/glm-5.3-flash', { conclusa: false }), sid);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  return erroriPagina;
}
const dalVivo = (page, eventi) => page.evaluate((eventi) => {
  const runtime = window.__talosHarnessUiRuntime;
  const generation = runtime.realSessionState.generation;
  for (const evento of eventi) runtime.handleRealEvent(evento, generation);
}, eventi);

async function controllaForma(page) {
  const corrente = page.locator('#conversation [data-c="PlanArtifact"]:not([data-sostituito])');
  await expect(corrente).toHaveCount(1);
  await expect(corrente).toHaveAttribute('data-revision', '2');
  const riga = page.locator('#conversation .talos-piano-sostituito');
  await expect(riga).toHaveCount(1);
  await expect(riga).toContainText('Piano · revisione 1');
  await expect(riga).toContainText('sostituito dalla revisione 2, più in basso');
  await expect(riga.locator('[data-c="PlanArtifact"]'), 'la scheda vecchia resta nella riga, chiusa').toBeHidden();
  /* la riga sta al posto del piano vecchio, la revisione nuova DOPO di lei (in fondo, dove si legge) */
  const dopo = await page.evaluate(() => {
    const riga = document.querySelector('#conversation .talos-piano-sostituito');
    const nuova = document.querySelector('#conversation [data-c="PlanArtifact"]:not([data-sostituito])');
    return Boolean(riga.compareDocumentPosition(nuova) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(dopo, 'la revisione nuova deve venire DOPO la riga della vecchia').toBe(true);
  await expect(corrente.locator('.talos-piano-cambiato')).toContainText('Rispetto alla revisione 1: 2 passi aggiunti, 1 tolto');
  await expect(corrente.locator('.talos-piano-diff-add')).toHaveCount(2);
  await expect(corrente.locator('.talos-piano-diff-add').first()).toContainText('Aggiungo i test della cache');
  await expect(corrente.locator('.talos-piano-diff-del')).toHaveCount(1);
  await expect(corrente.locator('.talos-piano-diff-del')).toContainText('Migro il database alla versione 4.');
  await expect(page.locator('#avvisoPiano')).toBeHidden();
  return { corrente, riga };
}

test('PIANO-RIVISTO-01 dal vivo: la revisione 2 nasce in fondo con «Cosa è cambiato», la 1 si chiude in una riga, niente salti', async ({ page }) => {
  const sid = 'piano-rivisto-vivo';
  const errori = await apri(page, sid);
  await dalVivo(page, giri(sid));
  await chiudiToastAperti(page);
  const { corrente, riga } = await controllaForma(page);
  /* nessun salto: lo scorrimento resta in fondo e la revisione nuova è nella parte visibile (le sue scelte in vista), senza clic.
     Il piano a metà giro (con l'attrezzo) può lasciare la testata appena sopra il bordo: quello che si decide sono le scelte. */
  await expect.poll(() => page.evaluate(() => {
    const card = document.querySelector('#conversation [data-c="PlanArtifact"]:not([data-sostituito])');
    const scelte = card.querySelector('.talos-plan-artifact__choices').getBoundingClientRect();
    let vista = null;
    for (let n = card.parentElement; n; n = n.parentElement) {
      const st = getComputedStyle(n);
      if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight) { vista = n; break; }
    }
    if (!vista) return 'nessuno scorrimento';
    const r = vista.getBoundingClientRect();
    const inFondo = vista.scrollTop + vista.clientHeight >= vista.scrollHeight - 2;
    return inFondo && scelte.top >= r.top - 1 && scelte.bottom <= r.bottom + 1 ? 'ok' : JSON.stringify({ inFondo, scelte: [scelte.top, scelte.bottom], vista: [r.top, r.bottom] });
  }), { timeout: 5_000 }).toBe('ok');
  /* le scelte stanno solo sulla revisione corrente */
  await expect(corrente.locator('.talos-plan-artifact__choices')).toBeVisible();
  await expect(corrente).toHaveAttribute('data-approvabile', '');
  /* «Nascondi le differenze»: il piano pulito, le tolte spariscono */
  await corrente.getByRole('button', { name: 'Nascondi le differenze' }).click();
  await expect(corrente.locator('.talos-piano-diff-del')).toBeHidden();
  await expect(corrente.getByRole('button', { name: 'Mostra le differenze' })).toHaveAttribute('aria-pressed', 'false');
  /* «Rileggi» apre la revisione vecchia nella sua riga, senza scelte; «Chiudi» la richiude */
  const rileggi = riga.getByRole('button', { name: 'Rileggi' });
  await expect(rileggi).toHaveAttribute('aria-expanded', 'false');
  await rileggi.click();
  const vecchia = riga.locator('[data-c="PlanArtifact"]');
  await expect(vecchia).toBeVisible();
  await expect(vecchia).toContainText('Migro il database alla versione 4.');
  await expect(vecchia.locator('.talos-plan-artifact__choices')).toBeHidden();
  await expect(vecchia).not.toHaveAttribute('data-approvabile', '');
  /* trovato nella foto: la pillola diceva ancora «Aspetta la tua scelta · rev. 1» */
  await expect(vecchia.locator('.talos-plan-artifact__state')).toHaveText('Sostituito dalla rev. 2');
  const chiudi = riga.getByRole('button', { name: 'Chiudi' });
  await expect(chiudi).toHaveAttribute('aria-expanded', 'true');
  await chiudi.click();
  await expect(vecchia).toBeHidden();
  expect(errori).toEqual([]);
});

test('PIANO-RIVISTO-02 in rigiocata la storia si legge uguale: riga al posto della 1, la 2 dopo con le differenze', async ({ page }) => {
  const sid = 'piano-rivisto-storia';
  const errori = await apri(page, sid, giri(sid));
  await chiudiToastAperti(page);
  await controllaForma(page);
  expect(errori).toEqual([]);
});

test('PIANO-RIVISTO-03 la scelta arriva sulla SUA revisione: la 2 approvata sulla corrente, la chiusura della 1 nella riga vecchia', async ({ page }) => {
  const sid = 'piano-rivisto-scelte';
  const errori = await apri(page, sid);
  const { content: _a, ...chiusa1 } = fatto(sid, 1, null, { status: 'cancelled', da: 'sistema', motivo: 'nuovo-messaggio' });
  const { content: _b, ...approvata2 } = fatto(sid, 2, null, { status: 'approved', decisione: 'procedi-con-conferma' });
  await dalVivo(page, [
    ...giri(sid),
    { type: 'CUSTOM', name: 'talos.plan', _sequenza: 9609, value: chiusa1 },
    { type: 'CUSTOM', name: 'talos.plan', _sequenza: 9610, value: approvata2 },
  ]);
  await chiudiToastAperti(page);
  const corrente = page.locator('#conversation [data-c="PlanArtifact"]:not([data-sostituito])');
  await expect(corrente).toHaveAttribute('data-revision', '2');
  await expect(corrente).not.toHaveAttribute('data-approvabile', '');
  const riga = page.locator('#conversation .talos-piano-sostituito');
  await riga.getByRole('button', { name: 'Rileggi' }).click();
  const vecchia = riga.locator('[data-c="PlanArtifact"]');
  await expect(vecchia).toHaveAttribute('data-revision', '1');
  /* ogni ricevuta sulla sua revisione: prima la chiusura della 1 cadeva nel nulla (si cercava la prima scheda del piano) */
  await expect(vecchia.locator('.talos-plan-artifact__heading')).toContainText('Piano chiuso');
  await expect(corrente.locator('.talos-plan-artifact__heading')).toContainText('Piano approvato');
  expect(errori).toEqual([]);
});

test('PIANO-RIVISTO-04 AL CONTRARIO: un piano solo non ha riga né differenze; la stessa revisione ripetuta non ne crea una seconda', async ({ page }) => {
  const sid = 'piano-rivisto-uno';
  const errori = await apri(page, sid);
  const [a, b, c, d] = giri(sid);
  await dalVivo(page, [a, b, c, d, { ...c, _sequenza: 9699 }]);
  await expect(page.locator('#conversation [data-c="PlanArtifact"]')).toHaveCount(1);
  await expect(page.locator('#conversation .talos-piano-sostituito')).toHaveCount(0);
  await expect(page.locator('#conversation .talos-piano-cambiato')).toHaveCount(0);
  expect(errori).toEqual([]);
});
