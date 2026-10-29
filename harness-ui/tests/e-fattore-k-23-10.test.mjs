/*
 * 23/10/2026 — §4 della CLI, pezzo E (owner 22/10 «tutto dentro la 0.6.13», rapporto `research-overflow-0613/REPORT.md` §4.1): le due
 *   misure che la regola del 10% usa al posto delle costanti.
 *   - k, il fattore di sottostima: `prompt_tokens` veri / stima della richiesta mandata (messaggi più schemi degli attrezzi), fra 1 e 4,
 *     come cline (`sdk/packages/core/src/extensions/context/compaction.ts:328-355`, `compaction-shared.ts:27`). Il guadagno G è in unità
 *     di stima: un riassunto si paga se G ≥ 0,10 × soglia / k.
 *   - S, il riassunto atteso: la mediana dei riassunti VERI della sessione (stimati col testo arrivato, nelle stesse unità di G), con lo
 *     stesso tetto della finestra e mai più del tratto che riassume; senza riassunti veri, la stima di prima.
 *   Ogni regola nei due versi, e il filo: giro → servizio → registro → giro dopo.
 * Fornitore finto via `fetchDiRete`, cartelle temporanee, nessuna porta.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosLavora as talosLavoraVero } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaToken, stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const talosLavora = (input) => talosLavoraVero({ scartoMisurato: 0, ...input });
const MODELLO = 'z-ai/glm-5.3-flash';

/* ------------------------------------------------------------------ le funzioni pure */

test('E-PURO-01 — k: veri / stima, fra 1 e 4; un numero che manca o non è positivo non è una misura', () => {
  assert.equal(compattazione.fattoreK(9_000, 3_000), 3);
  assert.equal(compattazione.fattoreK(100, 3_000), 1, 'mai sotto 1: la stima che conta di più non allarga niente');
  assert.equal(compattazione.fattoreK(50_000, 1_000), 4, 'mai sopra 4: una stima minuscola non fa crollare la regola');
  assert.equal(compattazione.fattoreK(0, 1_000), null);
  assert.equal(compattazione.fattoreK(1_000, 0), null);
  assert.equal(compattazione.fattoreK(Number.NaN, 1_000), null);
});

