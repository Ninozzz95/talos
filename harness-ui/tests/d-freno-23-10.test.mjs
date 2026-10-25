/*
 * 23/10/2026 — §4 della CLI, pezzo D (owner 22/10/2026, punto 4 del testo approvato: «un freno contro la ripetizione»; 23/10 «Tutto
 *   nella 0.6.13»). Il FRENO dei riassunti automatici pagati: colpi (verdetto vero ancora oltre la soglia, riassunto che allunga),
 *   ricariche (tre riassunti pagati in tre giri), tirato ⇒ niente riassunti automatici pagati (resta la sola coda), riarmo (crescita del
 *   mezzo del 10% della soglia, modello o finestra cambiati, /compact), detto UNA volta per armamento con `at` = identità della tirata
 *   (richiesta della CLI del 23/10), salvato nel giornale e copiato nel record. Ogni regola nei due versi, e il filo intero: registro →
 *   servizio → giro → servizio → registro → giornale → riavvio.
 * Fornitore finto via `fetchDiRete`, cartelle temporanee, nessuna porta.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora as talosLavoraVero } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
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

test('D-PURO-01 — colpi, ricariche, tirato: due colpi tirano; tre riassunti dentro tre giri tirano; due no, e tre su quattro giri no', () => {
  assert.equal(compattazione.frenoTirato(null), false);
  const uno = compattazione.colpoAlFreno(null, { mezzo: 1_000, modello: MODELLO, finestra: 8_192 });
  assert.deepEqual({ colpi: uno.colpi, mezzo: uno.mezzoAlVerdetto, at: uno.at }, { colpi: 1, mezzo: 1_000, at: null });
  assert.equal(compattazione.frenoTirato(uno), false, 'un colpo non tira');
  assert.equal(compattazione.frenoTirato(compattazione.colpoAlFreno(uno)), true, 'due sì');
  const r = (giri) => giri.reduce((f, giro) => compattazione.ricaricaAlFreno(f, { giro }), null);
  assert.equal(compattazione.frenoTirato(r([5, 6, 7])), true, 'tre in tre giri');
  assert.equal(compattazione.frenoTirato(r([5, 5, 5])), true, 'tre nello stesso giro');
  assert.equal(compattazione.frenoTirato(r([5, 6])), false, 'due no');
  assert.equal(compattazione.frenoTirato(r([5, 6, 8])), false, 'tre su quattro giri no');
  assert.deepEqual(r([1, 2, 3, 9]).ricariche, [2, 3, 9], 'si tengono le ultime tre');
  assert.deepEqual(compattazione.ricaricaAlFreno(null, { giro: null }).ricariche, [], 'senza giro noto, niente');
  const azzerato = compattazione.letturaSottoLaSoglia({ ...r([5, 6]), colpi: 1 });
  assert.deepEqual({ colpi: azzerato.colpi, ricariche: azzerato.ricariche }, { colpi: 0, ricariche: [5, 6] }, 'una lettura sotto la soglia azzera i colpi, non le ricariche');
});

test('D-PURO-02 — il riarmo: il mezzo cresciuto del 10% della soglia, il modello o la finestra cambiati; AL CONTRARIO sotto il 10% resta', () => {
  const tirato = { colpi: 2, mezzoAlVerdetto: 5_000, modello: MODELLO, finestra: 8_192, ricariche: [3, 9], at: 'x', detto: true };
  /* Z-K2: il riarmo per crescita azzera i colpi, `at` e `detto`, e TIENE le ricariche (la memoria della ripetizione) */
  const riarmato = compattazione.frenoDiAdesso(tirato, { mezzo: 5_000 + 800, soglia: 8_000, modello: MODELLO, finestra: 8_192 });
  assert.equal(compattazione.frenoTirato(riarmato), false, '+800 su 8.000: riarmato');
  assert.deepEqual({ colpi: riarmato.colpi, at: riarmato.at, detto: riarmato.detto, ricariche: riarmato.ricariche }, { colpi: 0, at: null, detto: false, ricariche: [3, 9] });
  assert.ok(compattazione.frenoTirato(compattazione.frenoDiAdesso(tirato, { mezzo: 5_000 + 799, soglia: 8_000, modello: MODELLO, finestra: 8_192 })), '+799: ancora tirato');
  assert.equal(compattazione.frenoDiAdesso(tirato, { mezzo: 5_000, soglia: 8_000, modello: 'altro/modello', finestra: 8_192 }), null, 'modello cambiato');
  assert.equal(compattazione.frenoDiAdesso(tirato, { mezzo: 5_000, soglia: 8_000, modello: MODELLO, finestra: 16_384 }), null, 'finestra cambiata');
  assert.ok(compattazione.frenoDiAdesso({ colpi: 2 }, { mezzo: 99_999, soglia: 8_000, modello: MODELLO, finestra: 8_192 }), 'senza un mezzo al verdetto la crescita non riarma');
  /* i colpi e le ricariche registrano modello e finestra: il riarmo per identità vale anche per un freno nato da loro */
  const dalColpo = compattazione.colpoAlFreno(compattazione.colpoAlFreno(null, { modello: MODELLO, finestra: 8_192 }));
  assert.deepEqual({ modello: dalColpo.modello, finestra: dalColpo.finestra }, { modello: MODELLO, finestra: 8_192 });
  assert.equal(compattazione.frenoDiAdesso(dalColpo, { modello: 'altro/modello', finestra: 8_192 }), null, 'nato da due colpi, al cambio di modello si riarma');
  const dallaRicarica = compattazione.ricaricaAlFreno(null, { giro: 1, modello: MODELLO, finestra: 8_192 });
  assert.equal(compattazione.frenoDiAdesso(dallaRicarica, { modello: MODELLO, finestra: 16_384 }), null, 'nato da una ricarica, al cambio di finestra si riarma');
});

test('D-PURO-04 — Z-K2: la crescita non riarma un freno NON tirato (i suoi conti restano), né uno tirato per le RICARICHE (solo modello, finestra o /compact)', () => {
  const soglia = 9_216;
  const unColpo = { colpi: 1, mezzoAlVerdetto: 300, ricariche: [4], modello: MODELLO, finestra: 12_288 };
  assert.deepEqual(compattazione.frenoDiAdesso(unColpo, { mezzo: 300 + 1_000, soglia, modello: MODELLO, finestra: 12_288 }), compattazione.frenoValido(unColpo), 'non tirato: niente si azzera');
  const ripetizione = { colpi: 1, mezzoAlVerdetto: 300, ricariche: [4, 5, 6], at: 't6', detto: true, modello: MODELLO, finestra: 12_288 };
  assert.ok(compattazione.frenoTirato(compattazione.frenoDiAdesso(ripetizione, { mezzo: 300 + 50_000, soglia, modello: MODELLO, finestra: 12_288 })), 'tirato per le ricariche: la crescita non lo riarma');
  /* …nemmeno in parte: con `at` e `detto` azzerati resterebbe tirato (le ricariche) ma ridirebbe l'avviso a ogni crescita */
  assert.deepEqual(compattazione.frenoDiAdesso(ripetizione, { mezzo: 300 + 50_000, soglia, modello: MODELLO, finestra: 12_288 }), compattazione.frenoValido(ripetizione),
    'tirato per le ricariche: identico, `at` e `detto` compresi');
  assert.equal(compattazione.frenoDiAdesso(ripetizione, { mezzo: 300, soglia, modello: 'altro/modello', finestra: 12_288 }), null, 'AL CONTRARIO il cambio di modello sì');
});

