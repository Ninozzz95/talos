import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { creaArchivioAllegati } from '../../../src/allegati-dati.mjs';
import { createHttpApp } from '../../../src/http-app.mjs';
import { createSessionRegistry } from '../../../src/session-registry.mjs';
import { createStaticHandler } from '../../../src/static-files.mjs';
import { rimuoviCartellaDiProva } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

const SESSION_ID = 'chat-files-browser-a1';
const BYTES = [0, 255, 80, 75, 0, 10];
/* Decisioni 43 e 47: la ricevuta vera: riferimento opaco e nome corto, mai un percorso del PC */
const ID_ALLEGATO = 'a'.repeat(24);
const RICEVUTA = { tipo: 'file', nome: 'report.bin', percorso: `attachments/${ID_ALLEGATO}/report.bin`, allegatoId: ID_ALLEGATO, bytes: BYTES.length };

/* Tester 02/11/2026: al PRIMO messaggio di una chat nuova il file non si allegava («Open a conversation before attaching a file»,
   a chat aperta): la sessione nasce con l'invio, e il caricamento voleva già il suo numero. */
test('CHAT-FILES-PRIMO: a file attaches to the first message of a new chat, and the first send carries it', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const uploads = [];
  const nate = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/chat-files' && request.method() === 'POST') {
      uploads.push({ cartella: JSON.parse(decodeURIComponent(request.headers()['x-talos-chat-folder'] ?? 'null')), nome: request.headers()['x-talos-file-name'] });
      return route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: RICEVUTA }) });
    }
    if (path === '/api/v1/sessions/custom' && request.method() === 'POST') {
      nate.push(JSON.parse(request.postData()));
      return route.abort();
    }
    if (request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(() => window.__talosHarnessUiRuntime.avviaSessionePendente({ cartellaId: 'default', nomeCartella: 'progetto', modello: 'z-ai/glm-5.3-flash' }));
  await expect(page.locator('#composerInput')).toBeVisible();
  await page.locator('#schermoChat .talos-chat-foot').evaluate((target, bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'report.bin', { type: 'application/octet-stream' }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, BYTES);
  await expect.poll(() => uploads.length).toBe(1);
  expect(uploads[0]).toEqual({ cartella: null, nome: 'report.bin' }); // decisioni 43 e 47: né cartella né sessione
  /* D27: la chat in attesa di un'altra cartella non eredita il file, e tornando il file c'è ancora */
  const riga = page.locator('#schermoChat .talos-allegati');
  await page.evaluate(() => window.__talosHarnessUiRuntime.avviaSessionePendente({ cartellaId: 'altra', nomeCartella: 'altra', modello: 'z-ai/glm-5.3-flash' }));
  await expect(riga).toBeHidden();
  await page.evaluate(() => window.__talosHarnessUiRuntime.avviaSessionePendente({ cartellaId: 'default', nomeCartella: 'progetto', modello: 'z-ai/glm-5.3-flash' }));
  await expect(riga).toContainText('report.bin');
  await page.locator('#composerInput').fill('Leggi questo');
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => nate.length).toBe(1);
  expect(nate[0].consegna).toContain('report.bin');
  expect(nate[0].bolla).toMatchObject({ testo: 'Leggi questo', allegati: [{ tipo: 'file', nome: 'report.bin', allegatoId: ID_ALLEGATO }] }); // il legame nasce da qui
});

/* R8 della revisione: invio fallito in una chat già aperta: l'allegato file si perdeva. */
test('R8-INVIO-FALLITO: a failed send in an open chat brings the file back to the field', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const SESSIONE = 'invio-fallito1';
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/chat-files' && request.method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { tipo: 'file', nome: 'report.bin', percorso: 'allegati/report.bin', bytes: BYTES.length } }) });
    if (path.endsWith('/resume') && request.method() === 'POST') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'INTERNAL', message: 'no' } }) });
    if (/\/events$/u.test(path)) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    if (request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione(id, 'workspace', 'Conclusa', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
    runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, runtime.realSessionState.generation);
  }, SESSIONE);
  await page.locator('#schermoChat .talos-chat-foot').evaluate((target, bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'report.bin', { type: 'application/octet-stream' }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, BYTES);
  const riga = page.locator('#schermoChat .talos-allegati');
  await expect(riga).toContainText('report.bin');
  await page.locator('#composerInput').fill('Leggi questo');
  await page.locator('#composerInput').press('Enter');
  await expect(riga).toContainText('report.bin');
  await expect(page.locator('#composerInput')).toHaveValue('Leggi questo');
});

