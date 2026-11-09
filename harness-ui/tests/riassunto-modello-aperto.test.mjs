/*
 * Owner 01/11/2026, «Scrive il modello aperto» (`FORMA-RIASSUNTO-MODELLO-APERTO-2026-11-01.md`, seconda versione). Una chat locale con un altro modello locale per i riassunti non
 * otteneva mai un riassunto scritto da un modello (terza revisione, D1). Il modello della chat non si scarica mai; a fine giro, a motore libero, scrive lui. Dentro il giro niente cambia.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createContextModelAdapter } from '../src/context-provider-adapter.mjs';
import { anelloDaUsare, catenaDelRiassunto, statoDallaMemoria } from '../src/kernel/catena-del-riassunto.mjs';
import { VARIABILE_TETTO_TOKEN } from '../src/kernel/compattazione-desktop.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BASE = { scelto: 'local:scelto', modelloConversazione: 'local:aperto', localeCaricato: 'local:aperto', inUnGiro: true };
const ruoli = (c) => c.map((a) => [a.ruolo, a.stato, a.motivo ?? null]);

test('RMA-01 at the end of the turn the open model writes it, after the person\'s chain', () => {
  assert.deepEqual(ruoli(catenaDelRiassunto({ ...BASE, conSostituto: true })), [['scelto', 'bloccato', 'posto-occupato'], ['sostituto', 'pronto', null], ['senza-modello', 'pronto', null]]);
  assert.deepEqual(anelloDaUsare(catenaDelRiassunto({ ...BASE, conSostituto: true })).modello, 'local:aperto');
});

test('RMA-02 who does not ask sees the chain of the 30/10: inside the turn and in the Settings nothing changes', () => {
  const c = catenaDelRiassunto(BASE);
  assert.deepEqual(ruoli(c), [['scelto', 'bloccato', 'posto-occupato'], ['senza-modello', 'pronto', null]]);
  assert.equal(anelloDaUsare(c).ruolo, 'senza-modello');
});

test('RMA-03 only for the seat: no blocked ring, no substitute', () => {
  assert.deepEqual(ruoli(catenaDelRiassunto({ ...BASE, scelto: 'local:aperto', conSostituto: true })), [['scelto', 'pronto', null], ['senza-modello', 'pronto', null]]);
  assert.deepEqual(ruoli(catenaDelRiassunto({ ...BASE, scelto: 'z-ai/glm-5.3-flash', conSostituto: true })), [['scelto', 'pronto', null], ['senza-modello', 'pronto', null]]);
  const limite = catenaDelRiassunto({ ...BASE, scelto: 'z-ai/glm-5.3-flash', conSostituto: true, statoDi: () => ({ stato: 'bloccato', motivo: 'limite', finoAlle: null }) });
  assert.equal(limite.some((a) => a.ruolo === 'sostituto'), false, 'a limit is not the seat: rule 3 stands');
});

test('RMA-04 a backup the person chose comes first', () => {
  const remota = catenaDelRiassunto({ ...BASE, riserva: { model: 'z-ai/glm-5.3-flash' }, conSostituto: true });
  assert.equal(anelloDaUsare(remota).ruolo, 'riserva');
  assert.equal(remota[2].ruolo, 'sostituto');
  const conversazione = catenaDelRiassunto({ ...BASE, riserva: 'conversazione', conSostituto: true });
  assert.deepEqual(conversazione.map((a) => a.ruolo), ['scelto', 'riserva', 'senza-modello'], 'it is already there, as the person\'s choice: never twice');
});

test('RMA-05 a substitute that is itself down leaves the summary without a model', () => {
  const c = catenaDelRiassunto({ ...BASE, conSostituto: true, statoDi: (id) => (id === 'local:aperto' ? { stato: 'bloccato', motivo: 'motore-non-pronto', finoAlle: null } : null) });
  assert.equal(anelloDaUsare(c).ruolo, 'senza-modello');
});

test('RMA-06 with the memory for both the choice of the person stands', () => {
  assert.deepEqual(ruoli(catenaDelRiassunto({ ...BASE, conSostituto: true, localiInsieme: true })), [['scelto', 'pronto', null], ['senza-modello', 'pronto', null]]);
});

/* Registro VERO, riassuntore finto. Stessa scena di `compact-manuale-record-22-10`. */
const storiaGrande = () => {
  const s = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < 6; i += 1) {
    s.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `file${i}.txt` }) } }] });
    s.push({ role: 'tool', tool_call_id: `call_${i}`, content: 'x'.repeat(3_000) });
  }
  s.push({ role: 'user', content: 'Seconda richiesta' }, { role: 'assistant', content: 'Fatto.' });
  return s;
};

