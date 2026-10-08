/*
 * F3, onda 2 di F2 (24/09/2026) — la compattazione che si SALVA nel registro, i writer che non ignorano,
 * la ripresa onesta e le quattro righe di collante (finestra dal catalogo, `createdAt`, `usage` all'hook,
 * ragionamento basso per la sintesi fuori OpenRouter).
 *
 * Ogni caso è nato ROSSO sulla base `b07c2012e` (onda 1 fusa) — l'output sta nel rapporto F3. Tutto ermetico:
 * modello finto, `fetchDiRete` finta, TEMP privata, nessuna porta, nessun journal dell'owner.
 */
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { SessionStoreError, attendiScritture, registraRigaSync } from '../src/session-store.mjs';
import {
  MARCATORE_RIASSUNTO, SCHEMA_RECORD_COMPATTAZIONE, VARIABILE_TETTO_TOKEN, applicaRecord, creaRecord,
} from '../src/kernel/compattazione-desktop.mjs';
import { talosLavora as talosLavoraKernel } from '../src/kernel/talosHarness.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function createSessionRegistry(opzioni) {
  return createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, ...opzioni });
}
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function sessioneControllabile() {
  let risolviAttesa;
  const attesa = new Promise((risolvi) => { risolviAttesa = risolvi; });
  let onEventoCatturato = null;
  let inputCatturato = null;
  let chiamate = 0;
  return {
    avviaSessioneFn: async (input) => {
      chiamate += 1;
      inputCatturato = input;
      onEventoCatturato = input.onEvento;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      return attesa;
    },
    concludi(eventoFinale, risultato = { ok: true }) { onEventoCatturato(eventoFinale); risolviAttesa(risultato); },
    emetti(evento) { onEventoCatturato(evento); },
    get chiamate() { return chiamate; },
    get ultimoInput() { return inputCatturato; },
  };
}
/* Una sequenza di finte: la prima chiamata usa la prima, la seconda la seconda… (un turno ciascuna). */
function sessioniControllabili(n) {
  const finte = Array.from({ length: n }, () => sessioneControllabile());
  let i = 0;
  return { finte, avviaSessioneFn: (input) => finte[i++].avviaSessioneFn(input) };
}
const cartellaStoreVera = () => cartellaDiProva('talos-f3-registro-');
const righeDelJournal = (cartellaStore, sessionId) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((r) => JSON.parse(r));
async function attendi(condizione, { tentativi = 400, intervalloMs = 10, messaggio = 'condizione non raggiunta' } = {}) {
  for (let i = 0; i < tentativi; i += 1) {
    if (await condizione()) return;
    await new Promise((r) => setTimeout(r, intervalloMs));
  }
  throw new Error(messaggio);
}
const unTick = () => new Promise((r) => setImmediate(r));
function conTetto(t, valore) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  if (valore === undefined) delete process.env[VARIABILE_TETTO_TOKEN];
  else process.env[VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
}
const storiaDiBase = () => [
  { role: 'system', content: 'You are a coding agent' },
  { role: 'user', content: 'Ciao, leggi il progetto' },
  { role: 'assistant', content: 'Letto.' },
  { role: 'user', content: 'Ora scrivi il file' },
  { role: 'assistant', content: 'Scritto.' },
];
/* ⛔ Il modello delle prove del background è in forma `vendor/nome`: un id nudo (`'m'`) è rifiutato per FORMA da `modelloDiSessionePerRete` (17/09) e il registro, giustamente, non riassume.
   Una storia GRANDE: 6 scambi con risultati da 3.000 caratteri (≈ 750 token l'uno), ben sopra un tetto di 2.000 token. */
const storiaGrande = (byteRisultato = 3_000) => {
  const s = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < 6; i += 1) {
    s.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `file${i}.txt` }) } }] });
    s.push({ role: 'tool', tool_call_id: `call_${i}`, content: 'x'.repeat(byteRisultato) });
  }
  s.push({ role: 'assistant', content: 'Fatto.' });
  return s;
};
const recordDiProva = (storia, extra = {}) => creaRecord({
  coveredThrough: storia.length,
  riassunto: [storia[0], { role: 'user', content: `${MARCATORE_RIASSUNTO}\n\nRIASSUNTO DI PROVA` }],
  tokenPrima: 9_000, tokenDopo: 120, misura: 'stimato', at: '2026-09-24T10:00:00.000Z', modello: 'm', ...extra,
});
const riassuntoreFinto = ({ ritardo = false, contenuto = 'RIASSUNTO DAL MODELLO', finishReason = 'stop' } = {}) => {
  const chiamate = [];
  let rilascia = null;
  const fn = async (input) => {
    chiamate.push(input);
    if (ritardo) await new Promise((r) => { rilascia = r; });
    return { scelta: { role: 'assistant', content: contenuto }, finishReason, usage: { prompt_tokens: 100, completion_tokens: 10 } };
  };
  return { fn, chiamate, rilascia: () => rilascia?.() };
};

/* ─── 1. Persistere la compattazione automatica (decisione 3) ─────────────────────────────────────── */

