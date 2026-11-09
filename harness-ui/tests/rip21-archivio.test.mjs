/*
 * RIP-3 (ripassata del Blocco 21, 01/11/2026): la riga dell'elenco contro la scheda Contesto quando l'evento `context.archive.set-aside` non arriva al giornale.
 * L'annuncio sta nella transazione di `setAsideSession` e nella coda degli eventi: se il giornale non scrive, o il processo muore prima di consegnare, lo si riprova.
 * Servizio, store e registro veri, come EC-11.
 */
import assert from 'node:assert/strict';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { compattazioniDellaConversazione } from '../frontend/src/components/contesto-scheda.js';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const ora = '2026-11-01T10:00:00.000Z';
const versioneCommitted = (sessionId, id) => ({ schema: 'talos.context.event.v1', id: `e-${id}`, sessionId, versionId: `v-${id}`, jobId: `j-${id}`, kind: 'context.version.committed', createdAt: ora, payload: { coveredThrough: 1 } });
const conta = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };
const prima = [{ role: 'user', content: 'uno' }, { role: 'assistant', content: 'due' }, { role: 'user', content: 'tre' }];
const dopo = [prima[0], { role: 'assistant', content: 'due, riscritto' }, prima[2]];

function banco(t) {
  const radice = realpathSync.native(cartellaDiProva('talos-rip21-arch-'));
  const store = join(radice, 'store'); mkdirSync(store, { recursive: true });
  const cartella = join(radice, 'AVM'); mkdirSync(cartella, { recursive: true });
  const registri = [];
  const nuovoRegistro = () => {
    const r = createSessionRegistry({
      guardaWorkspaceFn: () => () => {},
      avviaSessioneFn: async (input) => { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); return { ok: true, esito: { messaggiFinali: [] } }; },
      preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
      cartellaStore: store, modello: 'z-ai/glm-5.3-flash', chiave: 'k', motoreContestoPerNuoveFn: () => 'engine',
    });
    registri.push(r);
    return r;
  };
  t.after(async () => { for (const r of registri) await r.chiudi({ attesaMassimaMs: 2000 }); });
  const servizio = (m, db, onEvent) => {
    const engine = createContextEngine({ store: db, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: conta, clock: () => ora });
    const service = createDesktopContextService({ store: db, engine, readSession: (id) => (id === m ? { sessionId: id, modello: 'local:test' } : null), isSessionEnabled: (id) => id === m,
      resolveSessionModel: async () => MODELLO, onEvent, clock: () => ora });
    t.after(() => service.close());
    return service;
  };
  return { radice, nuovoRegistro, servizio };
}
const avviaConDueCompattazioni = async (registro) => {
  const { sessionId: m } = registro.avvia('task-vero');
  await new Promise((r) => setImmediate(r));
  return m;
};
const riga = (r, m) => r.elenca().find((x) => x.sessionId === m).compattazioni;
const scheda = async (service, m) => compattazioniDellaConversazione({ motore: await service.request({ sessionId: m, method: 'GET', path: '/' }) }).numero;

test('RIP21-D — l\'evento di set-aside non consegnato una volta: tornato il giornale la coda lo riprova, e elenco e scheda dicono lo stesso numero, anche dopo il riavvio', async (t) => {
  const b = banco(t);
  const registro = b.nuovoRegistro();
  const m = await avviaConDueCompattazioni(registro);
  const db = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => db.close());
  let giornaleGiu = false;
  const service = b.servizio(m, db, (x) => { if (giornaleGiu && x.event.kind === 'context.archive.set-aside') throw new Error('ENOSPC'); return registro.pubblicaEventoContesto(x); });
  const hooks = await service.createKernelHooks({ sessionId: m, runId: 'giro-1' });
  await hooks.prepare({ messages: prima, originali: prima, tools: [] });
  await registro.pubblicaEventoContesto({ sessionId: m, event: versioneCommitted(m, 1) });
  await registro.pubblicaEventoContesto({ sessionId: m, event: versioneCommitted(m, 2) });
  giornaleGiu = true;
  const esito = await hooks.prepare({ messages: dopo, originali: dopo, tools: [] });
  assert.ok(esito.riallineato, 'premessa: riparato');
  assert.equal(riga(registro, m), 2, 'premessa: il giornale non ha preso l\'evento');
  giornaleGiu = false;
  /* il giornale è tornato e la conversazione va avanti: nessuna riparazione nuova, quindi nessun evento nuovo */
  const seguito = [...dopo, { role: 'assistant', content: 'quattro' }, { role: 'user', content: 'cinque' }];
  const ancora = await hooks.prepare({ messages: seguito, originali: seguito, tools: [] });
  assert.equal(ancora.riallineato, undefined, 'premessa: non c\'è una «riparazione dopo»');
  const numero = await scheda(service, m);
  assert.equal(numero, 0);
  assert.equal(riga(registro, m), numero);
  await registro.chiudi({ attesaMassimaMs: 5000 });
  const secondo = b.nuovoRegistro();
  await secondo.ripristina();
  assert.equal(riga(secondo, m), numero, 'due numeri per la stessa conversazione: la condizione 3 del contratto');
});

test('RIP22-D2 — il processo muore dopo lo spostamento e prima della consegna: l\'annuncio è sul disco, e alla prima apertura della scheda i due numeri tornano uguali', async (t) => {
  const b = banco(t);
  const databasePath = join(b.radice, 'context.sqlite');
  const registro = b.nuovoRegistro();
  const m = await avviaConDueCompattazioni(registro);
  const db = createSqliteContextStore({ databasePath });
  /* la consegna che non arriva mai: per il giornale è come se il processo fosse morto subito dopo la transazione */
  const service = b.servizio(m, db, (x) => { if (x.event.kind === 'context.archive.set-aside') throw new Error('il processo è morto'); return registro.pubblicaEventoContesto(x); });
  const hooks = await service.createKernelHooks({ sessionId: m, runId: 'giro-1' });
  await hooks.prepare({ messages: prima, originali: prima, tools: [] });
  await registro.pubblicaEventoContesto({ sessionId: m, event: versioneCommitted(m, 1) });
  await registro.pubblicaEventoContesto({ sessionId: m, event: versioneCommitted(m, 2) });
  assert.ok((await hooks.prepare({ messages: dopo, originali: dopo, tools: [] })).riallineato, 'premessa: riparato');
  await service.close();
  await db.close();
  await registro.chiudi({ attesaMassimaMs: 5000 });

  const secondo = b.nuovoRegistro();
  await secondo.ripristina();
  assert.equal(riga(secondo, m), 2, 'premessa: dopo il riavvio il giornale non lo sa ancora');
  const riaperto = createSqliteContextStore({ databasePath });
  t.after(() => riaperto.close());
  const nuovo = b.servizio(m, riaperto, (x) => secondo.pubblicaEventoContesto(x));
  const numero = await scheda(nuovo, m);
  assert.equal(numero, 0);
  assert.equal(riga(secondo, m), numero);
  await secondo.chiudi({ attesaMassimaMs: 5000 });
  const terzo = b.nuovoRegistro();
  await terzo.ripristina();
  assert.equal(riga(terzo, m), numero, 'scritto sul giornale: non serve più riprovarlo');
});