/* La traccia di Z-K2 come prova: una ripetizione di 17 giri — il mezzo cresce di uno scambio (~1.000 token, ≥ 10% di 9.216) a giro e ogni
   riassunto pagato lascia la conversazione oltre la soglia (verdetto ⇒ colpo). Con la regola del giro (`freno = frenoDiAdesso(...)`). */
test('D-RIPETIZIONE-01 — Z-K2: in una ripetizione si pagano al più tre riassunti, poi il freno tira per le ricariche e resta tirato', () => {
  const soglia = 9_216, finestra = 12_288, CRESCITA = 1_000, DOPO = 300;
  let freno = null, mezzo = DOPO + CRESCITA, pagati = 0;
  const tirate = [];
  for (let giro = 4; giro <= 20; giro += 1) {
    freno = compattazione.frenoDiAdesso(freno, { mezzo, soglia, modello: MODELLO, finestra });
    if (!compattazione.frenoTirato(freno)) {
      pagati += 1;
      for (const nuovo of [() => compattazione.ricaricaAlFreno(freno, { giro, modello: MODELLO, finestra }), () => compattazione.colpoAlFreno(freno, { mezzo: DOPO, modello: MODELLO, finestra })]) {
        const r = compattazione.frenoCheTira(nuovo(), { at: `t${giro}-${tirate.length}` });
        freno = r.freno;
        if (r.evento) tirate.push(r.evento.perche);
      }
      mezzo = DOPO;
    }
    mezzo += CRESCITA;
  }
  assert.equal(pagati, 3, `al più tre riassunti pagati (${pagati})`);
  assert.equal(tirate.at(-1), 'ricariche', JSON.stringify(tirate));
  assert.equal(tirate.filter((p) => p === 'ricariche').length, 1, 'la tirata per le ricariche si dice una volta');
});

test('D-PURO-03 — la tirata si dice UNA volta, con `at` (l\'identità dell\'armamento), e il record ne porta una copia', () => {
  const due = { colpi: 2, mezzoAlVerdetto: 3_000 };
  const primo = compattazione.frenoCheTira(due, { at: '2026-10-23T10:00:00.000Z' });
  assert.deepEqual(primo.evento, { compattato: false, motivo: 'freno', perche: 'colpi', freno: { colpi: 2, mezzoAlVerdetto: 3_000, at: '2026-10-23T10:00:00.000Z' } });
  assert.equal(primo.freno.at, '2026-10-23T10:00:00.000Z');
  assert.equal(primo.freno.detto, true);
  assert.equal(compattazione.frenoCheTira(primo.freno, { at: '2026-10-23T11:00:00.000Z' }).evento, null, 'già detto: niente');
  assert.equal(compattazione.frenoCheTira({ colpi: 1 }).evento, null, 'non tirato: niente');
  assert.equal(compattazione.frenoCheTira({ ricariche: [3, 4, 5] }, { at: 'x' }).evento.perche, 'ricariche');
  const record = compattazione.creaRecord({ coveredThrough: 1, riassunto: [{ role: 'user', content: 'r' }], freno: primo.freno });
  assert.equal(record.freno.at, '2026-10-23T10:00:00.000Z');
  assert.equal(compattazione.creaRecord({ coveredThrough: 1, riassunto: [] }).freno, undefined, 'AL CONTRARIO senza freno nessun campo');
});

/* ------------------------------------------------------------------ il giro, col fornitore finto */

const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };
function conTetto(t, valore) {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
}
function fornitore({ riassunto = '## Riassunto\nbreve.', prompt = (corpo) => stima(corpo.messages), rifiuta = () => null } = {}) {
  const conti = { riassunti: 0, corpi: [] };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: riassunto }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.corpi.push(corpo);
    const r = rifiuta(conti.corpi.length, corpo);
    if (r) return r;
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: prompt(corpo), completion_tokens: 1 } });
  };
  return { fetchDiRete, conti };
}
async function giro(t, { messaggiIniziali, rete, ...resto }) {
  const cartella = cartellaDiProva('talos-d-freno-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  const esito = await talosLavora({ cartella, modello: MODELLO, chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali,
    contestoDelProgetto: 'Project files:\n', fetchDiRete: rete.fetchDiRete, permessi: 'Full access',
    onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(e); }, ...resto });
  return { esito, eventi };
}
/* sopra l'emergenza del tetto di 4.000: il giro deve compattare prima della prima richiesta */
const inEmergenza = () => [...storia(coppiePer(6_500)), { role: 'user', content: 'Adesso continua' }];

test('D-GIRO-01 — col freno tirato all\'emergenza non si paga un riassunto; AL CONTRARIO con un colpo solo sì', async (t) => {
  conTetto(t, 4_000);
  const tirato = fornitore();
  await giro(t, { messaggiIniziali: inEmergenza(), rete: tirato, freno: { colpi: 2, at: '2026-10-23T09:00:00.000Z', detto: true, modello: MODELLO } });
  assert.equal(tirato.conti.riassunti, 0, 'tirato: nessun riassunto pagato');
  const uno = fornitore();
  const pagato = await giro(t, { messaggiIniziali: inEmergenza(), rete: uno, freno: { colpi: 1, modello: MODELLO } });
  assert.ok(uno.conti.riassunti >= 1, `un colpo solo: il riassunto si paga (${uno.conti.riassunti})`);
  assert.equal(pagato.esito.recordDiCompattazione[0]?.freno?.modello, MODELLO, 'il record del giro porta la copia del freno (contratto d)');
});

test('D-GIRO-02 — il freno tirato si riarma quando il mezzo è cresciuto del 10% della soglia, o al cambio di modello: si paga, e l\'esito non porta più il freno', async (t) => {
  conTetto(t, 4_000);
  const cresciuto = fornitore();
  const a = await giro(t, { messaggiIniziali: inEmergenza(), rete: cresciuto, freno: { colpi: 2, mezzoAlVerdetto: 100, at: 'x', detto: true, modello: MODELLO } });
  assert.ok(cresciuto.conti.riassunti >= 1, 'riarmato per crescita: si paga');
  assert.ok(!compattazione.frenoTirato(a.esito.freno), `e il freno non è più tirato (${JSON.stringify(a.esito.freno)})`);
  /* riarmato vuol dire un armamento NUOVO: la tirata vecchia (`at`, `detto`) non resta, o la prossima tirata non si direbbe */
  assert.notEqual(a.esito.freno?.detto, true, JSON.stringify(a.esito.freno));
  assert.equal(a.esito.freno?.at ?? null, null, JSON.stringify(a.esito.freno));
  const altroModello = fornitore();
  const b = await giro(t, { messaggiIniziali: inEmergenza(), rete: altroModello, freno: { colpi: 2, at: 'x', detto: true, modello: 'altro/modello' } });
  assert.ok(altroModello.conti.riassunti >= 1, 'riarmato al cambio di modello');
  assert.notEqual(b.esito.freno?.detto, true, JSON.stringify(b.esito.freno));
});

