/*
 * C1 (owner 09/10/2026 sera, «Sì, Opus 5.5 alto») — IL MOTORE DEL CONTESTO LEGGE IL GIORNALE DI OGGI. Trovato dalla CLI e dal
 *   bugfixer l'08/10 sulla 4176: una conversazione nata a motore spento, a motore acceso, moriva al 2° giro con
 *   `CTX_LEGACY_NO_CHECKPOINT`. `context-engine/src/node/legacy-import.mjs` conosceva solo `messaggi-finali`/`checkpoint-ripresa`,
 *   e il registro dal 24/09 scrive `checkpoint {storia}` + `messaggi-delta {da, messaggi}` (F2, `pianificaRecordDiStoria`).
 * ⇒ Le regole del giornale restano in UN posto, il registro (`creaConsumatoreDiStoria`): l'import del motore riceve il suo
 *   selettore da chi lo chiama, come Hermes sceglie un parser per formato (`hermes_cli/foreign_sessions.py:183`, `_parser`).
 *   Senza selettore, o se il selettore non trova una storia valida, resta la regola vecchia (CTX-LEGACY-LATEST-VALID).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createDesktopContextRuntime } from '../src/context-runtime.mjs';
import { pianificaRecordDiStoria, statoJournalNuovo, storiaPerIlMotore } from '../src/session-registry.mjs';

const user = (content) => ({ role: 'user', content });
const assistant = (content) => ({ role: 'assistant', content });
const chiamata = (id) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'leggi', arguments: '{}' } }] });
const esito = (id, content) => ({ role: 'tool', tool_call_id: id, content });

/** Un giornale com'è oggi: le righe che il registro scrive davvero, coi record di storia decisi da `pianificaRecordDiStoria`. */
function giornale(giri) {
  const stato = statoJournalNuovo();
  const righe = [{ tipo: 'intestazione', sessionId: 'chat', avviataAlle: '2026-10-09T10:00:00.000Z' }];
  let storia = [];
  giri.forEach((nuovi, i) => {
    righe.push({ type: 'RunStarted', _sequenza: righe.length });
    storia = [...storia, ...nuovi];
    const piano = pianificaRecordDiStoria(stato, storia, { versioneGiro: i + 1, fase: 'finale' });
    righe.push(piano.record);
    piano.applica();
    righe.push({ type: 'RunFinished', _sequenza: righe.length });
  });
  return { righe, storia };
}
const jsonl = (righe) => `${righe.map((r) => JSON.stringify(r)).join('\n')}\n`;

const GIRI = [
  [user('Ciao, leggi a.md'), chiamata('c1'), esito('c1', 'contenuto di a'), assistant('Letto a.md')],
  [user('Ora b.md'), chiamata('c2'), esito('c2', 'contenuto di b'), assistant('Letto b.md')],
  [user('Confronta'), assistant('a e b sono diversi')],
];

test('C1-IMP-01: a conversation born with the engine off opens with the engine on — the history comes from checkpoint + deltas', async (t) => {
  const { righe, storia } = giornale(GIRI);
  assert.ok(righe.some((r) => r.tipo === 'messaggi-delta'), 'the fixture really has deltas (the format of today)');
  assert.ok(righe.some((r) => r.tipo === 'checkpoint'));
  const directory = await mkdtemp(join(tmpdir(), 'c1-import-'));
  await writeFile(join(directory, 'chat.jsonl'), jsonl(righe), 'utf8');
  const profile = { provider: 'local', model: 'fixture', windowTokens: 16384, responseReserve: 2048 };
  const runtime = await createDesktopContextRuntime({ sessionDirectory: directory, enabledSessionIds: ['chat'],
    readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:fixture', conclusa: true } : null),
    resolveModelProfile: async () => profile,
    tokenCounter: { countPreparedContext: async ({ messages, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify(messages).length / 4),
      windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false,
      requestHash: createHash('sha256').update(JSON.stringify(messages)).digest('hex'), provider: model.provider, model: model.model }) },
    callModel: async () => { throw new Error('Unexpected inference'); } });
  t.after(async () => { await runtime.close(); await rm(directory, { recursive: true, force: true }); }); // prima si chiude il database, poi si toglie
  const hooks = await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-4' });
  const prepared = await hooks.prepare({ messages: [...storia, user('E adesso?')], tools: [] });
  assert.equal(prepared.messages.at(-1).content, 'E adesso?');
  const originali = (await runtime.store.readOriginals({ sessionId: 'chat' })).map((r) => r.message);
  assert.deepEqual(originali.slice(0, storia.length), storia, 'the imported originals are the history the registry rebuilds');
});

test('C1-IMP-02: the same rules as the registry — a rewind (da below the length) and a pending turn that is newer than the last final', () => {
  const { righe, storia } = giornale(GIRI.slice(0, 2));
  // un giro di ripresa abbandonato da un riavvio: la storia riparte dall'ultimo finale (riavvolgimento), poi un giro nuovo a metà
  righe.push({ tipo: 'messaggi-delta', versioneGiro: 3, fase: 'ripresa', da: storia.length - 1, messaggi: [assistant('Letto b.md, rivisto'), user('Riprendi')] });
  const scelta = storiaPerIlMotore(righe);
  assert.equal(scelta.versioneGiro, 3, 'the pending turn is the most recent');
  assert.deepEqual(scelta.messages, [...storia.slice(0, -1), assistant('Letto b.md, rivisto'), user('Riprendi')]);
  assert.equal(scelta.recordIndex, righe.length - 1);
  assert.equal(scelta.incoerenza, undefined);
});