/* Tester D29: un file messo mentre il modello aspetta una domanda resta nel campo, e la carta lo dice prima della risposta. */
test('D29-AVVISO: an attachment added during a question stays in the field, and the card says so', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/chat-files' && request.method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { tipo: 'file', nome: 'report.bin', percorso: 'allegati/report.bin', bytes: BYTES.length } }) });
    if (/\/events$/u.test(path)) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    if (request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('domanda-allegato1', 'workspace', 'Domanda', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, runtime.realSessionState.generation);
    const g = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Lavora' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'z-ai/glm-5.3-flash' }, _sequenza: 1 }, g);
    runtime.handleRealEvent({ type: 'UserQuestionRequested', _sequenza: 2, requestId: 'domanda-1', questions: [{ id: 'scelta', question: 'Come procedo?', why: 'Cambia il lavoro.', options: [{ label: 'A', description: 'Prima' }, { label: 'B', description: 'Seconda' }] }] }, g);
  });
  const carta = page.locator('.talos-question-card').last();
  await expect(carta).toBeVisible();
  await expect(carta.locator('.talos-question-card__notice')).toBeHidden();
  await page.locator('#schermoChat .talos-chat-foot').evaluate((target, bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'report.bin', { type: 'application/octet-stream' }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, BYTES);
  await expect(page.locator('#schermoChat .talos-allegati')).toContainText('report.bin');
  await expect(carta.locator('.talos-question-card__notice')).toContainText('non parte con questa risposta');
});

/* Decisione 42 (Tester D12, D31): la chat nata col primo invio non passa da `passaASessione`: la ricarica riapriva quella di prima, o Home. */
test('D42-RICARICA: reloading reopens the chat born from the first message, not the one opened before', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const [VECCHIA, NUOVA] = ['ricarica-vecchia1', 'ricarica-nuova1'];
  const riga = (sessionId, nome) => ({ sessionId, taskId: 'libero', nome, stato: 'finished', conclusa: true, modello: 'z-ai/glm-5.3-flash' });
  let nata = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/sessions/custom' && request.method() === 'POST') { nata = true; return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { sessionId: NUOVA } }) }); }
    if (path === '/api/v1/sessions' && request.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { items: [riga(VECCHIA, 'Vecchia'), ...(nata ? [riga(NUOVA, 'Nuova')] : [])] } }) });
    if (/\/events$/u.test(path)) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    if (request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.addInitScript((id) => {
    if (!localStorage.getItem('talos.desktop.workspace.v2')) localStorage.setItem('talos.desktop.workspace.v2', JSON.stringify({ version: 2, density: 'comfortable', restoreWorkspace: true, lastSession: id }));
  }, VECCHIA);
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(() => window.__talosHarnessUiRuntime.avviaSessionePendente({ cartellaId: 'default', nomeCartella: 'progetto', modello: 'z-ai/glm-5.3-flash' }));
  await page.locator('#composerInput').fill('Primo messaggio');
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe(NUOVA);
  await page.reload();
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe(NUOVA);
  /* due finestre: quella che apre dopo non decide per l'altra */
  const altra = await page.context().newPage();
  await altra.goto('/');
  await altra.waitForFunction(() => window.__talosHarnessUiRuntime);
  await altra.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'libero', 'Vecchia', 'z-ai/glm-5.3-flash'), VECCHIA);
  await page.reload();
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe(NUOVA);
});