test('D-RIFIUTO-01 — sul rifiuto del fornitore col freno tirato: il riassunto sarebbe alla portata ma non si paga — senza modello, ragione «freno»', async (t) => {
  const messaggi = [...storia(40), { role: 'user', content: 'Continua.' }];
  const rete = fornitore({ rifiuta: (n, corpo) => (n === 1 ? new Response(JSON.stringify({ error: { message: `prompt is too long: ${stima(corpo.messages)} tokens > ${Math.floor(stima(corpo.messages) * 0.6)} maximum` } }), { status: 400 }) : null) });
  const { esito, eventi } = await giro(t, { messaggiIniziali: messaggi, rete, versioneGiro: 7, freno: { colpi: 2, at: 'x', detto: true, modello: MODELLO } });
  assert.ok(esito);
  assert.equal(rete.conti.riassunti, 0, 'niente pagato');
  const fine = eventi.find((e) => e.tipo === 'compattazione-fine' && e.compattato === true);
  assert.equal(fine?.ragione, 'freno', JSON.stringify(eventi.map((e) => [e.tipo, e.motivo, e.ragione])));
  assert.deepEqual(esito.freno?.ricariche ?? [], [], `il riassunto senza modello non è una ricarica (${JSON.stringify(esito.freno)})`);
});

test('D-VERDETTO-01 — il verdetto in attesa (record di fine giro): il primo numero vero oltre la soglia è un colpo; AL CONTRARIO sotto la soglia azzera e segna il mezzo', async (t) => {
  conTetto(t, 4_000); // la soglia sotto il numero «oltre» del fornitore finto (di serie è 200.000)
  const messaggi = [...storia(6), { role: 'user', content: 'ciao' }];
  assert.ok(stima(messaggi) < 3_000, 'premessa: la storia sta sotto la soglia, il giro non compatta da sé');
  const sopra = await giro(t, { messaggiIniziali: messaggi, rete: fornitore({ prompt: () => 190_000 }), verdettoInAttesa: true, freno: { colpi: 0, modello: MODELLO } });
  assert.equal(sopra.esito.freno?.colpi, 1, JSON.stringify(sopra.esito.freno));
  assert.ok(sopra.esito.freno.mezzoAlVerdetto !== null, 'il mezzo del verdetto è segnato');
  const sotto = await giro(t, { messaggiIniziali: messaggi, rete: fornitore({ prompt: () => 10 }), verdettoInAttesa: true, freno: { colpi: 1, modello: MODELLO } });
  assert.equal(sotto.esito.freno?.colpi, 0, JSON.stringify(sotto.esito.freno));
  assert.ok(sotto.esito.freno?.mezzoAlVerdetto !== null, 'anche un verdetto buono segna il mezzo: è il riferimento del riarmo');
  const senza = await giro(t, { messaggiIniziali: messaggi, rete: fornitore({ prompt: () => 190_000 }), freno: { colpi: 0, modello: MODELLO } });
  assert.equal(senza.esito.freno?.colpi, 0, 'senza verdetto in attesa un numero alto non è un colpo');
  /* il verdetto si consuma col PRIMO numero: un numero alto più avanti nello stesso giro non è un colpo */
  let chiamate = 0;
  const dueChiamate = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    chiamate += 1;
    if (chiamate === 1) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: 'v1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"g.txt"}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 1 } });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 190_000, completion_tokens: 1 } });
  };
  const consumato = await giro(t, { messaggiIniziali: messaggi, rete: { fetchDiRete: dueChiamate }, verdettoInAttesa: true, freno: { colpi: 0, modello: MODELLO } });
  assert.equal(chiamate, 2, 'premessa: due chiamate nel giro');
  assert.equal(consumato.esito.freno?.colpi ?? 0, 0, `primo numero sotto la soglia, il secondo alto non giudica più (${JSON.stringify(consumato.esito.freno)})`);
});

test('D-VERDETTO-02 — una compattazione applicata NEL giro mette in attesa il verdetto: il numero vero dopo, ancora oltre la soglia, è un colpo; AL CONTRARIO sotto no', async (t) => {
  conTetto(t, 4_000);
  const oltre = await giro(t, { messaggiIniziali: inEmergenza(), rete: fornitore({ prompt: () => 190_000 }), freno: { modello: MODELLO } });
  assert.ok(oltre.eventi.some((e) => e.tipo === 'compattazione-fine' && e.compattato === true), 'premessa: il giro ha compattato');
  assert.equal(oltre.esito.freno?.colpi, 1, JSON.stringify(oltre.esito.freno));
  const dentro = await giro(t, { messaggiIniziali: inEmergenza(), rete: fornitore({ prompt: () => 10 }), freno: { modello: MODELLO } });
  assert.equal(dentro.esito.freno?.colpi ?? 0, 0, JSON.stringify(dentro.esito.freno));
});

test('D-VERDETTO-03 — F1 della revisione 9: dopo la sola coda (passi gratuiti) un numero vero oltre la soglia NON è un colpo — non è un riassunto pagato; e il conto `compattazioni` non la conta', async (t) => {
  conTetto(t, 4_000);
  const conEsitoLungo = [{ role: 'system', content: 's' }, { role: 'user', content: 'Leggi il file' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'g1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"g.txt"}' } }] },
    { role: 'tool', tool_call_id: 'g1', content: 'una riga lunga del file. '.repeat(1_500) }, { role: 'user', content: 'Continua' }];
  const rete = fornitore({ prompt: () => 190_000 });
  const { esito, eventi } = await giro(t, { messaggiIniziali: conEsitoLungo, rete, freno: { modello: MODELLO } });
  const righe = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true);
  assert.ok(righe.length >= 1 && righe.every((e) => e.soloCoda === true), `premessa: solo righe «sola coda» (${JSON.stringify(eventi.map((e) => [e.tipo, e.motivo, e.soloCoda]))})`);
  assert.ok(righe[0].ridotti >= 1, `la riga dice quanti esiti ha accorciato (${JSON.stringify(righe[0])})`);
  assert.equal(rete.conti.riassunti, 0, 'premessa: niente pagato');
  assert.equal(esito.freno?.colpi ?? 0, 0, JSON.stringify(esito.freno));
  assert.equal(esito.compattazioni, 0, 'la sola coda non è una compattazione');
});

test('D-COLPI-01 — il secondo colpo fa tirare il freno: l\'evento una volta, con lo stesso `at` dello stato; dopo, niente riassunti pagati nel giro', async (t) => {
  conTetto(t, 4_000);
  const rete = fornitore({ prompt: () => 190_000 });
  const { esito, eventi } = await giro(t, { messaggiIniziali: inEmergenza(), rete, verdettoInAttesa: true, freno: { colpi: 1, modello: MODELLO } });
  const freni = eventi.filter((e) => e.motivo === 'freno');
  assert.ok(freni.length <= 1, `al più una tirata (${freni.length})`);
  assert.equal(esito.freno?.detto, true, JSON.stringify(esito.freno));
  assert.equal(freni.length, 1, 'la tirata si dice');
  assert.equal(freni[0].freno.at, esito.freno.at, 'lo stesso `at` nell\'evento e nello stato');
  assert.equal(freni[0].perche, 'colpi');
});

test('D-COLPI-02 — Z-K2 nel giro vero: un colpo ereditato con un mezzo al verdetto piccolo NON si azzera per la crescita: il verdetto oltre la soglia è il secondo colpo e il freno tira', async (t) => {
  conTetto(t, 4_000);
  const rete = fornitore({ prompt: () => 190_000 });
  const { esito, eventi } = await giro(t, { messaggiIniziali: inEmergenza(), rete, verdettoInAttesa: true, freno: { colpi: 1, mezzoAlVerdetto: 100, modello: MODELLO } });
  assert.equal(esito.freno?.detto, true, `il secondo colpo tira (${JSON.stringify(esito.freno)})`);
  assert.equal(eventi.filter((e) => e.motivo === 'freno').map((e) => e.perche).join(), 'colpi');
});