test('C1-IMP-03: a HOLE (da beyond the history) keeps the history up to the last coherent point and SAYS it — never an invented history', () => {
  const { righe, storia } = giornale(GIRI.slice(0, 2));
  righe.push({ tipo: 'messaggi-delta', versioneGiro: 3, fase: 'finale', da: storia.length + 5, messaggi: [user('dopo il buco')] });
  righe.push({ tipo: 'messaggi-delta', versioneGiro: 4, fase: 'finale', da: storia.length + 6, messaggi: [assistant('anche questo')] });
  const scelta = storiaPerIlMotore(righe);
  assert.deepEqual(scelta.messages, storia);
  assert.equal(scelta.versioneGiro, 2);
  assert.deepEqual(scelta.incoerenza, { versioneGiro: 3, da: storia.length + 5, lunghezza: storia.length, indice: righe.length - 2, deltaScartati: 2 });
});

test('C1-IMP-04: a journal migrated from the old format (old records, then a checkpoint and deltas) reads the new part', () => {
  const vecchio = [{ tipo: 'messaggi-finali', versioneGiro: 1, messaggiFinali: [user('vecchio'), assistant('risposta vecchia')] }];
  const nuovo = giornale(GIRI).righe.slice(1);
  const scelta = storiaPerIlMotore([...vecchio, ...nuovo]);
  assert.equal(scelta.versioneGiro, 3);
  assert.equal(scelta.messages.at(-1).content, 'a e b sono diversi');
});

test('C1-IMP-05: the other way — a journal with only old records gives what the old rule gave; an empty one gives null', () => {
  const righe = [
    { tipo: 'messaggi-finali', versioneGiro: 2, messaggiFinali: [user('older')] },
    { tipo: 'checkpoint-ripresa', versioneGiro: 4, messaggi: [user('valid checkpoint')] },
  ];
  assert.deepEqual(storiaPerIlMotore(righe), { messages: [user('valid checkpoint')], versioneGiro: 4, recordIndex: 1 });
  assert.equal(storiaPerIlMotore([{ tipo: 'intestazione' }, { type: 'RunStarted' }]), null);
});

/*
 * C1, prova dal vivo del motore DI SERIE (09/10/2026 sera, 4177): una conversazione NUOVA col motore moriva al primo giro con
 * CTX_LEGACY_NO_CHECKPOINT — il suo giornale c'è (intestazione, RunStarted) ma non ha ancora storia, e l'import lo prendeva per
 * un giornale rotto; dal giro dopo l'archivio non combaciava più con la storia attiva (CTX_HISTORY_DIVERGED). Un giornale senza
 * checkpoint è una conversazione SENZA STORIA: l'archivio nasce vuoto e si riempie dai messaggi originali del kernel.
 */
test('C1-IMP-NUOVA: a new conversation (journal with no history yet) opens with the engine and keeps working turn after turn', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'c1-import-nuova-'));
  await writeFile(join(directory, 'chat.jsonl'), jsonl([{ tipo: 'intestazione', sessionId: 'chat', avviataAlle: '2026-10-09T10:00:00.000Z' }, { type: 'RunStarted', _sequenza: 1 }]), 'utf8');
  const profile = { provider: 'local', model: 'fixture', windowTokens: 16384, responseReserve: 2048 };
  const runtime = await createDesktopContextRuntime({ sessionDirectory: directory, enabledSessionIds: ['chat'],
    readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:fixture', conclusa: false } : null),
    resolveModelProfile: async () => profile,
    tokenCounter: { countPreparedContext: async ({ messages, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify(messages).length / 4),
      windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false,
      requestHash: createHash('sha256').update(JSON.stringify(messages)).digest('hex'), provider: model.provider, model: model.model }) },
    callModel: async () => { throw new Error('Unexpected inference'); } });
  t.after(async () => { await runtime.close(); await rm(directory, { recursive: true, force: true }); });
  const primo = [{ role: 'system', content: 'sistema' }, user('Ciao, leggi a.md')];
  const hooks = await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  assert.equal((await hooks.prepare({ messages: primo, originali: primo, tools: [] })).messages.at(-1).content, 'Ciao, leggi a.md');
  const dopo = [...primo, chiamata('c1'), esito('c1', 'contenuto di a'), assistant('Letto'), user('Ora b.md')];
  await hooks.capture({ messages: dopo.slice(0, -1) });
  const hooks2 = await runtime.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-2' });
  assert.equal((await hooks2.prepare({ messages: dopo, originali: dopo, tools: [] })).messages.at(-1).content, 'Ora b.md', 'the second turn does not diverge');
  assert.deepEqual((await runtime.store.readOriginals({ sessionId: 'chat' })).map((r) => r.message), dopo);
});