test('CTX-REG-AUTO-COMPACTION-SURVIVES-RESTART — il record del turno finisce nel journal e un registro NUOVO riparte proiettato', async () => {
  const cartellaStore = cartellaStoreVera();
  const storia = storiaDiBase();
  const record = recordDiProva(storia);
  const finta = sessioneControllabile();
  try {
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
    const { sessionId } = registro.avvia('task-vero');
    finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [record] } });
    await attendi(() => existsSync(join(cartellaStore, `${sessionId}.jsonl`)) && righeDelJournal(cartellaStore, sessionId).some((r) => r.tipo === 'compattazione'), { messaggio: 'nessuna riga `compattazione` nel journal' });
    const riga = righeDelJournal(cartellaStore, sessionId).find((r) => r.tipo === 'compattazione');
    assert.equal(riga.record.schema, SCHEMA_RECORD_COMPATTAZIONE);
    assert.equal(riga.record.coveredThrough, storia.length);
    await attendiScritture({ cartellaStore, sessionId });

    const dopo = sessioneControllabile();
    const riavvio = createSessionRegistry({ cartellaStore, avviaSessioneFn: dopo.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
    await riavvio.ripristina();
    assert.equal(riavvio.resume(sessionId, 'seconda domanda').sessionId, sessionId);
    assert.deepEqual(dopo.ultimoInput.recordCompattazioneIniziale, record, 'il turno dopo il riavvio riceve il record persistito');
    const messaggi = dopo.ultimoInput.messaggiIniziali;
    assert.equal(messaggi.length, storia.length + 1, 'la storia passata al kernel resta GREZZA (decisione 3)');
    const proiettati = applicaRecord(messaggi, record);
    assert.equal(proiettati.length, 3, 'system + riassunto + nuova domanda');
    assert.equal(proiettati.at(-1).content, 'seconda domanda');
    dopo.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [...messaggi, { role: 'assistant', content: 'ok' }], recordDiCompattazione: [] } });
    await attendiScritture({ cartellaStore, sessionId });
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-REG-AUTO-COMPACTION-NOT-APPLIED-TWICE — la storia grezza non viene mai sostituita e il record si scrive UNA volta', async () => {
  const cartellaStore = cartellaStoreVera();
  const storia = storiaDiBase();
  const record = recordDiProva(storia);
  const { finte, avviaSessioneFn } = sessioniControllabili(3);
  try {
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
    const { sessionId } = registro.avvia('task-vero');
    finte[0].concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [record] } });
    await attendi(() => registro.statoCompattazione(sessionId)?.record?.at === record.at, { messaggio: 'il registro non tiene il record in RAM' });
    assert.equal(registro.resume(sessionId, 'domanda 2').sessionId, sessionId);
    assert.deepEqual(finte[1].ultimoInput.recordCompattazioneIniziale, record);
    const storia2 = [...finte[1].ultimoInput.messaggiIniziali, { role: 'assistant', content: 'risposta 2' }];
    assert.ok(!storia2.some((m) => typeof m.content === 'string' && m.content.startsWith(MARCATORE_RIASSUNTO)), 'nessun riassunto dentro la storia grezza');
    finte[1].concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia2, recordDiCompattazione: [] } });
    await attendiScritture({ cartellaStore, sessionId });
    assert.equal(registro.resume(sessionId, 'domanda 3').sessionId, sessionId);
    assert.deepEqual(finte[2].ultimoInput.recordCompattazioneIniziale, record, 'lo STESSO record, non uno ricalcolato o accumulato');
    assert.equal(finte[2].ultimoInput.messaggiIniziali.length, storia2.length + 1);
    finte[2].concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [...finte[2].ultimoInput.messaggiIniziali], recordDiCompattazione: [] } });
    await attendiScritture({ cartellaStore, sessionId });
    assert.equal(righeDelJournal(cartellaStore, sessionId).filter((r) => r.tipo === 'compattazione').length, 1, 'una sola riga `compattazione`');
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-REG-COMPACTION-UNDO — Annulla scrive una lapide, la proiezione torna grezza e sopravvive al riavvio', async () => {
  const cartellaStore = cartellaStoreVera();
  const storia = storiaDiBase();
  const record = recordDiProva(storia);
  const { finte, avviaSessioneFn } = sessioniControllabili(2);
  try {
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
    const { sessionId } = registro.avvia('task-vero');
    const eventi = [];
    registro.iscriviti(sessionId, (e) => eventi.push(e));
    finte[0].concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [record] } });
    await attendi(() => registro.statoCompattazione(sessionId)?.record?.at === record.at);
    const nonTrovata = await registro.annullaCompattazione(sessionId, 'non-esiste'); // K2: code + reason + frase inglese (l'italiano sta nel dizionario)
    assert.deepEqual({ code: nonTrovata.code, reason: nonTrovata.reason, erroreAvvio: nonTrovata.erroreAvvio }, { code: 'COMPACTION_NOT_FOUND', reason: 'compaction-id-not-found', erroreAvvio: 'No compaction with this identifier to cancel' });
    const esito = await registro.annullaCompattazione(sessionId, record.at);
    assert.deepEqual(esito, { ok: true, annullata: true });
    assert.equal(registro.statoCompattazione(sessionId).record, null);
    assert.ok(eventi.some((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'annullata' && e.value.at === record.at), 'evento di annullamento per la UI');
    await attendiScritture({ cartellaStore, sessionId });
    assert.ok(righeDelJournal(cartellaStore, sessionId).some((r) => r.tipo === 'compattazione-annullata' && r.at === record.at), 'lapide su disco');

    const riavvio = createSessionRegistry({ cartellaStore, avviaSessioneFn: finte[1].avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
    await riavvio.ripristina();
    assert.equal(riavvio.statoCompattazione(sessionId).record, null, 'la lapide vale anche dopo il riavvio');
    assert.equal(riavvio.resume(sessionId, 'x').sessionId, sessionId);
    assert.equal(finte[1].ultimoInput.recordCompattazioneIniziale ?? null, null);
    finte[1].concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [...finte[1].ultimoInput.messaggiIniziali], recordDiCompattazione: [] } });
    await attendiScritture({ cartellaStore, sessionId });
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

