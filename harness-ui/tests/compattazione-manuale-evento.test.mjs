/*
 * ⛔ Owner, 26/09/2026, con la foto: «avviso spunta anche dopo compattazione». Sotto «Conversazione riassunta» restava
 *   «Il contesto ha superato la soglia (378.705 su 200.000 token)» con «Compatta ora».
 * Una delle due cause sta qui: la compattazione MANUALE («Compatta ora», `registro.compatta`) rispondeva `{ ok, compattato }` e
 *   basta — nessun evento `talos.compattazione`, nessun numero. Ora registra `fase:'fine'` DUREVOLE coi numeri, come la via
 *   automatica, con lo stesso `at` della risposta.
 * 22/10/2026 (CLI, S2-A; owner «cura completa»): la manuale non sostituisce più la storia — scrive un RECORD come la via automatica,
 *   quindi ora è ANNULLABILE (`annullabile:true`, lo stesso `at` del record) e la storia grezza resta intera.
 * Stessa forma di Pi (`agent-session.ts:3865-3890`) e Hermes (`conversation_compression.py:3468-3470`): dopo una compattazione la
 *   misura vecchia NON vale più; qui il server dice almeno la stima del «dopo».
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';

const createSessionRegistry = (opzioni) => createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, ...opzioni });
const prepara = () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } });

function giroFinto() {
  let fine; let onEvento;
  return {
    avviaSessioneFn: async (input) => { onEvento = input.onEvento; onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return new Promise((ok) => { fine = ok; }); },
    concludi(storia) { onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); fine({ ok: true, esito: { messaggiFinali: storia } }); },
  };
}

const lungo = (n) => 'parola '.repeat(n);
/* Quattro scambi: i due ultimi restano alla lettera, i due primi si riassumono (con due soli scambi non c'è niente da riassumere). */
const STORIA = [
  { role: 'system', content: 's' },
  { role: 'user', content: 'ciao' },
  { role: 'assistant', content: lungo(4000) },
  { role: 'user', content: 'continua' },
  { role: 'assistant', content: lungo(4000) },
  { role: 'user', content: 'ancora' },
  { role: 'assistant', content: 'breve' },
  { role: 'user', content: 'fine' },
  { role: 'assistant', content: 'ok' },
];
const risposta = (content, finishReason = 'stop') => ({ scelta: { role: 'assistant', content }, finishReason, usage: null });

async function prepara_(riassumiPerCompattazioneFn, storia = STORIA) {
  const giro = giroFinto();
  const registro = createSessionRegistry({
    avviaSessioneFn: giro.avviaSessioneFn, preparaEsecuzioneFn: prepara, riassumiPerCompattazioneFn,
    modello: 'z-ai/glm-5.3-flash', chiave: 'k', clock: () => new Date('2026-09-26T12:00:00.000Z'),
  });
  const { sessionId } = registro.avvia('task-vero');
  giro.concludi(storia);
  await new Promise((r) => setImmediate(r));
  const eventi = [];
  registro.iscriviti(sessionId, (e) => eventi.push(e));
  return { registro, sessionId, eventi };
}

test('CTX-MANUAL-EVENT-01 — la compattazione manuale riuscita registra `talos.compattazione` fine, coi numeri e un `at` ANNULLABILE (è un record)', async () => {
  const { registro, sessionId, eventi } = await prepara_(async () => risposta('## Riassunto\nabbiamo parlato di tokenizer.'));
  const esito = await registro.compatta(sessionId);
  assert.equal(esito.ok, true);
  assert.equal(esito.compattato, true);
  assert.equal(esito.at, '2026-09-26T12:00:00.000Z', 'la risposta porta lo stesso `at` dell\'evento: POST ed evento aggiornano la STESSA riga');
  const fine = eventi.filter((e) => e?.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value?.fase === 'fine');
  assert.equal(fine.length, 1, `eventi di fine: ${fine.length}`);
  const v = fine[0].value;
  assert.equal(v.compattato, true);
  assert.equal(v.motivo, 'manuale');
  assert.equal(v.annullabile, true, 'il /compact scrive un record: «Annulla» lo riavvolge come quello di fine giro');
  assert.equal(esito.annullabile, true);
  assert.equal(v.at, esito.at);
  assert.equal(v.coveredThrough, STORIA.length, 'copre tutta la storia');
  assert.ok(Number.isSafeInteger(v.tokenPrima) && v.tokenPrima > 0, `tokenPrima ${v.tokenPrima}`);
  assert.ok(Number.isSafeInteger(v.tokenDopo) && v.tokenDopo > 0 && v.tokenDopo < v.tokenPrima, `tokenDopo ${v.tokenDopo} < ${v.tokenPrima}`);
  assert.equal(esito.tokenPrima, v.tokenPrima);
  assert.equal(esito.tokenDopo, v.tokenDopo);
  assert.equal(registro.statoCompattazione(sessionId).record?.at, esito.at, 'il record vivo è quello del /compact');
  const annullo = await registro.annullaCompattazione(sessionId, esito.at);
  assert.equal(annullo.ok, true, `annulla: ${JSON.stringify(annullo)}`);
  assert.equal(registro.statoCompattazione(sessionId).record, null);
});

test('CTX-MANUAL-EVENT-02 — AL CONTRARIO: una compattazione che non riassume non registra una «fine riuscita», e dice perché', async () => {
  const { registro, sessionId, eventi } = await prepara_(async () => risposta(''));
  const esito = await registro.compatta(sessionId);
  /* `fase` (lane CLI, 03/10/2026): un riassunto che non è venuto si è fermato al riassunto; `motivo` come il kernel (D5 a, 21/10). */
  assert.deepEqual(esito, { ok: true, compattato: false, fase: 'riassunto', motivo: 'vuoto' });
  assert.equal(eventi.some((e) => e?.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value?.compattato === true), false);
  assert.equal(registro.statoCompattazione(sessionId).record, null, 'nessun record');
});

test('CTX-MANUAL-EVENT-03 — una conversazione di due soli scambi non ha niente da riassumere: lo dice, senza chiamare il modello', async () => {
  let chiamate = 0;
  const { registro, sessionId } = await prepara_(async () => { chiamate += 1; return risposta('x'); }, STORIA.slice(0, 5));
  assert.deepEqual(await registro.compatta(sessionId), { ok: true, compattato: false, fase: 'riassunto', motivo: 'niente-da-compattare' });
  assert.equal(chiamate, 0);
});