function scena(t, { localiInsieme = false, conversazione = 'local:aperto', scelto = 'local:scelto' } = {}) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '2000';
  const cartellaStore = cartellaDiProva('talos-rma-');
  const chiamate = [];
  const giri = [];
  const riassumi = (input) => { chiamate.push(input); return Promise.resolve({ scelta: { role: 'assistant', content: '## Riassunto\nSCRITTO' }, finishReason: 'stop', usage: null }); };
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    giri.push({ concludi(storia) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [], stimaAttrezzi: 0 } }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
    return attesa;
  };
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn, modello: conversazione, chiave: 'k', riassumiPerCompattazioneFn: riassumi,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }), modelloRiassuntoFn: () => scelto, localiInsiemeFn: () => localiInsieme });
  t.after(async () => {
    if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima;
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: conversazione });
  return { registro, sessionId, giri, chiamate, cartellaStore };
}
const attendi = async (condizione) => { for (let i = 0; i < 300; i += 1) { if (await condizione()) return; await new Promise((r) => setTimeout(r, 10)); } };

test('RMA-10 on the real registry: the command of the person writes with the open model, and says who the chosen one was', async (t) => {
  const s = scena(t);
  s.giri[0].concludi(storiaGrande());
  await attendi(() => s.registro.stato?.(s.sessionId)?.conclusa !== false && s.giri.length === 1);
  await attendiScritture({ cartellaStore: s.cartellaStore });
  const esito = await s.registro.compatta(s.sessionId);
  assert.ok(s.chiamate.length >= 1, JSON.stringify(esito));
  for (const c of s.chiamate) assert.equal(c.modello, 'local:aperto', 'the model of the chat, never the chosen one: it would unload the chat');
  const righe = readFileSync(join(s.cartellaStore, `${s.sessionId}.jsonl`), 'utf8');
  assert.match(righe, /"riassuntoDi":"local:aperto"/u);
  assert.match(righe, /"motivo":"posto-occupato"/u);
});

test('RMA-11 on the real registry: with the memory for both, the chosen model writes', async (t) => {
  const s = scena(t, { localiInsieme: true });
  s.giri[0].concludi(storiaGrande());
  await attendi(() => s.giri.length === 1);
  await attendiScritture({ cartellaStore: s.cartellaStore });
  await s.registro.compatta(s.sessionId);
  assert.ok(s.chiamate.length >= 1);
  assert.equal(s.chiamate[0].modello, 'local:scelto');
});

test('RMA-12 on the real registry: the chosen model is not touched: its memory stays as it was', async (t) => {
  const s = scena(t);
  s.giri[0].concludi(storiaGrande());
  await attendi(() => s.giri.length === 1);
  await attendiScritture({ cartellaStore: s.cartellaStore });
  const memoria = s.registro.memoriaRiassuntoDi(s.sessionId);
  memoria.set('local:scelto', { stato: 'bloccato', motivo: 'rete', finoAlle: null, scadeAlle: Date.now() + 60_000 });
  await s.registro.compatta(s.sessionId);
  assert.equal(statoDallaMemoria(memoria, 'local:scelto')?.motivo, 'rete');
  assert.equal(memoria.riusciti?.has('local:scelto') ?? false, false, 'Desktop: the substitute does not enter `riusciti` of the chosen model');
});

