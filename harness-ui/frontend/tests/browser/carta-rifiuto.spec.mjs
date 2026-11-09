import { test, expect } from '@playwright/test';

/*
 * FE-051 (owner 01/11/2026), carta del rifiuto del modello. Eventi come li manda il server: risposta vuota = `RunError` con `PROVIDER_EMPTY_RESPONSE` e la
 * frase del nucleo (`erroreRifiutoDelModello`), testo a metà = il code `rifiuto-del-modello` e la sola prima riga (`esitoInEventoFinale`).
 * Il cambio di modello e il rinvio passano dal runtime e dalla rotta: nessuna richiesta vera a un modello.
 */
const ID = 'carta-rifiuto';
const MODELLO = 'z-ai/glm-5.3-flash';
const ALTRO = 'openai/gpt-6-luna';
const avvio = (runId, consegna) => ({ type: 'RunStarted', threadId: ID, runId, contesto: { modello: MODELLO }, input: { consegna, origine: 'persona' } });
const vuota = { type: 'RunError', code: 'PROVIDER_EMPTY_RESPONSE', message: 'The model refused to answer this conversation.' };
const parziale = { type: 'RunError', code: 'rifiuto-del-modello', message: '⛔ the model stopped and refused to continue: the text that arrived is kept.' };

/* `storia`: la chat riaperta, cioè la rigiocata vera dal flusso, come dopo una ricarica della pagina */
async function apri(page, lingua = 'it', storia = null, tema = 'dark') {
  await page.addInitScript(({ uiLanguage, colorMode }) => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } })); } catch { /* storage assente */ }
  }, { uiLanguage: lingua, colorMode: tema });
  await page.route(`**/api/v1/sessions/${ID}/events*`, (rotta) => {
    if (!storia) return undefined; // resta pending
    const righe = [...storia, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }].map((e, i) => `data: ${JSON.stringify({ ...e, _sequenza: i + 1 })}\n\n`);
    return rotta.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${righe.join('')}` });
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate(({ id, modello, rigiocata }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Carta rifiuto', modello, { conclusa: false, modello });
    if (!rigiocata) r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, { id: ID, modello: MODELLO, rigiocata: Boolean(storia) });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/);
}
const manda = (page, eventi) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, eventi);
/* il modello cambia con la fotografia delle impostazioni, la stessa strada di un cambio dal dispositivo (`impostazioni-dal-vivo.spec.mjs`) */
let versione = 10;
const scegliModello = (page, modello) => { versione += 1; return page.evaluate(({ modello: m, seq }) => {
  const r = window.__talosHarnessUiRuntime;
  const istantanea = { modello: m, permessi: 'on-request', modalitaOperativa: 'agent', nome: 'Carta rifiuto', versione: seq };
  r.handleRealEvent({ type: 'CUSTOM', name: 'talos.impostazioni-sessione', _sequenza: seq, value: { modalitaOperativa: 'agent', permessi: 'on-request', motivo: 'impostazioni', origine: { tipo: 'dispositivo', dispositivoId: 'd-1' }, istantanea } }, r.realSessionState.generation);
}, { modello, seq: versione }); };
const carta = (page) => page.locator('[data-c="SystemNote"][data-tone="warning"]');

test.use({ viewport: { width: 1920, height: 1080 } });

test('RIFIUTO-PC-01: risposta vuota: colore attenzione, badge, due frasi e il tasto, niente rimedi', async ({ page }) => {
  await apri(page);
  await manda(page, [avvio('r1', 'Scrivi la lettera'), vuota]);
  await expect(carta(page)).toHaveCount(1);
  await expect(carta(page)).toContainText('Rifiutata');
  await expect(carta(page)).toContainText('TALOS · risposta rifiutata');
  await expect(carta(page).locator('.assistant-copy')).toHaveText('Il modello ha rifiutato di rispondere a questa conversazione.');
  await expect(carta(page).locator('.talos-system-note__perche')).toHaveText('Riprovare con lo stesso modello dà lo stesso rifiuto e può costare.');
  await expect(carta(page).locator('[data-nota-azione="0"]')).toHaveText('Scegli un altro modello');
  await expect(carta(page).locator('[data-nota-azione]')).toHaveCount(1);
  await expect(carta(page).locator('li')).toHaveCount(0);
});

test('RIFIUTO-PC-02: «Scegli un altro modello» apre il selettore vero', async ({ page }) => {
  await apri(page);
  await manda(page, [avvio('r1', 'Scrivi la lettera'), vuota]);
  await carta(page).locator('[data-nota-azione="0"]').click();
  await expect(page.getByRole('dialog', { name: 'Modello' })).toBeVisible();
});

test('RIFIUTO-PC-03: scelto un altro modello un clic rimanda lo stesso testo, senza partire da solo né riempire il compositore', async ({ page }) => {
  await apri(page);
  const inviati = [];
  await page.route(`**/api/v1/sessions/${ID}/resume`, async (rotta) => {
    inviati.push(JSON.parse(rotta.request().postData() ?? '{}'));
    await rotta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { sessionId: ID } }) });
  });
  await manda(page, [avvio('r1', 'Scrivi la lettera'), vuota]);
  await scegliModello(page, ALTRO);
  const tasto = carta(page).locator('[data-nota-azione="0"]');
  await expect(tasto).toContainText('Invia di nuovo con');
  await expect(carta(page).locator('.talos-system-note__perche')).toContainText('il messaggio non è ancora ripartito.');
  expect(inviati).toEqual([]);
  await expect(page.locator('#composerInput, [data-composer-input]').first()).toHaveValue('');
  await tasto.dblclick();
  await expect.poll(() => inviati.length).toBe(1);
  expect(inviati[0].messaggio).toBe('Scrivi la lettera');
  await expect(carta(page).locator('.talos-system-note__perche')).toContainText('Messaggio inviato di nuovo con');
  await expect(tasto).toBeHidden();
  await expect(page.locator('.talos-message__meta').last()).toContainText('GPT-6 Luna'); // il giro che riparte dice da subito il modello nuovo // 68ebab480 (revisione d'uso 04/11, reperto 11)
});

test('RIFIUTO-PC-04 — AL CONTRARIO: se il rinvio non arriva la carta torna a offrirlo', async ({ page }) => {
  await apri(page);
  await page.route(`**/api/v1/sessions/${ID}/resume`, (rotta) => rotta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'no' } }) }));
  await manda(page, [avvio('r1', 'Scrivi la lettera'), vuota]);
  await scegliModello(page, ALTRO);
  await carta(page).locator('[data-nota-azione="0"]').click();
  await expect(carta(page).locator('[data-nota-azione="0"]')).toContainText('Invia di nuovo con');
  await expect(carta(page).locator('.talos-system-note__perche')).toContainText('non è ancora ripartito');
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.currentRunModel), 'il modello nuovo un giro non l ha fatto').toBe(MODELLO);
});

test('RIFIUTO-PC-05: tornando al modello che ha rifiutato la carta torna quella di partenza', async ({ page }) => {
  await apri(page);
  await manda(page, [avvio('r1', 'Scrivi la lettera'), vuota]);
  await scegliModello(page, ALTRO);
  await expect(carta(page).locator('[data-nota-azione="0"]')).toContainText('Invia di nuovo con');
  await scegliModello(page, MODELLO);
  await expect(carta(page).locator('[data-nota-azione="0"]')).toHaveText('Scegli un altro modello');
});

test('RIFIUTO-PC-06: un messaggio nuovo chiude la carta: niente tasto, la frase torna quella del rifiuto', async ({ page }) => {
  await apri(page);
  await manda(page, [avvio('r1', 'Scrivi la lettera'), vuota]);
  await scegliModello(page, ALTRO);
  await manda(page, [avvio('r2', 'Un altra cosa')]);
  await expect(carta(page).locator('[data-nota-azione="0"]')).toBeHidden();
  await expect(carta(page).locator('.talos-system-note__perche')).toHaveText('Riprovare con lo stesso modello dà lo stesso rifiuto e può costare.');
});

test('RIFIUTO-PC-07: testo a metà: il testo resta sopra, le frasi sono le sue; «Riprova» sparisce finché il modello resta quello', async ({ page }) => {
  await apri(page, 'en');
  await manda(page, [avvio('r1', 'Write the letter'), { type: 'TextMessageContent', messageId: 'm1', delta: 'Dear supplier, in recent weeks' }, parziale]);
  await expect(page.locator('.assistant-copy').filter({ hasText: 'Dear supplier' })).toHaveCount(1);
  await expect(carta(page).locator('.assistant-copy')).toHaveText('The model stopped and refused to continue.');
  await expect(carta(page).locator('.talos-system-note__perche')).toHaveText('The text above is what it wrote up to that point: it may be incomplete.');
  await expect(carta(page)).toContainText('Refused');
  const risposta = page.locator('.talos-message').filter({ hasText: 'Dear supplier' }).last();
  await risposta.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Delete' }).first()).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Retry/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await scegliModello(page, ALTRO);
  await risposta.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /^Retry/ })).toHaveCount(1);
});

test('RIFIUTO-PC-08 — AL CONTRARIO: un altro errore resta com era, rosso e senza il tasto', async ({ page }) => {
  await apri(page);
  await manda(page, [avvio('r1', 'Scrivi la lettera'), { type: 'RunError', code: 'PROVIDER_EMPTY_RESPONSE', message: 'The model answered with neither text nor tools (2 times in a row; provider reason: length).' }]);
  await expect(page.locator('[data-c="SystemNote"][data-tone="danger"]')).toHaveCount(1);
  await expect(carta(page)).toHaveCount(0);
});

test('RIFIUTO-PC-09 — revisione del Frontend: un giro di una delega rifiutato non tocca la domanda di prima e dice la frase giusta, senza tasto di rinvio', async ({ page }) => {
  await apri(page);
  await manda(page, [avvio('r1', 'Una domanda'), { type: 'TextMessageContent', messageId: 'm1', delta: 'Risposta riuscita' }, { type: 'RunFinished', threadId: ID, runId: 'r1', outcome: { type: 'success' } },
    { type: 'RunStarted', threadId: ID, runId: 'r2', contesto: { modello: MODELLO }, input: { consegna: 'Lavoro della figlia', origine: 'delega' } }, vuota]);
  await scegliModello(page, ALTRO);
  await expect(carta(page).locator('.talos-system-note__perche')).toContainText('il prossimo messaggio parte con questo modello.');
  await expect(carta(page).locator('[data-nota-azione="0"]')).toBeHidden();
  await scegliModello(page, MODELLO);
  await page.locator('.talos-message').filter({ hasText: 'Risposta riuscita' }).last().click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /^Riprova/ })).toHaveCount(1);
});

const IMMAGINE = { tipo: 'immagine', id: 'a'.repeat(64), nome: 'foto.png', url: '/api/v1/chat/immagini/foto.png' };

test('RIFIUTO-PC-10 — revisione del Frontend: chat riaperta: il tasto è vivo, e il rinvio porta le immagini del messaggio', async ({ page }) => {
  await apri(page, 'it', [{ ...avvio('r1', 'Descrivi la foto'), input: { consegna: 'Descrivi la foto', origine: 'persona', immagini: [IMMAGINE] } }, vuota]);
  const inviati = [];
  await page.route(`**/api/v1/sessions/${ID}/resume`, async (rotta) => {
    inviati.push(JSON.parse(rotta.request().postData() ?? '{}'));
    await rotta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { sessionId: ID } }) });
  });
  await expect(carta(page).locator('[data-nota-azione="0"]')).toHaveText('Scegli un altro modello');
  await scegliModello(page, ALTRO);
  await carta(page).locator('[data-nota-azione="0"]').click();
  await expect.poll(() => inviati.length).toBe(1);
  expect(inviati[0].messaggio).toBe('Descrivi la foto');
  expect(inviati[0].immagini).toEqual([{ id: IMMAGINE.id }]);
});

test('RIFIUTO-PC-11 — revisione del Frontend: chat riaperta dopo il rinvio: la carta dice ancora con che modello è ripartito', async ({ page }) => {
  await apri(page, 'it', [avvio('r1', 'Scrivi la lettera'), vuota,
    { type: 'RunStarted', threadId: ID, runId: 'r2', contesto: { modello: ALTRO }, input: { consegna: 'Scrivi la lettera', origine: 'persona' } },
    { type: 'TextMessageContent', messageId: 'm2', delta: 'Gentile fornitore' }, { type: 'RunFinished', threadId: ID, runId: 'r2', outcome: { type: 'success' } }]);
  await expect(carta(page).locator('.talos-system-note__perche')).toContainText('Messaggio inviato di nuovo con');
  await expect(carta(page).locator('[data-nota-azione="0"]')).toBeHidden();
});

test('RIFIUTO-PC-12 — AL CONTRARIO: chat riaperta: un messaggio diverso dopo il rifiuto non è un rinvio, anche con un altro modello', async ({ page }) => {
  await apri(page, 'it', [avvio('r1', 'Scrivi la lettera'), vuota,
    { type: 'RunStarted', threadId: ID, runId: 'r2', contesto: { modello: ALTRO }, input: { consegna: 'Un altra cosa', origine: 'persona' } },
    { type: 'RunFinished', threadId: ID, runId: 'r2', outcome: { type: 'success' } }]);
  await expect(carta(page).locator('.talos-system-note__perche')).toHaveText('Riprovare con lo stesso modello dà lo stesso rifiuto e può costare.');
  await expect(carta(page).locator('[data-nota-azione="0"]')).toBeHidden();
});

test('RIFIUTO-PC-13 — AL CONTRARIO: chat riaperta: lo stesso messaggio con lo stesso modello non è il rinvio di questa carta', async ({ page }) => {
  await apri(page, 'it', [avvio('r1', 'Scrivi la lettera'), vuota, avvio('r2', 'Scrivi la lettera'), { type: 'RunFinished', threadId: ID, runId: 'r2', outcome: { type: 'success' } }]);
  await expect(carta(page).locator('.talos-system-note__perche')).toHaveText('Riprovare con lo stesso modello dà lo stesso rifiuto e può costare.');
});

test('RIFIUTO-PC-14: un messaggio con un file: la bolla del rinvio è la frase della persona, il testo per il modello resta intero', async ({ page }) => {
  const consegna = 'Leggi il file\n\n--- a.txt ---\ncontenuto del file';
  await apri(page, 'it', [{ ...avvio('r1', consegna), input: { consegna, origine: 'persona', bolla: { testo: 'Leggi il file', allegati: [{ tipo: 'file', nome: 'a.txt' }] } } }, vuota]);
  const inviati = [];
  await page.route(`**/api/v1/sessions/${ID}/resume`, async (rotta) => {
    inviati.push(JSON.parse(rotta.request().postData() ?? '{}'));
    await rotta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { sessionId: ID } }) });
  });
  await scegliModello(page, ALTRO);
  await carta(page).locator('[data-nota-azione="0"]').click();
  await expect.poll(() => inviati.length).toBe(1);
  expect(inviati[0].messaggio).toBe(consegna);
  expect(inviati[0].bolla?.testo).toBe('Leggi il file');
  const bolle = page.locator('.talos-message--user');
  await expect(bolle).toHaveCount(2);
  await expect(bolle.last()).toContainText('Leggi il file');
  await expect(bolle.last()).not.toContainText('contenuto del file');
});

for (const tema of ['dark', 'light']) {
  test(`RIFIUTO-PC-FOTO (${tema}): testo a metà e carta dopo il rinvio`, async ({ page }) => {
    const D = process.env.TALOS_FOTO_RIFIUTO;
    test.skip(!D, 'solo foto a richiesta');
    await apri(page, 'it', null, tema);
    await page.route(`**/api/v1/sessions/${ID}/resume`, (rotta) => rotta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { sessionId: ID } }) }));
    await manda(page, [avvio('r1', 'Scrivi la lettera di reclamo per il fornitore delle pulizie'), { type: 'TextMessageContent', messageId: 'm1', delta: 'Gentile fornitore, le scrivo in merito al contratto di pulizia del magazzino: nelle ultime settimane' }, parziale]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${D}/foto-rifiuto-parziale-${tema}.png` });
    await scegliModello(page, ALTRO);
    await carta(page).locator('[data-nota-azione="0"]').click();
    await expect(carta(page).locator('.talos-system-note__perche')).toContainText('Messaggio inviato di nuovo con');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${D}/foto-rifiuto-inviato-${tema}.png` });
  });
}
