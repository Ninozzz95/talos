import { expect, test } from '@playwright/test';
const FRASE = 'riassumi questo';

import { CONFINE, attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';
/* Revisione avversaria del Blocco 20: primo messaggio, carta al ritorno in una chat, riga in un giro a più testi. Banco copiato da rami-riprova-modifica.spec.mjs. File temporaneo col prefisso _rev20-. */
function giro(runId, consegna, seq, { seguito = seq > 1, immagini } = {}) {
  return [
    { type: 'RunStarted', runId, _sequenza: seq, input: { consegna, seguito, ...(immagini ? { immagini } : {}) }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' } },
    { type: 'TextMessageStart', messageId: `m-${runId}`, _sequenza: seq + 1 },
    { type: 'TextMessageContent', messageId: `m-${runId}`, delta: `Risposta a «${consegna}».`, _sequenza: seq + 2 },
    { type: 'TextMessageEnd', messageId: `m-${runId}`, _sequenza: seq + 3 },
    { type: 'RunFinished', runId, _sequenza: seq + 4 },
  ];
}
const flusso = (eventi) => (route) => route.fulfill({
  status: 200, contentType: 'text/event-stream',
  body: `retry: 3600000\n${[...eventi, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`,
});
const ok = (route, data) => route.fulfill({ status: 200, contentType: 'application/json', json: { ok: true, data } });

const MOD = 'qwen/qwen3.8-flash';
const rigaDi = (id, extra = {}) => ({ sessionId: id, taskId: id, nome: id, conclusa: true, modello: MOD, ...extra });
async function bancoLibero(page, sessioni, { fork = null, stop = null, tema = 'dark' } = {}) {
  const viste = { fork: [], resume: [], stop: [], altri: [] };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); } catch { /* privata */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET' && r.method() !== 'HEAD') { viste.altri.push(`${r.method()} ${new URL(r.url()).pathname}`); return route.fulfill({ status: 404, contentType: 'application/json', json: { ok: false, error: { code: 'NOT_FOUND', message: 'non finto' } } }); }
    return route.fallback();
  });
  await page.route('**/api/v1/sessions', (route) => (route.request().method() === 'GET'
    ? ok(route, { items: Object.values(sessioni).filter((s) => !s.eliminata).map((s) => s.riga) }) : route.fallback()));
  for (const [id, s] of Object.entries(sessioni)) {
    await page.route(`**/api/v1/sessions/${id}/events*`, (route) => flusso(s.eliminata ? [] : s.eventi)(route));
    await page.route(`**/api/v1/sessions/${id}/export`, (route) => (s.eliminata
      ? route.fulfill({ status: 404, contentType: 'application/json', json: { ok: false, error: { code: 'NOT_FOUND', message: 'Session not found' } } })
      : ok(route, { sessionId: id, eventi: s.eventi })));
    await page.route(`**/api/v1/sessions/${id}/fork`, async (route) => {
      const corpo = route.request().postDataJSON(); viste.fork.push([id, corpo]);
      if (fork) return fork(route, id, corpo);
      const tagliato = s.eventi.find((e) => e.type === 'RunStarted' && e.runId === corpo.primaDelGiro);
      return ok(route, { sessionId: 'nuovo', forkDa: id, forkPrimaDelGiro: corpo.primaDelGiro, taglio: { primaDelGiro: corpo.primaDelGiro, messaggio: tagliato?.input?.consegna ?? '' } });
    });
  }
  /* K3b: prima del resume la finestra allinea la lingua della sessione — una scrittura del banco, finta come le altre */
  await page.route('**/api/v1/sessions/*/settings', (route) => (route.request().method() === 'GET' ? route.fallback() : ok(route, {})));
  await page.route('**/api/v1/sessions/nuovo/events*', flusso([]));
  await page.route('**/api/v1/sessions/nuovo/export', (route) => ok(route, { sessionId: 'nuovo', eventi: [] }));
  await page.route('**/api/v1/sessions/*/resume', (route) => { viste.resume.push(route.request().postDataJSON()); return ok(route, { sessionId: 'nuovo' }); });
  await page.route('**/api/v1/sessions/*/stop', async (route) => {
    viste.stop.push(new URL(route.request().url()).pathname);
    if (stop) return stop(route);
    await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'RunFinished', runId: 'vivo' }, r.realSessionState.generation); });
    return ok(route, { fermata: true });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali?.());
  return viste;
}
const DUE_GIRI = () => [...giro('r1', 'domanda 1', 1), ...giro('r2', 'domanda 2', 10)];
const numeri = (page) => page.locator('#conversation .talos-rami-versioni__numero').allTextContents();
const idCorrente = (page) => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id);
const giroVivo = (page) => page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'RunStarted', runId: 'vivo', _sequenza: 500, input: { consegna: 'lavoro lungo', seguito: true } }, r.realSessionState.generation); });
/* il messaggio con un FILE, nella forma vera di `testoConAllegati` (frase, intestazione, riga «- nome (percorso)», blocco «--- … ---») */
const CONSEGNA_FILE = `${FRASE}\n\nAttachments of this message:\n- note.txt (C:/progetti/AVM/note.txt)\n\n--- note.txt (C:/progetti/AVM/note.txt) ---\ncontenuto segreto del file`;
const BOLLA_FILE = { testo: FRASE, allegati: [{ tipo: 'file', nome: 'note.txt', percorso: 'C:/progetti/AVM/note.txt', caratteri: 26 }] };
function giroConBolla(runId, consegna, seq, bolla) {
  const [inizio, ...resto] = giro(runId, consegna, seq);
  return [{ ...inizio, input: { ...inizio.input, bolla } }, ...resto];
}


