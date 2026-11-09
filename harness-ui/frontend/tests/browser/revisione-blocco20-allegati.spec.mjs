import { expect, test } from '@playwright/test';
import { CONFINE, attendiFineStoria } from './aiuto-confine.mjs';

/* Revisione avversaria del Blocco 20: primo messaggio di soli allegati, «Modifica e rimanda» senza toccare niente. File temporaneo col prefisso _rev20-. */
const CONSEGNA = '\n\nAttachments of this message:\n- note.txt (C:/progetti/AVM/note.txt)\n\n--- note.txt (C:/progetti/AVM/note.txt) ---\ncontenuto segreto del file';
const BOLLA = { testo: '', allegati: [{ tipo: 'file', nome: 'note.txt', percorso: 'C:/progetti/AVM/note.txt', caratteri: 26 }] };
const ok = (route, data) => route.fulfill({ status: 200, contentType: 'application/json', json: { ok: true, data } });
const EVENTI = [
  { type: 'RunStarted', runId: 'r1', _sequenza: 1, input: { consegna: CONSEGNA, seguito: false, bolla: BOLLA }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' } },
  { type: 'TextMessageStart', messageId: 'm1', _sequenza: 2 }, { type: 'TextMessageContent', messageId: 'm1', delta: 'Letto.', _sequenza: 3 }, { type: 'TextMessageEnd', messageId: 'm1', _sequenza: 4 },
  { type: 'RunFinished', runId: 'r1', _sequenza: 5 },
];

test('REV20-P7 Modifica su un primo messaggio di soli allegati, Invia senza toccare: il file parte una volta sola', async ({ page }) => {
  const resume = [];
  await page.route('**/api/v1/**', (route) => (route.request().method() === 'GET' ? route.fallback() : route.fulfill({ status: 404, contentType: 'application/json', json: { ok: false, error: { code: 'NOT_FOUND', message: 'x' } } })));
  await page.route('**/api/v1/sessions', (route) => (route.request().method() === 'GET' ? ok(route, { items: [{ sessionId: 'A', taskId: 'A', nome: 'A', conclusa: true, modello: 'qwen/qwen3.8-flash' }] }) : route.fallback()));
  await page.route('**/api/v1/sessions/A/events*', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: `retry: 3600000\n${[...EVENTI, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` }));
  await page.route('**/api/v1/sessions/A/fork', (route) => ok(route, { sessionId: 'nuovo', forkDa: 'A', forkPrimaDelGiro: 'r1', taglio: { primaDelGiro: 'r1', messaggio: CONSEGNA } }));
  await page.route('**/api/v1/sessions/nuovo/events*', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: `retry: 3600000\ndata: ${JSON.stringify(CONFINE)}\n\n` }));
  await page.route('**/api/v1/sessions/*/language', (route) => ok(route, {}));
  await page.route('**/api/v1/sessions/*/settings', (route) => ok(route, {}));
  await page.route('**/api/v1/sessions/*/resume', (route) => { resume.push(route.request().postDataJSON()); return ok(route, { sessionId: 'nuovo' }); });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('A', 'A', 'A', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' }));
  await attendiFineStoria(page);
  const prima = page.locator('#conversation .talos-message--user').first();
  await prima.hover();
  await prima.locator('[data-message-action="modifica"]').click();
  await prima.getByRole('button', { name: /Invia|Send/u }).click();
  await expect.poll(() => resume.length, { timeout: 6000 }).toBe(1);
  const volte = String(resume[0].messaggio).split('contenuto segreto del file').length - 1;
  expect(volte).toBe(1);
});
