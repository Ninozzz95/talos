/**
 * ⭐⭐⭐ 11/09/2026 — IL REPLAY COALESCENTE DELLA ROTTA /events.
 *
 * Nasce da una misura, non da un'idea: la sessione `8dde6bff` dell'owner ha 34.019 eventi
 * (16.662 `ReasoningMessageContent` + 15.952 `ToolCallArgs`, delta da ~11 caratteri), il
 * server li consegna in 222 ms e la PAGINA ci mette 20,1 s dal clic al primo frame stabile.
 *
 * ⛔ Ogni cura qui è provata ANCHE AL VERSO CONTRARIO: un coalescitore che fonde tutto
 *   passerebbe la prova «i delta si fondono» esattamente come uno giusto. Le prove che
 *   mordono sono le altre quattro: il dal vivo NON si fonde, chiavi diverse NON si fondono,
 *   un tipo non-delta NON si tocca, e `Last-Event-ID` a metà di un gruppo consegna solo la coda.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { creaReplayCoalescente, CAMPO_CHIAVE_PER_TIPO } from '../src/sse-replay-coalescente.mjs';

/** Il pezzo di `iscriviti()` che conta qui: il filtro per `Last-Event-ID` e il replay SINCRONO. */
function rigioca(eventi, ascoltatore, daSequenza = 0) {
  for (const evento of eventi) {
    if (typeof evento._sequenza === 'number' && evento._sequenza <= daSequenza) continue;
    ascoltatore(evento);
  }
}

const args = (id, delta, seq) => ({ type: 'ToolCallArgs', toolCallId: id, delta, _sequenza: seq });
const ragiona = (id, delta, seq) => ({ type: 'ReasoningMessageContent', messageId: id, delta, _sequenza: seq });

test('⭐⭐⭐ i delta contigui della stessa tool-call diventano UN evento, col testo intero e la sequenza dell ULTIMO', () => {
  const spediti = [];
  const replay = creaReplayCoalescente((e) => spediti.push(e));
  rigioca([
    { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'scrivi', _sequenza: 1 },
    args('t1', '{"perc', 2), args('t1', 'orso":', 3), args('t1', '"a.md"}', 4),
    { type: 'ToolCallResult', toolCallId: 't1', content: 'ok', _sequenza: 5 },
  ], replay.ascoltatore);
  replay.fineReplay();

  assert.deepEqual(spediti.map((e) => e.type), ['ToolCallStart', 'ToolCallArgs', 'ToolCallResult']);
  assert.equal(spediti[1].delta, '{"percorso":"a.md"}');
  // ⛔ l'ULTIMA sequenza del gruppo, mai la prima: è l'`id:` del frame SSE e quindi il
  //    Last-Event-ID che il client rimanderà. Con la prima, una riconnessione riceverebbe
  //    di nuovo i delta 3 e 4 e il testo si raddoppierebbe nel bubble.
  assert.equal(spediti[1]._sequenza, 4);
  assert.equal(spediti[1].toolCallId, 't1');
});

test('⭐⭐ lo stesso vale per il ragionamento, e un gruppo di UNO resta l oggetto originale (nessuna copia)', () => {
  const spediti = [];
  const replay = creaReplayCoalescente((e) => spediti.push(e));
  const solo = ragiona('m1', 'penso', 7);
  rigioca([ragiona('m0', 'a', 1), ragiona('m0', 'b', 2), solo], replay.ascoltatore);
  replay.fineReplay();

  assert.equal(spediti.length, 2);
  assert.equal(spediti[0].delta, 'ab');
  assert.equal(spediti[0]._sequenza, 2);
  assert.equal(spediti[1], solo, 'un delta solo non va copiato: è lo stesso oggetto che sta in voce.eventi');
});

test('⛔ AL CONTRARIO (1) — DAL VIVO non si coalesce: due delta dopo fineReplay() restano DUE eventi', () => {
  const spediti = [];
  const replay = creaReplayCoalescente((e) => spediti.push(e));
  rigioca([args('t1', 'a', 1), args('t1', 'b', 2)], replay.ascoltatore);
  replay.fineReplay();
  assert.equal(spediti.length, 1, 'il replay si fonde');

  // da qui in poi è il presente: la grana token-per-token È il prodotto
  replay.ascoltatore(args('t1', 'c', 3));
  replay.ascoltatore(args('t1', 'd', 4));
  assert.equal(spediti.length, 3, 'due delta dal vivo devono restare due eventi');
  assert.deepEqual(spediti.slice(1).map((e) => e.delta), ['c', 'd']);
  assert.deepEqual(spediti.slice(1).map((e) => e._sequenza), [3, 4]);
});

