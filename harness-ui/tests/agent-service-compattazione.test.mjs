/*
 * F3, onda 2 di F2 (24/09/2026) — `agent-service.mjs::onGiro` traduce gli eventi di compattazione dell'adapter
 * (`compattazione-inizio` / `compattazione-fine`, rapporto F1 §6) in un evento AG-UI persistito
 * `CUSTOM talos.compattazione`, coi NUMERI per la UI (decisione 6: «X → Y token» con Annulla). Ermetico.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { avviaSessione, riassumiPerCompattazione } from '../src/agent-service.mjs';
import { creaRecord } from '../src/kernel/compattazione-desktop.mjs';

test('CTX-REG-AGENT-SERVICE-COMPACTION-EVENTS — inizio e fine della compattazione diventano CUSTOM talos.compattazione con i numeri, senza il riassunto', async () => {
  const eventi = [];
  const record = creaRecord({ coveredThrough: 7, riassunto: [{ role: 'user', content: 'RIASSUNTO LUNGO '.repeat(50) }], tokenPrima: 9_000, tokenDopo: 700, misura: 'fornitore', at: '2026-09-24T10:00:00.000Z', modello: 'z-ai/glm-5.3-flash' });
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async ({ onGiro }) => {
      onGiro({ giro: 2, tipo: 'compattazione-inizio', tokenMisurati: 9_000, soglia: 8_000, motivo: 'soglia' });
      onGiro({ giro: 2, tipo: 'compattazione-fine', compattato: true, record });
      onGiro({ giro: 3, tipo: 'compattazione-inizio', tokenMisurati: 9_500, soglia: 8_000, motivo: 'emergenza' });
      onGiro({ giro: 3, tipo: 'compattazione-fine', compattato: false, motivo: 'troncato' });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [record] };
    },
  });
  const custom = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione').map((e) => e.value);
  assert.equal(custom.length, 4, `attesi 4 eventi, visti ${JSON.stringify(custom)}`);
  assert.deepEqual(custom[0], { fase: 'inizio', giro: 2, tokenPrima: 9_000, soglia: 8_000, motivo: 'soglia' });
  assert.deepEqual(custom[1], { fase: 'fine', giro: 2, compattato: true, tokenPrima: 9_000, tokenDopo: 700, misura: 'fornitore', coveredThrough: 7, at: record.at, modello: 'z-ai/glm-5.3-flash', motivo: 'soglia' });
  assert.equal(custom[1].record, undefined, 'il riassunto NON viaggia nell’evento: sta nella riga `compattazione` del journal (una fonte sola)');
  assert.deepEqual(custom[2], { fase: 'inizio', giro: 3, tokenPrima: 9_500, soglia: 8_000, motivo: 'emergenza' });
  assert.deepEqual(custom[3], { fase: 'fine', giro: 3, compattato: false, motivo: 'troncato' });
  const indiceInizio = eventi.findIndex((e) => e.name === 'talos.compattazione');
  const indiceFinale = eventi.findIndex((e) => e.type === 'RunFinished');
  assert.ok(indiceInizio > 0 && indiceInizio < indiceFinale, 'gli eventi stanno dentro il giro, prima di RunFinished');
});

test('CTX-REG-AGENT-SERVICE-SUMMARY-CALL — riassumiPerCompattazione chiama il modello SENZA attrezzi, col tetto di uscita e il ragionamento passato', async () => {
  let body = null;
  const fetchDiRete = async (_url, init) => { body = JSON.parse(init.body); return Response.json({ choices: [{ message: { role: 'assistant', content: 'SINTESI' }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 3 } }); };
  const esito = await riassumiPerCompattazione({ modello: 'z-ai/glm-5.3-flash', chiave: 'k', messaggi: [{ role: 'user', content: 'riassumi' }], maxOutputTokens: 2_048, reasoning: { effort: 'low' }, fetchDiRete });
  assert.equal(esito.scelta.content, 'SINTESI');
  assert.equal(esito.finishReason, 'stop');
  assert.equal(esito.usage.prompt_tokens, 12);
  assert.deepEqual(body.tools ?? [], []);
  assert.equal(body.max_tokens, 2_048);
  assert.deepEqual(body.reasoning, { effort: 'low' });
});