async function apri(page, id) {
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, s, 'Rami', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' }), id);
  await attendiFineStoria(page);
}
const domande = (page) => page.locator('#conversation .talos-message--user');
const risposte = (page) => page.locator('#conversation .talos-message:not(.talos-message--user):has(.assistant-copy)');
const rifiuto = (runId, consegna, seq) => [
  { type: 'RunStarted', runId, _sequenza: seq, input: { consegna, seguito: seq > 1, origine: 'persona' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: MOD } },
  { type: 'RunError', runId, _sequenza: seq + 1, code: 'PROVIDER_EMPTY_RESPONSE', message: 'The model refused to answer this conversation.' },
];
const carta = (page) => page.locator('[data-c="SystemNote"][data-tone="warning"]');

test('REV20-P1 Riprova sul PRIMO messaggio con un file: frase + chip, il modello riceve il file', async ({ page }) => {
  const viste = await bancoLibero(page, { A: { riga: rigaDi('A'), eventi: giroConBolla('r1', CONSEGNA_FILE, 1, BOLLA_FILE) } });
  await apri(page, 'A');
  await risposte(page).first().click({ button: 'right' });
  await page.locator('#menuRispostaMessaggio [role="menuitem"]').first().click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.resume[0].messaggio).toBe(CONSEGNA_FILE);
  expect(viste.resume[0].bolla?.testo).toBe(FRASE);
  await expect(page.locator('#conversation')).not.toContainText('contenuto segreto del file');
});

test('REV20-P2 Modifica e rimanda sul PRIMO messaggio con un file: il chip c e il file riparte', async ({ page }) => {
  const viste = await bancoLibero(page, { A: { riga: rigaDi('A'), eventi: giroConBolla('r1', CONSEGNA_FILE, 1, BOLLA_FILE) } });
  await apri(page, 'A');
  const prima = domande(page).first();
  await prima.hover();
  await prima.locator('[data-message-action="modifica"]').click();
  /* D21 del Tester e bolla allegati «B» (owner 02/11): la scheda ha glifo dell'estensione, nome e riga sotto; il nome è il suo pezzo */
  await expect(prima.locator('.talos-rami-modifica__file .talos-scheda-file__nome')).toHaveText(['note.txt']);
  await prima.locator('textarea').fill('riassumi in tre righe');
  await prima.getByRole('button', { name: 'Invia' }).click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.resume[0].messaggio).toBe(CONSEGNA_FILE.replace(FRASE, 'riassumi in tre righe'));
});

test('REV20-P3 AL CONTRARIO: primo messaggio senza allegati: Riprova come prima, nessuna bolla', async ({ page }) => {
  const viste = await bancoLibero(page, { A: { riga: rigaDi('A'), eventi: giro('r1', 'domanda 1', 1) } });
  await apri(page, 'A');
  await risposte(page).first().click({ button: 'right' });
  await page.locator('#menuRispostaMessaggio [role="menuitem"]').first().click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.resume[0]).toEqual({ messaggio: 'domanda 1', paginaBrowser: null }); // 4e0dae315 (decisione 201, 04/11): /resume manda sempre paginaBrowser, null senza pagina
});