/* Tester D27, 02/11/2026: un allegato messo in una chat e non inviato passava alla chat dopo e partiva col suo messaggio. Hermes tiene la bozza per sessione: `apps/desktop/src/store/composer-draft-stash.ts`. */
test('CHAT-FILES-BOZZA: an unsent attachment stays with its chat', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const [A, B] = ['chat-bozza-a1', 'chat-bozza-b1'];
  const mandati = [];
  let rilascia = () => {};
  const cancello = new Promise((ok) => { rilascia = ok; });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const sessione = [A, B].find((id) => path.startsWith(`/api/v1/sessions/${id}/`));
    if (sessione && path.endsWith('/events')) {
      const events = [{ type: 'RunStarted', input: { consegna: 'Prima.' }, _sequenza: 1 }, { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 2 }, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }];
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (sessione && path.endsWith('/metrics')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {} } }) });
    if (path === '/api/v1/chat-files' && request.method() === 'POST') {
      const nome = request.headers()['x-talos-file-name'];
      if (nome === 'tardi.bin') await cancello;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { tipo: 'file', nome, percorso: `allegati/${nome}`, bytes: BYTES.length, assoluto: `C:\\ses\\allegati\\${nome}` } }) });
    }
    if (sessione && path.endsWith('/resume') && request.method() === 'POST') {
      mandati.push({ sessione, corpo: request.postData() });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true } }) });
    }
    if (request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  const apri = (id) => page.evaluate((sessionId) => window.__talosHarnessUiRuntime.passaASessione(sessionId, 'workspace', sessionId, 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), id);
  const riga = page.locator('#schermoChat .talos-allegati');
  await apri(A);
  const lascia = (nome) => page.locator('#schermoChat .talos-chat-foot').evaluate((target, { bytes, nome: n }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], n, { type: 'application/octet-stream' }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, { bytes: BYTES, nome });
  await lascia('report.bin');
  await expect(riga).toContainText('report.bin');
  await page.locator('#composerInput').fill('leggi questo');
  await lascia('tardi.bin');
  await apri(B);
  await expect(riga).toBeHidden();
  await expect(page.locator('#composerInput')).toHaveValue('');
  rilascia();
  await page.waitForTimeout(300);
  await expect(riga).toBeHidden();
  await page.locator('#composerInput').fill('Altra domanda');
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => mandati.length).toBe(1);
  expect(mandati[0].sessione).toBe(B);
  expect(mandati[0].corpo).not.toContain('report.bin');
  expect(mandati[0].corpo).not.toContain('leggi questo');
  await apri(A);
  await expect(riga).toContainText('report.bin');
  await expect(riga).toContainText('tardi.bin');
  await expect(page.locator('#composerInput')).toHaveValue('leggi questo');
});