test('E-PURO-02 — la mediana dei riassunti veri: le ultime nove, i numeri validi; vuota ⇒ null', () => {
  assert.equal(compattazione.medianaRiassunti([300, 100, 200]), 200);
  assert.equal(compattazione.medianaRiassunti([100, 200, 300, 400]), 250, 'pari: la media dei due di mezzo');
  assert.equal(compattazione.medianaRiassunti([]), null);
  assert.equal(compattazione.medianaRiassunti(null), null);
  assert.equal(compattazione.medianaRiassunti([-5, Number.NaN, 'x', 120]), 120, 'solo i numeri positivi');
  assert.equal(compattazione.medianaRiassunti([9_999, 9_999, 9_999, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 1, 'contano le ultime nove');
  assert.deepEqual(compattazione.conRiassuntoVero([1, 2, 3, 4, 5, 6, 7, 8, 9], 10), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('E-PURO-03 — S: con la mediana vera al posto del quinto del tratto, col tetto della finestra e mai più del tratto; AL CONTRARIO senza, come prima', () => {
  const mezzo = [{ role: 'user', content: 'x'.repeat(40_000) }]; // ~10.000 token
  const senza = compattazione.riassuntoAtteso(mezzo, { finestraToken: 64_000 });
  assert.equal(senza, Math.floor(stima(mezzo) * 0.2), 'premessa: senza mediana, un quinto del tratto');
  assert.equal(compattazione.riassuntoAtteso(mezzo, { finestraToken: 64_000, mediana: 700 }), 700, 'la mediana vera');
  assert.equal(compattazione.riassuntoAtteso(mezzo, { finestraToken: 64_000, mediana: 50_000 }), 3_200, 'col tetto della finestra (5%)');
  assert.equal(compattazione.riassuntoAtteso([{ role: 'user', content: 'x'.repeat(400) }], { finestraToken: 64_000, mediana: 700 }), 100, 'mai più del tratto');
  assert.equal(compattazione.riassuntoAtteso(mezzo, { finestraToken: 64_000, mediana: null }), senza);
});

test('E-PURO-04 — la regola del 10% in unità di stima: un guadagno del 7% della soglia non si paga con k = 1, si paga con k = 2; e la mediana entra nel guadagno', () => {
  const soglia = 10_000;
  const mezzo = [{ role: 'user', content: 'x'.repeat(4_000) }]; // 1.000 token, S = 400 (il pavimento piccolo)
  const pavimentoConCornice = 5_000;
  assert.equal(compattazione.riassuntoAtteso(mezzo, { soglia }), 400, 'premessa: S di serie');
  const prima = pavimentoConCornice + 400 + 700; // guadagno 700 = 7% della soglia
  const base = { prima, pavimentoConCornice, mezzo, soglia };
  assert.equal(compattazione.riassuntoUtile(base), false, 'k di serie (1): 7% < 10%');
  assert.equal(compattazione.riassuntoUtile({ ...base, k: 2 }), true, 'k = 2: 7% ≥ 10% / 2');
  assert.equal(compattazione.riassuntoUtile({ ...base, k: 1.3 }), false, 'k = 1,3: 7% < 7,7%');
  assert.equal(compattazione.riassuntoUtile({ ...base, k: 9 }), true, 'k oltre 4 vale 4');
  assert.equal(compattazione.riassuntoUtile({ ...base, k: 0.5 }), false, 'k sotto 1 vale 1');
  /* la mediana vera dei riassunti (50 invece di 400): il guadagno sale a 1.050, il 10,5% */
  assert.equal(compattazione.guadagnoAtteso({ ...base, mediana: 50 }), 1_050);
  assert.equal(compattazione.riassuntoUtile({ ...base, mediana: 50 }), true);
  assert.equal(compattazione.riassuntoNonPuoRidurre(5_420, pavimentoConCornice, mezzo, { soglia }), false, 'premessa: 5.420 contro 5.400');
  assert.equal(compattazione.riassuntoNonPuoRidurre(5_420, pavimentoConCornice, mezzo, { soglia, mediana: 500 }), true, 'con S = 500 non riduce più');
});

/* ------------------------------------------------------------------ il giro, col fornitore finto */

function conTetto(t, valore) {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
}
const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };
/** Il fornitore: `fattore` moltiplica la stima della richiesta (messaggi più schemi) per dare il numero «vero» */
function fornitore({ fattore = 1, riassunto = '## Riassunto\nbreve.' } = {}) {
  const conti = { riassunti: 0, corpi: [] };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { conti.riassunti += 1; return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: riassunto }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }); }
    conti.corpi.push(corpo);
    const veri = Math.round((stima(corpo.messages) + compattazione.stimaDegliAttrezzi(corpo.tools)) * fattore);
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: veri, completion_tokens: 1 } });
  };
  return { fetchDiRete, conti };
}
async function giro(t, { messaggiIniziali, rete, ...resto }) {
  const cartella = cartellaDiProva('talos-e-k-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  return talosLavora({ cartella, modello: MODELLO, chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali, contestoDelProgetto: 'Project files:\n',
    fetchDiRete: rete.fetchDiRete, permessi: 'Full access', ...resto });
}

test('E-GIRO-01 — il giro misura k sul numero vero (messaggi più schemi) e lo restituisce; AL CONTRARIO un fornitore onesto dà 1', async (t) => {
  const messaggi = [...storia(6), { role: 'user', content: 'ciao' }];
  const denso = await giro(t, { messaggiIniziali: messaggi, rete: fornitore({ fattore: 2.5 }) });
  assert.ok(Math.abs(denso.fattoreK - 2.5) < 0.05, `k ≈ 2,5 (${denso.fattoreK})`);
  const onesto = await giro(t, { messaggiIniziali: messaggi, rete: fornitore({ fattore: 1 }) });
  assert.equal(onesto.fattoreK, 1);
  const ereditato = await giro(t, { messaggiIniziali: messaggi, rete: fornitore({ fattore: 1.5 }), fattoreK: 3 });
  assert.ok(Math.abs(ereditato.fattoreK - 1.5) < 0.05, `la misura nuova vince su quella ereditata (${ereditato.fattoreK})`);
});

test('E-GIRO-02 — un riassunto pagato entra nei riassunti veri della sessione (stimato col testo arrivato); quello senza modello no', async (t) => {
  conTetto(t, 4_000);
  const inEmergenza = [...storia(coppiePer(6_500)), { role: 'user', content: 'Adesso continua' }];
  const testo = `## Riassunto\n${'Dettaglio importante. '.repeat(40)}`;
  const pagato = await giro(t, { messaggiIniziali: inEmergenza, rete: fornitore({ riassunto: testo }), riassuntiVeri: [111, 222] });
  assert.deepEqual(pagato.riassuntiVeri.slice(0, 2), [111, 222], 'quelli di prima restano');
  assert.equal(pagato.riassuntiVeri.length, 3, JSON.stringify(pagato.riassuntiVeri));
  assert.ok(Math.abs(pagato.riassuntiVeri[2] - stimaToken(testo.trim())) <= 3, `il nuovo pesa come il suo testo (${pagato.riassuntiVeri[2]} contro ${stimaToken(testo)})`);
});