test('⛔ AL CONTRARIO (2) — chiavi DIVERSE non si fondono, e l ordine non cambia mai', () => {
  const spediti = [];
  const replay = creaReplayCoalescente((e) => spediti.push(e));
  // due tool-call intrecciate: nessun riordino, restano quattro gruppi nell'ordine originale
  rigioca([args('t1', 'a', 1), args('t2', 'x', 2), args('t1', 'b', 3), args('t2', 'y', 4)], replay.ascoltatore);
  replay.fineReplay();

  assert.equal(spediti.length, 4);
  assert.deepEqual(spediti.map((e) => [e.toolCallId, e.delta]), [['t1', 'a'], ['t2', 'x'], ['t1', 'b'], ['t2', 'y']]);

  // e due tipi diversi con lo stesso id non sono la stessa cosa
  const altri = [];
  const r2 = creaReplayCoalescente((e) => altri.push(e));
  rigioca([ragiona('u', 'a', 1), { type: 'TextMessageContent', messageId: 'u', delta: 'b', _sequenza: 2 }], r2.ascoltatore);
  r2.fineReplay();
  assert.deepEqual(altri.map((e) => e.type), ['ReasoningMessageContent', 'TextMessageContent']);
});

test('⛔ AL CONTRARIO (3) — un evento che NON porta un delta da concatenare non si tocca mai', () => {
  const spediti = [];
  const replay = creaReplayCoalescente((e) => spediti.push(e));
  const eventi = [
    // ⛔ StateDelta è una patch JSON Patch (RFC 6902): due patch NON si sommano per concatenazione
    { type: 'StateDelta', delta: [{ op: 'add', path: '/a', value: 1 }], _sequenza: 1 },
    { type: 'StateDelta', delta: [{ op: 'add', path: '/b', value: 2 }], _sequenza: 2 },
    { type: 'WorkspaceChanged', percorsi: ['a.txt'], _sequenza: 3 },
    { type: 'WorkspaceChanged', percorsi: ['b.txt'], _sequenza: 4 },
    // del tipo giusto ma senza id: passa intatto invece di sparire in un gruppo
    { type: 'ToolCallArgs', delta: 'orfano', _sequenza: 5 },
  ];
  rigioca(eventi, replay.ascoltatore);
  replay.fineReplay();

  assert.equal(spediti.length, 5);
  for (let i = 0; i < eventi.length; i += 1) assert.equal(spediti[i], eventi[i], `evento ${i} deve passare identico`);
  assert.equal(CAMPO_CHIAVE_PER_TIPO.has('StateDelta'), false);
});

test('⛔ AL CONTRARIO (4) — Last-Event-ID a META di un gruppo: si consegna SOLO la coda, e la sua sequenza', () => {
  const storia = [args('t1', 'a', 1), args('t1', 'b', 2), args('t1', 'c', 3), args('t1', 'd', 4)];
  const spediti = [];
  const replay = creaReplayCoalescente((e) => spediti.push(e));
  rigioca(storia, replay.ascoltatore, 2); // il client aveva già visto fino al 2
  replay.fineReplay();

  assert.equal(spediti.length, 1);
  assert.equal(spediti[0].delta, 'cd', 'mai "abcd": i primi due delta il client li ha già applicati');
  assert.equal(spediti[0]._sequenza, 4);
});

test('⭐⭐⭐ SUI DATI VERI — la concatenazione coalescente e quella evento-per-evento sono IDENTICHE', async () => {
  /*
   * ⛔ Le fixture non bastano: il difetto che questa cura riguarda vive in un file da 34.019
   *   eventi. Se il file dell'owner non c'è (un'altra macchina, uno store ripulito) il test
   *   non fallisce a vuoto: si salta dichiarandolo.
   */
  const { readFileSync, existsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const percorso = fileURLToPath(new URL('../.sessions-store/8dde6bff-c463-4794-b6b9-7ddb4f5ce885.jsonl', import.meta.url));
  if (!existsSync(percorso)) { test.skip?.('lo store con la sessione lunga non è su questa macchina'); return; }

  const eventi = readFileSync(percorso, 'utf8').split('\n').filter(Boolean)
    .map((riga) => JSON.parse(riga)).filter((o) => typeof o.type === 'string');

  const atteso = new Map();
  for (const e of eventi) {
    const campo = CAMPO_CHIAVE_PER_TIPO.get(e.type);
    if (campo === undefined || typeof e.delta !== 'string' || typeof e[campo] !== 'string') continue;
    const k = `${e.type} ${e[campo]}`;
    atteso.set(k, (atteso.get(k) ?? '') + e.delta);
  }

  const ottenuto = new Map();
  let spediti = 0;
  const replay = creaReplayCoalescente((e) => {
    spediti += 1;
    const campo = CAMPO_CHIAVE_PER_TIPO.get(e.type);
    if (campo === undefined || typeof e.delta !== 'string' || typeof e[campo] !== 'string') return;
    const k = `${e.type} ${e[campo]}`;
    ottenuto.set(k, (ottenuto.get(k) ?? '') + e.delta);
  });
  rigioca(eventi, replay.ascoltatore);
  replay.fineReplay();

  assert.equal(atteso.size, ottenuto.size, 'stessi messaggi/tool-call, nessuno perso né inventato');
  for (const [k, v] of atteso) assert.equal(ottenuto.get(k), v, `il testo ricostruito di ${k} deve essere byte-identico`);

  // la ragione per cui esiste tutto questo: il taglio misurato, non stimato
  assert.equal(eventi.length, 34019);
  assert.ok(spediti < eventi.length / 10, `attesi meno di ${Math.round(eventi.length / 10)} eventi spediti, spediti ${spediti}`);
});