/* Tester R1, 03/11/2026: la bozza (testo e file) si perdeva ricaricando. Ora resta nella scheda e torna alla sua chat; AL CONTRARIO non passa a un'altra chat. */
test('CHAT-FILES-BOZZA-RICARICA: an unsent draft survives a reload and returns to its own chat only', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const [A, B] = ['chat-ricarica-a1', 'chat-ricarica-b1'];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const sessione = [A, B].find((id) => path.startsWith(`/api/v1/sessions/${id}/`));
    if (sessione && path.endsWith('/events')) {
      const events = [{ type: 'RunStarted', input: { consegna: 'Prima.' }, _sequenza: 1 }, { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 2 }, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }];
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (sessione && path.endsWith('/metrics')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {} } }) });
    if (path === '/api/v1/chat-files' && request.method() === 'POST') {
      const nome = request.headers()['x-talos-file-name'];
      /* R1c (03/11): la ricevuta VERA del server (`allegati-dati.mjs`, `salva`): riferimento opaco e nome corto, mai un percorso del PC */
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { tipo: 'file', nome, bytes: BYTES.length, allegatoId: ID_ALLEGATO, percorso: `attachments/${ID_ALLEGATO}/${nome}` } }) });
    }
    if (request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  const avvia = async () => {
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  };
  const apri = (id) => page.evaluate((sessionId) => window.__talosHarnessUiRuntime.passaASessione(sessionId, 'workspace', sessionId, 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), id);
  const riga = page.locator('#schermoChat .talos-allegati');
  await page.goto('/');
  await avvia();
  await apri(A);
  await page.locator('#schermoChat .talos-chat-foot').evaluate((target) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['RIGA-SEGRETA-DEL-FILE'], 'n1.txt', { type: 'text/plain' }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(riga).toContainText('n1.txt');
  await page.locator('#composerInput').fill('bozza di A non inviata');
  await page.reload();
  await avvia();
  /* R1c: nella scheda il riferimento, mai il testo del file né un percorso del PC */
  const scheda = await page.evaluate(() => Object.keys(sessionStorage).map((k) => `${k}=${sessionStorage.getItem(k)}`).join('\n'));
  expect(scheda).toContain(`attachments/${ID_ALLEGATO}/n1.txt`);
  expect(scheda).not.toContain('RIGA-SEGRETA-DEL-FILE');
  expect(scheda).not.toMatch(/"contenuto"|[A-Z]:\\\\/u);
  await apri(B);
  await expect(riga).toBeHidden();
  await expect(page.locator('#composerInput')).toHaveValue('');
  await apri(A);
  await expect(riga).toContainText('n1.txt');
  await expect(page.locator('#composerInput')).toHaveValue('bozza di A non inviata');
});

/*
 * Revisione del blocco del 03/11 pomeriggio, R1a e R1b: la fotografia nella scheda si scriveva solo a `pagehide`, che non arriva se il renderer
 *   cade. Una bozza parcheggiata si perdeva; e una bozza già INVIATA tornava, perché restava la fotografia vecchia. Qui la caduta si imita
 *   fermando `pagehide` prima del ricaricamento. La ricevuta del file è quella vera del server (`allegati-dati.mjs`, `salva`).
 */
async function scenaBozze(page, { mandati = [] } = {}) {
  await page.setViewportSize({ width: 1200, height: 800 });
  const [A, B] = ['chat-bozza-a1', 'chat-bozza-b1'];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const sessione = [A, B].find((id) => path.startsWith(`/api/v1/sessions/${id}/`));
    if (sessione && path.endsWith('/events')) {
      const events = [{ type: 'RunStarted', input: { consegna: 'Prima.' }, _sequenza: 1 }, { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 2 }, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }];
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (sessione && path.endsWith('/metrics')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {} } }) });
    if (path === '/api/v1/chat-files' && request.method() === 'POST') {
      const nome = request.headers()['x-talos-file-name'];
      const id = 'b'.repeat(24);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { tipo: 'file', nome, bytes: BYTES.length, allegatoId: id, percorso: `attachments/${id}/${nome}` } }) });
    }
    if (sessione && path.endsWith('/resume') && request.method() === 'POST') {
      mandati.push({ sessione, corpo: request.postData() });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true } }) });
    }
    if (request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  const avvia = async () => {
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  };
  const apri = (id) => page.evaluate((sessionId) => window.__talosHarnessUiRuntime.passaASessione(sessionId, 'workspace', sessionId, 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), id);
  const lascia = (nome) => page.locator('#schermoChat .talos-chat-foot').evaluate((target, { bytes, n }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], n, { type: 'text/plain' }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, { bytes: BYTES, n: nome });
  /* la scheda che cade: nessun `pagehide` arriva all'app (un ascoltatore di cattura sulla finestra parte prima e ferma gli altri) */
  const cadeERicarica = async () => {
    await page.evaluate(() => window.addEventListener('pagehide', (e) => e.stopImmediatePropagation(), { capture: true }));
    await page.reload();
    await avvia();
  };
  return { A, B, avvia, apri, lascia, cadeERicarica, riga: page.locator('#schermoChat .talos-allegati'), campo: page.locator('#composerInput') };
}

