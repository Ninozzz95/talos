import test from 'node:test';
import assert from 'node:assert/strict';

import { impostaLingua } from '../../src/components/lingua.js';
import { creaContestoTrascrizione, spanDiCodice, trascriviEventoInterno, EVENTI_CONTABILI } from '../../src/components/trascrizione-eventi-interni.js';
import { etichettaSeparatoreContesto } from '../../src/components/context-separator.js';
import { testoRigaCompattazione } from '../../src/components/compattazione-legacy.js';

/*
 * R-04 (17/10/2026): che cosa diventa nel trascritto esportato un evento interno. Le forme sono quelle VERE:
 * - `consumo-fornitore` e `talos.process-output` copiati da una riga dell'archivio del 4174 (`.sessions-store`, letto in sola lettura);
 * - `talos.compattazione` dalle righe vere dello stesso archivio (fase inizio/fine, giro 50);
 * - `talos.context` dalle due funzioni che lo scrivono (`context-engine/src/node/sqlite-worker.mjs:189-199`, `enqueueUsage` e `activate`).
 */
impostaLingua('en');

const consumo = { type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', provider: 'openrouter', model: 'z-ai/glm-5.3-flash', usage: { prompt_tokens: 3183, completion_tokens: 157, total_tokens: 3340, cost: 0.000132895 }, costoDichiarato: 0.000132895, esito: 'completato' }, _sequenza: 3 };
const uscita = { type: 'CUSTOM', name: 'talos.process-output', value: { schema: 'talos.process-output.v1', outputId: '849de2b1-d1cf-4099-ab0c-146b601c58f0', sessionId: 's', runId: 'r', toolCallId: 'call_1', state: 'complete', limitBytes: 67108864, nextSequence: 0 } };
const misura = { type: 'CUSTOM', name: 'talos.context', value: { schema: 'talos.context.event.v1', id: 'usage-ab', sessionId: 's', kind: 'context.usage.recorded', createdAt: '2026-10-12T10:00:00.000Z', payload: { operationId: 'op', usage: { input: 10 } } } };
const versione = { type: 'CUSTOM', name: 'talos.context', value: { schema: 'talos.context.event.v1', id: 'e1', sessionId: 's', jobId: 'j', versionId: 'v1', kind: 'context.version.committed', createdAt: '2026-10-12T10:00:00.000Z', payload: { coveredThrough: 40 } } };
const ripristinata = { ...versione, value: { ...versione.value, id: 'e2', versionId: 'v0', kind: 'context.version.restored' } };
const inizio = { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'inizio', giro: 50, tokenPrima: 200121, soglia: 200000, motivo: 'soglia' } };
const fine = { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', giro: 50, compattato: true, tokenPrima: 200121, tokenDopo: 9998, misura: 'fornitore', coveredThrough: 391, at: '2026-10-04T10:09:28.580Z', modello: 'stealth/space-bunny-alpha', motivo: 'soglia' } };

test('R04-01 — la contabilità del giro resta fuori: consumo del fornitore e uscita dei comandi', () => {
  assert.deepEqual(trascriviEventoInterno(consumo), { omesso: true });
  assert.deepEqual(trascriviEventoInterno(uscita), { omesso: true });
  assert.deepEqual([...EVENTI_CONTABILI].sort(), ['consumo-fornitore', 'talos.process-output']);
});

test('R04-02 — talos.context: la misura resta fuori, la versione compattata o ripristinata ha la frase della chat', () => {
  assert.deepEqual(trascriviEventoInterno(misura), { omesso: true });
  assert.deepEqual(trascriviEventoInterno(versione), { testo: 'Context compacted' });
  assert.deepEqual(trascriviEventoInterno(ripristinata), { testo: 'Context restored' });
  // la stessa frase del separatore della chat, da una fonte sola
  assert.equal(trascriviEventoInterno(versione).testo, etichettaSeparatoreContesto(versione.value));
});

test('R04-03 — talos.compattazione: l\'inizio resta fuori, la fine e l\'annullo hanno la riga della chat coi numeri', () => {
  assert.deepEqual(trascriviEventoInterno(inizio), { omesso: true });
  assert.deepEqual(trascriviEventoInterno(fine), { testo: 'Conversation compacted · 190,123 tokens saved' });
  const fallita = trascriviEventoInterno({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: false, motivo: 'errore: 429 rate limited', at: 'x' } });
  assert.equal(fallita.testo, testoRigaCompattazione({ stato: 'non-riuscita', motivo: 'errore', dettaglio: '429 rate limited' }));
  assert.match(fallita.testo, /^Conversation not summarized · .*\(429 rate limited\)$/u);
  assert.deepEqual(trascriviEventoInterno({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'annullata', at: 'x' } }), { testo: testoRigaCompattazione({ stato: 'annullata' }) });
});