test('D-RICARICHE-01 — tre riassunti pagati in tre giri fanno tirare il freno («ricariche»); AL CONTRARIO su quattro giri no', async (t) => {
  conTetto(t, 4_000);
  const vicino = await giro(t, { messaggiIniziali: inEmergenza(), rete: fornitore(), versioneGiro: 7, freno: { ricariche: [5, 6], modello: MODELLO } });
  assert.deepEqual(vicino.esito.freno?.ricariche, [5, 6, 7], JSON.stringify(vicino.esito.freno));
  assert.ok(compattazione.frenoTirato(vicino.esito.freno));
  assert.equal(vicino.eventi.filter((e) => e.motivo === 'freno').map((e) => e.perche).join(), 'ricariche');
  const lontano = await giro(t, { messaggiIniziali: inEmergenza(), rete: fornitore(), versioneGiro: 9, freno: { ricariche: [5, 6], modello: MODELLO } });
  assert.ok(!compattazione.frenoTirato(lontano.esito.freno), JSON.stringify(lontano.esito.freno));
});

test('D-INEFFICACE-01 — un riassunto pagato che allunga è un colpo; AL CONTRARIO uno che accorcia no', async (t) => {
  conTetto(t, 4_000);
  const lungo = await giro(t, { messaggiIniziali: inEmergenza(), rete: fornitore({ riassunto: `## Riassunto\n${'dettaglio '.repeat(9000)}` }), freno: { modello: MODELLO } });
  assert.ok((lungo.esito.freno?.colpi ?? 0) >= 1, JSON.stringify(lungo.esito.freno));
  const corto = await giro(t, { messaggiIniziali: inEmergenza(), rete: fornitore(), freno: { modello: MODELLO } });
  assert.equal(corto.esito.freno?.colpi ?? 0, 0, JSON.stringify(corto.esito.freno));
});

/* ------------------------------------------------------------------ il servizio: lungo il filo */

test('D-SERVIZIO-01 — il servizio passa al giro freno, giro della sessione e verdetto in attesa, e porta al giornale `perche` e `freno` della tirata', async () => {
  const eventi = [];
  let ricevuto = null;
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: (e) => { eventi.push(e); },
    freno: { colpi: 1 }, versioneGiro: 4, verdettoInAttesa: true,
    talosLavoraFn: async (input) => {
      ricevuto = { freno: input.freno, versioneGiro: input.versioneGiro, verdettoInAttesa: input.verdettoInAttesa };
      input.onGiro({ giro: 1, tipo: 'compattazione-fine', compattato: false, motivo: 'freno', perche: 'colpi', freno: { colpi: 2, mezzoAlVerdetto: 3_000, at: '2026-10-23T10:00:00.000Z' } });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [] };
    },
  });
  assert.deepEqual(ricevuto, { freno: { colpi: 1 }, versioneGiro: 4, verdettoInAttesa: true });
  const fine = eventi.find((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.motivo === 'freno')?.value;
  assert.deepEqual(fine, { fase: 'fine', giro: 1, compattato: false, motivo: 'freno', perche: 'colpi', freno: { colpi: 2, mezzoAlVerdetto: 3_000, at: '2026-10-23T10:00:00.000Z' } });
});

test('R10-SERVIZIO — il servizio passa al giro la copia viva del freno (R10-3), e su un giro fallito restituisce record e stato del giro (R10-7); AL CONTRARIO un errore senza non li inventa', async () => {
  const vivo = () => ({ colpi: 2, at: 'R', detto: true });
  let ricevuta = null;
  const fallito = await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, frenoVivo: vivo,
    talosLavoraFn: async (input) => {
      ricevuta = input.frenoVivo;
      throw Object.assign(new Error('Credential rejected by the provider.'), { code: 'PROVIDER_REQUEST_ERROR',
        recordDiCompattazione: [{ at: 'x' }], statoDelGiro: { freno: { ricariche: [3] }, scartoMisurato: 7 } });
    },
  });
  assert.equal(ricevuta, vivo, 'la funzione arriva al giro com\'è');
  assert.deepEqual([fallito.ok, fallito.recordDiCompattazione, fallito.statoDelGiro], [false, [{ at: 'x' }], { freno: { ricariche: [3] }, scartoMisurato: 7 }]);
  const nudo = await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {},
    talosLavoraFn: async () => { throw new Error('boom'); } });
  assert.deepEqual([nudo.ok, 'recordDiCompattazione' in nudo, 'statoDelGiro' in nudo], [false, false, false]);
});

test('D-SERVIZIO-02 — F1 della revisione 9: il servizio porta al giornale la riga senza riassunto (`soloCoda`) con `ridotti` e `immagini`; AL CONTRARIO una compattazione vera non li porta', async () => {
  const eventi = [];
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async (input) => {
      input.onGiro({ giro: 1, tipo: 'compattazione-fine', compattato: true, record: { tokenPrima: 9_000, tokenDopo: 6_000 }, soloCoda: true, ridotti: 3, immagini: 2 });
      input.onGiro({ giro: 2, tipo: 'compattazione-fine', compattato: true, record: { tokenPrima: 9_000, tokenDopo: 3_000 } });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [] };
    },
  });
  const fini = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine').map((e) => e.value);
  assert.deepEqual(fini.map((v) => [v.giro, v.soloCoda ?? false, v.ridotti ?? 0, v.immagini ?? 0]), [[1, true, 3, 2], [2, false, 0, 0]], JSON.stringify(fini));
});

