/*
 * Chiusura della compattazione (31/10/2026, banco dal vivo col piano ChatGPT): sei letture in una richiesta, il livello 1 ne accorciava il mezzo, e il modello rispondeva con
 * 2 dati su 6 senza rileggere, a giro «riuscito». Finché la richiesta entra, le uscite della richiesta in corso restano intere e il riassunto lavora in sottofondo.
 * Il posto unico resta come prima: lì il riassunto in sottofondo non parte finché la richiesta entra (Mobile, 31/10).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const now = '2026-10-31T00:00:00.000Z';
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const grande = (n) => `riga dell'uscita ${n}\n`.repeat(150) + `CODE: ${n}\n` + 'altra riga\n'.repeat(150);
const finestra = (tokens, ratio) => Math.ceil((tokens / ratio + 2048) / 0.85);
const lettura = (id, n) => [
  { role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${n}.txt` }) } }] },
  { role: 'tool', content: grande(n), tool_call_id: id },
];
/** `prima` letture in una richiesta già chiusa, poi `dopo` letture nella richiesta in corso. */
function storia({ prima = 0, dopo = 6 } = {}) {
  const m = [{ role: 'system', content: 'sistema' }];
  if (prima) {
    m.push({ role: 'user', content: 'Leggi i file vecchi' });
    for (let i = 0; i < prima; i++) m.push(...lettura(`v${i}`, 100 + i));
    m.push({ role: 'assistant', content: 'fatto' });
  }
  m.push({ role: 'user', content: 'Leggi i file e dammi i codici' });
  for (let i = 0; i < dopo; i++) m.push(...lettura(`p${i}`, i));
  m.push({ role: 'assistant', content: 'proseguo' });
  return m;
}
const uscite = (messaggi, prefisso) => messaggi.filter((m) => m.role === 'tool' && m.tool_call_id.startsWith(prefisso));
const tocca = (m) => /omitted|trimmed|cleared/u.test(m.content);

async function motore(t, messaggi, ratio, extra = {}, { isPersonRequest, contaDivisore = 4, tetto, summarize, senzaPrepara = false } = {}) {
  const pieno = Math.ceil(JSON.stringify({ messages: messaggi, tools: [] }).length / 4);
  const dir = await mkdtemp(join(tmpdir(), 'richiesta-intera-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  const richieste = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: summarize ?? ((r) => { richieste.push(r); return new Promise(() => {}); }) };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / contaDivisore), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now, clearedToolPointer: 'Recover it with conversation_search.', summaryCeilingMs: 0, ...(isPersonRequest ? { isPersonRequest } : {}) });
  t.after(async () => { await store.close().catch(() => {}); await rm(dir, { recursive: true, force: true }).catch(() => {}); });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  for (const [i, message] of messaggi.entries()) await engine.appendOriginal({ sessionId: 'chat', record: { id: `r${i}`, message, createdAt: now } });
  const profilo = { provider: 'cloud', model: 'fixture', windowTokens: finestra(pieno, ratio), responseReserve: 2048, ...extra };
  const preparata = senzaPrepara ? null : await engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: profilo, ...(tetto === undefined ? {} : { summaryCeilingMs: tetto }) }).catch((errore) => ({ errore }));
  return { preparata, richieste, engine, profilo };
}

test('RICHIESTA-INTERA-01 oltre la soglia, finché la richiesta entra: le sue uscite restano intere, e il riassunto lavora in sottofondo', async (t) => {
  const { preparata, richieste } = await motore(t, storia(), 0.8);
  assert.equal(preparata.errore, undefined);
  assert.equal(uscite(preparata.messages, 'p').filter(tocca).length, 0, 'tutti e sei i dati arrivano al modello');
  assert.equal(uscite(preparata.messages, 'p').filter((m) => /CODE:/u.test(m.content)).length, 6);
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(richieste.length >= 1, 'il riassunto è partito: la soglia non si ignora');
  assert.ok(preparata.job, 'e la richiesta ne porta il lavoro');
});

test('RICHIESTA-INTERA-02 le uscite delle richieste già chiuse si accorciano come prima', async (t) => {
  const { preparata } = await motore(t, storia({ prima: 8, dopo: 2 }), 0.8);
  assert.ok(uscite(preparata.messages, 'v').some(tocca), 'il vecchio cede');
  assert.equal(uscite(preparata.messages, 'p').length, 2, 'la richiesta in corso arriva tutta');
  assert.equal(uscite(preparata.messages, 'p').filter(tocca).length, 0, 'e intera');
});

test('RICHIESTA-INTERA-03 AL CONTRARIO: se la richiesta non entra, si accorcia anche la richiesta in corso: la chat non si ferma', async (t) => {
  const { preparata } = await motore(t, storia(), 1.3);
  assert.equal(preparata.errore, undefined, String(preparata.errore?.message));
  assert.ok(uscite(preparata.messages, 'p').some(tocca));
});

test('RICHIESTA-INTERA-04 sul posto unico si resta come prima: il riassunto lì non parte finché la richiesta entra', async (t) => {
  const { preparata, richieste } = await motore(t, storia(), 0.8, { singleSlot: true, local: true });
  assert.ok(uscite(preparata.messages, 'p').some(tocca));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(richieste.length, 0);
});

/* Revisione del blocco 14 (31/10/2026). D-39: una nota del kernel col ruolo `user` non apre una richiesta. Un messaggio in coda arrivato fra un attrezzo e l'altro nemmeno: le uscite
   prima di lui servono ancora. D-40: dopo un riassunto dentro il giro la coda può non avere nessun `user`. D-41: la stima dice che entra e il conto vero no. */
