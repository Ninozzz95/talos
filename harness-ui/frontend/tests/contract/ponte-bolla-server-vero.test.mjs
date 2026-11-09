/*
 * FE-071, richiesta del Desktop 05/11 17:45: il SEG-R9 nel browser ha un server finto, e Playwright non mostra `Last-Event-ID` sulle richieste intercettate.
 * Qui il ponte della bolla ascolta il server VERO (`createHttpApp` + registro delle sessioni su una cartella temporanea) con un `EventSource` vero (undici, lo stesso
 * della specifica WHATWG): prima apertura con `?after=`, poi la connessione cade, un evento nasce mentre è giù, e la riconnessione nativa riparte da `Last-Event-ID`.
 * Si prova che nessuna sequenza manca e nessuna arriva due volte, e che il computer use si inoltra alla bolla una volta sola.
 * ⛔ Mai i dati veri: la cartella è temporanea e si cancella alla fine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventSource } from 'undici';

import { createHttpApp } from '../../../src/http-app.mjs';
import { createSessionRegistry } from '../../../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';
import { creaPonteBolla } from '../../src/components/computer-use/ponte-bolla.js';

const SESSIONE = '0f0f0f0f-0000-4000-8000-0000000f0e71';
const ANN = { finestra: { x: 0, y: 0, w: 800, h: 600 }, punto: { x: 10, y: 20 }, t0: 1 };
const STORIA = [
  { type: 'RunStarted', threadId: SESSIONE, runId: 'r1', _sequenza: 1 },
  { type: 'CUSTOM', name: 'talos.computer-use-annuncio', value: ANN, _sequenza: 2 },
  { type: 'TextMessageContent', messageId: 'm1', delta: 'cerco', _sequenza: 3 },
  { type: 'CUSTOM', name: 'talos.computer-use-passo', value: { fase: 'annuncio', n: 2, bersaglio: 'Treni' }, _sequenza: 4 },
  { type: 'CUSTOM', name: 'talos.computer-use-guarda', value: { finestra: { x: 0, y: 0, w: 800, h: 600 } }, _sequenza: 5 },
];

async function serverVero(t) {
  const store = mkdtempSync(join(tmpdir(), 'talos-ponte-vero-'));
  t.after(() => rimuoviCartellaDiProva(store));
  const intestazione = { tipo: 'intestazione', schema: 1, sessionId: SESSIONE, taskId: 'libero:ponte', cartella: store, task: { consegna: 'treni', consegnaCorta: 'treni' },
    avviataAlle: '2026-11-05T17:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true };
  writeFileSync(join(store, `${SESSIONE}.jsonl`), [intestazione, ...STORIA].map((r) => `${JSON.stringify(r)}\n`).join(''));
  const registro = createSessionRegistry({ cartellaStore: store, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  await registro.ripristina();
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro });
  const richieste = [];
  const server = createServer((req, res) => {
    if (req.url.includes('/events')) richieste.push({ url: req.url, lastEventId: req.headers['last-event-id'] ?? null });
    return app(req, res);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); }));
  return { base: `http://127.0.0.1:${server.address().port}`, registro, server, richieste };
}

async function finche(condizione, messaggio, ms = 10_000) {
  const limite = Date.now() + ms;
  while (!condizione()) {
    if (Date.now() > limite) assert.fail(`tempo scaduto: ${messaggio}`);
    await new Promise((ok) => setTimeout(ok, 20));
  }
}

test('PON-13 col server vero: ?after= alla prima apertura, Last-Event-ID alla riconnessione; nessun buco, nessun doppione, il computer use alla bolla una volta', async (t) => {
  const { base, registro, server, richieste } = await serverVero(t);
  const arrivate = [];
  const allaBolla = [];
  const sorgenti = [];
  /* Come `apriFlussoComputerUse` della pagina principale, con l'EventSource vero. */
  const ascolta = (sessionId, dopo, onEvento, onChiuso) => {
    const query = dopo > 0 ? `?${new URLSearchParams({ after: String(dopo) })}` : '';
    const sorgente = new EventSource(`${base}/api/v1/sessions/${encodeURIComponent(sessionId)}/events${query}`);
    sorgenti.push(sorgente);
    sorgente.onmessage = (m) => {
      let evento;
      try { evento = JSON.parse(m.data); } catch { return; }
      if (typeof evento._sequenza === 'number') arrivate.push(evento._sequenza);
      onEvento(evento);
    };
    sorgente.onerror = () => { if (sorgente.readyState === EventSource.CLOSED) onChiuso(); };
    return () => sorgente.close();
  };
  t.after(() => { for (const s of sorgenti) s.close(); });
  const ponte = creaPonteBolla({ apri: () => ({ postMessage: (m) => { if (m.tipo === 'evento') allaBolla.push(m.evento.name); }, close() {} }), ascolta });

  /* La pagina principale ha visto dal vivo fino alla 3, poi la persona cambia chat. */
  for (const evento of STORIA.slice(0, 3)) ponte.evento(evento, { inRigiocata: false, sessione: SESSIONE });
  assert.deepEqual(allaBolla, ['talos.computer-use-annuncio']);
  ponte.lascia(SESSIONE);
  assert.equal(sorgenti.length, 1, 'un ascolto solo');
  await finche(() => arrivate.includes(5), 'le sequenze 4 e 5 dal server');
  assert.deepEqual(richieste.map((r) => [r.url.split('?')[1] ?? '', r.lastEventId]), [['after=3', null]], 'la prima apertura dice da dove riprendere con ?after=');
  assert.deepEqual(arrivate, [4, 5], 'dopo la 3: niente di già visto');

  /* La connessione cade; mentre è giù il server registra un evento nuovo (la 6). */
  server.closeAllConnections();
  await registro.pubblicaModelloRiassuntoInutilizzabile({ sessionId: SESSIONE, at: '2026-11-05T17:01:00.000Z', modello: 'm', motivo: 'prova', scelto: null });
  await finche(() => arrivate.includes(6), 'la 6 dopo la riconnessione nativa', 15_000);
  const ripresa = richieste.at(-1);
  assert.equal(ripresa.lastEventId, '5', 'la riconnessione nativa manda Last-Event-ID con l ultima sequenza ricevuta');
  await new Promise((ok) => setTimeout(ok, 200));
  assert.deepEqual(arrivate, [4, 5, 6], 'nessun buco e nessun doppione fra le due connessioni');
  assert.deepEqual(allaBolla, ['talos.computer-use-annuncio', 'talos.computer-use-passo', 'talos.computer-use-guarda'], 'il computer use alla bolla una volta sola, in ordine');
  assert.equal(sorgenti.length, 1, 'la riconnessione è dello stesso EventSource, il ponte non ne apre un altro');
  ponte.chiudi();
});