/* ------------------------------------------------------------------ il servizio e il registro: lungo il filo */

test('E-SERVIZIO-01 — il servizio passa al giro i riassunti veri e k della sessione; AL CONTRARIO senza, niente', async () => {
  const ricevuti = [];
  const fn = async (input) => { ricevuti.push({ riassuntiVeri: input.riassuntiVeri, fattoreK: input.fattoreK }); return { comeFinita: 'concluso', detto: 'ok', messaggiFinali: [], recordDiCompattazione: [] }; };
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'p' }, modello: 'm', chiave: 'k', onEvento: () => {}, riassuntiVeri: [300, 500], fattoreK: 2.2, talosLavoraFn: fn });
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'p' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn: fn });
  assert.deepEqual(ricevuti, [{ riassuntiVeri: [300, 500], fattoreK: 2.2 }, { riassuntiVeri: undefined, fattoreK: undefined }]);
});

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}

test('E-REGISTRO-01 — il registro tiene k e i riassunti veri dell\'ultimo giro e li passa al giro dopo; al cambio di modello k torna da capo', async (t) => {
  const giri = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    giri.push({ input, concludi(extra = {}) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'ok' }], recordDiCompattazione: [], ...extra } }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
    return attesa;
  };
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: MODELLO, chiave: 'k',
    riassumiPerCompattazioneFn: async () => ({ scelta: { role: 'assistant', content: '## R' }, finishReason: 'stop', usage: null }), finestraTokenFn: () => 64_000 });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: MODELLO });
  assert.equal(giri[0].input.fattoreK, undefined, 'premessa: una sessione nuova non ha k');
  giri[0].concludi({ fattoreK: 2.5, riassuntiVeri: [400, 600] });
  await new Promise((ok) => setTimeout(ok, 50));
  registro.resume(sessionId, 'ancora');
  assert.equal(giri.at(-1).input.fattoreK, 2.5);
  assert.deepEqual(giri.at(-1).input.riassuntiVeri, [400, 600]);
  giri.at(-1).concludi({ fattoreK: 1.2, riassuntiVeri: [400, 600, 800] });
  await new Promise((ok) => setTimeout(ok, 50));
  assert.deepEqual(await registro.aggiornaImpostazioni(sessionId, { modello: 'altro/modello' }), { ok: true }, 'premessa: il modello cambia');
  registro.resume(sessionId, 'con un altro modello');
  assert.equal(giri.at(-1).input.fattoreK, undefined, 'altro modello, altro tokenizzatore: k da capo');
  assert.deepEqual(giri.at(-1).input.riassuntiVeri, [400, 600, 800], 'i riassunti veri restano (sono nelle unità della stima)');
});

/* ------------------------------------------------------------------ le DECISIONI che k e S cambiano (scene trovate cercando, 23/10) */

/* Il tratto vecchio è piccolo e quasi tutto il peso sta negli ultimi scambi, che restano: il guadagno di un riassunto è fra il 2,5% e il
   10% della soglia. Con k = 1 e S stimato non si paga; con k = 4, o con riassunti veri brevi (S piccolo), sì. */
const scenaAlBordo = (coppie, grande) => [...storia(coppie, 280), { role: 'user', content: 'Leggi il log' },
  { role: 'assistant', content: `Il log: ${'riga '.repeat(grande / 5)}` }, { role: 'user', content: `Ultima: ${'parola '.repeat(400)}` }];

test('E-GIRO-03 — nel giro k e S decidono: al bordo un riassunto non si paga con k = 1 e S stimato; si paga con k = 4 ereditato, o con la mediana di riassunti veri brevi', async (t) => {
  conTetto(t, 4_000);
  const m = scenaAlBordo(8, 9_000);
  const senza = fornitore();
  await giro(t, { messaggiIniziali: m, rete: senza });
  assert.equal(senza.conti.riassunti, 0, `premessa: al bordo, senza misure, non si paga (stima ${stima(m)})`);
  const conK = fornitore();
  await giro(t, { messaggiIniziali: m, rete: conK, fattoreK: 4 });
  assert.ok(conK.conti.riassunti >= 1, 'con k = 4 il 10% della soglia vale 2,5% in unità di stima: si paga');
  const conS = fornitore();
  await giro(t, { messaggiIniziali: m, rete: conS, riassuntiVeri: [20, 20, 20] });
  assert.ok(conS.conti.riassunti >= 1, 'con riassunti veri da 20 token il guadagno atteso sale: si paga');
});