test('CHAT-FILES-BOZZA-SENZA-PAGEHIDE (R1b): a parked draft survives a reload without pagehide (a crashed renderer)', async ({ page }) => {
  const s = await scenaBozze(page);
  await page.goto('/');
  await s.avvia();
  await s.apri(s.A);
  await s.lascia('n2.txt');
  await expect(s.riga).toContainText('n2.txt');
  await s.campo.fill('bozza parcheggiata');
  await s.apri(s.B); // il parcheggio
  await s.cadeERicarica();
  await s.apri(s.A);
  await expect(s.riga).toContainText('n2.txt');
  await expect(s.campo).toHaveValue('bozza parcheggiata');
});

test('CHAT-FILES-BOZZA-INVIATA (R1b, AL CONTRARIO): sent, reloaded, it does not come back', async ({ page }) => {
  const mandati = [];
  const s = await scenaBozze(page, { mandati });
  await page.goto('/');
  await s.avvia();
  await s.apri(s.A);
  await s.lascia('n3.txt');
  await expect(s.riga).toContainText('n3.txt');
  await s.campo.fill('ciao');
  await page.reload(); // ricarica normale: la bozza va nella scheda
  await s.avvia();
  await s.apri(s.A);
  await expect(s.riga).toContainText('n3.txt');
  await expect(s.campo).toHaveValue('ciao');
  await s.campo.press('Enter');
  await expect.poll(() => mandati.length).toBe(1);
  expect(mandati[0].sessione).toBe(s.A);
  await s.cadeERicarica();
  await s.apri(s.B);
  await s.apri(s.A);
  await expect(s.riga).toBeHidden();
  await expect(s.campo).toHaveValue('');
});

/* Decisione 201 dell'owner (04/11/2026), al posto di R1c: la pagina aperta nel Browser non è più un allegato. Una bozza salvata da una
   versione di prima con una pagina `daBrowser` torna SENZA la pagina, e il server non la rilegge: la pagina la dice il nucleo in una
   riga e la legge l'attrezzo `browser_page`. AL CONTRARIO della R1c di prima: nessuna chiamata a `/api/v1/browser/leggi`. */
test('CHAT-FILES-BOZZA-PAGINA (decision 201): a Browser page saved in an old draft does not come back as an attachment', async ({ page }) => {
  const mandati = [];
  const s = await scenaBozze(page, { mandati });
  const URL_PAGINA = 'https://esempio.test/articolo';
  const riletture = [];
  await page.route('**/api/v1/browser/leggi**', (route) => { riletture.push(route.request().url()); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { url: URL_PAGINA, stato: 200, corpo: 'TESTO-RILETTO-DELLA-PAGINA' } }) }); });
  await page.addInitScript(({ chiave, voce }) => {
    if (sessionStorage.getItem('prova.seminata')) return;
    sessionStorage.setItem('prova.seminata', '1');
    sessionStorage.setItem('talos.bozze.v2', JSON.stringify({ version: 2, voci: [[chiave, voce]] }));
  }, { chiave: `sessione:${s.A}`, voce: { testo: 'leggi la pagina', allegati: [{ tipo: 'testo', nome: 'Pagina: articolo', percorso: URL_PAGINA, caratteri: 26, daBrowser: true }] } });
  await page.goto('/');
  await s.avvia();
  await s.apri(s.A);
  await expect(s.campo).toHaveValue('leggi la pagina');
  await expect(s.riga).toBeHidden();
  await s.campo.press('Enter');
  await expect.poll(() => mandati.length).toBe(1);
  expect(mandati[0].corpo).not.toContain('TESTO-RILETTO-DELLA-PAGINA');
  expect(riletture).toEqual([]);
});

/* Decisione 201 dell'owner (04/11/2026): con una pagina aperta nel Browser il messaggio porta SOLO dove si trova (`paginaBrowser`:
   indirizzo, titolo, corsia), mai il suo testo né un allegato; senza pagine porta `null`. Il nucleo lo dice al modello in una riga. */