/* ------------------------------------------------------------------ il registro: giornale, riavvio, fine giro, /compact */

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
const coppie = (n, l = 600) => Array.from({ length: n }, (_, i) => [{ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(l / 7)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(l / 7)}` }]).flat();
const storiaLunga = () => [{ role: 'system', content: 's' }, { role: 'user', content: 'Consegna' }, ...coppie(14, 1_400), { role: 'user', content: 'ultima' }, { role: 'assistant', content: 'ok' }];
function registroRiavviabile(t, opzioni = {}) {
  const cartellaStore = cartellaDiProva('talos-d-registro-');
  const giri = [];
  const riassunti = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    giri.push({ input, concludi(storiaFinale, extra = {}) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storiaFinale, recordDiCompattazione: [], ...extra } }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
    return attesa;
  };
  const riassumiPerCompattazioneFn = async () => { riassunti.push(1); return { scelta: { role: 'assistant', content: '## Riassunto\nR' }, finishReason: 'stop', usage: null }; };
  let ms = Date.parse('2026-10-23T01:00:00.000Z');
  const crea = () => createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta,
    modello: MODELLO, chiave: 'k', riassumiPerCompattazioneFn, clock: () => new Date(ms += 1000), finestraTokenFn: () => 64_000, ...opzioni });
  const assesta = async (sessionId) => { await attendiScritture({ cartellaStore, sessionId }); await new Promise((ok) => setTimeout(ok, 60)); };
  t.after(async () => { await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  return { crea, giri, riassunti, assesta, cartellaStore };
}
const righe = (cartellaStore, sessionId, tipo) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((r) => JSON.parse(r)).filter((r) => r.tipo === tipo);
/* gli eventi `talos.compattazione` durevoli del giornale, in qualunque forma il negozio li scriva */
const righeCompattazione = (cartellaStore, sessionId) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n')
  .filter((r) => r.includes('"talos.compattazione"')).map((r) => JSON.parse(r));

test('D-REGISTRO-01 — il freno torna dal giro alla sessione, va nel giornale una volta, sopravvive al riavvio e il giro dopo lo riceve col suo giro della sessione', async (t) => {
  const amb = registroRiavviabile(t);
  const prima = amb.crea();
  const { sessionId } = prima.avvia('task-vero', { modelloScelto: MODELLO });
  assert.equal(amb.giri[0].input.freno, undefined, 'premessa: una sessione nuova non ha freno');
  assert.ok(Number.isSafeInteger(amb.giri[0].input.versioneGiro), 'il giro della sessione arriva al giro');
  const freno = { colpi: 2, mezzoAlVerdetto: 4_000, at: '2026-10-23T09:00:00.000Z', detto: true, modello: MODELLO, finestra: 64_000, ricariche: [1] };
  amb.giri[0].concludi(storiaLunga(), { freno });
  await amb.assesta(sessionId);
  assert.deepEqual(righe(amb.cartellaStore, sessionId, 'freno').map((r) => r.freno?.at), ['2026-10-23T09:00:00.000Z'], 'una riga nel giornale');
  const dopo = amb.crea();
  await dopo.ripristina();
  dopo.resume(sessionId, 'ancora');
  assert.equal(amb.giri.at(-1).input.freno?.at, '2026-10-23T09:00:00.000Z', 'il giro dopo il riavvio riceve il freno');
  assert.equal(amb.giri.at(-1).input.freno?.detto, true, 'già detto: non si ridice');
  amb.giri.at(-1).concludi([...storiaLunga(), { role: 'user', content: 'ancora' }, { role: 'assistant', content: 'ok' }], { freno: { ...freno } });
  await amb.assesta(sessionId);
  assert.equal(righe(amb.cartellaStore, sessionId, 'freno').length, 1, 'lo stesso freno non si riscrive');
});

test('D-REGISTRO-02 — il /compact della persona paga e riarma il freno: la riga nuova dice null, e il giro dopo non lo riceve più', async (t) => {
  const amb = registroRiavviabile(t);
  const registro = amb.crea();
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri[0].concludi(storiaLunga(), { freno: { colpi: 2, at: '2026-10-23T09:00:00.000Z', detto: true, modello: MODELLO } });
  await amb.assesta(sessionId);
  const esito = await registro.compatta(sessionId);
  assert.equal(esito.compattato, true, `premessa: il /compact compatta (${JSON.stringify(esito)})`);
  await amb.assesta(sessionId);
  assert.equal(righe(amb.cartellaStore, sessionId, 'freno').at(-1)?.freno, null, 'riarmato nel giornale');
  registro.resume(sessionId, 'ancora');
  assert.equal(amb.giri.at(-1).input.freno, undefined, 'il giro dopo non riceve più il freno');
  /* il riavvio legge l'ULTIMA riga `freno` (la riarmata), non la prima (la tirata) */
  assert.ok(righe(amb.cartellaStore, sessionId, 'freno').length >= 2, 'premessa: due righe nel giornale');
  amb.giri.at(-1).concludi([...storiaLunga(), { role: 'user', content: 'ancora' }, { role: 'assistant', content: 'ok' }], {});
  await amb.assesta(sessionId);
  const dopo = amb.crea();
  await dopo.ripristina();
  dopo.resume(sessionId, 'dopo il riavvio');
  assert.equal(amb.giri.at(-1).input.freno, undefined, `dopo il riavvio il freno resta riarmato (${JSON.stringify(amb.giri.at(-1).input.freno)})`);
});

test('D-REGISTRO-06 — senza negozio (registro in memoria) il /compact riarma lo stesso il freno', async (t) => {
  const amb = registroRiavviabile(t, { cartellaStore: null });
  const registro = amb.crea();
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri[0].concludi(storiaLunga(), { freno: { colpi: 2, at: '2026-10-23T09:00:00.000Z', detto: true, modello: MODELLO } });
  await new Promise((ok) => setTimeout(ok, 100));
  registro.resume(sessionId, 'prima');
  assert.equal(amb.giri.at(-1).input.freno?.at, '2026-10-23T09:00:00.000Z', 'premessa: il freno resta nella sessione in memoria');
  amb.giri.at(-1).concludi([...storiaLunga(), { role: 'user', content: 'prima' }, { role: 'assistant', content: 'ok' }], {});
  await new Promise((ok) => setTimeout(ok, 100));
  const esito = await registro.compatta(sessionId);
  assert.equal(esito.compattato, true, `premessa: il /compact compatta (${JSON.stringify(esito)})`);
  registro.resume(sessionId, 'dopo');
  assert.equal(amb.giri.at(-1).input.freno, undefined, 'riarmato');
});

test('D-REGISTRO-03 — a fine giro, col freno tirato, il registro non paga un riassunto; AL CONTRARIO senza freno sì, e il primo giro dopo il record riceve il verdetto in attesa', async (t) => {
  const amb = registroRiavviabile(t, { finestraTokenFn: () => 8_000 });
  const registro = amb.crea();
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri[0].concludi(storiaLunga(), { freno: { colpi: 2, at: '2026-10-23T09:00:00.000Z', detto: true, modello: MODELLO, finestra: 8_000 } });
  await amb.assesta(sessionId);
  await new Promise((ok) => setTimeout(ok, 200));
  assert.equal(amb.riassunti.length, 0, 'tirato: nessun riassunto di fine giro');
  assert.equal(righeCompattazione(amb.cartellaStore, sessionId).length, 0, 'e niente da accorciare: nessuna riga di compattazione, nemmeno un «inizio»');
  /* con un esito d'attrezzo lungo negli ultimi scambi la coda si accorcia da sola: il record «sola coda» si scrive, senza pagare */
  const conCoda = registro.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri.at(-1).concludi([...storiaLunga().slice(0, -1), { role: 'assistant', content: null, tool_calls: [{ id: 'g1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"g.txt"}' } }] },
    { role: 'tool', tool_call_id: 'g1', content: 'una riga lunga del file. '.repeat(1_500) }, { role: 'assistant', content: 'letto' }],
  { freno: { colpi: 2, at: '2026-10-23T09:00:00.000Z', detto: true, modello: MODELLO, finestra: 8_000 } });
  await amb.assesta(conCoda.sessionId);
  await new Promise((ok) => setTimeout(ok, 200));
  await amb.assesta(conCoda.sessionId);
  assert.equal(amb.riassunti.length, 0, 'tirato, con la coda da accorciare: ancora nessun riassunto pagato');
  assert.ok(righe(amb.cartellaStore, conCoda.sessionId, 'compattazione').length >= 1, 'ma la sola coda, gratuita, si scrive');
  /* F1 della revisione 9: un record «sola coda» non mette in attesa il verdetto del freno (non è un riassunto pagato) */
  registro.resume(conCoda.sessionId, 'ancora');
  assert.equal(amb.giri.at(-1).input.verdettoInAttesa, undefined, 'dopo la sola coda nessun verdetto in attesa');
  const altro = registro.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri.at(-1).concludi(storiaLunga(), {});
  await amb.assesta(altro.sessionId);
  await new Promise((ok) => setTimeout(ok, 200));
  assert.ok(amb.riassunti.length >= 1, `senza freno il fine giro riassume (${amb.riassunti.length})`);
  registro.resume(altro.sessionId, 'ancora');
  assert.equal(amb.giri.at(-1).input.verdettoInAttesa, true, 'il giro dopo il record di fine giro riceve il verdetto in attesa');
  amb.giri.at(-1).concludi([...storiaLunga(), { role: 'user', content: 'ancora' }, { role: 'assistant', content: 'ok' }], {});
  await amb.assesta(altro.sessionId);
  registro.resume(altro.sessionId, 'e ancora');
  assert.equal(amb.giri.at(-1).input.verdettoInAttesa, undefined, 'una volta sola: il giro dopo non lo riceve più');
});

test('D-REGISTRO-05 — a fine giro il freno tirato si riarma se il mezzo è cresciuto del 10% della soglia: si paga, e il giornale scrive il freno riarmato', async (t) => {
  const amb = registroRiavviabile(t, { finestraTokenFn: () => 8_000 });
  const registro = amb.crea();
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri[0].concludi(storiaLunga(), { freno: { colpi: 2, mezzoAlVerdetto: 100, at: '2026-10-23T09:00:00.000Z', detto: true, modello: MODELLO, finestra: 8_000 } });
  await amb.assesta(sessionId);
  await new Promise((ok) => setTimeout(ok, 200));
  await amb.assesta(sessionId);
  assert.ok(amb.riassunti.length >= 1, 'riarmato: il fine giro paga');
  const ultimo = righe(amb.cartellaStore, sessionId, 'freno').at(-1)?.freno ?? null;
  assert.ok(!compattazione.frenoTirato(ultimo), `il giornale non porta più un freno tirato (${JSON.stringify(ultimo)})`);
});

test('D-REGISTRO-07 — Z-K2: a fine giro il riarmo per crescita di un freno tirato per i colpi va nel giornale anche se poi il riassunto fallisce (nessuna ricarica che lo riscriva): il riavvio non lo ritrova tirato', async (t) => {
  const amb = registroRiavviabile(t, { finestraTokenFn: () => 8_000, riassumiPerCompattazioneFn: async () => { throw new Error('fornitore giù'); } });
  const registro = amb.crea();
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri[0].concludi(storiaLunga(), { freno: { colpi: 2, mezzoAlVerdetto: 100, at: '2026-10-23T09:00:00.000Z', detto: true, modello: MODELLO, finestra: 8_000, ricariche: [1] } });
  await amb.assesta(sessionId);
  await new Promise((ok) => setTimeout(ok, 200));
  await amb.assesta(sessionId);
  const ultimo = righe(amb.cartellaStore, sessionId, 'freno').at(-1)?.freno ?? null;
  assert.ok(ultimo && !compattazione.frenoTirato(ultimo), `il giornale porta il freno riarmato (${JSON.stringify(ultimo)})`);
  assert.deepEqual([ultimo.colpi, ultimo.at, ultimo.ricariche], [0, null, [1]], 'colpi e `at` azzerati, ricariche tenute');
  const dopo = amb.crea();
  await dopo.ripristina();
  dopo.resume(sessionId, 'ancora');
  assert.ok(!compattazione.frenoTirato(amb.giri.at(-1).input.freno ?? null), `dopo il riavvio non è tirato (${JSON.stringify(amb.giri.at(-1).input.freno)})`);
});

test('D-REGISTRO-04 — a fine giro un riassunto pagato è una ricarica (nel giro della sessione), e uno che allunga è un colpo', async (t) => {
  const amb = registroRiavviabile(t, { finestraTokenFn: () => 8_000 });
  const registro = amb.crea();
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: MODELLO });
  const giro0 = amb.giri[0].input.versioneGiro;
  amb.giri[0].concludi(storiaLunga(), {});
  await amb.assesta(sessionId);
  await new Promise((ok) => setTimeout(ok, 200));
  await amb.assesta(sessionId);
  assert.ok(amb.riassunti.length >= 1, 'premessa: il fine giro ha pagato un riassunto');
  assert.deepEqual(righe(amb.cartellaStore, sessionId, 'freno').at(-1)?.freno?.ricariche, [giro0], 'la ricarica nel giornale, col giro della sessione');
  assert.deepEqual(righe(amb.cartellaStore, sessionId, 'compattazione').at(-1)?.record?.freno?.ricariche, [giro0], 'e la copia nel record di fine giro (contratto d)');
  /* la terza ricarica dentro tre giri fa tirare il freno anche a fine giro: l'evento durevole, una volta, con `at` e `perche` */
  const rapide = registroRiavviabile(t, { finestraTokenFn: () => 8_000 });
  const r3 = rapide.crea();
  const s3 = r3.avvia('task-vero', { modelloScelto: MODELLO });
  const g3 = rapide.giri[0].input.versioneGiro;
  rapide.giri[0].concludi(storiaLunga(), { freno: { ricariche: [g3, g3], modello: MODELLO, finestra: 8_000 } });
  await rapide.assesta(s3.sessionId);
  await new Promise((ok) => setTimeout(ok, 200));
  await rapide.assesta(s3.sessionId);
  const tirate = righeCompattazione(rapide.cartellaStore, s3.sessionId).filter((r) => JSON.stringify(r).includes('"motivo":"freno"'));
  assert.equal(tirate.length, 1, `la tirata detta una volta nel giornale (${tirate.length})`);
  assert.ok(JSON.stringify(tirate[0]).includes('"perche":"ricariche"'), JSON.stringify(tirate[0]));
  assert.equal(righe(rapide.cartellaStore, s3.sessionId, 'freno').at(-1)?.freno?.detto, true);
  const lungo = registroRiavviabile(t, { finestraTokenFn: () => 8_000,
    riassumiPerCompattazioneFn: async () => ({ scelta: { role: 'assistant', content: `## Riassunto\n${'dettaglio '.repeat(9000)}` }, finishReason: 'stop', usage: null }) });
  const r2 = lungo.crea();
  const s2 = r2.avvia('task-vero', { modelloScelto: MODELLO });
  lungo.giri[0].concludi(storiaLunga(), {});
  await lungo.assesta(s2.sessionId);
  await new Promise((ok) => setTimeout(ok, 200));
  await lungo.assesta(s2.sessionId);
  assert.equal(righe(lungo.cartellaStore, s2.sessionId, 'freno').at(-1)?.freno?.colpi, 1, 'il riassunto che allunga è un colpo');
});