test('E-GIRO-04 — un numero impossibile del fornitore (×30, sopra la finestra) non è una misura di k; e il riassunto SENZA modello non entra nei riassunti veri', async (t) => {
  const messaggi = [...storia(6), { role: 'user', content: 'ciao' }];
  const impossibile = await giro(t, { messaggiIniziali: messaggi, rete: fornitore({ fattore: 30 }), finestraToken: 32_000 });
  assert.equal(impossibile.fattoreK, null, `nessuna misura (${impossibile.fattoreK})`);
  /* il freno tirato e un rifiuto: il riassunto è quello senza modello (ragione «freno») */
  let chiamate = 0;
  const ripiego = await giro(t, { messaggiIniziali: [...storia(40), { role: 'user', content: 'Continua.' }], riassuntiVeri: [111],
    freno: { colpi: 2, at: 'x', detto: true, modello: MODELLO },
    rete: { fetchDiRete: async (_u, o) => {
      const corpo = JSON.parse(o.body);
      chiamate += 1;
      if (chiamate === 1) return new Response(JSON.stringify({ error: { message: `prompt is too long: ${stima(corpo.messages)} tokens > ${Math.floor(stima(corpo.messages) * 0.6)} maximum` } }), { status: 400 });
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
    } } });
  assert.deepEqual(ripiego.riassuntiVeri, [111], JSON.stringify(ripiego.riassuntiVeri));
});

/* Il registro con un giro finto: la storia finale la decide la prova, il fine giro e il /compact sono veri */
function registroDiProva(t) {
  const cartellaStore = cartellaDiProva('talos-e-registro-');
  const giri = [];
  const conti = { riassunti: 0 };
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    giri.push({ input, concludi(storiaFinale, extra = {}) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storiaFinale, recordDiCompattazione: [], scartoMisurato: 0, ...extra } }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
    return attesa;
  };
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: MODELLO, chiave: 'k',
    riassumiPerCompattazioneFn: async () => { conti.riassunti += 1; return { scelta: { role: 'assistant', content: '## Riassunto\nR' }, finishReason: 'stop', usage: null }; }, finestraTokenFn: () => 64_000 });
  const assesta = async (sessionId) => { await attendiScritture({ cartellaStore, sessionId }); await new Promise((ok) => setTimeout(ok, 300)); await attendiScritture({ cartellaStore, sessionId }); };
  t.after(async () => { await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  return { registro, giri, conti, assesta };
}
const scenaDelRegistro = (coppie, grande) => [{ role: 'system', content: 's' }, { role: 'user', content: 'Consegna' }, ...storia(coppie, 280), { role: 'user', content: 'Leggi il log' },
  { role: 'assistant', content: `Il log: ${'riga '.repeat(grande / 5)}` }, { role: 'user', content: `Ultima: ${'parola '.repeat(400)}` }, { role: 'assistant', content: 'ok' }];

test('E-REGISTRO-02 — a fine giro k e S decidono come nel giro; e il riassunto pagato a fine giro entra nei riassunti veri del giro dopo', async (t) => {
  conTetto(t, 4_000);
  const m = scenaDelRegistro(5, 11_000);
  const corsa = async (extra) => {
    const amb = registroDiProva(t);
    const { sessionId } = amb.registro.avvia('task-vero', { modelloScelto: MODELLO });
    amb.giri[0].concludi(m, extra);
    await amb.assesta(sessionId);
    return { ...amb, sessionId };
  };
  const senza = await corsa({});
  assert.equal(senza.conti.riassunti, 0, `premessa: al bordo, senza misure, il fine giro non paga (stima ${stima(m)})`);
  const conK = await corsa({ fattoreK: 4 });
  assert.equal(conK.conti.riassunti, 1, 'con k = 4 dal giro, il fine giro paga');
  conK.registro.resume(conK.sessionId, 'ancora');
  assert.equal(conK.giri.at(-1).input.riassuntiVeri?.length, 1, `il riassunto di fine giro entra nei riassunti veri (${JSON.stringify(conK.giri.at(-1).input.riassuntiVeri)})`);
  assert.ok(Math.abs(conK.giri.at(-1).input.riassuntiVeri[0] - stimaToken('## Riassunto\nR')) <= 2);
  const conS = await corsa({ riassuntiVeri: [20, 20, 20] });
  assert.equal(conS.conti.riassunti, 1, 'con riassunti veri brevi dal giro, il fine giro paga');
});

test('E-REGISTRO-03 — anche il /compact usa S: un tratto che col riassunto stimato «non riduce» si riassume se i riassunti veri della sessione sono brevi', async (t) => {
  conTetto(t, 4_000);
  const m = scenaDelRegistro(3, 11_000);
  const corsa = async (extra) => {
    const amb = registroDiProva(t);
    const { sessionId } = amb.registro.avvia('task-vero', { modelloScelto: MODELLO });
    amb.giri[0].concludi(m, extra);
    await amb.assesta(sessionId);
    return amb.registro.compatta(sessionId);
  };
  const senza = await corsa({});
  assert.equal(senza.compattato, false, JSON.stringify(senza));
  assert.equal(senza.motivo, 'poco-utile', JSON.stringify(senza));
  const conS = await corsa({ riassuntiVeri: [20, 20, 20] });
  assert.equal(conS.compattato, true, JSON.stringify(conS));
});

/* Le due strade del bordo dove S decide anche senza soglia: il rifiuto coi numeri (un riassunto pagato arriva al bersaglio?) e il
   «non entra» (pavimento, più S, più lo scarto, oltre la finestra?) */
const scenaConLog = (righe) => [...storia(10, 280), { role: 'user', content: 'Leggi il log' }, { role: 'assistant', content: `Il log: ${'riga '.repeat(righe)}` },
  { role: 'user', content: 'Continua.' }];

test('E-RIFIUTO-01 — sul rifiuto coi numeri S decide se un riassunto pagato può arrivare al bersaglio: stimato no (senza modello, ragione «bersaglio»), coi riassunti veri brevi sì', async (t) => {
  const m = scenaConLog(1_400);
  const corsa = async (extra) => {
    const conti = { riassunti: 0, n: 0 };
    const eventi = [];
    const fetchDiRete = async (_u, o) => {
      const corpo = JSON.parse(o.body);
      if (!corpo.tools?.length) { conti.riassunti += 1; return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }); }
      conti.n += 1;
      if (conti.n === 1) return new Response(JSON.stringify({ error: { message: `prompt is too long: ${stima(corpo.messages)} tokens > ${Math.floor(stima(corpo.messages) * 0.8)} maximum` } }), { status: 400 });
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
    };
    await giro(t, { messaggiIniziali: m, rete: { fetchDiRete }, onGiro: (e) => { if (e?.tipo === 'compattazione-fine') eventi.push(e); }, ...extra });
    return { conti, eventi };
  };
  const senza = await corsa({});
  assert.equal(senza.conti.riassunti, 0);
  assert.equal(senza.eventi.find((e) => e.compattato === true)?.ragione, 'bersaglio', JSON.stringify(senza.eventi.map((e) => [e.motivo, e.ragione])));
  const conS = await corsa({ riassuntiVeri: [20, 20, 20] });
  assert.equal(conS.conti.riassunti, 1, 'coi riassunti veri brevi il riassunto arriva al bersaglio: si paga');
});