for (const conPagina of [true, false]) test(`BROWSER-201-INVIO: the message carries only which page is open in the Browser (${conPagina ? 'one open' : 'none'})`, async ({ page }) => {
  const mandati = [];
  const s = await scenaBozze(page, { mandati });
  const riletture = [];
  await page.route('**/api/v1/browser/leggi**', (route) => { riletture.push(route.request().url()); return route.abort(); });
  await page.goto('/');
  await s.avvia();
  await s.apri(s.A);
  if (conPagina) {
    await page.evaluate(() => {
      const rs = window.__talosHarnessUiRuntime.realSessionState;
      rs.browserVive = [
        { id: 'b-vecchia', url: 'https://esempio.test/vecchia', titolo: 'Vecchia', viaVista: 'proxy', stato: 'pronta' },
        { id: 'b-attiva', url: 'https://esempio.test/articolo', titolo: 'Articolo di prova', viaVista: 'cornice', stato: 'pronta' },
        { id: 'b-annullata', url: 'https://esempio.test/annullata', titolo: 'No', viaVista: 'cornice', stato: 'annullata' },
      ];
      rs.browserAttiva = 'b-attiva';
    });
  }
  await s.campo.fill('di che parla?');
  await s.campo.press('Enter');
  await expect.poll(() => mandati.length).toBe(1);
  const corpo = JSON.parse(mandati[0].corpo);
  expect(corpo.paginaBrowser).toEqual(conPagina ? { url: 'https://esempio.test/articolo', titolo: 'Articolo di prova', via: 'cornice' } : null);
  expect(mandati[0].corpo).not.toContain('daBrowser');
  await expect(s.riga).toBeHidden();
  expect(riletture).toEqual([]);
});

/* Tester D26, 02/11/2026: il titolo prendeva il testo interno «Attachments of this message…» col file al primo messaggio. */
for (const [scritto, atteso] of [['Leggi questo', 'Leggi questo'], ['', 'report.bin']]) test(`CHAT-FILES-TITOLO: the title comes from what the person wrote (${atteso})`, async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const nomi = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/chat-files' && request.method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { tipo: 'file', nome: 'report.bin', percorso: 'allegati/report.bin', bytes: BYTES.length, assoluto: 'C:\progetto\allegati\report.bin' } }) });
    }
    if (path === '/api/v1/sessions/custom' && request.method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { sessionId: 'chat-titolo-1' } }) });
    if (path === '/api/v1/sessions/chat-titolo-1/rename' && request.method() === 'POST') {
      nomi.push(JSON.parse(request.postData()).nome);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true } }) });
    }
    if (path.startsWith('/api/v1/sessions/chat-titolo-1/')) return route.abort();
    if (request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(() => window.__talosHarnessUiRuntime.avviaSessionePendente({ cartellaId: 'default', nomeCartella: 'progetto', modello: 'z-ai/glm-5.3-flash' }));
  await expect(page.locator('#composerInput')).toBeVisible();
  await page.locator('#schermoChat .talos-chat-foot').evaluate((target, bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'report.bin', { type: 'application/octet-stream' }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, BYTES);
  await expect(page.locator('#schermoChat .talos-allegati')).toContainText('report.bin');
  if (scritto) await page.locator('#composerInput').fill(scritto);
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => nomi.length).toBe(1);
  expect(nomi[0]).toBe(atteso);
});

