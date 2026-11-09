/*
 * ⭐ Owner 27/10/2026 notte, «Sì, mai aspettare» — contratto C1 con la CLI (`handoff-talos-2026-09-27/CONTRATTO-RIASSUNTO-MAI-ASPETTARE-
 * 2026-10-27.md`), sulla compattazione SEMPLICE dell'adattatore (le conversazioni senza motore del contesto, e il suo ripiego).
 * All'emergenza il giro non aspetta più nessun riassunto del modello (prima: fino a `RIASSUNTO_TETTO_MS`, 10 minuti):
 *   - in volo o no, la richiesta parte SUBITO col riassunto senza modello (ragione 'in-arrivo');
 *   - quello del modello (in volo, o avviato adesso in sottofondo) prende il suo posto alla richiesta dopo, anche a giro finito, e la
 *     riga lo dice (`migliora`: l'`at` del riassunto rapido che sostituisce);
 *   - nessun secondo riassunto pagato mentre uno è in volo.
 * Supera EMERG-ATTESA-01..03 (22/10), che provavano l'attesa con Stop, «Salta» e tetto. Fornitore finto via `fetchDiRete`, nessuna rete.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };
const testoDi = (m) => (typeof m?.content === 'string' ? m.content
  : Array.isArray(m?.content) ? m.content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : JSON.stringify(m?.content ?? ''));
const portaIlRiassuntoDelModello = (corpo) => corpo.messages.some((m) => testoDi(m).includes('RIASSUNTO-DEL-MODELLO'));

/**
 * Il fornitore finto: le richieste senza attrezzi sono riassunti e restano FERME finché la prova non le lascia andare (`lascia`);
 * le richieste di lavoro rispondono subito, o con `risposte` (una per richiesta di lavoro) quando la prova la dà.
 */
function fornitore({ risposte = null } = {}) {
  const lavori = []; const riassunti = [];
  let lascia;
  const via = new Promise((r) => { lascia = r; });
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      riassunti.push(corpo);
      await via;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nRIASSUNTO-DEL-MODELLO: le domande e le risposte di prima.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    lavori.push(corpo);
    const propria = risposte?.(lavori.length, corpo);
    if (propria) return propria;
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
  return { fetchDiRete, lavori, riassunti, lascia: () => lascia() };
}

function conTetto(t, valore) {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
}

async function giro(t, { cartella, f, messaggiIniziali, ...altro }) {
  const eventi = [];
  const inizio = Date.now();
  const lavoro = talosLavora({
    cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali,
    compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: f.fetchDiRete, ...altro,
    onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(e); altro.onGiro?.(e); },
  }).then((esito) => ({ esito }), (errore) => ({ errore }));
  const esito = await Promise.race([lavoro, new Promise((r) => { setTimeout(() => r('APPESO'), 4_000); })]);
  return { ...(esito === 'APPESO' ? { appeso: true } : esito), eventi, ms: Date.now() - inizio };
}

const rapidi = (eventi) => eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.ripiego === true);

test('MAI-ASPETTARE-LEG-01 — at the emergency a summary in flight (the one from the turn before) is not awaited: quick summary now, nothing paid twice', async (t) => {
  conTetto(t, 4000);
  const cartella = cartellaDiProva('talos-mai-aspettare-'); t.after(() => rimuoviCartellaDiProva(cartella));
  let consegna;
  const inArrivo = new Promise((r) => { consegna = r; });
  t.after(() => consegna(null));
  const f = fornitore();
  t.after(() => f.lascia());
  const g = await giro(t, { cartella, f, messaggiIniziali: [...storia(coppiePer(6500)), { role: 'user', content: 'Adesso continua' }], compattazioneInArrivo: inArrivo });
  assert.ok(!g.appeso, `the turn waited for the summary in flight (events ${JSON.stringify(g.eventi.map((e) => e.tipo))})`);
  assert.ok(g.esito, `the turn ended well: ${g.errore?.message ?? ''}`);
  const [rapido, ...altri] = rapidi(g.eventi);
  assert.ok(rapido && altri.length === 0, 'one quick summary');
  assert.equal(rapido.ragione, 'in-arrivo', 'its line says the model\'s one is on its way');
  assert.equal(f.riassunti.length, 0, 'no second model summary while one is in flight');
});