/* ------------------------------------------------------------------ revisione 10 della CLI (23/10/2026): R10-3, R10-4, R10-6 */

test('R10-4 — una lettura sotto la soglia che libera il freno chiude l\'armamento: la tirata dopo ha un `at` nuovo e si dice; AL CONTRARIO un freno ancora tirato per le ricariche tiene `at` e `detto`', () => {
  const primo = compattazione.frenoCheTira({ colpi: 2, mezzoAlVerdetto: 3_000, modello: MODELLO }, { at: 'T1' }).freno;
  const libero = compattazione.letturaSottoLaSoglia(primo);
  assert.deepEqual([libero.colpi, libero.at, libero.detto], [0, null, false], JSON.stringify(libero));
  const secondo = compattazione.frenoCheTira(compattazione.colpoAlFreno(compattazione.colpoAlFreno(libero)), { at: 'T2' });
  assert.equal(secondo.evento?.freno?.at, 'T2', 'la seconda tirata si dice, col suo `at`');
  const perRicariche = compattazione.frenoCheTira({ colpi: 1, ricariche: [4, 5, 6], modello: MODELLO }, { at: 'T3' }).freno;
  assert.deepEqual(compattazione.letturaSottoLaSoglia(perRicariche), { ...perRicariche, colpi: 0 }, 'ancora tirato: l\'armamento resta');
  const maiTirato = compattazione.frenoValido({ colpi: 0, modello: MODELLO });
  assert.deepEqual(compattazione.letturaSottoLaSoglia(maiTirato), maiTirato, 'niente da cambiare');
});