/* Tester R5, 03/11/2026: con la sola immagine il titolo era «Describe the attached image.», la consegna per il modello. AL CONTRARIO: con parole, le parole. */
const pngProva = new PNG({ width: 16, height: 16 }); pngProva.data.fill(255);
const PNG_1X1 = [...PNG.sync.write(pngProva)];
for (const [scritto, atteso] of [['', 'punto.png'], ['Cosa vedi?', 'Cosa vedi?']]) test(`CHAT-FILES-TITOLO-IMMAGINE: an image alone names the chat after its file (${atteso})`, async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const nomi = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/chat-images' && request.method() === 'POST') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { id: 'f'.repeat(64), tipo: 'immagine', nome: 'punto.png', mimeType: 'image/png', byte: PNG_1X1.length, url: '/api/v1/chat-images/' + 'f'.repeat(64) } }) });
    if (path === '/api/v1/chat-images/' + 'f'.repeat(64)) return route.fulfill({ contentType: 'image/png', body: Buffer.from(PNG_1X1) });
    if (path === '/api/v1/sessions/custom' && request.method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { sessionId: 'chat-titolo-img' } }) });
    if (path === '/api/v1/sessions/chat-titolo-img/rename' && request.method() === 'POST') {
      nomi.push(JSON.parse(request.postData()).nome);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true } }) });
    }
    if (path.startsWith('/api/v1/sessions/chat-titolo-img/')) return route.abort();
    if (request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(() => window.__talosHarnessUiRuntime.avviaSessionePendente({ cartellaId: 'default', nomeCartella: 'progetto', modello: 'z-ai/glm-5.3-flash' }));
  await expect(page.locator('#composerInput')).toBeVisible();
  await page.getByRole('button', { name: 'Aggiungi contesto', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /Immagine Una foto/ }).click();
  await (await chooser).setFiles({ name: 'punto.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1) });
  await expect(page.locator('.talos-image-card--compact')).toBeVisible();
  if (scritto) await page.locator('#composerInput').fill(scritto);
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => nomi.length).toBe(1);
  expect(nomi[0]).toBe(atteso);
});

test('CHAT-FILES-WORKSPACE: drop uploads original bytes before exposing the real relative path', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const uploads = [];
  const sent = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `/api/v1/sessions/${SESSION_ID}/events`) {
      const events = [
        { type: 'RunStarted', input: { consegna: 'Test precedente.' }, _sequenza: 1 },
        { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 2 },
        { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null },
      ];
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (path === `/api/v1/sessions/${SESSION_ID}/metrics`) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {} } }) });
    }
    if (path === '/api/v1/chat-files' && request.method() === 'POST') {
      uploads.push({ bytes: [...request.postDataBuffer()], name: request.headers()['x-talos-file-name'] });
      return route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: RICEVUTA }) });
    }
    if (path === `/api/v1/sessions/${SESSION_ID}/resume` && request.method() === 'POST') {
      sent.push(JSON.parse(request.postData()));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true } }) });
    }
    if (request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((sessionId) => window.__talosHarnessUiRuntime.passaASessione(
    sessionId, 'workspace', 'Allegato binario', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSION_ID);
  await page.locator('#schermoChat .talos-chat-foot').evaluate((target, bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'report.bin', { type: 'application/octet-stream' }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, BYTES);
  await expect.poll(() => uploads.length).toBe(1);
  expect(uploads[0]).toEqual({ bytes: BYTES, name: 'report.bin' });
  await expect(page.locator('#schermoChat .talos-allegati__nome')).toHaveAttribute('title', 'report.bin');
  await page.locator('#composerInput').fill('Leggi il file');
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => sent.length).toBe(1);
  assertMessageHasPath(sent[0]);
});

function assertMessageHasPath(value) {
  /* Decisioni 43 e 47, ritocco 4 della CLI: al modello il nome corto che il nucleo risolve, mai il percorso del PC */
  expect(value.messaggio).toContain(RICEVUTA.percorso);
  expect(value.messaggio).not.toContain('C:\\');
  expect(value.messaggio).not.toContain('file allegato: report.bin\n');
}

