/*
 * 21/10/2026, richiesta della CLI (owner 14/10: il lavoro di contorno sul modello «più economico dello stesso fornitore»):
 * 1. il riassunto di fine giro non parte quando il giro è andato col motore del contesto (il suo record lo legge solo la compattazione
 *    semplice dell'adattatore, in modo legacy o in ripiego): pagato e mai usato;
 * 2. `modelloRiassuntoFn` sceglie il modello che scrive il riassunto di fine giro; la finestra è la più piccola delle due, e se non regge
 *    nemmeno la richiesta minima il riassunto torna sul modello della conversazione;
 * 3. lo stesso dentro il giro: il registro passa `modelloRiassunto` + `finestraRiassuntoToken`, `agent-service` li inoltra, l'adattatore
 *    li usa. Il record resta intestato al modello della CONVERSAZIONE. Senza le opzioni tutto è com'era.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import {
  INGRESSO_MINIMO_TOKEN_RIASSUNTO, VARIABILE_TETTO_TOKEN, budgetRiassunto, caratteriIngressoPerFinestra, sceltaDelRiassunto,
} from '../src/kernel/compattazione-desktop.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CONV = 'z-ai/glm-5.3-flash';
const AUX = 'z-ai/glm-4.7-flash';

test('AUX-01 sceltaDelRiassunto: nessun ausiliario, finestra minore, finestra ignota, finestra che non regge', () => {
  const base = { modelloConversazione: CONV, finestraConversazione: 200_000, tokenDaRiassumere: 60_000, soglia: 150_000 };
  for (const modelloRiassunto of [null, undefined, '', CONV, 42]) {
    const s = sceltaDelRiassunto({ ...base, modelloRiassunto, finestraRiassunto: 8_000 });
    assert.deepEqual([s.modello, s.finestraToken, s.ausiliario], [CONV, 200_000, false], String(modelloRiassunto));
    assert.deepEqual(s.budget, budgetRiassunto({ tokenDaRiassumere: 60_000, finestraToken: 200_000, soglia: 150_000 }));
  }
  const minore = sceltaDelRiassunto({ ...base, modelloRiassunto: AUX, finestraRiassunto: 32_768 });
  assert.deepEqual([minore.modello, minore.finestraToken, minore.ausiliario], [AUX, 32_768, true]);
  assert.deepEqual(minore.budget, budgetRiassunto({ tokenDaRiassumere: 60_000, finestraToken: 32_768, soglia: 150_000 }));
  const maggiore = sceltaDelRiassunto({ ...base, modelloRiassunto: AUX, finestraRiassunto: 1_000_000 });
  assert.equal(maggiore.finestraToken, 200_000, 'la più piccola delle due');
  const ignota = sceltaDelRiassunto({ ...base, modelloRiassunto: AUX, finestraRiassunto: null });
  assert.deepEqual([ignota.modello, ignota.finestraToken], [AUX, 200_000], 'ignota ⇒ quella della conversazione');
  const entrambeIgnote = sceltaDelRiassunto({ ...base, finestraConversazione: null, modelloRiassunto: AUX });
  assert.deepEqual([entrambeIgnote.modello, entrambeIgnote.finestraToken], [AUX, null]);
  /* il confine: finestra − uscita − margine (1.024) contro l'ingresso minimo (1.024) */
  const uscita = budgetRiassunto({ tokenDaRiassumere: 60_000, finestraToken: 4_048, soglia: 150_000 }).maxOutputTokens;
  const giusta = uscita + 1_024 + INGRESSO_MINIMO_TOKEN_RIASSUNTO;
  assert.equal(sceltaDelRiassunto({ ...base, modelloRiassunto: AUX, finestraRiassunto: giusta }).modello, AUX, 'al confine regge');
  const stretta = sceltaDelRiassunto({ ...base, modelloRiassunto: AUX, finestraRiassunto: giusta - 1 });
  assert.deepEqual([stretta.modello, stretta.finestraToken, stretta.ausiliario, stretta.ripiego], [CONV, 200_000, false, 'finestra']);
});

