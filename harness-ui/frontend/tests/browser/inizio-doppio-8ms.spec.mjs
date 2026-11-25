import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createSessionRegistry } from '../../../src/session-registry.mjs';
import { registraRiga } from '../../../src/session-store.mjs';
import { createHttpApp } from '../../../src/http-app.mjs';
import { createStaticHandler } from '../../../src/static-files.mjs';
import { rimuoviCartellaDiProva } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * 22/11/2026 (P2-B, riga 61 (a); revisione «funzioni della chat» del 10/11, reperto 2) — L'INIZIO DELLA RISPOSTA SCRITTO DUE VOLTE.
 *   Al secondo messaggio, con pezzi ogni 8 ms, la risposta usciva «Paragrafo 1 della risposParagrafo 1 della risposta…».
 * Causa (misurata coi numeri dei due flussi): durante la POST /resume il flusso vecchio consegna i primi pezzi (#13-#15); il flusso
 *   nuovo rigioca la storia da capo, e la rigiocata FONDE i pezzi contigui in uno col numero dell'ultimo (`sse-replay-coalescente.mjs`,
 *   #16 = «Paragrafo 1 …» intero). Lo scarto per numero non lo riconosce e il testo già visto si accoda una seconda volta.
 * ⛔ Registro e server VERI (la rigiocata che fonde è quella vera), giro finto che manda davvero un pezzo ogni 8 ms. La POST risponde
 *   solo dopo che il primo pezzo è a schermo: è la finestra che il revisore ha visto aprirsi da sola, qui aperta sempre.
 */
const BUNDLE = process.env.TALOS_RIPRESA_BUNDLE || fileURLToPath(new URL('../../dist/', import.meta.url));
const PRIMO = 'Prima risposta, corta.';
const SECONDO = Array.from({ length: 12 }, (_, i) => `Paragrafo ${i + 1} della risposta lunga, con abbastanza parole da riempire una riga.`).join('\n\n');
const piatto = (t) => String(t).replace(/\s+/gu, ' ').trim();

async function conServer(run, { ritmo = 8, secondo = SECONDO } = {}) {
  const store = mkdtempSync(join(tmpdir(), 'talos-inizio-doppio-'));
  const writes = [];
  let giri = 0;
  const options = { registraRigaFn: (...args) => { const pending = registraRiga(...args); writes.push(pending); return pending; }, cartellaStore: store, modello: 'test', chiave: 'test',
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: store, task: { id: 'task', consegna: 'Primo messaggio' } }),
    avviaSessioneFn: (input) => new Promise((resolve) => {
      giri += 1;
      const testo = giri === 1 ? PRIMO : secondo;
      const messageId = `m${giri}`;
      input.onEvento({ type: 'RunStarted', input: { consegna: giri === 1 ? 'Primo messaggio' : 'Secondo messaggio' } });
      input.onEvento({ type: 'TextMessageStart', messageId, role: 'assistant' });
      let i = 0;
      const passo = () => {
        if (i < testo.length) { input.onEvento({ type: 'TextMessageContent', messageId, delta: testo.slice(i, i + 24) }); i += 24; setTimeout(passo, ritmo); return; }
        input.onEvento({ type: 'TextMessageEnd', messageId });
        input.onEvento({ type: 'RunFinished' });
        resolve({ ok: true, esito: { detto: testo, comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'Primo messaggio' }, { role: 'assistant', content: testo }] } });
      };
      passo();
    }) };
  const registry = createSessionRegistry(options);
  const server = createServer(createHttpApp({ senzaGettone: 'prove', sessionRegistry: registry, staticHandler: createStaticHandler(BUNDLE) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run({ registry, base: `http://127.0.0.1:${server.address().port}` });
  } finally {
    const chiuso = new Promise((resolve) => server.close(resolve)); server.closeAllConnections(); await chiuso;
    for (let conto = -1; conto !== writes.length;) { conto = writes.length; await Promise.all(writes); }
    rimuoviCartellaDiProva(store);
  }
}

const ultimaRisposta = (page) => page.evaluate(() => [...document.querySelectorAll('#conversation .assistant-copy')].pop()?.innerText ?? '');

async function giroDoppio(page, { attendiIlPrimoPezzo, ritmo = 8, secondo = SECONDO }) {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  await conServer(async ({ registry, base }) => {
    const { sessionId } = registry.avvia('task');
    await new Promise((fatto) => { setTimeout(fatto, 400); }); // il primo giro (un pezzo solo) è finito
    await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })); } catch { /* niente */ } });
    await page.goto(base);
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    await page.evaluate((sid) => window.__talosHarnessUiRuntime.passaASessione(sid, 'workspace', 'Inizio doppio', 'test', { conclusa: true, modello: 'test' }), sessionId);
    /* al contrario: la storia aperta da capo resta intera, una volta sola */
    await expect.poll(async () => piatto(await ultimaRisposta(page)), { timeout: 10_000 }).toBe(PRIMO);
    let flussi = 0;
    page.on('request', (r) => { if (/\/events(\?|$)/u.test(r.url())) flussi += 1; });
    await page.route('**/resume', async (route) => {
      const risposta = await route.fetch();
      if (attendiIlPrimoPezzo) await page.waitForFunction(() => /Paragrafo 1/u.test([...document.querySelectorAll('#conversation .assistant-copy')].pop()?.innerText ?? ''), null, { timeout: 10_000 });
      await route.fulfill({ response: risposta });
    });
    await page.locator('#composerInput').fill('Secondo messaggio');
    await page.locator('#composerInput').press('Enter');
    await expect.poll(async () => piatto(await ultimaRisposta(page)).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(piatto(secondo).length);
    await page.waitForTimeout(600);
    const finale = piatto(await ultimaRisposta(page));
    expect(finale.split('Paragrafo 1 della').length - 1, finale.slice(0, 140)).toBe(1);
    expect(finale).toBe(piatto(secondo));
    expect(flussi, 'il secondo messaggio apre un flusso nuovo').toBeGreaterThanOrEqual(1);
  }, { ritmo, secondo });
  expect(errori).toEqual([]);
}

test('INIZIO-DOPPIO-01 — pezzi ogni 8 ms, il flusso vecchio consegna l’inizio prima della risposta della POST: l’inizio esce una volta sola', async ({ page }) => {
  test.setTimeout(60_000);
  await giroDoppio(page, { attendiIlPrimoPezzo: true });
});

test('INIZIO-DOPPIO-02 — pezzi ogni 8 ms e la POST che risponde subito: la risposta è quella mandata, intera', async ({ page }) => {
  test.setTimeout(60_000);
  await giroDoppio(page, { attendiIlPrimoPezzo: false });
});

test('INIZIO-DOPPIO-03 — al contrario: pezzi ogni 250 ms (il ritmo di un fornitore in rete), la risposta resta quella di sempre', async ({ page }) => {
  test.setTimeout(60_000);
  await giroDoppio(page, { attendiIlPrimoPezzo: true, ritmo: 250, secondo: SECONDO.split('\n\n').slice(0, 2).join('\n\n') });
});
