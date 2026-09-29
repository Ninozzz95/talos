import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHttpApp } from '../../../src/http-app.mjs';
import { leggiTestoLimitato } from '../../../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../../../src/session-registry.mjs';
import { createStaticHandler } from '../../../src/static-files.mjs';
import { rimuoviCartellaDiProva } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

const SESSION_ID = 'chat-files-browser-a1';
const BYTES = [0, 255, 80, 75, 0, 10];

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
    if (path === `/api/v1/sessions/${SESSION_ID}/chat-files` && request.method() === 'POST') {
      uploads.push({ bytes: [...request.postDataBuffer()], name: request.headers()['x-talos-file-name'] });
      return route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { tipo: 'file', nome: 'report.bin', percorso: 'allegati/report.bin', bytes: BYTES.length } }) });
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
  await expect(page.locator('#schermoChat .talos-allegati__nome')).toHaveAttribute('title', 'allegati/report.bin');
  await page.locator('#composerInput').fill('Leggi il file');
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => sent.length).toBe(1);
  assertMessageHasPath(sent[0]);
});

function assertMessageHasPath(value) {
  expect(value.messaggio).toContain('allegati/report.bin');
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
  const registry = createSessionRegistry({ cartellaStore: store, modello: 'test/model', chiave: 'test',
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
  const server = createServer(createHttpApp({ sessionRegistry: registry, staticHandler: createStaticHandler(dist) }));
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
    await expect(page.locator('#schermoChat .talos-allegati__nome')).toHaveAttribute('title', 'allegati/report.txt');
    const recovered = await registry.scaricaFile(sessionId, 'allegati/report.txt');
    expect(recovered.ok).toBe(true);
    expect(recovered.bytes.toString('utf8')).toBe(contents);
    expect((await leggiTestoLimitato(workspace, 'allegati/report.txt')).testo).toBe(contents);
    await page.locator('#composerInput').fill('Leggi il file');
    const sent = page.waitForResponse((response) => /\/sessions\/[^/]+\/(?:resume|queue)$/u.test(new URL(response.url()).pathname), { timeout: 5000 });
    await page.locator('#composerInput').press('Enter');
    const sentResponse = await sent;
    expect(sentResponse.url()).toContain(`/sessions/${sessionId}/resume`);
    expect(sentResponse.status(), JSON.stringify(await sentResponse.json())).toBe(200);
    await expect.poll(() => runs.length).toBe(2);
    expect(runs[1].task.consegna).toContain('allegati/report.txt');
    await page.reload();
    expect((await registry.scaricaFile(sessionId, 'allegati/report.txt')).bytes.toString('utf8')).toBe(contents);
  } finally {
    await page.goto('about:blank');
    await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
    await registry.chiudi();
    rimuoviCartellaDiProva(root);
  }
});
