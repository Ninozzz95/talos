import { test, expect } from '@playwright/test';

/*
 * C06 (owner 10/10/2026, «come Claude») — il giro che riparte da solo perché un comando in sottofondo è finito. Il registro lo
 *   annuncia come l'esito di un Workflow (`RunStarted.input`: `origine: 'sfondo'`, `toolCallIds`, `risultatiSfondo` coi fatti).
 *   La chat lo disegna come una NOTA (il comando, come è finito, dove sta l'uscita) nella lingua dell'interfaccia, mai come una
 *   bolla della persona col testo inglese per il modello; e al rigioco una volta sola.
 * ⛔ Server isolato di `playwright.config.mjs` (mai il 4174): tutto intercettato; ogni richiesta non-GET si ferma e si conta.
 */
const SESSION_ID = 'c06-uscita-sfondo';
const TESTO = 'The background command `npm run dev` failed (exit code 1). Its full output is in /tmp/x/.talos/sfondo/call_dev.log.';
const FATTI = { comando: 'npm run dev', esito: 'fallito', codice: 1, segnale: null, file: '/tmp/x/.talos/sfondo/call_dev.log' };
const eventi = [
  { type: 'RunStarted', input: { consegna: 'Avvia il server di sviluppo in sottofondo.' } },
  { type: 'RunFinished', outcome: { type: 'success' } },
  { type: 'RunStarted', input: { consegna: TESTO, seguito: true, origine: 'sfondo', codaIds: ['coda-1'], toolCallIds: ['call_dev'],
    risultatiSfondo: [{ codaId: 'coda-1', toolCallId: 'call_dev', ...FATTI }] } },
  { type: 'TextMessageStart', messageId: 'm2', role: 'assistant' },
  { type: 'TextMessageContent', messageId: 'm2', delta: 'Il server di sviluppo si è fermato con codice 1: guardo il log.' },
  { type: 'TextMessageEnd', messageId: 'm2' },
  { type: 'RunFinished', outcome: { type: 'success' } },
].map((evento, i) => ({ ...evento, _sequenza: i + 1 }));
const json = (data) => ({ contentType: 'application/json', body: JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } }) });

