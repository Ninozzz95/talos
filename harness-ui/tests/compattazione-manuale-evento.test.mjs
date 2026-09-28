/*
 * ⛔ Owner, 26/09/2026, con la foto: «avviso spunta anche dopo compattazione». Sotto «Conversazione riassunta» restava
 *   «Il contesto ha superato la soglia (378.705 su 200.000 token)» con «Compatta ora».
 * Una delle due cause sta qui: la compattazione MANUALE («Compatta ora», `registro.compatta`) sostituiva la storia con un
 *   checkpoint e rispondeva `{ ok, compattato }` e basta — nessun evento `talos.compattazione`, nessun numero. La chat non
 *   sapeva che la conversazione era stata ridotta: la riga restava senza «X → Y» e, riaperta la sessione, spariva.
 * La via automatica (`avviaCompattazioneInBackground`) registra già `fase:'fine'` DUREVOLE coi numeri: la manuale fa lo
 *   stesso, con un `at` suo e `annullabile:false` — il suo checkpoint non ha un record da riavvolgere, e un «Annulla» che
 *   non può funzionare non si offre.
 * Stessa forma di Pi (`agent-session.ts:3865-3890`) e Hermes (`conversation_compression.py:3468-3470`): dopo una
 *   compattazione la misura vecchia NON vale più; qui il server dice almeno la stima del «dopo».
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
const STORIA = [
  { role: 'system', content: 's' },
  { role: 'user', content: 'ciao' },
  { role: 'assistant', content: lungo(4000) },
  { role: 'user', content: 'continua' },
  { role: 'assistant', content: lungo(4000) },
];
const RIASSUNTA = [{ role: 'system', content: 's' }, { role: 'user', content: 'Riassunto: abbiamo parlato di tokenizer.' }];

async function prepara_(compattaSessioneFn) {
  const giro = giroFinto();
  const registro = createSessionRegistry({
    avviaSessioneFn: giro.avviaSessioneFn, preparaEsecuzioneFn: prepara, compattaSessioneFn,
    modello: 'z-ai/glm-5.3-flash', chiave: 'k', clock: () => new Date('2026-09-26T12:00:00.000Z'),
  });
  const { sessionId } = registro.avvia('task-vero');
  giro.concludi(STORIA);
  await new Promise((r) => setImmediate(r));
  const eventi = [];
  registro.iscriviti(sessionId, (e) => eventi.push(e));
  return { registro, sessionId, eventi };
}

test('CTX-MANUAL-EVENT-01 — la compattazione manuale riuscita registra `talos.compattazione` fine, coi numeri e un `at` non annullabile', async () => {
  const { registro, sessionId, eventi } = await prepara_(async () => ({ compattato: true, messaggi: RIASSUNTA, usage: null }));
  const esito = await registro.compatta(sessionId);
  assert.equal(esito.ok, true);
  assert.equal(esito.compattato, true);
  assert.equal(esito.at, '2026-09-26T12:00:00.000Z', 'la risposta porta lo stesso `at` dell\'evento: POST ed evento aggiornano la STESSA riga');
  const fine = eventi.filter((e) => e?.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value?.fase === 'fine');
  assert.equal(fine.length, 1, `eventi di fine: ${fine.length}`);
  const v = fine[0].value;
  assert.equal(v.compattato, true);
  assert.equal(v.motivo, 'manuale');
  assert.equal(v.annullabile, false);
  assert.equal(v.at, esito.at);
  assert.ok(Number.isSafeInteger(v.tokenPrima) && v.tokenPrima > 0, `tokenPrima ${v.tokenPrima}`);
  assert.ok(Number.isSafeInteger(v.tokenDopo) && v.tokenDopo > 0 && v.tokenDopo < v.tokenPrima, `tokenDopo ${v.tokenDopo} < ${v.tokenPrima}`);
  assert.equal(esito.tokenPrima, v.tokenPrima);
  assert.equal(esito.tokenDopo, v.tokenDopo);
});

test('CTX-MANUAL-EVENT-02 — AL CONTRARIO: una compattazione che non riassume non registra una «fine riuscita»', async () => {
  const { registro, sessionId, eventi } = await prepara_(async () => ({ compattato: false, messaggi: STORIA, usage: null }));
  const esito = await registro.compatta(sessionId);
  assert.deepEqual(esito, { ok: true, compattato: false });
  assert.equal(eventi.some((e) => e?.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value?.compattato === true), false);
});