test('CHAT-FILES-REAL-BROWSER: drop reaches the real session workspace and survives reload', async ({ page }) => {
  test.setTimeout(45_000);
  const root = mkdtempSync(join(tmpdir(), 'talos-chat-file-ui-'));
  const workspace = join(root, 'progetto');
  const store = join(root, 'sessioni');
  mkdirSync(workspace);
  mkdirSync(store);
  const runs = [];
  const archivioAllegati = creaArchivioAllegati({ cartella: join(root, 'dati', 'allegati') });
  const registry = createSessionRegistry({ cartellaStore: store, modello: 'test/model', chiave: 'test', archivioAllegati,
    guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella: workspace, comandoProva: 'node --test', task: { id: 'test', consegna: 'prova' } }),
    avviaSessioneFn: async (input) => {
      runs.push(input);
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r-${runs.length}`, input: { consegna: input.task?.consegna || 'prova' } });
      input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r-${runs.length}` });
      return { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [
        { role: 'user', content: input.task?.consegna || 'prova' }, { role: 'assistant', content: 'Pronto.' },
      ] } };
    },
  });
  const { sessionId } = registry.avvia('test');
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
  const server = createServer(createHttpApp({ senzaGettone: 'prove', sessionRegistry: registry, archivioAllegati, staticHandler: createStaticHandler(dist) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const contents = 'Prova testuale € dal file trascinato.';
  try {
    await page.goto(base);
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
    await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id,
      'workspace', 'Allegato reale', 'test/model', { conclusa: true, modello: 'test/model' }), sessionId);
    await page.locator('#schermoChat .talos-chat-foot').evaluate((target, text) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], 'report.txt', { type: 'text/plain' }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, contents);
    await expect(page.locator('#schermoChat .talos-allegati__nome')).toHaveAttribute('title', 'report.txt');
    /* Decisioni 43 e 47: il file sta nei dati di TALOS, il progetto non si tocca */
    expect(readdirSync(workspace)).toEqual([]);
    const { allegatoId } = JSON.parse(readFileSync(join(root, 'dati', 'allegati', readdirSync(join(root, 'dati', 'allegati'))[0], 'voce.json'), 'utf8'));
    expect(readFileSync(archivioAllegati.percorsoDi(allegatoId), 'utf8')).toBe(contents);
    /* ⭐ BUG-20 (06/10/2026): l'upload reale passa per l'helper VERIFICATO — il lock SHA256 scritto dalla
     * build deve esistere e combaciare coi byte dell'exe appena usato (verifica di sola lettura: nessuna
     * esecuzione alla cieca, nessun fallback silenzioso). */
    const eseguibileHelper = fileURLToPath(new URL('../../../native/talos-chat-upload.exe', import.meta.url));
    const improntaHelper = createHash('sha256').update(readFileSync(eseguibileHelper)).digest('hex');
    expect(readFileSync(`${eseguibileHelper}.sha256`, 'utf8'),
      'lock SHA256 assente o non allineato all\'exe eseguito: l\'upload reale è partito senza verifica dei byte').toContain(improntaHelper);
    await page.locator('#composerInput').fill('Leggi il file');
    const sent = page.waitForResponse((response) => /\/sessions\/[^/]+\/(?:resume|queue)$/u.test(new URL(response.url()).pathname), { timeout: 5000 });
    await page.locator('#composerInput').press('Enter');
    const sentResponse = await sent;
    expect(sentResponse.url()).toContain(`/sessions/${sessionId}/resume`);
    expect(sentResponse.status(), JSON.stringify(await sentResponse.json())).toBe(200);
    await expect.poll(() => runs.length).toBe(2);
    /* ⛔ BUG-20: il testo entro tetto viaggia COL messaggio (blocco `--- nome (riferimento) ---`), e la
     * consegna nomina il file col nome corto che il nucleo risolve, solo per questa conversazione. */
    const riferimento = `attachments/${allegatoId}/report.txt`;
    expect(runs[1].task.consegna).toContain(riferimento);
    await expect.poll(() => [...runs[1].allegatiConversazioneFn()].map((a) => a.riferimento)).toEqual([riferimento]);
    expect(runs[1].task.consegna).toContain('--- report.txt (');
    expect(runs[1].task.consegna).toContain('Prova testuale € dal file trascinato.');
    await page.reload();
    expect((await registry.leggiAllegato(sessionId, allegatoId)).bytes.toString('utf8')).toBe(contents);
  } finally {
    await page.goto('about:blank');
    await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
    await registry.chiudi();
    rimuoviCartellaDiProva(root);
  }
});