/* Revisione 10 della CLI (23/10/2026, il pavimento di F6): il pavimento col riassunto atteso blocca il PAGAMENTO, in silenzio; «non entra»
   si dice solo se nemmeno il riassunto senza modello entra — qui entra, quindi niente avviso in tutti e due i versi (prima: detto, e poi il
   riassunto senza modello faceva entrare il giro) */
test('E-NONENTRA-01 — S entra nel pavimento che decide se si paga: col riassunto stimato supera la finestra (non si paga, e non si dice: quello senza modello entra), coi riassunti veri brevi no (si paga)', async (t) => {
  const m = scenaConLog(1_800);
  const corsa = async (extra) => {
    const rete = fornitore();
    const eventi = [];
    /* 29/10/2026 (R-24/R-25): la descrizione di `cerca` è cresciuta di qualche decina di token (`continua` solo id + `pattern`,
       `dentro` file o cartella) e la finestra stretta di questa scena stava sul bordo basso: misurato, la scena regge da 5.080 a
       ~5.200 (prima finiva più in basso). 5.140 è il centro della banda nuova: stesso caso, non un'altra prova. */
    await giro(t, { messaggiIniziali: m, rete, finestraToken: 5_140, onGiro: (e) => { if (e?.tipo === 'compattazione-fine') eventi.push(e); }, ...extra });
    return { riassunti: rete.conti.riassunti, nonEntra: eventi.filter((e) => e.motivo === 'non-entra').length };
  };
  assert.deepEqual(await corsa({}), { riassunti: 0, nonEntra: 0 });
  assert.deepEqual(await corsa({ riassuntiVeri: [20, 20, 20] }), { riassunti: 1, nonEntra: 0 });
});