/* ---------------------------------------------------------------------------------------------------- il registro */
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function giri() {
  const tutti = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    tutti.push({ input, concludi(storia) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [] } }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${tutti.length}` });
    return attesa;
  };
  return { tutti, avviaSessioneFn };
}
function riassuntore() {
  const chiamate = [];
  const fn = async (input) => {
    chiamate.push(input);
    return { scelta: { role: 'assistant', content: 'RIASSUNTO' }, finishReason: 'stop', usage: { prompt_tokens: 100, completion_tokens: 10 } };
  };
  return { fn, chiamate };
}
/* una storia grande: 6 risultati da 20.000 caratteri, ben sopra un tetto di 2.000 token e oltre una finestra da 8.192 */
const storiaGrande = () => {
  const s = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < 6; i += 1) {
    s.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `file${i}.txt` }) } }] });
    s.push({ role: 'tool', tool_call_id: `call_${i}`, content: 'x'.repeat(20_000) });
  }
  s.push({ role: 'assistant', content: 'Fatto.' });
  return s;
};
async function attendi(condizione, messaggio) {
  for (let i = 0; i < 400; i += 1) { if (await condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error(messaggio);
}
const caratteriInviati = (messaggi) => messaggi.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content ?? '').length), 0);

async function fineGiro(t, opzioni = {}) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '2000';
  const cartellaStore = cartellaDiProva('talos-riassunto-aux-');
  const r = riassuntore();
  const g = giri();
  const registro = createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn: g.avviaSessioneFn,
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: CONV, chiave: 'k', riassumiPerCompattazioneFn: r.fn, ...opzioni });
  t.after(async () => {
    if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima;
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task-vero');
  await attendi(() => g.tutti.length === 1, 'il giro non è partito');
  g.tutti[0].concludi(storiaGrande());
  await attendiScritture({ cartellaStore, sessionId });
  await new Promise((res) => setTimeout(res, 30));
  await attendi(() => !registro.statoCompattazione(sessionId)?.inCorso, 'il riassunto non si è chiuso');
  return { registro, sessionId, r, g };
}

test('AUX-02 fine giro: il riassunto va sull\'ausiliario, sulla sua finestra più piccola; il record resta della conversazione', async (t) => {
  const chiestoPer = [];
  const { registro, sessionId, r } = await fineGiro(t, {
    modelloRiassuntoFn: (m) => { chiestoPer.push(m); return AUX; },
    finestraTokenFn: (m) => (m === AUX ? 8_192 : 200_000),
  });
  assert.ok(chiestoPer.includes(CONV));
  assert.equal(r.chiamate.length, 1);
  assert.equal(r.chiamate[0].modello, AUX);
  const budget = budgetRiassunto({ tokenDaRiassumere: 31_000, finestraToken: 8_192, soglia: 1_500 });
  assert.ok(r.chiamate[0].maxOutputTokens <= 8_192, `tetto ${r.chiamate[0].maxOutputTokens}`);
  assert.ok(caratteriInviati(r.chiamate[0].messaggi) <= caratteriIngressoPerFinestra({ finestraToken: 8_192, maxOutputTokens: budget.maxOutputTokens }) + 2_000,
    `ingresso misurato sulla finestra dell'ausiliario: ${caratteriInviati(r.chiamate[0].messaggi)}`);
  assert.equal(registro.statoCompattazione(sessionId).record?.modello, CONV);
});

test('AUX-03 verso contrario: senza la funzione, o con null, una forma non valida, lo stesso modello o un\'eccezione ⇒ il modello della conversazione', async (t) => {
  for (const modelloRiassuntoFn of [undefined, () => null, () => 'non un modello', () => CONV, () => 42, () => { throw new Error('rotto'); }]) {
    const { r } = await fineGiro(t, { ...(modelloRiassuntoFn ? { modelloRiassuntoFn } : {}), finestraTokenFn: () => 200_000 });
    assert.equal(r.chiamate.length, 1, String(modelloRiassuntoFn));
    assert.equal(r.chiamate[0].modello, CONV, String(modelloRiassuntoFn));
  }
});

test('AUX-04 finestra dell\'ausiliario che non regge la richiesta minima ⇒ il riassunto torna sul modello della conversazione', async (t) => {
  const { r } = await fineGiro(t, { modelloRiassuntoFn: () => AUX, finestraTokenFn: (m) => (m === AUX ? 2_048 : 200_000) });
  assert.equal(r.chiamate.length, 1);
  assert.equal(r.chiamate[0].modello, CONV);
});

test('AUX-05 un giro col motore del contesto non paga il riassunto di fine giro; verso contrario: senza ganci (legacy) sì', async (t) => {
  const conMotore = await fineGiro(t, { contextHooksFn: async () => ({ prepare: async ({ messages }) => ({ messages }) }) });
  assert.equal(conMotore.r.chiamate.length, 0, 'il record non lo leggerebbe nessuno');
  const legacy = await fineGiro(t, { contextHooksFn: async () => null });
  assert.equal(legacy.r.chiamate.length, 1);
  const senzaMotore = await fineGiro(t, { contextHooksFn: async () => ({ prepare: async ({ messages }) => ({ messages }) }), giroUsaIlMotoreFn: () => false });
  assert.equal(senzaMotore.r.chiamate.length, 1, 'una conversazione legacy col motore di serie acceso: il riassunto serve');
});