test('MAI-ASPETTARE-LEG-02 — at the emergency with nothing in flight: quick summary now, and the model summary starts in the background', async (t) => {
  conTetto(t, 4000);
  const cartella = cartellaDiProva('talos-mai-aspettare-'); t.after(() => rimuoviCartellaDiProva(cartella));
  const f = fornitore();
  t.after(() => f.lascia());
  const g = await giro(t, { cartella, f, messaggiIniziali: [...storia(coppiePer(6500)), { role: 'user', content: 'Adesso continua' }] });
  assert.ok(!g.appeso, 'the turn waited for the model summary');
  assert.ok(g.esito, `the turn ended well: ${g.errore?.message ?? ''}`);
  const [rapido] = rapidi(g.eventi);
  assert.ok(rapido, 'a quick summary without the model');
  assert.equal(rapido.ragione, 'in-arrivo');
  assert.ok(!portaIlRiassuntoDelModello(f.lavori[0]), 'the request did not wait for the model one');
  assert.equal(f.riassunti.length, 1, 'the model summary started, in the background');
  f.lascia();
  const pronta = g.esito.compattazionePronta ?? await g.esito.compattazioneInPreparazione;
  assert.ok(pronta?.record, 'the model summary is ready for the next request');
  assert.ok(Array.isArray(pronta.sostituisce) || typeof pronta.sostituisce === 'string', 'and it says which quick summary it replaces');
});

test('MAI-ASPETTARE-LEG-03 — the next turn swaps the quick summary for the model one at its first request, even below the threshold, and the line says «improved»', async (t) => {
  conTetto(t, 4000);
  const cartella = cartellaDiProva('talos-mai-aspettare-'); t.after(() => rimuoviCartellaDiProva(cartella));
  const f1 = fornitore();
  t.after(() => f1.lascia());
  const g1 = await giro(t, { cartella, f: f1, messaggiIniziali: [...storia(coppiePer(6500)), { role: 'user', content: 'Adesso continua' }] });
  const [rapido] = rapidi(g1.eventi);
  assert.ok(rapido?.record, 'premise: a quick summary with its record');
  f1.lascia();
  const pronta = g1.esito.compattazionePronta ?? await g1.esito.compattazioneInPreparazione;
  assert.ok(pronta?.record, 'premise: the model summary arrived after the turn');
  /* il registro ridà al giro dopo il record applicato (quello rapido) e il riassunto pronto */
  const f2 = fornitore();
  t.after(() => f2.lascia());
  const g2 = await giro(t, { cartella, f: f2, messaggiIniziali: [...g1.esito.messaggiFinali, { role: 'user', content: 'e adesso?' }],
    recordCompattazioneIniziale: rapido.record, compattazionePronta: pronta });
  assert.ok(g2.esito, `the turn ended well: ${g2.errore?.message ?? ''}`);
  assert.ok(portaIlRiassuntoDelModello(f2.lavori[0]), 'the first request of the next turn carries the model summary');
  const migliorato = g2.eventi.find((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.migliora);
  assert.ok(migliorato, `the line says the summary was improved: ${JSON.stringify(g2.eventi.map((e) => [e.tipo, e.motivo, e.ragione]))}`);
  assert.equal(migliorato.migliora.at, rapido.record.at, 'it points at the quick summary it replaces');
  assert.equal(rapidi(g2.eventi).length, 0, 'no new quick summary');
  assert.equal(f2.riassunti.length, 0, 'nothing paid again');
});

test('MAI-ASPETTARE-LEG-04 — the model summary that arrives during the turn replaces the quick one at the next request of the same turn', async (t) => {
  conTetto(t, 4000);
  const cartella = cartellaDiProva('talos-mai-aspettare-'); t.after(() => rimuoviCartellaDiProva(cartella));
  let pronta = null; let segnalaPronta;
  const arrivata = new Promise((r) => { segnalaPronta = r; });
  /* la prima richiesta di lavoro chiede una lettura; prima di rispondere, il riassunto del modello finisce (evento «pronta») */
  const f = fornitore({ risposte: (n) => {
    if (n !== 1) return null;
    f.lascia();
    return arrivata.then(() => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: 'l1', type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'uno.txt' }) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1000, completion_tokens: 5 } }));
  } });
  t.after(() => f.lascia());
  const g = await giro(t, { cartella, f, messaggiIniziali: [...storia(coppiePer(6500)), { role: 'user', content: 'Adesso continua' }],
    onGiro: (e) => { if (e?.tipo === 'compattazione-preparata' && e.fase === 'pronta') { pronta = e; segnalaPronta(); } } });
  assert.ok(g.esito, `the turn ended well: ${g.appeso ? 'hung' : g.errore?.message ?? ''}`);
  assert.ok(pronta, 'premise: the model summary arrived during the turn');
  assert.ok(f.lavori.length >= 2, 'the turn made a second request');
  assert.ok(!portaIlRiassuntoDelModello(f.lavori[0]), 'the first request went with the quick summary');
  assert.ok(portaIlRiassuntoDelModello(f.lavori[1]), 'the second one with the model summary');
  const [rapido] = rapidi(g.eventi);
  const migliorato = g.eventi.find((e) => e.tipo === 'compattazione-fine' && e.migliora);
  assert.equal(migliorato?.migliora?.at, rapido?.record?.at, 'the line of the quick summary is the one improved');
});

