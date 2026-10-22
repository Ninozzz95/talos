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

test('CTX-REG-AGENT-SERVICE-INSTANT — lo scambio istantaneo (nessun `inizio`) arriva al giornale col suo motivo e `istantanea: true`; AL CONTRARIO una fine normale resta com era', async () => {
  const eventi = [];
  const record = creaRecord({ coveredThrough: 5, riassunto: [{ role: 'user', content: 'R' }], tokenPrima: 9_000, tokenDopo: 700, misura: 'fornitore', at: '2026-10-15T22:00:00.000Z', modello: 'z-ai/glm-5.3-flash' });
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async ({ onGiro }) => {
      onGiro({ giro: 4, tipo: 'compattazione-fine', compattato: true, record, istantanea: true, motivo: 'soglia' });
      onGiro({ giro: 5, tipo: 'compattazione-inizio', tokenMisurati: 9_500, soglia: 8_000, motivo: 'emergenza' });
      onGiro({ giro: 5, tipo: 'compattazione-fine', compattato: true, record });
      onGiro({ giro: 6, tipo: 'compattazione-fine', compattato: true, record, motivo: 'non-istantanea' });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [record] };
    },
  });
  const fini = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine').map((e) => e.value);
  assert.equal(fini[0].istantanea, true);
  assert.equal(fini[0].motivo, 'soglia', 'il motivo lo porta lo scambio stesso');
  assert.equal(fini[1].istantanea, undefined, 'una fine normale non diventa istantanea');
  assert.equal(fini[1].motivo, 'emergenza', 'e il motivo resta quello del suo inizio');
  assert.equal(fini[2].motivo, null, 'un motivo sulla fine NON istantanea non si legge: il contratto di prima');
});

test('CTX-REG-AGENT-SERVICE-REST-FAILED — sulla riga della base adottata il perché del resto arriva al giornale, ridotto ai campi di codice; AL CONTRARIO senza resto non compare', async () => {
  const eventi = [];
  const record = creaRecord({ coveredThrough: 5, riassunto: [{ role: 'user', content: 'R' }], tokenPrima: 9_000, tokenDopo: 700, misura: 'fornitore', at: '2026-10-22T15:00:00.000Z', modello: 'z-ai/glm-5.3-flash' });
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async ({ onGiro }) => {
      onGiro({ giro: 3, tipo: 'compattazione-inizio', tokenMisurati: 9_500, soglia: 8_000, motivo: 'emergenza' });
      onGiro({ giro: 3, tipo: 'compattazione-fine', compattato: true, record, istantanea: true, motivo: 'emergenza',
        restoNonRiuscito: { motivo: 'x'.repeat(200), interrottaIn: 'riassunto', classe: 'server_error', fallimentiConsecutivi: 2, testo: 'testo del fornitore' } });
      onGiro({ giro: 4, tipo: 'compattazione-fine', compattato: true, record, istantanea: true, motivo: 'soglia' });
      onGiro({ giro: 5, tipo: 'compattazione-fine', compattato: true, record, istantanea: true, motivo: 'soglia', restoNonRiuscito: 'non un oggetto' });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [record] };
    },
  });
  const fini = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine').map((e) => e.value);
  assert.deepEqual(fini[0].restoNonRiuscito, { motivo: 'x'.repeat(64), interrottaIn: 'riassunto', classe: 'server_error', fallimentiConsecutivi: 2 },
    'il perché arriva, tagliato, e i campi che non sono di codice restano fuori');
  assert.equal(fini[0].compattato, true, 'la riga resta quella della base');
  assert.equal(fini[1].restoNonRiuscito, undefined, 'senza resto non compare');
  assert.equal(fini[2].restoNonRiuscito, undefined, 'un valore che non è un oggetto non passa');
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

/* R-05 fino in fondo (12/10/2026): nel trascritto dell'owner (36289618) la riga del ripiego non diceva la causa. Il codice e il
   «dove» (posizioni e ruolo, mai contenuto) ora arrivano all'evento; senza, l'evento resta identico a prima. */
test('CTX-REG-AGENT-SERVICE-COMPACTION-CAUSE — codice e dettaglio del ripiego e del riallineo arrivano all’evento, solo se ci sono', async () => {
  const eventi = [];
  const DOVE = { archiviati: 12, attivi: 14, primoDiverso: 7, forma: 'riscritta', ruolo: 'assistant' };
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async ({ onGiro }) => {
      onGiro({ giro: 1, tipo: 'compattazione-fine', compattato: false, motivo: 'ripiego', codice: 'CTX_HISTORY_DIVERGED', dettaglio: DOVE });
      onGiro({ giro: 2, tipo: 'compattazione-fine', compattato: false, motivo: 'archivio-riallineato', codice: 'CTX_HISTORY_DIVERGED', dettaglio: DOVE });
      onGiro({ giro: 3, tipo: 'compattazione-fine', compattato: false, motivo: 'troncato', codice: null, dettaglio: [1] });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [] };
    },
  });
  const custom = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione').map((e) => e.value);
  assert.deepEqual(custom[0], { fase: 'fine', giro: 1, compattato: false, motivo: 'ripiego', codice: 'CTX_HISTORY_DIVERGED', dettaglio: DOVE });
  assert.equal(custom[1].motivo, 'archivio-riallineato');
  assert.deepEqual(custom[2], { fase: 'fine', giro: 3, compattato: false, motivo: 'troncato' }, 'al contrario: niente codice né dettaglio inventati');
});

test('CTX-REG-AGENT-SERVICE-PREPARED — i riassunti preparati in sottofondo (pagati) restano nel giornale: inizio, pronta, scartata col perché', async () => {
  const eventi = [];
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (e, opzioni) => { eventi.push({ e, durevole: opzioni?.durable === true }); },
    talosLavoraFn: async ({ onGiro }) => {
      onGiro({ giro: 3, tipo: 'compattazione-preparata', fase: 'inizio', motivo: 'precalcolo', tokenMisurati: 48_100 });
      onGiro({ giro: 5, tipo: 'compattazione-preparata', fase: 'scartata', motivo: 'prefix-changed', tokenMisurati: 61_000 });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [] };
    },
  });
  const preparate = eventi.filter(({ e }) => e.type === 'CUSTOM' && e.name === 'talos.compattazione-preparata');
  assert.deepEqual(preparate.map(({ e }) => e.value), [
    { giro: 3, fase: 'inizio', motivo: 'precalcolo', tokenMisurati: 48_100 },
    { giro: 5, fase: 'scartata', motivo: 'prefix-changed', tokenMisurati: 61_000 },
  ]);
  assert.ok(preparate.every(({ durevole }) => durevole), 'durevoli: sono riassunti pagati');
  assert.equal(eventi.filter(({ e }) => e.name === 'talos.compattazione').length, 0, 'e non diventano compattazioni per l interfaccia');
});