/* ---------------------------------------------------------------------------------------------------- il filo fino al kernel */
async function giroSpiato(opzioni) {
  let alKernel = null;
  const registro = createSessionRegistryReale({ guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: async (ri) => { alKernel = ri; return { comeFinita: 'concluso', messaggiFinali: [] }; } }),
    preparaEsecuzioneFn: (taskId) => ({ ...preparaEsecuzioneFinta(taskId), cartella: process.cwd(), comandoProva: null }),
    modello: CONV, chiave: 'k', riassuntoDiFineGiro: false, ...opzioni });
  const { sessionId } = registro.avvia('task-vero');
  const fine = Date.now() + 10_000;
  while (!alKernel && Date.now() < fine) await new Promise((r) => { setTimeout(r, 10); });
  registro.ferma?.(sessionId);
  return alKernel;
}

test('AUX-06 il modello dei riassunti e la sua finestra arrivano al kernel attraverso agent-service; senza, non viaggiano', async () => {
  const alKernel = await giroSpiato({ modelloRiassuntoFn: () => AUX, finestraTokenFn: (m) => (m === AUX ? 32_768 : 1_000_000) });
  assert.ok(alKernel);
  assert.equal(alKernel.modelloRiassunto, AUX);
  assert.equal(alKernel.finestraRiassuntoToken, 32_768);
  const ignota = await giroSpiato({ modelloRiassuntoFn: () => AUX, finestraTokenFn: (m) => (m === AUX ? null : 1_000_000) });
  assert.equal(ignota.modelloRiassunto, AUX);
  assert.equal(Object.hasOwn(ignota, 'finestraRiassuntoToken'), false, 'finestra ignota: non viaggia, l\'adattatore usa quella della conversazione');
  for (const modelloRiassuntoFn of [undefined, () => null, () => CONV]) {
    const senza = await giroSpiato({ ...(modelloRiassuntoFn ? { modelloRiassuntoFn } : {}), finestraTokenFn: () => 1_000_000 });
    assert.equal(Object.hasOwn(senza, 'modelloRiassunto'), false, String(modelloRiassuntoFn));
    assert.equal(Object.hasOwn(senza, 'finestraRiassuntoToken'), false);
  }
});

/* ---------------------------------------------------------------------------------------------------- dentro il giro */
const { talosLavora } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
const { stimaTokenConversazione: stima } = await import('../src/kernel/talosHarness.mjs');
const storiaGiro = (coppie) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(60)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(60)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storiaGiro(c + 1)) < token) c += 1; return c; };

async function giroAdattatore(t, extra) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
  const cartella = mkdtempSync(join(tmpdir(), 'riassunto-aux-giro-'));
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
  const esito = await talosLavora({ cartella, modello: CONV, chiave: 'finta', task: { consegna: 'Leggi.' }, messaggiIniziali: [...storiaGiro(coppiePer(2600)), { role: 'user', content: 'Leggi i file.' }],
    contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access', ...extra,
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine') fine.push(e); } });
  return { riassunti, fine, esito };
}

test('AUX-07 dentro il giro: il riassunto va sul modello dei riassunti; il record resta della conversazione', async (t) => {
  const { riassunti, esito } = await giroAdattatore(t, { modelloRiassunto: AUX, finestraRiassuntoToken: 32_768 });
  assert.ok(riassunti.length >= 1, 'il giro ha compattato');
  assert.ok(riassunti.every((m) => m === AUX), JSON.stringify(riassunti));
  const record = esito.recordDiCompattazione?.at(-1);
  assert.ok(record, 'un record del turno');
  assert.equal(record.modello, CONV);
});

test('AUX-08 dentro il giro, verso contrario: senza modello dei riassunti, o con una finestra che non regge, il modello della conversazione', async (t) => {
  const senza = await giroAdattatore(t, {});
  assert.ok(senza.riassunti.length >= 1);
  assert.ok(senza.riassunti.every((m) => m === CONV), JSON.stringify(senza.riassunti));
  const stretta = await giroAdattatore(t, { modelloRiassunto: AUX, finestraRiassuntoToken: 2_048 });
  assert.ok(stretta.riassunti.length >= 1);
  assert.ok(stretta.riassunti.every((m) => m === CONV), JSON.stringify(stretta.riassunti));
});

test('AUX-09 fine giro: il limite d\'uscita è quello del modello dei riassunti, non della conversazione', async (t) => {
  const { r } = await fineGiro(t, { modelloRiassuntoFn: () => AUX, finestraTokenFn: () => 200_000, limiteUscitaFn: (m) => (m === AUX ? 3_000 : 32_000) });
  assert.equal(r.chiamate.length, 1);
  assert.equal(r.chiamate[0].modello, AUX);
  assert.ok(r.chiamate[0].maxOutputTokens <= 3_000, `tetto ${r.chiamate[0].maxOutputTokens}`);
});