const soloLaPersona = (m) => m.role === 'user' && !String(m.content).startsWith('[TALOS');
function conInMezzo(messaggio) {
  const m = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'Leggi i file e dammi i codici' }];
  for (let i = 0; i < 3; i++) m.push(...lettura(`p${i}`, i));
  m.push(messaggio);
  for (let i = 3; i < 6; i++) m.push(...lettura(`p${i}`, i));
  m.push({ role: 'assistant', content: 'proseguo' });
  return m;
}

test('RICHIESTA-INTERA-05 una nota del kernel dopo una risposta tagliata non apre una richiesta: le uscite prima di lei restano intere (D-39)', async (t) => {
  const nota = { role: 'user', content: '[TALOS: your previous answer was cut off by the output length limit.]' };
  const m = conInMezzo(nota);
  m.splice(m.indexOf(nota), 0, { role: 'assistant', content: 'Ho letto i primi' }); // dopo un testo, non dopo un attrezzo: è il caso vero del tetto d'uscita
  const { preparata } = await motore(t, m, 0.8, {}, { isPersonRequest: soloLaPersona });
  assert.equal(preparata.errore, undefined);
  assert.equal(uscite(preparata.messages, 'p').filter(tocca).length, 0);
});

test('RICHIESTA-INTERA-06 un messaggio in coda fra due attrezzi non chiude la richiesta (D-39)', async (t) => {
  const { preparata } = await motore(t, conInMezzo({ role: 'user', content: 'Aggiungi anche il totale' }), 0.8, {}, { isPersonRequest: soloLaPersona });
  assert.equal(uscite(preparata.messages, 'p').filter(tocca).length, 0);
});

test('RICHIESTA-INTERA-07 una richiesta chiusa resta accorciabile: la persona che riparte dopo una risposta apre una richiesta nuova', async (t) => {
  const { preparata } = await motore(t, storia({ prima: 4, dopo: 6 }), 0.8, {}, { isPersonRequest: soloLaPersona });
  assert.ok(uscite(preparata.messages, 'v').filter(tocca).length > 0);
  assert.equal(uscite(preparata.messages, 'p').filter(tocca).length, 0);
});

test('RICHIESTA-INTERA-08 dopo un riassunto dentro il giro la coda non ha nessun user: la richiesta è tutta la coda (D-40)', async (t) => {
  const m = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'Leggi tutto e dammi i codici' }];
  for (let i = 0; i < 8; i++) m.push(...lettura(`p${i}`, i));
  m.push({ role: 'assistant', content: 'proseguo' });
  const sintesi = { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'sintesi', goal: 'g', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: 'r1', quote: 'Leggi tutto e dammi i codici' }] }), finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
  const { engine, profilo } = await motore(t, m, 0.4, {}, { senzaPrepara: true, summarize: async () => sintesi });
  const lavoro = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'a1', sessionModel: profilo, tools: [], withinTurn: true });
  await engine.waitForCompaction({ sessionId: 'chat', jobId: lavoro.id ?? lavoro.job?.id });
  const altro = [...m];
  for (let i = 0; i < 5; i++) altro.push(...lettura(`q${i}`, 20 + i));
  altro.push({ role: 'assistant', content: 'proseguo' });
  for (const [i, message] of altro.entries()) if (i >= m.length) await engine.appendOriginal({ sessionId: 'chat', record: { id: `r${i}`, message, createdAt: now } });
  const stima = Math.ceil(JSON.stringify(altro).length / 3.5);
  const sopra = { ...profilo, windowTokens: Math.ceil((stima * 0.62 + 2048) / 0.85) };
  const due = await engine.prepareForRequest({ sessionId: 'chat', messages: altro, tools: [], sessionModel: sopra, summaryCeilingMs: 0 });
  assert.equal(uscite(due.messages, 'q').length > 0, true);
  assert.equal(uscite(due.messages, 'q').filter(tocca).length, 0, 'le uscite dopo il riassunto sono della stessa richiesta');
});

test('RICHIESTA-INTERA-09 la stima dice che entra, il conto vero no: si accorcia invece di finire in errore (D-41)', async (t) => {
  const m = storia();
  const stima = Math.ceil(JSON.stringify({ messages: m, tools: [] }).length / 3.5); // la stima del motore
  const { preparata } = await motore(t, m, 0.9, { windowTokens: finestra(stima, 0.9) }, { contaDivisore: 2.8, tetto: 0 });
  assert.equal(preparata.errore, undefined, String(preparata.errore?.code));
  assert.ok(uscite(preparata.messages, 'p').filter(tocca).length > 0, 'la richiesta entra solo accorciata');
});

test('RICHIESTA-INTERA-10 la stima dice che non entra, il conto vero sì: le uscite della richiesta restano intere (banco del 31/10 sera, 3 dati su 6)', async (t) => {
  const m = storia();
  const stima = Math.ceil(JSON.stringify({ messages: m, tools: [] }).length / 3.5);
  const { preparata } = await motore(t, m, 0.9, { windowTokens: Math.ceil(stima * 0.9), responseReserve: Math.floor(stima * 0.9 / 8) }, { contaDivisore: 6.5, tetto: 0 });
  assert.equal(preparata.errore, undefined, String(preparata.errore?.code));
  assert.equal(uscite(preparata.messages, 'p').filter(tocca).length, 0);
});