test('MAI-ASPETTARE-LEG-05 — reverse: a model summary ready for ANOTHER quick summary is not used', async (t) => {
  conTetto(t, 4000);
  const cartella = cartellaDiProva('talos-mai-aspettare-'); t.after(() => rimuoviCartellaDiProva(cartella));
  const f1 = fornitore();
  t.after(() => f1.lascia());
  const g1 = await giro(t, { cartella, f: f1, messaggiIniziali: [...storia(coppiePer(6500)), { role: 'user', content: 'Adesso continua' }] });
  const [rapido] = rapidi(g1.eventi);
  f1.lascia();
  const pronta = g1.esito.compattazionePronta ?? await g1.esito.compattazioneInPreparazione;
  assert.ok(rapido?.record && pronta?.record, 'premise');
  /* un altro record applicato (per esempio la persona ha annullato e rifatto): il riassunto pronto non lo sostituisce */
  const altro = compattazione.creaRecord({ coveredThrough: rapido.record.coveredThrough, riassunto: rapido.record.riassunto, tokenPrima: 10, tokenDopo: 5, misura: 'stimato', at: '2026-10-28T00:00:00.000Z', modello: 'z-ai/glm-5.3-flash' });
  const f2 = fornitore();
  t.after(() => f2.lascia());
  await giro(t, { cartella, f: f2, messaggiIniziali: [...g1.esito.messaggiFinali, { role: 'user', content: 'e adesso?' }], recordCompattazioneIniziale: altro, compattazionePronta: pronta });
  assert.ok(!portaIlRiassuntoDelModello(f2.lavori[0]), 'the model summary is not applied over a different summary');
});

test('MAI-ASPETTARE-LEG-06 — the summary inherited from the turn before, still in flight at the emergency, replaces the quick one when it lands mid-turn', async (t) => {
  conTetto(t, 4000);
  const cartella = cartellaDiProva('talos-mai-aspettare-'); t.after(() => rimuoviCartellaDiProva(cartella));
  /* un riassunto vero del modello sulla stessa storia, preparato da un giro di prova (come lo passerebbe il registro) */
  const storiaGrande = [...storia(coppiePer(6500)), { role: 'user', content: 'Adesso continua' }];
  const f0 = fornitore();
  t.after(() => f0.lascia());
  const g0 = await giro(t, { cartella, f: f0, messaggiIniziali: storiaGrande });
  f0.lascia();
  const vero = g0.esito.compattazionePronta ?? await g0.esito.compattazioneInPreparazione;
  assert.ok(vero?.record && vero.base === compattazione.chiaveBaseDelRecord(null), 'premise: a model summary born on the plain history');
  /* il giro dopo riparte dalla stessa storia, senza record: quel riassunto è «in arrivo» dal registro e arriva dopo la prima richiesta */
  let consegna;
  const inArrivo = Object.assign(new Promise((r) => { consegna = r; }), { firma: { coveredThrough: vero.record.coveredThrough, impronta: vero.impronta, base: vero.base } });
  t.after(() => consegna(null));
  /* il riassunto ereditato arriva mentre il fornitore risponde alla prima richiesta (dopo il riassunto rapido); la risposta parte dopo
     che il giro l'ha presa (la sua promessa si risolve in pochi microtask: 20 ms bastano e avanzano) */
  const f = fornitore({ risposte: (n) => {
    if (n !== 1) return null;
    consegna({ record: vero.record, impronta: vero.impronta, base: vero.base, soloCoda: false });
    return new Promise((r) => { setTimeout(r, 20); }).then(() => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: 'l1', type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'uno.txt' }) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1000, completion_tokens: 5 } }));
  } });
  t.after(() => f.lascia());
  const g = await giro(t, { cartella, f, messaggiIniziali: storiaGrande, compattazioneInArrivo: inArrivo });
  assert.ok(g.esito, `the turn ended well: ${g.appeso ? 'hung' : g.errore?.message ?? ''}`);
  assert.equal(rapidi(g.eventi)[0]?.ragione, 'in-arrivo', 'premise: the quick summary was applied first, without waiting');
  assert.equal(f.riassunti.length, 0, 'nothing paid: the inherited summary was in flight');
  assert.ok(f.lavori.length >= 2, 'the turn made a second request');
  assert.ok(!portaIlRiassuntoDelModello(f.lavori[0]), 'the first request went with the quick summary');
  assert.ok(portaIlRiassuntoDelModello(f.lavori[1]), 'the second one with the inherited model summary');
  const [rapido] = rapidi(g.eventi);
  assert.equal(g.eventi.find((e) => e.tipo === 'compattazione-fine' && e.migliora)?.migliora?.at, rapido?.record?.at);
});

