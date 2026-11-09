/*
 * C6-bis, la terza strada (owner 28/10/2026; OK di Performance, Mobile e CLI 30/10): il riassunto di FINE GIRO del registro,
 * `scriviRiassuntoDelleParti`. Con un modello locale a posto unico il riassunto del modello lo scrive qui, fra due giri, quindi è qui che
 * un ALTRO modello locale scaricherebbe la chat (domanda Q1 di Performance). La stessa catena del giro e del motore: scelto → riserva →
 * senza modello. Condizione della CLI: la riserva parte con fornitore e modello ESPLICITI, e senza riserva mai il modello della
 * conversazione al suo posto. Registro VERO, giri e riassuntore finti, TEMP privata, nessuna porta, nessuna chiave.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { VARIABILE_TETTO_TOKEN } from '../src/kernel/compattazione-desktop.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CLOUD = 'z-ai/glm-5.3-flash';
const SCELTO = 'openai:scelto-dei-riassunti';
const RISERVA = { provider: 'anthropic', model: 'riserva-dei-riassunti' };
const ID_RISERVA = 'anthropic:riserva-dei-riassunti';

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function giri() {
  const tutti = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    tutti.push({ input, concludi(storia) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [], scartoMisurato: 0 } }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${tutti.length}` });
    return attesa;
  };
  return { tutti, avviaSessioneFn };
}
/* Il riassuntore: `errori[modello]` è l'errore che quel modello lancia; gli altri rispondono. L'uso del tentativo fallito viaggia sull'errore. */
function riassuntore(errori = {}) {
  const chiamate = [];
  const fn = async (input) => {
    chiamate.push({ modello: input.modello, riserva: input.riserva ?? null, fornitore: input.fornitore ?? null, reasoning: input.reasoning ?? null });
    const crea = errori[input.modello];
    if (crea) throw crea();
    return { scelta: { role: 'assistant', content: `## Riassunto\nscritto da ${input.modello}` }, finishReason: 'stop', usage: { prompt_tokens: 10, completion_tokens: 5 } };
  };
  return { fn, chiamate };
}
const errore403 = () => Object.assign(new Error('403 Forbidden'), { status: 403, usage: { prompt_tokens: 7, completion_tokens: 0 } });
const erroreDiRete = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('getaddrinfo ENOTFOUND api'), { code: 'ENOTFOUND' }) });