test('R10-3 — due copie si uniscono: ricariche di tutte e due, i colpi più alti, una tirata già detta resta detta col suo `at`; identità diverse ⇒ la prima', () => {
  const delGiro = { colpi: 1, mezzoAlVerdetto: 500, ricariche: [13], modello: MODELLO, finestra: 32_768 };
  const delRegistro = { colpi: 2, mezzoAlVerdetto: 900, ricariche: [13, 14], at: '…394Z', detto: true, modello: MODELLO, finestra: 32_768 };
  const unito = compattazione.unisciFreni(delGiro, delRegistro);
  assert.deepEqual([unito.colpi, unito.mezzoAlVerdetto, unito.ricariche, unito.at, unito.detto], [2, 900, [13, 14], '…394Z', true], JSON.stringify(unito));
  assert.equal(compattazione.frenoCheTira(unito, { at: '…579Z' }).evento, null, 'già detto: nessun secondo avviso');
  const treRicariche = compattazione.unisciFreni({ ricariche: [12, 13], modello: MODELLO }, { ricariche: [13, 14], modello: MODELLO });
  assert.deepEqual(treRicariche.ricariche, [12, 13, 14]);
  assert.ok(compattazione.frenoTirato(treRicariche) && !treRicariche.detto && treRicariche.at === null, 'tirato dall\'unione e mai detto: lo dirà chi lo aggiorna');
  assert.deepEqual(compattazione.unisciFreni(delGiro, { ...delRegistro, modello: 'altro/modello' }), compattazione.frenoValido(delGiro), 'identità diverse: la prima');
  assert.deepEqual(compattazione.unisciFreni(null, delRegistro), compattazione.frenoValido(delRegistro));
  assert.deepEqual(compattazione.unisciFreni(delGiro, null), compattazione.frenoValido(delGiro));
});

test('R10-3 nel giro — il registro tira il freno mentre il giro lavora (riassunto di fine giro arrivato): il giro non paga e non lo ridice; AL CONTRARIO con la copia viva uguale a quella di partenza si paga', async (t) => {
  conTetto(t, 4_000);
  const partenza = { ricariche: [5], modello: MODELLO };
  const tiratoDalRegistro = { ricariche: [5, 6, 7], at: 'R', detto: true, modello: MODELLO };
  const rete = fornitore();
  const { esito, eventi } = await giro(t, { messaggiIniziali: inEmergenza(), rete, freno: partenza, versioneGiro: 7, frenoVivo: () => tiratoDalRegistro });
  assert.equal(rete.conti.riassunti, 0, 'il freno vivo è tirato: niente pagato');
  assert.ok(!eventi.some((e) => e.motivo === 'freno'), `nessun secondo avviso (${JSON.stringify(eventi.map((e) => [e.tipo, e.motivo]))})`);
  assert.equal(esito.freno?.at, 'R', `l'esito porta l'armamento del registro (${JSON.stringify(esito.freno)})`);
  const pagante = fornitore();
  await giro(t, { messaggiIniziali: inEmergenza(), rete: pagante, freno: partenza, versioneGiro: 7, frenoVivo: () => partenza });
  assert.ok(pagante.conti.riassunti >= 1, 'AL CONTRARIO: la copia viva non è cambiata, il giro paga');
});

test('R10-3 nel giro, una volta sola — la copia viva cambiata si unisce UNA volta: i colpi che una lettura sotto la soglia ha azzerato non tornano alla compattazione dopo, nello stesso giro; le ricariche del registro restano', async (t) => {
  conTetto(t, 4_000);
  const cartella = cartellaDiProva('talos-r10-3-una-volta-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'grande.txt'), 'contenuto del file grande, riga dopo riga.\n'.repeat(2_000));
  let richieste = 0;
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    richieste += 1;
    /* la prima lettura, dopo il riassunto, sta sotto la soglia (azzera i colpi); poi un esito d'attrezzo grande porta la richiesta dopo
       oltre l'emergenza (seconda compattazione, la sola coda), e la risposta finale */
    if (richieste === 1) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: 'g1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 100, completion_tokens: 1 } });
    /* l'ultima lettura sta SOPRA la soglia (dopo la sola coda non c'è verdetto: niente colpo, niente azzeramento) — così il freno finale è
       quello della seconda compattazione, dove la copia viva non deve tornare a unirsi */
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5_000, completion_tokens: 1 } });
  };
  const eventi = [];
  const esito = await talosLavora({ cartella, modello: MODELLO, chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: inEmergenza(), contestoDelProgetto: 'Project files:\n',
    fetchDiRete, permessi: 'Full access', versioneGiro: 9, freno: { modello: MODELLO }, frenoVivo: () => ({ colpi: 1, ricariche: [3], modello: MODELLO }),
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine') eventi.push(e); } });
  assert.ok(eventi.filter((e) => e.compattato === true).length >= 2, `premessa: due compattazioni nel giro (${JSON.stringify(eventi.map((e) => [e.motivo, e.compattato, e.soloCoda]))})`);
  assert.equal(esito.freno?.colpi, 0, `il colpo del registro, smentito dalla lettura sotto la soglia, non torna (${JSON.stringify(esito.freno)})`);
  assert.ok(esito.freno?.ricariche?.includes(3), `la ricarica del registro resta (${JSON.stringify(esito.freno)})`);
});

test('R10-3 nel registro — il riassunto di fine giro del giro prima arriva mentre il giro dopo lavora: a fine giro la sua ricarica resta (le copie si uniscono); prima la copia vecchia del giro la cancellava', async (t) => {
  let rilascia;
  const trattenuto = new Promise((r) => { rilascia = r; });
  let pagati = 0;
  const amb = registroRiavviabile(t, { finestraTokenFn: () => 8_000,
    riassumiPerCompattazioneFn: async () => { await trattenuto; pagati += 1; return { scelta: { role: 'assistant', content: '## Riassunto\nR' }, finishReason: 'stop', usage: null }; } });
  const registro = amb.crea();
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: MODELLO });
  const v0 = amb.giri[0].input.versioneGiro;
  amb.giri[0].concludi(storiaLunga(), { freno: { ricariche: [v0], modello: MODELLO, finestra: 8_000 } });
  await amb.assesta(sessionId);
  registro.resume(sessionId, 'ancora');
  const giro1 = amb.giri.at(-1);
  assert.deepEqual(giro1.input.freno?.ricariche, [v0], 'premessa: il giro dopo parte con la copia di prima');
  rilascia();
  await new Promise((ok) => setTimeout(ok, 200));
  await amb.assesta(sessionId);
  assert.equal(pagati, 1, 'premessa: il riassunto di fine giro è arrivato e si è pagato');
  assert.equal(giro1.input.frenoVivo()?.ricariche?.length, 2, `la copia viva ha la ricarica del registro (${JSON.stringify(giro1.input.frenoVivo())})`);
  giro1.concludi([...storiaLunga(), { role: 'user', content: 'ancora' }, { role: 'assistant', content: 'ok' }], { freno: { ricariche: [v0], modello: MODELLO, finestra: 8_000 } });
  await amb.assesta(sessionId);
  assert.equal(righe(amb.cartellaStore, sessionId, 'freno').at(-1)?.freno?.ricariche?.length, 2, 'nel giornale le due ricariche: la copia del giro non cancella quella del registro');
  registro.resume(sessionId, 'e ancora');
  assert.equal(amb.giri.at(-1).input.freno?.ricariche?.length, 2, 'e il giro dopo le riceve');
});