/* ─── 2. Background a fine giro (decisione 5) ─────────────────────────────────────────────────────── */

test('CTX-REG-BACKGROUND-COMPACTION-AFTER-TURN — sopra soglia, dopo RunFinished, il registro riassume da solo e persiste il record', async (t) => {
  conTetto(t, 2_000);
  const cartellaStore = cartellaStoreVera();
  const storia = storiaGrande();
  const riassuntore = riassuntoreFinto();
  const { finte, avviaSessioneFn } = sessioniControllabili(2);
  try {
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k', riassumiPerCompattazioneFn: riassuntore.fn });
    const { sessionId } = registro.avvia('task-vero');
    const eventi = [];
    registro.iscriviti(sessionId, (e) => eventi.push(e));
    finte[0].concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [] } });
    await attendi(() => eventi.some((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine'), { messaggio: 'nessuna fine dal background' });
    const { record } = registro.statoCompattazione(sessionId);
    assert.ok(record, 'record in RAM');
    assert.equal(riassuntore.chiamate.length, 1, 'una chiamata al modello');
    assert.equal(riassuntore.chiamate[0].modello, 'z-ai/glm-5.3-flash', 'il modello della SESSIONE, nella forma che il trasporto capisce');
    assert.ok(riassuntore.chiamate[0].maxOutputTokens > 0);
    assert.ok(!riassuntore.chiamate[0].messaggi.some((m) => m.role === 'tool' && m.content.length > 3_000), 'il riassuntore riceve il mezzo, non attrezzi');
    assert.equal(record.coveredThrough, storia.length, 'marca d’acqua = lunghezza al via');
    assert.ok(record.riassunto.some((m) => typeof m.content === 'string' && m.content.includes('RIASSUNTO DAL MODELLO')));
    assert.equal(record.riassunto[0].role, 'system', 'la testa resta alla lettera');
    const inizio = eventi.find((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'inizio');
    const fine = eventi.find((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine');
    assert.ok(inizio && inizio.value.tokenPrima >= 2_000 && inizio.value.motivo === 'background', `evento di inizio con i numeri: ${JSON.stringify(inizio?.value)}`);
    assert.ok(fine && fine.value.compattato === true && fine.value.tokenDopo < fine.value.tokenPrima && fine.value.at === record.at, `evento di fine con X → Y: ${JSON.stringify(fine?.value)}`);
    await attendiScritture({ cartellaStore, sessionId });
    const righe = righeDelJournal(cartellaStore, sessionId);
    assert.equal(righe.filter((r) => r.tipo === 'compattazione').length, 1);
    assert.ok(righe.some((r) => r.type === 'CUSTOM' && r.name === 'talos.compattazione' && r.value?.fase === 'fine'), 'evento persistito per F5');
    assert.equal(registro.resume(sessionId, 'dopo').sessionId, sessionId);
    assert.deepEqual(finte[1].ultimoInput.recordCompattazioneIniziale, record);
    finte[1].concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [...finte[1].ultimoInput.messaggiIniziali, { role: 'assistant', content: 'ok' }], recordDiCompattazione: [] } });
    await attendi(() => !registro.statoCompattazione(sessionId).inCorso);
    await attendiScritture({ cartellaStore, sessionId });
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-REG-BACKGROUND-TRUNCATED-ONE-CALL — riassunto fermato dal tetto: UNA chiamata, budget di Hermes, «troncato» dichiarato', async (t) => {
  conTetto(t, 2_000);
  const cartellaStore = cartellaStoreVera();
  const storia = storiaGrande();
  const riassuntore = riassuntoreFinto({ contenuto: '## Objective\nparziale', finishReason: 'length' });
  const { finte, avviaSessioneFn } = sessioniControllabili(1);
  try {
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k', riassumiPerCompattazioneFn: riassuntore.fn });
    const { sessionId } = registro.avvia('task-vero');
    const eventi = [];
    registro.iscriviti(sessionId, (e) => eventi.push(e));
    finte[0].concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [] } });
    await attendi(() => eventi.some((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine'), { messaggio: 'nessuna fine dal background' });
    const fine = eventi.find((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine');
    assert.equal(fine.value.compattato, false);
    assert.equal(fine.value.motivo, 'troncato');
    assert.equal(riassuntore.chiamate.length, 1, 'un riassunto troncato non si richiede uguale una seconda volta');
    // mezzo piccolo, soglia 2.000 senza finestra ⇒ il pavimento di Hermes, non il vecchio 2.048 fisso
    assert.equal(riassuntore.chiamate[0].maxOutputTokens, 2_000);
    assert.ok(riassuntore.chiamate[0].messaggi.at(-1).content.includes(`at most ${Math.floor((2_000 * 1_200) / 2_048)} words`));
    assert.equal(registro.statoCompattazione(sessionId).record ?? null, null, 'nessun record da un riassunto troncato');
    await attendi(() => !registro.statoCompattazione(sessionId).inCorso);
    await attendiScritture({ cartellaStore, sessionId });
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-REG-BACKGROUND-DOES-NOT-BLOCK-NEXT-TURN — un turno che parte durante la sintesi non aspetta, e la sintesi non copre i messaggi nuovi', async (t) => {
  conTetto(t, 2_000);
  const cartellaStore = cartellaStoreVera();
  const storia = storiaGrande();
  const riassuntore = riassuntoreFinto({ ritardo: true });
  const { finte, avviaSessioneFn } = sessioniControllabili(3);
  try {
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k', riassumiPerCompattazioneFn: riassuntore.fn });
    const { sessionId } = registro.avvia('task-vero');
    finte[0].concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [] } });
    await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === true, { messaggio: 'la sintesi in background non risulta in corso' });
    assert.equal(riassuntore.chiamate.length, 1);
    const ripresa = registro.resume(sessionId, 'messaggio NUOVO');
    assert.equal(ripresa.sessionId, sessionId, `il turno parte subito, senza aspettare la sintesi: ${JSON.stringify(ripresa)}`);
    assert.equal(finte[1].chiamate, 1);
    assert.equal(finte[1].ultimoInput.recordCompattazioneIniziale ?? null, null, 'nessun record: la sintesi non è finita');
    const storia2 = [...finte[1].ultimoInput.messaggiIniziali, { role: 'assistant', content: 'risposta al nuovo' }];
    finte[1].concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia2, recordDiCompattazione: [] } });
    await unTick();
    riassuntore.rilascia();
    await attendi(() => registro.statoCompattazione(sessionId)?.inCorso === false && registro.statoCompattazione(sessionId)?.record, { messaggio: 'la sintesi non si è chiusa' });
    const { record } = registro.statoCompattazione(sessionId);
    assert.equal(record.coveredThrough, storia.length, 'copre solo la storia di quando è partita');
    assert.equal(registro.resume(sessionId, 'terzo').sessionId, sessionId);
    const proiettati = applicaRecord(finte[2].ultimoInput.messaggiIniziali, finte[2].ultimoInput.recordCompattazioneIniziale);
    assert.ok(proiettati.some((m) => m.role === 'user' && m.content === 'messaggio NUOVO'), 'il messaggio arrivato durante la sintesi resta alla lettera');
    assert.ok(proiettati.some((m) => m.role === 'assistant' && m.content === 'risposta al nuovo'));
    finte[2].concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [...finte[2].ultimoInput.messaggiIniziali], recordDiCompattazione: [] } });
    await attendi(() => !registro.statoCompattazione(sessionId).inCorso);
    await attendiScritture({ cartellaStore, sessionId });
  } finally {
    riassuntore.rilascia();
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-REG-BACKGROUND-UNDER-THRESHOLD-NO-CALL — sotto soglia nessuna chiamata al modello, nessuna riga, nessun evento (verso contrario)', async (t) => {
  conTetto(t, undefined);
  const cartellaStore = cartellaStoreVera();
  const riassuntore = riassuntoreFinto();
  const finta = sessioneControllabile();
  try {
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k', riassumiPerCompattazioneFn: riassuntore.fn });
    const { sessionId } = registro.avvia('task-vero');
    /* Una storia TAGLIABILE (15 messaggi, 6 scambi) ma piccola (~400 token): sotto il tetto di 200K. Con la sola guardia
       della divisione la mutazione «soglia tolta» sopravviveva (M4 del rapporto): la prova deve morderla. */
    finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storiaGrande(40), recordDiCompattazione: [] } });
    await attendiScritture({ cartellaStore, sessionId });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(riassuntore.chiamate.length, 0);
    assert.equal(registro.statoCompattazione(sessionId).record, null);
    assert.equal(registro.statoCompattazione(sessionId).inCorso, false);
    const righe = righeDelJournal(cartellaStore, sessionId);
    assert.ok(!righe.some((r) => r.tipo === 'compattazione' || (r.type === 'CUSTOM' && r.name === 'talos.compattazione')));
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