const storiaGrande = (letture = 10) => {
  const s = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < letture; i += 1) {
    s.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `file${i}.txt` }) } }] });
    s.push({ role: 'tool', tool_call_id: `call_${i}`, content: 'x'.repeat(3_000) });
  }
  s.push({ role: 'user', content: 'Seconda richiesta' }, { role: 'assistant', content: 'Fatto.' });
  return s;
};
/* tutti gli eventi CUSTOM col nome dato, dovunque stiano nella riga salvata */
function eventi(cartellaStore, sessionId, nome) {
  const trovati = [];
  const visita = (x) => {
    if (!x || typeof x !== 'object') return;
    if (x.type === 'CUSTOM' && x.name === nome) { trovati.push(x.value); return; }
    for (const v of Object.values(x)) visita(v);
  };
  for (const riga of readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n')) visita(JSON.parse(riga));
  return trovati;
}
async function attendi(condizione, messaggio) {
  for (let i = 0; i < 400; i += 1) { if (await condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error(messaggio);
}
function ambiente(t, { scelta, errori, modello = CLOUD, reasoning = null, registroExtra = {} }) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '6000';
  const cartellaStore = cartellaDiProva('talos-c6bis-fine-giro-');
  const r = riassuntore(errori);
  const g = giri();
  let ms = Date.parse('2026-10-30T12:00:00.000Z');
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn: g.avviaSessioneFn,
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello, chiave: 'k', riassumiPerCompattazioneFn: r.fn, clock: () => new Date(ms += 1000),
    sceltaDelRiassuntoFn: () => scelta, ...registroExtra });
  t.after(async () => {
    if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima;
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId, erroreAvvio } = registro.avvia('task-vero', { modelloScelto: modello, ...(reasoning ? { reasoningScelto: reasoning } : {}) });
  assert.ok(sessionId, JSON.stringify(erroreAvvio));
  return { registro, r, g, sessionId, cartellaStore };
}
/* il fine giro è finito quando la riga «fine» della compattazione è sul disco */
async function fineGiro({ g, sessionId, cartellaStore }) {
  g.tutti[0].concludi(storiaGrande());
  await attendi(async () => { await attendiScritture({ cartellaStore, sessionId }); return eventi(cartellaStore, sessionId, 'talos.compattazione').some((v) => v?.fase === 'fine'); },
    'il riassunto di fine giro non è finito');
  return eventi(cartellaStore, sessionId, 'talos.compattazione').filter((v) => v?.fase === 'fine').at(-1);
}

test('C6BIS-FINE-01 — 403 sul modello scelto: la riserva della persona riassume, con fornitore e modello espliciti, e l\'avviso esce UNA volta', async (t) => {
  const amb = ambiente(t, { scelta: { modelloDelRiassunto: SCELTO, riservaDelRiassunto: RISERVA }, errori: { [SCELTO]: errore403 }, reasoning: { effort: 'high' } });
  const fine = await fineGiro(amb);
  assert.ok(amb.r.chiamate[0].reasoning, 'premessa: la conversazione ragiona, e il modello scelto riceve il suo ragionamento (basso)');
  assert.deepEqual(amb.r.chiamate.map((c) => c.modello), [SCELTO, ID_RISERVA], 'lo scelto una volta, poi la riserva — mai un secondo tentativo pagato sullo scelto');
  const allaRiserva = amb.r.chiamate[1];
  assert.equal(allaRiserva.riserva, true, 'condizione della CLI: la chiamata dice che è la riserva');
  assert.equal(allaRiserva.fornitore, 'anthropic', 'condizione della CLI: il fornitore esplicito, così la porta sceglie la chiave giusta');
  assert.equal(allaRiserva.reasoning, null, 'il ragionamento della conversazione non va alla riserva');
  assert.equal(fine.compattato, true, JSON.stringify(fine));
  assert.equal(fine.riassuntoDi, ID_RISERVA);
  assert.equal(fine.dallaRiserva, true);
  const avvisi = eventi(amb.cartellaStore, amb.sessionId, 'talos.riassunto-modello-inutilizzabile');
  assert.equal(avvisi.length, 1, JSON.stringify(avvisi));
  assert.equal(avvisi[0].modello, SCELTO);
  assert.equal(avvisi[0].motivo, 'accesso-negato');
  assert.equal(avvisi[0].scelto, 'persona');
});

test('C6BIS-FINE-02 — rete giù sul modello scelto: la riserva riassume e NESSUN avviso (il guasto è passeggero)', async (t) => {
  const amb = ambiente(t, { scelta: { modelloDelRiassunto: SCELTO, riservaDelRiassunto: RISERVA }, errori: { [SCELTO]: erroreDiRete } });
  const fine = await fineGiro(amb);
  assert.deepEqual(amb.r.chiamate.map((c) => c.modello), [SCELTO, ID_RISERVA]);
  assert.equal(fine.compattato, true, JSON.stringify(fine));
  assert.equal(fine.riassuntoDi, ID_RISERVA);
  assert.equal(eventi(amb.cartellaStore, amb.sessionId, 'talos.riassunto-modello-inutilizzabile').length, 0);
  assert.deepEqual(fine.nonDisponibile, { modello: SCELTO, stato: 'bloccato', motivo: 'rete' }, 'FE-053: la riga della riserva dice perché lo scelto non ha scritto');
});

test('C6BIS-FINE-02-ORA (Mobile, FE-053) — un limite dell\'account con l\'ora: la riga la riceve, con `diAccount`; lo scelto che risponde non porta niente', async (t) => {
  const riapre = Date.now() + 3_600_000;
  const limite = () => Object.assign(new Error('The usage limit has been reached'), { status: 429, code: 'CHATGPT_LIMITE_DEL_PIANO', retryAt: riapre });
  const amb = ambiente(t, { scelta: { modelloDelRiassunto: SCELTO, riservaDelRiassunto: RISERVA }, errori: { [SCELTO]: limite } });
  const fine = await fineGiro(amb);
  assert.equal(fine.riassuntoDi, ID_RISERVA, JSON.stringify(fine));
  assert.equal(fine.nonDisponibile?.modello, SCELTO);
  assert.equal(fine.nonDisponibile?.motivo, 'limite');
  assert.equal(fine.nonDisponibile?.finoAlle, riapre, JSON.stringify(fine.nonDisponibile));
  assert.equal(fine.nonDisponibile?.diAccount, true);
  const scritto = ambiente(t, { scelta: { modelloDelRiassunto: SCELTO, riservaDelRiassunto: RISERVA }, errori: {} });
  assert.equal((await fineGiro(scritto)).nonDisponibile, undefined);
});

test('C6BIS-FINE-03 — 403 e nessuna riserva: niente secondo tentativo pagato, niente modello della conversazione, «non disponibile» col perché', async (t) => {
  const amb = ambiente(t, { scelta: { modelloDelRiassunto: SCELTO }, errori: { [SCELTO]: errore403 } });
  const fine = await fineGiro(amb);
  assert.deepEqual(amb.r.chiamate.map((c) => c.modello), [SCELTO], 'una sola chiamata: lo scelto, e basta');
  assert.equal(fine.compattato, false);
  assert.equal(fine.motivo, 'non-disponibile', JSON.stringify(fine));
  assert.deepEqual(fine.nonDisponibile, { modello: SCELTO, stato: 'inutilizzabile', motivo: 'accesso-negato' });
});

test('CATENA-IMP-02 — le Impostazioni: di serie il modello è null, mai indovinato; poi scelto, riserva e senza modello nell\'ordine', (t) => {
  assert.deepEqual(ambiente(t, { scelta: {}, errori: {} }).registro.catenaDelleImpostazioni(),
    [{ ruolo: 'scelto', modello: null, stato: 'pronto', origine: 'serie' }, { ruolo: 'senza-modello', modello: null, stato: 'pronto' }]);
  assert.deepEqual(ambiente(t, { scelta: { modelloDelRiassunto: SCELTO, riservaDelRiassunto: RISERVA }, errori: {} }).registro.catenaDelleImpostazioni().map((a) => [a.ruolo, a.modello, a.stato, a.origine]),
    [['scelto', SCELTO, 'pronto', 'scelta'], ['riserva', ID_RISERVA, 'pronto', 'scelta'], ['senza-modello', null, 'pronto', undefined]]);
  assert.deepEqual(ambiente(t, { scelta: { modelloDelRiassunto: SCELTO, riservaDelRiassunto: 'conversazione' }, errori: {} }).registro.catenaDelleImpostazioni().map((a) => [a.ruolo, a.modello]),
    [['scelto', SCELTO], ['riserva', null], ['senza-modello', null]], 'la riserva è il modello della conversazione: non ce n\'è uno solo da scrivere');
});

test('CATENA-IMP-03 — un modello che una conversazione ha trovato negato si vede anche nelle Impostazioni, senza una conversazione aperta', async (t) => {
  const amb = ambiente(t, { scelta: { modelloDelRiassunto: SCELTO, riservaDelRiassunto: RISERVA }, errori: { [SCELTO]: errore403 } });
  await fineGiro(amb);
  assert.deepEqual(amb.registro.catenaDelleImpostazioni().map((a) => [a.ruolo, a.stato, a.motivo]),
    [['scelto', 'inutilizzabile', 'accesso-negato'], ['riserva', 'pronto', undefined], ['senza-modello', 'pronto', undefined]]);
});

test('CATENA-IMP-04 — senza la chiave si vede subito, senza aspettare un guasto; le chiavi in panchina non sono «senza chiave»', (t) => {
  const con = (risposta) => ambiente(t, { scelta: { modelloDelRiassunto: SCELTO }, errori: {}, registroExtra: { prontoFn: (m) => (m === SCELTO ? risposta : { pronto: true }) } }).registro.catenaDelleImpostazioni()[0];
  assert.deepEqual([con({ pronto: false, motivo: 'provider-key-missing-named' }).stato, con({ pronto: false, motivo: 'provider-key-missing-named' }).motivo], ['inutilizzabile', 'senza-chiave']);
  assert.equal(con({ pronto: false, messaggio: 'paused' }).stato, 'pronto');
  assert.equal(con({ pronto: true }).stato, 'pronto');
});

test('C6BIS-FINE-04 (Perf-Q1) — chat su un modello locale: un ALTRO modello locale scelto per i riassunti non viene mai chiamato, riassume la riserva remota', async (t) => {
  const amb = ambiente(t, { modello: 'local:chat-della-persona', scelta: { modelloDelRiassunto: 'local:un-altro', riservaDelRiassunto: RISERVA }, errori: {} });
  const fine = await fineGiro(amb);
  assert.ok(!amb.r.chiamate.some((c) => c.modello === 'local:un-altro'), `il locale diverso scaricherebbe la chat: ${JSON.stringify(amb.r.chiamate)}`);
  assert.deepEqual(amb.r.chiamate.map((c) => c.modello), [ID_RISERVA]);
  assert.equal(fine.compattato, true, JSON.stringify(fine));
  assert.equal(fine.riassuntoDi, ID_RISERVA);
});

test('C6BIS-FINE-04-TELEFONO (Mobile, FE-053) — anche col motore del telefono un altro modello locale non viene chiamato: un posto solo', async (t) => {
  const amb = ambiente(t, { modello: 'locale-ospite:chat-della-persona', scelta: { modelloDelRiassunto: 'locale-ospite:un-altro', riservaDelRiassunto: RISERVA }, errori: {} });
  await fineGiro(amb);
  assert.ok(!amb.r.chiamate.some((c) => c.modello === 'locale-ospite:un-altro'), `il locale diverso scaricherebbe la chat: ${JSON.stringify(amb.r.chiamate)}`);
});

test('C6BIS-FINE-05 (Perf-Q1) — chat su un modello locale e lo STESSO modello per i riassunti: si chiama lui, il posto è già suo', async (t) => {
  const amb = ambiente(t, { modello: 'local:chat-della-persona', scelta: { modelloDelRiassunto: 'local:chat-della-persona', riservaDelRiassunto: RISERVA }, errori: {} });
  const fine = await fineGiro(amb);
  assert.deepEqual(amb.r.chiamate.map((c) => c.modello), ['local:chat-della-persona']);
  assert.equal(fine.compattato, true, JSON.stringify(fine));
  assert.equal(fine.riassuntoDi, undefined, 'riassunto dal modello della conversazione: niente da dire');
});

/* ---------------------------------------------------------------------- spesa di servizio (owner 30/10/2026, contratto §1-2) */
const ACCESA = { consumoDiServizioDurevole: true };

test('SERVIZIO-FINE-01 — un riassunto di fine giro riuscito: UNA riga consumo-di-servizio col suo uso, mai una consumo-fornitore', async (t) => {
  const amb = ambiente(t, { scelta: { modelloDelRiassunto: SCELTO, riservaDelRiassunto: RISERVA }, errori: {}, registroExtra: ACCESA });
  await fineGiro(amb);
  const righe = eventi(amb.cartellaStore, amb.sessionId, 'consumo-di-servizio');
  assert.equal(righe.length, 1, JSON.stringify(righe));
  assert.equal(righe[0].schema, 'talos.consumo-di-servizio.v1');
  assert.equal(righe[0].scopo, 'riassunto');
  assert.equal(righe[0].esito, 'completato');
  assert.equal(righe[0].fonte, 'openai');
  assert.equal(righe[0].modelloRemoto, 'scelto-dei-riassunti');
  assert.deepEqual(righe[0].usage, { prompt_tokens: 10, completion_tokens: 5 });
  assert.equal(righe[0].inPrimoPiano, false, 'a fine giro nessuno aspetta');
  assert.ok(Number.isSafeInteger(righe[0].durataMs) && righe[0].durataMs >= 0);
  assert.equal('costoDichiarato' in righe[0], false, 'non dichiarato ⇒ assente, mai 0');
  assert.equal(eventi(amb.cartellaStore, amb.sessionId, 'consumo-fornitore').length, 0, 'la barra del contesto non vede il riassunto');
});

test('SERVIZIO-FINE-02 — 403 sullo scelto e poi la riserva: DUE righe, ognuna col SUO uso (mai la somma), la seconda «riserva»', async (t) => {
  const amb = ambiente(t, { scelta: { modelloDelRiassunto: SCELTO, riservaDelRiassunto: RISERVA }, errori: { [SCELTO]: errore403 }, registroExtra: ACCESA });
  await fineGiro(amb);
  const righe = eventi(amb.cartellaStore, amb.sessionId, 'consumo-di-servizio');
  assert.deepEqual(righe.map((r) => [r.modelloRemoto, r.esito, r.riserva ?? false]), [['scelto-dei-riassunti', 'interrotto', false], ['riserva-dei-riassunti', 'completato', true]]);
  assert.deepEqual(righe[0].usage, { prompt_tokens: 7, completion_tokens: 0 }, 'l\'uso del tentativo fallito, solo il suo');
  assert.deepEqual(righe[1].usage, { prompt_tokens: 10, completion_tokens: 5 }, 'la riserva col suo uso, senza la somma C1b');
});

test('SERVIZIO-FINE-03 — AL CONTRARIO: con la porta spenta (di serie) nessuna riga, com\'era', async (t) => {
  const amb = ambiente(t, { scelta: { modelloDelRiassunto: SCELTO, riservaDelRiassunto: RISERVA }, errori: { [SCELTO]: errore403 } });
  await fineGiro(amb);
  assert.equal(eventi(amb.cartellaStore, amb.sessionId, 'consumo-di-servizio').length, 0);
});

test('SERVIZIO-FINE-04 (Mobile, Performance) — un riassunto FERMATO a metà che il fornitore ha già fatturato: la riga «fermato» tiene il suo uso; e porta giro e runId del giro', async (t) => {
  const fermato = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError', usage: { prompt_tokens: 9, completion_tokens: 3 } });
  const amb = ambiente(t, { scelta: { modelloDelRiassunto: SCELTO, riservaDelRiassunto: RISERVA }, errori: { [SCELTO]: fermato }, registroExtra: ACCESA });
  await fineGiro(amb);
  const righe = eventi(amb.cartellaStore, amb.sessionId, 'consumo-di-servizio');
  assert.ok(righe.length >= 1, JSON.stringify(righe));
  assert.equal(righe[0].esito, 'fermato');
  assert.deepEqual(righe[0].usage, { prompt_tokens: 9, completion_tokens: 3 }, 'il fatturato di un riassunto fermato resta nel conto');
  assert.equal(righe[0].runId, 'r1', 'il run del giro a cui appartiene');
  assert.ok(Number.isSafeInteger(righe[0].giro) && righe[0].giro >= 1, JSON.stringify(righe[0]));
});