/* Il kernel vero: dentro il giro nessuna richiesta di riassunto, e il rapido promette il fine giro. Stessa scena della prova `R-04c` della terza revisione. */
const { talosLavora } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
const { stimaTokenConversazione: stima } = await import('../src/kernel/talosHarness.mjs');
const storiaGiro = (coppie) => Array.from({ length: coppie }, (_, i) => [{ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(60)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(60)}` }]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storiaGiro(c + 1)) < token) c += 1; return c; };

async function giroDelKernel(t, extra) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
  const cartella = cartellaDiProva('talos-rma-giro-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 12; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${'riga del file '.repeat(60)}\n`);
  const riassunti = [];
  let fatte = 0;
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      riassunti.push(corpo.model);
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'Dettaglio. '.repeat(20)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });
    }
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    const nome = corpo.tools.map((x) => x.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    if (fatte < 12) {
      fatte += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${fatte}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `f${fatte}.txt`, path: `f${fatte}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
  };
  const fine = [];
  const esito = await talosLavora({ cartella, modello: 'local:aperto', chiave: 'finta', task: { consegna: 'Leggi.' }, messaggiIniziali: [...storiaGiro(coppiePer(2600)), { role: 'user', content: 'Leggi i file.' }],
    contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access', finestraRiassuntoToken: 32_768, statoModelliRiassunto: new Map(), modelloRiassunto: 'local:scelto', ...extra,
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine') fine.push(e); } });
  return { riassunti, fine, esito };
}

test('RMA-15 the real kernel: inside the turn no summary is asked, the chat does not wait, and the quick one promises the end of the turn', async (t) => {
  const { riassunti, fine, esito } = await giroDelKernel(t, {});
  assert.ok(fine.length > 0, 'a compaction happened');
  assert.deepEqual(riassunti, [], '27/10 and 28/10: never a generation inside the turn');
  const records = esito?.recordDiCompattazione ?? esito?.esito?.recordDiCompattazione ?? [];
  assert.ok(records.length > 0, 'a record was written');
  assert.equal(records.at(-1).aFineGiro, true, 'without the promise the quick one would stay for ever: no threshold is passed after it');
});

test('RMA-16 the real kernel: a chosen model stopped by something else makes no promise: nothing would come at the end of the turn', async (t) => {
  const memoria = new Map([['z-ai/glm-5.3-flash', { stato: 'bloccato', motivo: 'limite', finoAlle: Date.now() + 3_600_000, scadeAlle: Date.now() + 3_600_000 }]]);
  const { fine, esito } = await giroDelKernel(t, { modelloRiassunto: 'z-ai/glm-5.3-flash', statoModelliRiassunto: memoria });
  assert.ok(fine.length > 0, 'a compaction happened');
  const records = esito?.recordDiCompattazione ?? esito?.esito?.recordDiCompattazione ?? [];
  assert.ok(records.length > 0);
  assert.notEqual(records.at(-1).aFineGiro, true);
});

const ok = () => ({ text: 'RIASSUNTO', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } });
const SCELTO = { provider: 'local', model: 'scelto', windowTokens: 16_384, responseReserve: 4_096 };
const APERTO = { provider: 'local', model: 'aperto', windowTokens: 16_384, responseReserve: 2_048 };

function adattatore({ sostituto = APERTO, risponde = ok } = {}) {
  const chiamate = [];
  const memoria = new Map();
  const a = createContextModelAdapter({ resolveModel: async ({ selected }) => ({ ...selected, windowTokens: SCELTO.windowTokens, responseReserve: SCELTO.responseReserve }),
    callModel: async (r) => { chiamate.push(r); return risponde(r); }, sceltaDellaPersona: () => ({ provider: 'local', model: 'scelto' }), memoriaRiassunto: () => memoria,
    sostitutoDelRiassunto: async () => sostituto });
  return { a, chiamate, memoria };
}
const riassumi = async (x) => x.a.summarize({ model: SCELTO, messages: [{ role: 'user', content: 'x' }], maxOutputTokens: 3_000, sessionId: 'chat', operationId: 'op' });

test('RMA-20 the road of the context engine: the same rule, and the provenance says it', async () => {
  const x = adattatore();
  const r = await riassumi(x);
  assert.deepEqual(x.chiamate.map((c) => c.model), ['aperto']);
  assert.equal(x.chiamate[0].maxOutputTokens, 2_048, 'its own reserve');
  assert.equal(x.chiamate[0].operationId, 'op:sostituto', 'a paid call of its own');
  assert.deepEqual(r.provenienza, { riassuntoDi: 'local:aperto', nonDisponibile: { modello: 'local:scelto', stato: 'bloccato', motivo: 'posto-occupato' } });
  assert.equal(x.memoria.size, 0, 'the chosen model is not touched');
});

test('RMA-21 never a smaller window: the request is made for the chosen one', async () => {
  const x = adattatore({ sostituto: { ...APERTO, windowTokens: 8_192 } });
  await riassumi(x);
  assert.deepEqual(x.chiamate.map((c) => c.model), ['scelto']);
});

test('RMA-22 no substitute, or one that cannot be read: as before', async () => {
  const x = adattatore({ sostituto: null });
  const r = await riassumi(x);
  assert.deepEqual(x.chiamate.map((c) => c.model), ['scelto']);
  assert.equal(r.provenienza, undefined);
});

test('RMA-25 fifth review R-12: the backup of the person comes before the open model, and the open model writes if the backup falls', async () => {
  const RISERVA = { provider: 'openrouter', model: 'z-ai/glm-5.3-flash', windowTokens: 128_000, responseReserve: 4_096 };
  const fai = (cade) => {
    const chiamate = [];
    const a = createContextModelAdapter({ resolveModel: async ({ selected }) => ({ ...selected, windowTokens: SCELTO.windowTokens, responseReserve: SCELTO.responseReserve }),
      callModel: async (r) => { chiamate.push(r.model); if (cade && r.model === RISERVA.model) throw Object.assign(new Error('HTTP 429'), { stato: 429 }); return ok(); },
      sceltaDellaPersona: () => ({ provider: 'local', model: 'scelto' }), memoriaRiassunto: () => new Map(), riservaDelRiassunto: async () => RISERVA, sostitutoDelRiassunto: async () => APERTO });
    return { a, chiamate };
  };
  const prima = fai(false);
  const r = await prima.a.summarize({ model: SCELTO, messages: [{ role: 'user', content: 'x' }], maxOutputTokens: 3_000, sessionId: 'chat', operationId: 'op' });
  assert.deepEqual(prima.chiamate, ['z-ai/glm-5.3-flash'], 'never the chosen one: it would unload the chat');
  assert.equal(r.provenienza.dallaRiserva, true);
  assert.equal(r.provenienza.nonDisponibile.motivo, 'posto-occupato');
  const caduta = fai(true);
  const r2 = await caduta.a.summarize({ model: SCELTO, messages: [{ role: 'user', content: 'x' }], maxOutputTokens: 3_000, sessionId: 'chat', operationId: 'op' });
  assert.deepEqual(caduta.chiamate, ['z-ai/glm-5.3-flash', 'aperto']);
  assert.equal(r2.provenienza.riassuntoDi, 'local:aperto');
});

test('RMA-26 fifth review R-13: a backup the spending policy does not authorize is not called, and the open model writes', async () => {
  const RISERVA = { provider: 'openrouter', model: 'z-ai/glm-5.3-flash', windowTokens: 128_000, responseReserve: 4_096 };
  const chiamate = [];
  const chieste = [];
  const a = createContextModelAdapter({ resolveModel: async ({ selected }) => ({ ...selected, windowTokens: SCELTO.windowTokens, responseReserve: SCELTO.responseReserve }),
    callModel: async (r) => { chiamate.push(r.model); return ok(); },
    usagePolicy: { authorize: async ({ model }) => { chieste.push(model.model); return model.model !== RISERVA.model; } },
    sceltaDellaPersona: () => ({ provider: 'local', model: 'scelto' }), memoriaRiassunto: () => new Map(), riservaDelRiassunto: async () => RISERVA, sostitutoDelRiassunto: async () => APERTO });
  const r = await a.summarize({ model: SCELTO, messages: [{ role: 'user', content: 'x' }], maxOutputTokens: 3_000, sessionId: 'chat', operationId: 'op' });
  assert.ok(chieste.includes(RISERVA.model), 'the policy was asked about the backup');
  assert.equal(chiamate.includes(RISERVA.model), false, 'a refused backup is never called');
  assert.equal(chiamate.includes('scelto'), false, 'never the chosen one: it would unload the chat');
  assert.equal(chiamate.at(-1), 'aperto');
  assert.equal(r.provenienza.riassuntoDi, 'local:aperto');
});

test('RMA-23 a Stop that arrives while the substitute is being read: nothing is asked', async () => {
  const stop = new AbortController();
  const chiamate = [];
  const a = createContextModelAdapter({ resolveModel: async ({ selected }) => ({ ...selected, windowTokens: SCELTO.windowTokens, responseReserve: SCELTO.responseReserve }), callModel: async (r) => { chiamate.push(r); return ok(); },
    sostitutoDelRiassunto: async () => { stop.abort(new Error('fermato')); return APERTO; } });
  await assert.rejects(a.summarize({ model: SCELTO, messages: [{ role: 'user', content: 'x' }], maxOutputTokens: 3_000, sessionId: 'chat', operationId: 'op', signal: stop.signal }), /fermato/u);
  assert.equal(chiamate.length, 0);
});

test('RMA-24 a port that fails is no substitute: the summary goes as before', async () => {
  const chiamate = [];
  const a = createContextModelAdapter({ resolveModel: async ({ selected }) => ({ ...selected, windowTokens: SCELTO.windowTokens, responseReserve: SCELTO.responseReserve }), callModel: async (r) => { chiamate.push(r); return ok(); },
    sostitutoDelRiassunto: async () => { throw new Error('non si legge'); } });
  await a.summarize({ model: SCELTO, messages: [{ role: 'user', content: 'x' }], maxOutputTokens: 3_000, sessionId: 'chat', operationId: 'op' });
  assert.deepEqual(chiamate.map((c) => c.model), ['scelto']);
});