/* ─── 3. Le quattro righe di collante ─────────────────────────────────────────────────────────────── */

test('CTX-REG-WINDOW-FROM-CATALOG — la finestra del modello arriva al kernel dal catalogo (sola lettura), null senza catalogo', () => {
  const finta = sessioneControllabile();
  let chiestoPer = null;
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
    finestraTokenFn: (modello) => { chiestoPer = modello; return 131_072; } });
  registro.avvia('task-vero');
  assert.equal(finta.ultimoInput.finestraToken, 131_072);
  assert.equal(chiestoPer, 'z-ai/glm-5.3-flash');
  finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } });

  const senza = sessioneControllabile();
  const registroSenza = createSessionRegistry({ avviaSessioneFn: senza.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  registroSenza.avvia('task-vero');
  assert.equal(senza.ultimoInput.finestraToken ?? null, null);
  senza.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } });
});

test('CTX-REG-POLICY — la sessione espone la stessa soglia verificata usata dal giro', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta,
    modello: 'z-ai/glm-5.3-flash', chiave: 'k', finestraTokenFn: () => 1_000_000 });
  const { sessionId } = registro.avvia('task-vero');
  assert.equal(finta.ultimoInput.finestraToken, 1_000_000);
  assert.deepEqual(registro.politicaCompattazione(sessionId), {
    windowTokens: 1_000_000, triggerTokens: 750_000, warningTokens: 600_000,
    emergencyTokens: 900_000, source: 'route-minimum', modelId: 'z-ai/glm-5.3-flash', inProgress: false,
  });
  finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } });
});