/*
 * «Non arriva» (contratto con la CLI, 28/10/2026): il riassunto del modello nato per sostituire il rapido può non arrivare mai (il
 * riassuntore risponde vuoto, è inutile, non serve più, Stop). Prima la riga del rapido diceva «sta arrivando» per sempre. Ora il kernel lo
 * dice UNA volta per rapido: `compattazione-preparata`, `fase:'non-arriva'`, `perIlRapido:{at}` (l'`at` del record rapido), `motivo` un
 * codice chiuso — mai il testo del fornitore (la CLI lo mostra o lo mappa a schermo).
 */
const CODICI_NON_ARRIVA = ['fallita', 'inefficace', 'bersaglio', 'non-serve', 'non-vale-piu', 'fermata'];
const nonArriva = (eventi) => eventi.filter((e) => e.tipo === 'compattazione-preparata' && e.fase === 'non-arriva');

test('MAI-ASPETTARE-LEG-07 — the model summary meant to replace the quick one comes back empty: «non-arriva» once, with the quick one\'s at and a closed code', async (t) => {
  conTetto(t, 4000);
  const cartella = cartellaDiProva('talos-mai-aspettare-'); t.after(() => rimuoviCartellaDiProva(cartella));
  const riassunti = [];
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      riassunti.push(corpo);
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 0 } });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
  const g = await giro(t, { cartella, f: { fetchDiRete }, messaggiIniziali: [...storia(coppiePer(6500)), { role: 'user', content: 'Adesso continua' }] });
  assert.ok(g.esito, `the turn ended well: ${g.errore?.message ?? ''}`);
  const [rapido] = rapidi(g.eventi);
  assert.ok(rapido?.record?.at, 'a quick summary without the model, with its at');
  assert.equal(rapido.ragione, 'in-arrivo');
  await Promise.resolve(g.esito.compattazioneInPreparazione).catch(() => null);
  await new Promise((r) => { setTimeout(r, 50); });
  assert.ok(riassunti.length >= 1, 'the model summary was asked for, in the background');
  const detti = nonArriva(g.eventi);
  assert.equal(detti.length, 1, `said once: ${JSON.stringify(detti)}`);
  assert.deepEqual(detti[0].perIlRapido, { at: rapido.record.at });
  assert.ok(CODICI_NON_ARRIVA.includes(detti[0].motivo), `a closed code, not the provider's text: ${detti[0].motivo}`);
  assert.equal(detti[0].motivo, 'fallita');
});

test('MAI-ASPETTARE-LEG-08 (reverse) — the model summary arrives: no «non-arriva»; and with nothing to replace, nothing is said', async (t) => {
  conTetto(t, 4000);
  const cartella = cartellaDiProva('talos-mai-aspettare-'); t.after(() => rimuoviCartellaDiProva(cartella));
  const f = fornitore();
  t.after(() => f.lascia());
  const g = await giro(t, { cartella, f, messaggiIniziali: [...storia(coppiePer(6500)), { role: 'user', content: 'Adesso continua' }] });
  assert.ok(g.esito, `the turn ended well: ${g.errore?.message ?? ''}`);
  f.lascia();
  await Promise.resolve(g.esito.compattazioneInPreparazione).catch(() => null);
  await new Promise((r) => { setTimeout(r, 50); });
  assert.deepEqual(nonArriva(g.eventi), [], 'the improvement is coming: nothing to say');
  // sotto la soglia nessun rapido, nessuna preparazione: niente da dire
  const piccolo = await giro(t, { cartella, f, messaggiIniziali: [...storia(4), { role: 'user', content: 'Ciao' }] });
  assert.deepEqual(nonArriva(piccolo.eventi), []);
});