async function apri(page, lingua, storia = eventi) {
  const traffico = { altriNonGet: 0 };
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript((l) => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: l } })); } catch { /* */ } }, lingua);
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === `/api/v1/sessions/${SESSION_ID}/events`) {
      return route.fulfill({ contentType: 'text/event-stream',
        body: `retry: 3600000\n${[...storia, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (path === `/api/v1/sessions/${SESSION_ID}/metrics`) return route.fulfill(json({ registrato: true, cacheSessione: null, ragionamentiMs: {} }));
    if (req.method() !== 'GET') { traffico.altriNonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Sottofondo', 'z-ai/glm-5.3-flash',
    { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSION_ID);
  return traffico;
}

test.describe('C06 — un comando in sottofondo finito, nella chat', () => {
  test('C06-SFONDO-BROWSER-IT: a note with the command, how it ended and the output file; never a user bubble with the model\'s text', async ({ page }) => {
    const errori = []; page.on('pageerror', (e) => errori.push(String(e?.message ?? e)));
    const traffico = await apri(page, 'it');
    const conversazione = page.locator('#conversation');
    await expect(conversazione).toContainText('Il server di sviluppo si è fermato');
    const nota = conversazione.locator('.talos-risultato-delega');
    await expect(nota).toHaveCount(1, { timeout: 5000 });
    await expect(nota).toContainText('comando in sottofondo finito');
    await expect(nota).toContainText('npm run dev');
    await expect(nota).toContainText('non riuscito (codice 1)');
    await expect(nota).toContainText('Uscita completa: /tmp/x/.talos/sfondo/call_dev.log');
    await expect(conversazione).not.toContainText('The background command');
    await expect(conversazione.locator('.talos-message--user')).toHaveCount(1, { timeout: 5000 }); // solo la domanda vera
    /* «Chiedi di nuovo» rimanda `ultimaDomanda`: deve restare la domanda della persona, mai la nota inglese per il modello */
    expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.ultimaDomanda)).toBe('Avvia il server di sviluppo in sottofondo.');
    expect(traffico.altriNonGet).toBe(0);
    expect(errori).toEqual([]);
  });

  test('C06-SFONDO-BROWSER-EN: the same note in English', async ({ page }) => {
    await apri(page, 'en');
    const nota = page.locator('#conversation .talos-risultato-delega');
    await expect(nota).toHaveCount(1, { timeout: 10_000 });
    await expect(nota).toContainText('background command finished');
    await expect(nota).toContainText('failed (exit code 1)');
    await expect(nota).toContainText('Full output: /tmp/x/.talos/sfondo/call_dev.log');
  });
});

/*
 * C06 (a) (owner 10/10/2026, «Nota senza ripartire») — un comando FERMATO DALLA PERSONA dalla scheda Processi: la nota nasce
 *   quando arriva la sua uscita (`talos.processo-sfondo` con `fermatoDallaPersona`), dice «fermato da te» e che il modello lo leggerà
 *   col prossimo messaggio; poi viene la domanda della persona, nella sua bolla. Alla rigiocata una volta sola, nello stesso punto.
 */
const FERMATO = [
  { type: 'RunStarted', input: { consegna: 'Avvia il server di sviluppo in sottofondo.' } },
  { type: 'RunFinished', outcome: { type: 'success' } },
  { type: 'CUSTOM', name: 'talos.processo-sfondo', value: { toolCallId: 'call_dev', esito: 'terminato', codice: null, segnale: 'SIGTERM',
    finitoAlle: '2026-10-10T13:20:00.000Z', fermatoDallaPersona: true, comando: 'npm run dev' } },
  { type: 'RunStarted', input: { consegna: 'E adesso?', seguito: true } },
  { type: 'TextMessageStart', messageId: 'm3', role: 'assistant' },
  { type: 'TextMessageContent', messageId: 'm3', delta: 'Hai fermato tu il server di sviluppo: lo lascio spento.' },
  { type: 'TextMessageEnd', messageId: 'm3' },
  { type: 'RunFinished', outcome: { type: 'success' } },
].map((evento, i) => ({ ...evento, _sequenza: i + 1 }));

test('C06-FERMATO-BROWSER-IT: the note «fermato da te» sits where the person stopped it, before their next message, once', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(String(e?.message ?? e)));
  const traffico = await apri(page, 'it', FERMATO);
  const conversazione = page.locator('#conversation');
  await expect(conversazione).toContainText('lo lascio spento');
  const nota = conversazione.locator('.talos-risultato-delega');
  await expect(nota).toHaveCount(1, { timeout: 5000 });
  await expect(nota).toContainText('comando in sottofondo fermato');
  await expect(nota).toContainText('npm run dev');
  await expect(nota).toContainText('fermato da te');
  await expect(nota).toContainText('Il modello lo leggerà col tuo prossimo messaggio.');
  await expect(nota).not.toHaveAttribute('data-tone', 'warning');
  const bolle = conversazione.locator('.talos-message--user');
  await expect(bolle).toHaveCount(2, { timeout: 5000 });
  /* l'ordine: la nota viene PRIMA della seconda domanda della persona */
  const primaDellaDomanda = await page.evaluate(() => {
    const n = document.querySelector('#conversation .talos-risultato-delega');
    const domande = [...document.querySelectorAll('#conversation .talos-message--user')];
    return Boolean(n && domande[1] && (n.compareDocumentPosition(domande[1]) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(primaDellaDomanda).toBe(true);
  expect(traffico.altriNonGet).toBe(0);
  expect(errori).toEqual([]);
});

test('C06-FERMATO-BROWSER-EN: the same note in English', async ({ page }) => {
  await apri(page, 'en', FERMATO);
  const nota = page.locator('#conversation .talos-risultato-delega');
  await expect(nota).toHaveCount(1, { timeout: 10_000 });
  await expect(nota).toContainText('background command stopped');
  await expect(nota).toContainText('stopped by you');
  await expect(nota).toContainText('The model reads this with your next message.');
});