test('CTX-REG-CONTEXT-SESSION-CREATED-AT — leggiSessioneContesto espone createdAt per la politica del trial', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', clock: () => new Date('2026-09-24T12:00:00.000Z') });
  const { sessionId } = registro.avvia('task-vero');
  assert.equal(registro.leggiSessioneContesto(sessionId).createdAt, '2026-09-24T12:00:00.000Z');
  finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } });
});

test('CTX-REG-KERNEL-USAGE-TO-CAPTURE — il kernel passa `usage` a captureProviderResponse', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-f3-kernel-'));
  writeFileSync(join(dir, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(dir));
  const catturati = [];
  const fetchDiRete = async () => Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 42, completion_tokens: 3 } });
  const esito = await talosLavoraKernel({
    cartella: dir, task: { consegna: 'rispondi Fatto' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete, comandoProva: 'node -e 0',
    contextHooks: { prepare: async ({ messages }) => ({ messages }), captureProviderResponse: async (p) => { catturati.push(p); } },
  });
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(catturati.length, 1);
  assert.equal(catturati[0].usage?.prompt_tokens, 42, 'usage del fornitore all’hook (F4 punto 5)');
});

test('CTX-REG-SUMMARY-REASONING-OUTSIDE-OPENROUTER — la sintesi inviata a un motore locale porta reasoning_effort:none, come il corpo contato', async () => {
  let body = null;
  const adapter = createOwnerRuntimeAdapter({ destinazioneModelloDeps: { leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true, chiamaLocale: async (_path, options) => {
    body = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: 'Sintesi' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  } } });
  await adapter.callContextModel({ provider: 'local', model: 'fixture', messages: [{ role: 'user', content: 'ciao' }], maxOutputTokens: 256, fetchDiRete: async () => { throw new Error('no cloud'); } });
  assert.equal(body.reasoning_effort, 'none');
  assert.equal(body.reasoning, undefined);
});

/* ─── 4. I writer non ignorano più ────────────────────────────────────────────────────────────────── */

const eStoriaDiFineGiro = (record) => record.tipo === 'messaggi-finali' || (['messaggi-delta', 'checkpoint'].includes(record.tipo) && record.fase === 'finale');

