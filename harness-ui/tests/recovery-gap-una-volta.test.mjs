/*
 * ⛔ Trovato dalla CLI (26/10/2026, sulla COPIA dell'archivio vero dell'owner, 134 giornali): una conversazione madre rimasta
 *   `interrotta` (morta a metà giro) riceveva un record `grafo-agenti` «recovery-gap» (~10 KB) a OGNI ripristino, anche senza nessun
 *   cambiamento — una delle due ne portava già 39 uguali, l'altra 8. `voce.interrotta` resta vera per sempre (al ripristino è
 *   `!conclusa`), quindi la condizione `voce.interrotta || …` non convergeva mai. Effetti: i giornali crescono a ogni avvio del server
 *   (e a ogni `talos session list` della CLI, che ripristina), e l'indice della lista della CLI, legato a (dimensione, mtime) del
 *   giornale, non era MAI fresco (3,4 s a lista sulla copia, minuti sul PC dell'owner).
 * Cura: si confronta con lo stato GIÀ registrato nell'ultimo nodo, come per `conclusa` — il primo ripristino dopo il guasto registra il
 *   buco UNA volta; i seguenti no; una conversazione ripresa e interrotta di nuovo lo registra di nuovo.
 */
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MADRE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const FIGLIA = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const CONCLUSA = 'cccccccc-3333-4333-8333-cccccccccccc';