test('REV20-P4 AL CONTRARIO: primo messaggio senza allegati: Modifica manda solo il testo nuovo', async ({ page }) => {
  const viste = await bancoLibero(page, { A: { riga: rigaDi('A'), eventi: giro('r1', 'domanda 1', 1) } });
  await apri(page, 'A');
  const prima = domande(page).first();
  await prima.hover();
  await prima.locator('[data-message-action="modifica"]').click();
  await prima.locator('textarea').fill('domanda riscritta');
  await prima.getByRole('button', { name: 'Invia' }).click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.resume[0]).toEqual({ messaggio: 'domanda riscritta', paginaBrowser: null }); // 4e0dae315 (decisione 201, 04/11)
});

test('REV20-P5 sessione vecchia, primo messaggio senza bolla conservata ma col blocco allegati: Riprova ricostruisce la bolla', async ({ page }) => {
  const viste = await bancoLibero(page, { A: { riga: rigaDi('A'), eventi: giro('r1', CONSEGNA_FILE, 1) } });
  await apri(page, 'A');
  await risposte(page).first().click({ button: 'right' });
  await page.locator('#menuRispostaMessaggio [role="menuitem"]').first().click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.resume[0].messaggio).toBe(CONSEGNA_FILE);
  expect(viste.resume[0].bolla?.testo).toBe(FRASE);
});

test('REV20-C1 si lascia una chat con la carta aperta e si torna: il tasto funziona ancora', async ({ page }) => {
  await bancoLibero(page, { A: { riga: rigaDi('A'), eventi: [...giro('r1', 'domanda 1', 1), ...rifiuto('r2', 'Scrivi la lettera', 10)] }, B: { riga: rigaDi('B'), eventi: giro('b1', 'altra chat', 1) } });
  await apri(page, 'A');
  await expect(carta(page).locator('[data-nota-azione="0"]')).toHaveText('Scegli un altro modello');
  await apri(page, 'B');
  await expect(carta(page)).toHaveCount(0);
  await apri(page, 'A');
  await expect(carta(page).locator('[data-nota-azione="0"]')).toHaveText('Scegli un altro modello');
  await carta(page).locator('[data-nota-azione="0"]').click();
  await expect(page.getByRole('dialog', { name: 'Modello' }), 'il tasto apre il selettore anche dopo il ritorno').toBeVisible({ timeout: 4000 });
});

test('REV20-R1 riga accorciati in un giro a due testi con uno strumento in mezzo: sta sotto l ultimo testo', async ({ page }) => {
  await bancoLibero(page, { A: { riga: rigaDi('A', { conclusa: false }), eventi: giro('r1', 'domanda 1', 1) } });
  await apri(page, 'A');
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    for (const e of [
      { type: 'RunStarted', runId: 'r2', _sequenza: 50, input: { consegna: 'seconda', seguito: true, origine: 'persona' }, contesto: { modello: 'qwen/qwen3.8-flash' } },
      { type: 'TextMessageStart', messageId: 'm1', _sequenza: 51 }, { type: 'TextMessageContent', messageId: 'm1', delta: 'Leggo i file.', _sequenza: 52 }, { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 53 },
      { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi', _sequenza: 54 }, { type: 'ToolCallEnd', toolCallId: 't1', _sequenza: 55 }, { type: 'ToolCallResult', toolCallId: 't1', content: 'x', _sequenza: 56 },
      { type: 'TextMessageStart', messageId: 'm2', _sequenza: 57 }, { type: 'TextMessageContent', messageId: 'm2', delta: 'Risposta finale.', _sequenza: 58 }, { type: 'TextMessageEnd', messageId: 'm2', _sequenza: 59 },
      { type: 'CUSTOM', name: 'talos.risultati-accorciati', value: { numero: 2, runId: 'r2' }, _sequenza: 60 },
      { type: 'RunFinished', runId: 'r2', outcome: { type: 'success' }, _sequenza: 61 },
    ]) r.handleRealEvent(e, r.realSessionState.generation);
  });
  await expect(page.locator('.talos-message__nota')).toHaveCount(1);
  const ordine = await page.evaluate(() => {
    const m = document.querySelector('.talos-message__nota').closest('.talos-message');
    return [...m.children].map((c) => `${c.className.split(' ')[0]}:${(c.textContent ?? '').trim().slice(0, 24)}`);
  });
  expect(ordine.findIndex((x) => x.startsWith('talos-message__nota')), 'la riga sta sotto la risposta finale').toBeGreaterThan(ordine.findIndex((x) => x.includes('Risposta finale')));
});