test('CTX-REG-FINAL-HISTORY-WRITE-FAIL-VISIBLE — messaggi-finali non scritti ⇒ RunError visibile, non un log', async () => {
  const cartellaStore = cartellaStoreVera();
  const finta = sessioneControllabile();
  const consoleError = console.error;
  console.error = () => {};
  try {
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
      // 24/09/2026 (F2-bis B): la storia di fine giro è `messaggi-finali` nel formato di prima, `messaggi-delta`/`checkpoint` con `fase:'finale'` in quello nuovo
      registraRigaSyncFn: ({ record }) => { if (eStoriaDiFineGiro(record)) throw new Error('ENOSPC'); },
      registraRigaConfermataFn: async ({ record }) => { if (eStoriaDiFineGiro(record)) throw new Error('ENOSPC'); } });
    const { sessionId } = registro.avvia('task-vero');
    const eventi = [];
    registro.iscriviti(sessionId, (e) => eventi.push(e));
    finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storiaDiBase(), recordDiCompattazione: [] } });
    await attendi(() => eventi.some((e) => e.type === 'RunError' && e.code === 'SESSION_STORE_WRITE_FAILED'), { tentativi: 100, messaggio: `nessun RunError visibile; eventi: ${eventi.map((e) => e.type).join(',')}` });
    const errore = eventi.find((e) => e.type === 'RunError' && e.code === 'SESSION_STORE_WRITE_FAILED');
    assert.match(errore.message, /conversation|history/i);
    assert.equal(errore.messageChiave, 'server.sessionPersistence.historyNotSaved');
    assert.deepEqual(errore.messageParams, { detail: 'ENOSPC' });
  } finally {
    console.error = consoleError;
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-REG-QUEUE-ACK-ONLY-AFTER-DISK — accodaMessaggio non risponde ok:true a una coda non salvata', async () => {
  const cartellaStore = cartellaStoreVera();
  const finta = sessioneControllabile();
  const consoleError = console.error;
  console.error = () => {};
  try {
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
      registraRigaSyncFn: ({ record }) => { if (record.tipo === 'coda') throw new Error('ENOSPC'); },
      registraRigaConfermataFn: async ({ record }) => { if (record.tipo === 'coda') throw new Error('ENOSPC'); } });
    const { sessionId } = registro.avvia('task-vero');
    const esito = registro.accodaMessaggio(sessionId, 'in coda');
    assert.equal(esito.ok, undefined, `risposto ${JSON.stringify(esito)}`);
    assert.equal(esito.code, 'SESSION_STORE_WRITE_FAILED');
    assert.equal(registro.statoCoda(sessionId).voci?.length ?? registro.statoCoda(sessionId).items?.length ?? 0, 0, 'la coda in RAM non tiene ciò che il disco ha rifiutato');
    finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } });
  } finally {
    console.error = consoleError;
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

/* ─── 6. Ripresa onesta (decisione 7) ─────────────────────────────────────────────────────────────── */

function seminaJournal(cartellaStore, sessionId, messaggiFinali) {
  for (const record of [
    { tipo: 'intestazione', sessionId, taskId: 'task-vero', cartella: '/tmp/x', task: { consegna: 'Ciao' }, modello: 'm', avviataAlle: new Date().toISOString() },
    { type: 'RunStarted', _sequenza: 1 },
    { tipo: 'messaggi-finali', versioneGiro: 1, messaggiFinali },
    { type: 'RunFinished', _sequenza: 2 },
  ]) registraRigaSync({ cartellaStore, sessionId, record });
}

/*
 * ⛔ 24/09/2026 (review avversaria del coordinatore su F3+F5) — UN RIASSUNTO NON SOPRAVVIVE A UN RIAVVIO. L'evento
 *   `talos.compattazione {fase:'inizio'}` è durevole; allo spegnimento (`chiudi()`) le sintesi in background si abbandonano
 *   senza un «fine», e un crash non scrive niente. Al ripasso la barra «Riassumo la conversazione…» della chat si riaccendeva
 *   e nessuno la spegneva più (l'avviso «Compatta ora», che si nasconde mentre la barra c'è, spariva con lei).
 *   Hermes tiene lo stato «compacting» in memoria e lo RICONCILIA su una prova terminale (`store/compaction.ts`,
 *   `reconcileSessionCompacting`, clone 65ad529 letto il 24/09/2026). Qui la prova terminale è il riavvio stesso: il
 *   registro che ripristina sa che nessuna sintesi è viva, e chiude ogni «inizio» senza «fine» — in memoria, mai sul disco.
 */
test('CTX-REG-DANGLING-COMPACTION-CLOSED-AT-RESTORE — un riassunto iniziato e mai finito si chiude al ripristino con «interrotta», solo in memoria', async () => {
  const cartellaStore = cartellaStoreVera();
  const sessionId = 'sess-sintesi-interrotta';
  const AT = '2026-09-24T11:00:00.000Z';
  const AT_CHIUSO = '2026-09-24T10:00:00.000Z';
  try {
    seminaJournal(cartellaStore, sessionId, storiaDiBase());
    const evento = (value, _sequenza) => registraRigaSync({ cartellaStore, sessionId, record: { type: 'CUSTOM', name: 'talos.compattazione', value, _sequenza } });
    evento({ fase: 'inizio', tokenPrima: 150_000, soglia: 100_000, motivo: 'background', coveredThrough: 1, at: AT_CHIUSO }, 3);
    evento({ fase: 'fine', compattato: false, motivo: 'vuoto', at: AT_CHIUSO }, 4); // verso contrario: già chiuso, niente seconda chiusura
    evento({ fase: 'inizio', tokenPrima: 250_000, soglia: 200_000, motivo: 'background', coveredThrough: 1, at: AT }, 5); // il riavvio a metà
    const percorso = join(cartellaStore, `${sessionId}.jsonl`);
    const primaSulDisco = readFileSync(percorso);

    const finta = sessioneControllabile();
    const registro = createSessionRegistry({ cartellaStore, modello: 'm', chiave: 'k', avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta });
    await registro.ripristina();
    const compattazioni = registro.esporta(sessionId).eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione');
    const chiusure = compattazioni.filter((e) => e.value?.fase === 'fine' && e.value?.motivo === 'interrotta');
    assert.equal(chiusure.length, 1, `una sola chiusura, per l'inizio rimasto aperto: ${JSON.stringify(compattazioni.map((e) => e.value))}`);
    assert.equal(chiusure[0].value.at, AT);
    assert.equal(chiusure[0].value.compattato, false);
    assert.ok(chiusure[0]._sequenza > 5, 'la chiusura viene DOPO l’inizio che chiude');
    await attendiScritture({ cartellaStore, sessionId });
    assert.deepEqual(readFileSync(percorso), primaSulDisco, 'la chiusura vive in memoria: il ripristino non scrive sul disco');

    // il giro successivo non riusa la sequenza della chiusura: due eventi con la stessa `_sequenza` si scartano nel frontend
    const eventiVivi = [];
    registro.iscriviti(sessionId, (e) => eventiVivi.push(e));
    const ripresa = registro.resume(sessionId, 'andiamo avanti');
    assert.ok(!ripresa.erroreAvvio, ripresa.erroreAvvio);
    const partenza = eventiVivi.find((e) => e.type === 'RunStarted' && e._sequenza > 2);
    assert.ok(partenza && partenza._sequenza > chiusure[0]._sequenza, `RunStarted dopo la chiusura: ${partenza?._sequenza} contro ${chiusure[0]._sequenza}`);
    finta.concludi({ type: 'RunFinished', threadId: 't', runId: 'r2' });
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

/*
 * ⛔⛔ A20 (07/10/2026, bugfixer) — LE CHIUSURE FINTE. Su DESKTOP OLD (1363 giri) il ripristino aggiungeva 10 «interrotta» a 45
 *   compattazioni tutte concluse: l'adapter apre con `giro` senza `at` e chiude con un `fine` che porta anche `at`, e le due
 *   chiavi non combaciavano. Misura: `bugfixer/A20-EVENTI-710672f5.sse` (GET in sola lettura dal 4174).
 */
async function chiusureDopoIlRipristino(sessionId, eventiCompattazione) {
  const cartellaStore = cartellaStoreVera();
  try {
    seminaJournal(cartellaStore, sessionId, storiaDiBase());
    for (const [value, _sequenza] of eventiCompattazione) {
      registraRigaSync({ cartellaStore, sessionId, record: { type: 'CUSTOM', name: 'talos.compattazione', value, _sequenza } });
    }
    const finta = sessioneControllabile();
    const registro = createSessionRegistry({ cartellaStore, modello: 'm', chiave: 'k', avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta });
    await registro.ripristina();
    return registro.esporta(sessionId).eventi
      .filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value?.fase === 'fine' && e.value?.motivo === 'interrotta');
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
}

test('A20-01 LA FORMA VERA: inizio dell adapter senza «at» e fine con «at» sono la STESSA compattazione — nessuna chiusura finta', async () => {
  const chiusure = await chiusureDopoIlRipristino('sess-a20-forma-vera', [
    [{ fase: 'inizio', giro: 2, motivo: 'soglia', soglia: 100_000, tokenPrima: 120_000 }, 3],
    [{ fase: 'fine', giro: 2, compattato: true, at: '2026-10-05T10:00:00.000Z', coveredThrough: 4, tokenPrima: 120_000, tokenDopo: 30_000, motivo: 'soglia' }, 4],
    [{ fase: 'inizio', giro: 74, motivo: 'emergenza', soglia: 100_000, tokenPrima: 190_000 }, 5],
    [{ fase: 'fine', giro: 74, compattato: true, at: '2026-10-05T11:00:00.000Z', coveredThrough: 6, tokenPrima: 190_000, tokenDopo: 40_000, motivo: 'emergenza' }, 6],
    [{ fase: 'inizio', giro: 0, motivo: 'soglia', soglia: 100_000, tokenPrima: 110_000 }, 7],
    [{ fase: 'fine', giro: 0, compattato: false, motivo: 'vuoto' }, 8],
  ]);
  assert.equal(chiusure.length, 0, `nessuna compattazione era rimasta aperta: ${JSON.stringify(chiusure.map((e) => e.value))}`);
});

test('A20-02 PILA PER GIRO: un inizio interrotto davvero, poi inizio+fine nello stesso giro ⇒ esattamente UNA chiusura', async () => {
  const chiusure = await chiusureDopoIlRipristino('sess-a20-pila', [
    [{ fase: 'inizio', giro: 2, motivo: 'soglia', soglia: 100_000, tokenPrima: 120_000 }, 3], // interrotto: il server si è fermato
    [{ fase: 'inizio', giro: 2, motivo: 'soglia', soglia: 100_000, tokenPrima: 125_000 }, 4],
    [{ fase: 'fine', giro: 2, compattato: true, at: '2026-10-05T10:00:00.000Z', coveredThrough: 5, tokenPrima: 125_000, tokenDopo: 30_000, motivo: 'soglia' }, 5],
  ]);
  assert.equal(chiusure.length, 1, `una sola interruzione vera: ${JSON.stringify(chiusure.map((e) => e.value))}`);
  assert.equal(chiusure[0].value.giro, 2);
  assert.ok(chiusure[0]._sequenza > 5, 'la chiusura viene dopo l ultimo evento');
  /* review di «talos desktop» (mutante MB, pila → coda): il fine chiude l'inizio PIÙ RECENTE (sequenza 4); resta aperto, e si
     chiude, quello interrotto davvero (sequenza 3, tokenPrima 120.000) — non il contrario. */
  assert.equal(chiusure[0].value.sequenzaInizio, 3, 'la chiusura è dell inizio interrotto, il più vecchio');
});

test('A20-03 SFONDO E ADAPTER NELLO STESSO GIRO: ciascun fine chiude il suo inizio, mai quello dell altro', async () => {
  const AT_SFONDO = '2026-10-05T09:00:00.000Z';
  // i due chiusi ⇒ nessuna chiusura
  assert.equal((await chiusureDopoIlRipristino('sess-a20-entrambi', [
    [{ fase: 'inizio', motivo: 'background', soglia: 100_000, tokenPrima: 150_000, coveredThrough: 1, at: AT_SFONDO }, 3],
    [{ fase: 'inizio', giro: 3, motivo: 'soglia', soglia: 100_000, tokenPrima: 160_000 }, 4],
    [{ fase: 'fine', compattato: true, motivo: 'background', at: AT_SFONDO, coveredThrough: 2 }, 5],
    [{ fase: 'fine', giro: 3, compattato: true, at: '2026-10-05T09:05:00.000Z', coveredThrough: 5, motivo: 'soglia' }, 6],
  ])).length, 0);
  // AL CONTRARIO: solo lo sfondo si chiude ⇒ resta aperto quello dell'adapter, e la chiusura è sua (senza «at», col giro)
  const restaAdapter = await chiusureDopoIlRipristino('sess-a20-solo-sfondo', [
    [{ fase: 'inizio', motivo: 'background', soglia: 100_000, tokenPrima: 150_000, coveredThrough: 1, at: AT_SFONDO }, 3],
    [{ fase: 'inizio', giro: 3, motivo: 'soglia', soglia: 100_000, tokenPrima: 160_000 }, 4],
    [{ fase: 'fine', compattato: true, motivo: 'background', at: AT_SFONDO, giro: 3, coveredThrough: 2 }, 5],
  ]);
  assert.equal(restaAdapter.length, 1);
  assert.equal(restaAdapter[0].value.giro, 3);
  assert.equal(Object.hasOwn(restaAdapter[0].value, 'at'), false, 'la chiusura è dell inizio dell adapter, non dello sfondo');
});

test('CTX-REG-POISONED-RESUME-HONEST — su una coda avvelenata resume dice il vero (SESSION_STORE_AMBIGUOUS), non «Riprova»', async () => {
  const cartellaStore = cartellaStoreVera();
  const sessionId = 'sess-avvelenata';
  try {
    seminaJournal(cartellaStore, sessionId, storiaDiBase());
    const finta = sessioneControllabile();
    const ambiguo = () => { throw new SessionStoreError('coda incerta', 'SESSION_STORE_AMBIGUOUS'); };
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
      registraRigaSyncFn: ambiguo, registraRigaConfermataFn: async () => ambiguo() });
    await registro.ripristina();
    const esito = registro.resume(sessionId, 'continua');
    assert.equal(esito.code, 'SESSION_STORE_AMBIGUOUS', JSON.stringify(esito));
    assert.doesNotMatch(esito.erroreAvvio, /Riprova/);
    assert.match(esito.erroreAvvio, /diagnosi|incert/i);
    assert.equal(finta.chiamate, 0, 'nessun giro parte su una coda incerta');
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-REG-REPAIR-ANNOUNCED — una coda spezzata riparata al riavvio si DICE con un evento persistito', async () => {
  const cartellaStore = cartellaStoreVera();
  const sessionId = 'sess-spezzata';
  try {
    seminaJournal(cartellaStore, sessionId, storiaDiBase());
    appendFileSync(join(cartellaStore, `${sessionId}.jsonl`), '{"type":"TextMessageStart","messageId":"m1","ro');
    const registro = createSessionRegistry({ cartellaStore, modello: 'm', chiave: 'k' });
    const { ripristinate } = await registro.ripristina();
    assert.equal(ripristinate, 1);
    const evento = registro.esporta(sessionId).eventi.find((e) => e.type === 'CUSTOM' && e.name === 'talos.journal-riparato');
    assert.ok(evento, 'evento talos.journal-riparato nella storia');
    assert.equal(evento.value.righeScartate, 1);
    assert.ok(evento.value.byteScartati > 0);
    assert.match(String(evento.value.backup), /\.bak-/);
    await attendiScritture({ cartellaStore, sessionId });
    assert.ok(righeDelJournal(cartellaStore, sessionId).some((r) => r.type === 'CUSTOM' && r.name === 'talos.journal-riparato'), 'persistito');
    assert.ok(readdirSync(cartellaStore).some((n) => n.includes('.bak-')));

    const sano = createSessionRegistry({ cartellaStore, modello: 'm', chiave: 'k' });
    await sano.ripristina();
    assert.equal(sano.esporta(sessionId).eventi.filter((e) => e.name === 'talos.journal-riparato').length, 1, 'un file sano non annuncia una seconda riparazione (verso contrario)');
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('CTX-REG-RESUME-CLOSES-ORPHAN-TOOL-CALLS — una tool_call senza risultato riceve una chiusura sintetica, mai un orfano al fornitore', async () => {
  const cartellaStore = cartellaStoreVera();
  const sessionId = 'sess-orfana';
  const storia = [
    { role: 'system', content: 'You are a coding agent' },
    { role: 'user', content: 'leggi' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'call_orfana', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } }, { id: 'call_orfana_2', type: 'function', function: { name: 'elenca', arguments: '{}' } }] },
  ];
  try {
    seminaJournal(cartellaStore, sessionId, storia);
    const finta = sessioneControllabile();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
    await registro.ripristina();
    assert.equal(registro.resume(sessionId, 'continua').sessionId, sessionId);
    const messaggi = finta.ultimoInput.messaggiIniziali;
    const chiusure = messaggi.filter((m) => m.role === 'tool');
    assert.equal(chiusure.length, 2, 'una chiusura per ogni chiamata orfana');
    assert.deepEqual(chiusure.map((m) => m.tool_call_id), ['call_orfana', 'call_orfana_2']);
    assert.match(chiusure[0].content, /interrupt|not available/i);
    assert.equal(messaggi.indexOf(chiusure[1]), messaggi.length - 2, 'le chiusure stanno subito dopo l’assistant, prima del nuovo messaggio');
    assert.equal(messaggi.at(-1).content, 'continua');
    finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [...messaggi], recordDiCompattazione: [] } });
    await attendiScritture({ cartellaStore, sessionId });
    /* Verso contrario: una tool_call CON il suo risultato non riceve chiusure. */
    const completa = [...storia, { role: 'tool', tool_call_id: 'call_orfana', content: 'a' }, { role: 'tool', tool_call_id: 'call_orfana_2', content: 'b' }, { role: 'assistant', content: 'ok' }];
    const finta2 = sessioneControllabile();
    const registro2 = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta2.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
    seminaJournal(cartellaStore, 'sess-completa', completa);
    await registro2.ripristina();
    registro2.resume('sess-completa', 'x');
    assert.equal(finta2.ultimoInput.messaggiIniziali.filter((m) => m.role === 'tool').length, 2);
    finta2.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } });
    await attendiScritture({ cartellaStore });
  } finally {
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  }
});