function scriviSessione(cartellaStore, sessionId, { padreId = null, conclusa, cartella, avviataAlle }) {
  let sequenza = 0;
  const evento = (type, extra = {}) => ({ type, _sequenza: ++sequenza, ...extra });
  const righe = [
    { tipo: 'intestazione', schema: 1, sessionId, taskId: padreId ? `delega:${padreId}` : 'libero:coda', cartella,
      task: { consegna: `Compito ${sessionId.slice(0, 4)}`, consegnaCorta: `Compito ${sessionId.slice(0, 4)}` }, comandoProva: null, forkDa: null, avviataAlle,
      modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: 'medium', mobile: false, permessi: 'Full access', permessiPerAttrezzo: null,
      padreId, profonditaDelega: padreId ? 1 : 0, provider: 'cloud', runtimeId: null, modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true },
    evento('RunStarted', { threadId: sessionId, runId: 'r1' }),
    evento('TextMessageStart', { messageId: `m-${sessionId}`, role: 'assistant' }),
    evento('TextMessageContent', { messageId: `m-${sessionId}`, delta: 'lavoro in corso' }),
    evento('TextMessageEnd', { messageId: `m-${sessionId}` }),
  ];
  if (conclusa) righe.push(evento('RunFinished', { threadId: sessionId, runId: 'r1', result: { detto: 'fatto' } }));
  writeFileSync(join(cartellaStore, `${sessionId}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
}
const nodo = (rootId, seq, node, event = 'started') => ({ tipo: 'grafo-agenti', schema: 'talos.agent-timeline.v1', rootId, seq, at: `2026-10-20T09:00:${String(seq).padStart(2, '0')}.000Z`, coverage: 'complete', event, sourceSeq: null, node });

/** La madre morta a metà giro (l'ultimo nodo registrato la diceva viva: `interrotta:false, conclusa:false`), con una figlia conclusa. */
function archivio(t, { gapGiaRegistrati = 0 } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'gap-store-'));
  const cartella = mkdtempSync(join(tmpdir(), 'gap-lavoro-'));
  t.after(async () => { await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  scriviSessione(cartellaStore, MADRE, { conclusa: false, cartella, avviataAlle: '2026-10-20T09:00:00.000Z' });
  scriviSessione(cartellaStore, FIGLIA, { padreId: MADRE, conclusa: true, cartella, avviataAlle: '2026-10-20T09:01:00.000Z' });
  scriviSessione(cartellaStore, CONCLUSA, { conclusa: true, cartella, avviataAlle: '2026-10-20T09:05:00.000Z' });
  const righe = [nodo(MADRE, 1, { sessionId: MADRE, conclusa: false, interrotta: false }), nodo(MADRE, 2, { sessionId: FIGLIA, padreId: MADRE, conclusa: true, interrotta: false })];
  for (let i = 0; i < gapGiaRegistrati; i += 1) righe.push(nodo(MADRE, 3 + i, { sessionId: MADRE, conclusa: false, interrotta: true }, 'recovery-gap'));
  appendFileSync(join(cartellaStore, `${MADRE}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
  return { cartellaStore, cartella };
}
const registro = (cartellaStore) => createSessionRegistry({
  cartellaStore, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'z-ai/glm-5.3-flash', chiave: 'finta',
  clock: () => new Date('2026-10-26T12:00:00.000Z'),
});
const gapsDi = (cartellaStore, sessionId = MADRE) => readFileSync(join(cartellaStore, `${MADRE}.jsonl`), 'utf8').split('\n').filter(Boolean)
  .map((r) => JSON.parse(r)).filter((r) => r.tipo === 'grafo-agenti' && r.event === 'recovery-gap' && r.node?.sessionId === sessionId);
async function ripristino(cartellaStore) {
  const reg = registro(cartellaStore);
  await reg.ripristina();
  await attendiScritture({ cartellaStore });
  return reg;
}

test('GAP-01 la madre interrotta: il PRIMO ripristino dopo il guasto registra il buco una volta, i seguenti non fanno crescere il giornale', async (t) => {
  const { cartellaStore } = archivio(t);
  await ripristino(cartellaStore);
  const dopoIlPrimo = gapsDi(cartellaStore);
  assert.equal(dopoIlPrimo.length, 1, 'il buco del guasto si registra (una volta)');
  assert.equal(dopoIlPrimo[0].node.interrotta, true);
  const byte = statSync(join(cartellaStore, `${MADRE}.jsonl`)).size;
  for (let i = 0; i < 3; i += 1) await ripristino(cartellaStore);
  assert.equal(gapsDi(cartellaStore).length, 1, 'nessun buco nuovo: niente è cambiato');
  assert.equal(statSync(join(cartellaStore, `${MADRE}.jsonl`)).size, byte, 'il giornale della madre ha la stessa dimensione, byte per byte');
});

test('GAP-02 i buchi uguali già sul disco (39 e 8 sull\'archivio dell\'owner) non ne chiamano un altro, e la linea del tempo si legge', async (t) => {
  const { cartellaStore } = archivio(t, { gapGiaRegistrati: 5 });
  const byte = statSync(join(cartellaStore, `${MADRE}.jsonl`)).size;
  const reg = await ripristino(cartellaStore);
  assert.equal(gapsDi(cartellaStore).length, 5, 'nessun sesto');
  assert.equal(statSync(join(cartellaStore, `${MADRE}.jsonl`)).size, byte);
  const linea = await reg.timelineAgenti(MADRE);
  assert.ok(linea && Array.isArray(linea.items ?? linea.nodi ?? linea.nodes ?? []), 'la linea del tempo con i doppioni vecchi si legge ancora');
});

test('GAP-03 AL CONTRARIO: ripresa e interrotta DI NUOVO, la madre riceve il suo nuovo buco', async (t) => {
  const { cartellaStore } = archivio(t);
  await ripristino(cartellaStore);
  assert.equal(gapsDi(cartellaStore).length, 1);
  /* un giro nuovo l'ha registrata viva (come fa `registraTimeline` al RunStarted), poi il server è morto di nuovo */
  appendFileSync(join(cartellaStore, `${MADRE}.jsonl`), `${JSON.stringify(nodo(MADRE, 40, { sessionId: MADRE, conclusa: false, interrotta: false }, 'RunStarted'))}\n`, 'utf8');
  await ripristino(cartellaStore);
  assert.equal(gapsDi(cartellaStore).length, 2, 'il secondo guasto è un buco nuovo');
});

test('GAP-04 AL CONTRARIO: una conversazione conclusa non riceve buchi, e una figlia senza nodo riceve il suo (come prima)', async (t) => {
  const { cartellaStore } = archivio(t);
  const reg = await ripristino(cartellaStore);
  assert.equal(gapsDi(cartellaStore, FIGLIA).length, 0, 'la figlia ha già il suo nodo, conclusa com\'è');
  assert.ok(reg.elenca().some((r) => r.sessionId === CONCLUSA));
});