test('R04-04 — AL CONTRARIO: ciò che non si riconosce torna null, cioè prosegue col suo JSON', () => {
  assert.equal(trascriviEventoInterno({ type: 'CUSTOM', name: 'talos.agenti', value: {} }), null);
  assert.equal(trascriviEventoInterno({ type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: true } }), null);
  assert.equal(trascriviEventoInterno({ type: 'CUSTOM', name: 'talos.context', value: { schema: 'altro', kind: 'context.usage.recorded' } }), null);
  assert.equal(trascriviEventoInterno({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'sconosciuta' } }), null);
  assert.equal(trascriviEventoInterno({ type: 'CUSTOM', name: 'talos.compattazione', value: null }), null);
  assert.equal(trascriviEventoInterno({ type: 'StateDelta', name: 'consumo-fornitore' }), null);
  assert.equal(trascriviEventoInterno(null), null);
});

test('R04-05 — in italiano la frase è quella italiana della chat', () => {
  impostaLingua('it');
  try {
    assert.deepEqual(trascriviEventoInterno(versione), { testo: 'Contesto compattato' });
    assert.equal(trascriviEventoInterno(fine).testo, 'Conversazione compattata · 190.123 token risparmiati');
  } finally { impostaLingua('en'); }
});

/* 18/10/2026 — il server MCP che non parte, nel trascritto come in chat (l'evento `talos.mcp-avvio` di `agent-service.mjs`). */
const avvio = (...esiti) => ({ type: 'CUSTOM', name: 'talos.mcp-avvio', value: { id: 'x', esiti } });
const giu = (serverId, motivo = 'spawn npx ENOENT') => ({ serverId, hash: 'h', esito: 'non-partito', motivo });
const su = (serverId) => ({ serverId, hash: 'h', esito: 'collegato' });

test('R04-MCP-01 — un server che non parte: la frase della chat, nome e motivo come codice, e dove si ripara', () => {
  const contesto = creaContestoTrascrizione();
  const r = trascriviEventoInterno(avvio(giu('github'), su('files')), contesto);
  assert.equal(r.testo, 'The MCP server “`github`” did not start (`spawn npx ENOENT.`). The conversation goes on without it; you can fix it in Capability › Connectors.');
});

test('R04-MCP-02 AL CONTRARIO — lo stesso fallimento al giro dopo NON si ridice (come la chat); riparte e ricade: si ridice', () => {
  const contesto = creaContestoTrascrizione();
  assert.ok(trascriviEventoInterno(avvio(giu('github')), contesto).testo);
  assert.deepEqual(trascriviEventoInterno(avvio(giu('github')), contesto), { omesso: true });
  assert.deepEqual(trascriviEventoInterno(avvio(su('github')), contesto), { omesso: true });
  assert.ok(trascriviEventoInterno(avvio(giu('github')), contesto).testo);
});

test('R04-MCP-03 — un nome coi backtick non esce dallo span di codice, e una forma storta resta al JSON', () => {
  const r = trascriviEventoInterno(avvio(giu('a`b``c', '')), creaContestoTrascrizione());
  assert.ok(r.testo.includes('```a`b``c```'), r.testo);
  assert.ok(!r.testo.includes('('), 'without a reason there are no parentheses');
  assert.equal(trascriviEventoInterno({ type: 'CUSTOM', name: 'talos.mcp-avvio', value: { esiti: 'no' } }, creaContestoTrascrizione()), null);
  assert.equal(spanDiCodice('`x`'), '`` `x` ``');
});