test('R10-6 — la sola coda del fine giro si annuncia come tale: `soloCoda` e `ridotti` sulla riga di fine `background`; AL CONTRARIO un riassunto vero non li porta', async (t) => {
  const amb = registroRiavviabile(t, { finestraTokenFn: () => 8_000 });
  const registro = amb.crea();
  const conCoda = registro.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri.at(-1).concludi([...storiaLunga().slice(0, -1), { role: 'assistant', content: null, tool_calls: [{ id: 'g1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"g.txt"}' } }] },
    { role: 'tool', tool_call_id: 'g1', content: 'una riga lunga del file. '.repeat(1_500) }, { role: 'assistant', content: 'letto' }],
  { freno: { colpi: 2, at: '2026-10-23T09:00:00.000Z', detto: true, modello: MODELLO, finestra: 8_000 } });
  await amb.assesta(conCoda.sessionId);
  await new Promise((ok) => setTimeout(ok, 200));
  await amb.assesta(conCoda.sessionId);
  const fineCoda = righeCompattazione(amb.cartellaStore, conCoda.sessionId).map((r) => JSON.stringify(r)).find((r) => r.includes('"motivo":"background"') && r.includes('"compattato":true'));
  assert.ok(fineCoda && fineCoda.includes('"soloCoda":true') && /"ridotti":[1-9]/.test(fineCoda), `la riga dice sola coda e quanti esiti (${fineCoda})`);
  const vero = registro.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri.at(-1).concludi(storiaLunga(), {});
  await amb.assesta(vero.sessionId);
  await new Promise((ok) => setTimeout(ok, 200));
  await amb.assesta(vero.sessionId);
  const fineVera = righeCompattazione(amb.cartellaStore, vero.sessionId).map((r) => JSON.stringify(r)).find((r) => r.includes('"motivo":"background"') && r.includes('"compattato":true'));
  assert.ok(fineVera && !fineVera.includes('"soloCoda"'), `AL CONTRARIO il riassunto vero no (${fineVera})`);
});

test('R10-7 nel giro — un giro che compatta (riassunto pagato) e poi fallisce porta con l\'errore il record applicato e lo stato del giro (la ricarica); AL CONTRARIO un giro che fallisce senza compattare non porta record', async (t) => {
  conTetto(t, 4_000);
  const credenzialeRifiutata = () => new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const rete = fornitore({ rifiuta: () => credenzialeRifiutata() });
  const errore = await giro(t, { messaggiIniziali: inEmergenza(), rete, versioneGiro: 9 }).then(() => null, (e) => e);
  assert.ok(errore, 'premessa: il giro fallisce');
  assert.ok(rete.conti.riassunti >= 1, 'premessa: prima di fallire ha pagato un riassunto');
  assert.equal(errore.recordDiCompattazione?.length, 1, `il record applicato viaggia con l'errore (${Object.keys(errore)})`);
  assert.ok(compattazione.eRecordValido(errore.recordDiCompattazione[0]));
  assert.deepEqual(errore.statoDelGiro?.freno?.ricariche, [9], `e la ricarica del riassunto pagato (${JSON.stringify(errore.statoDelGiro)})`);
  const senza = await giro(t, { messaggiIniziali: [{ role: 'user', content: 'Ciao' }], rete: fornitore({ rifiuta: () => credenzialeRifiutata() }) }).then(() => null, (e) => e);
  assert.ok(senza, 'premessa: fallisce anche questo');
  assert.equal(senza.recordDiCompattazione, undefined, 'AL CONTRARIO: niente compattato, nessun record');
});

test('R10-7 nel registro — il record di un giro fallito si tiene se si tiene il lavoro del giro (il giro dopo parte proiettato, niente da ripagare), con la ricarica nel freno; AL CONTRARIO senza il lavoro del giro il record non si tiene', async (t) => {
  const corsa = async (conLavoro) => {
    const risposte = [];
    const avviaSessioneFn = async (input) => new Promise((risolvi) => { risposte.push({ input, risolvi }); input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${risposte.length}` }); });
    const amb = registroRiavviabile(t, { avviaSessioneFn });
    const registro = amb.crea();
    const { sessionId } = registro.avvia('task-vero', { modelloScelto: MODELLO });
    const primo = risposte[0];
    const v0 = primo.input.versioneGiro;
    const storia = [...primo.input.messaggiIniziali ?? [], ...storiaLunga().slice(2)];
    const record = compattazione.creaRecord({ coveredThrough: storia.length - 2, riassunto: [{ role: 'user', content: '## Riassunto\nR' }], tokenPrima: 9_000, tokenDopo: 3_000, at: '2026-10-23T12:00:00.000Z', modello: MODELLO });
    primo.input.onEvento({ type: 'RunError', message: 'Credential rejected by the provider.', code: 'PROVIDER_REQUEST_ERROR' });
    primo.risolvi({ threadId: 't', runId: 'r1', ok: false, esito: null, erroreInterno: 'Credential rejected by the provider.', codiceErrore: 'PROVIDER_REQUEST_ERROR',
      ...(conLavoro ? { messaggiDelGiro: storia } : {}), recordDiCompattazione: [record], statoDelGiro: { freno: { ricariche: [v0], modello: MODELLO }, scartoMisurato: 321 } });
    await amb.assesta(sessionId);
    await new Promise((ok) => setTimeout(ok, 100));
    await amb.assesta(sessionId);
    const righeRecord = righe(amb.cartellaStore, sessionId, 'compattazione');
    registro.resume(sessionId, 'riprova');
    return { righeRecord, dopo: risposte.at(-1).input, freno: righe(amb.cartellaStore, sessionId, 'freno').at(-1)?.freno ?? null, record };
  };
  const tenuto = await corsa(true);
  assert.equal(tenuto.righeRecord.length, 1, 'il record del giro fallito è nel giornale');
  assert.equal(tenuto.dopo.recordCompattazioneIniziale?.at, tenuto.record.at, 'il giro dopo parte dalla compattazione, non dalla storia intera');
  assert.deepEqual(tenuto.freno?.ricariche, [tenuto.dopo.versioneGiro - 1], `la ricarica del riassunto pagato resta nel freno (${JSON.stringify(tenuto.freno)})`);
  assert.equal(tenuto.dopo.scartoMisurato, 321, 'e lo scarto misurato nel giro fallito');
  const perso = await corsa(false);
  assert.equal(perso.righeRecord.length, 0, 'AL CONTRARIO: senza il lavoro del giro il record non si tiene (coprirebbe una storia diversa)');
  assert.equal(perso.dopo.scartoMisurato, 321, 'ma lo stato del giro sì: lo scarto misurato');
  assert.deepEqual(perso.freno?.ricariche?.length, 1, `e la ricarica nel freno (${JSON.stringify(perso.freno)})`);
});
