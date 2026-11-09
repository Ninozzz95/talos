/*
 * FE-008 (forma del 03/11/2026, OK di Performance, CLI e Mobile): i Passi, la lista del giro. Lo strumento `steps_update` c'è solo se chi ospita
 * lo chiede; senza, strumenti e primo messaggio restano quelli di oggi. Il costo vero sono i giri: risultato corto, nessuna rottura delle letture
 * in parallelo, le chiamate vecchie vanno via per prime.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { avviaSessione } from '../src/agent-service.mjs';
import { riduciCodaSottoPressione } from '../src/kernel/compattazione-desktop.mjs';
import { modelloConChiamateParallele } from '../src/kernel/chiamata-nel-testo.mjs';
import { nonFermaLeLetture, talosLavora } from '../src/kernel/talosHarness.mjs';
import { talosLavora as talosLavoraDesktop } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import {
  EVENTO_PASSI, NOME_PASSI, TETTI_PASSI, applicaPassi, creaContenitorePassi, esitoPassi, leggiArgomentiPassi, passiDaEventi, riassuntoPassi, statoPassiVuoto, testoPassiDopoCompattazione,
} from '../src/passi-del-giro.mjs';
import { esitoPianoPerIlModello } from '../src/plan-contract.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const LISTA = [{ text: 'Leggo i file', status: 'completed' }, { text: 'Scrivo la cura', status: 'in_progress' }, { text: 'Lancio le prove', status: 'pending' }];
const risposta = (message, finish_reason = 'stop') => Response.json({ choices: [{ message, finish_reason }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
const chiamata = (...calls) => risposta({ role: 'assistant', content: null, tool_calls: calls.map(([name, args], i) => ({ id: `c${i + 1}`, type: 'function', function: { name, arguments: JSON.stringify(args) } })) }, 'tool_calls');

/** Un giro vero del nucleo con un fornitore finto: `risposte` in fila, poi «fatto». */
async function giro(ingresso = {}, risposte = []) {
  const corpi = [];
  const cartella = mkdtempSync(join(tmpdir(), 'talos-passi-'));
  const coda = [...risposte];
  try {
    const esito = await talosLavora({
      cartella, task: { consegna: 'ciao' }, modello: 'x', chiave: 'y', ...ingresso,
      fetchDiRete: async (_url, init) => { corpi.push(JSON.parse(init.body)); return coda.shift()?.() ?? risposta({ role: 'assistant', content: 'fatto' }); },
    });
    return { corpi, esito };
  } finally { rimuoviCartellaDiProva(cartella); }
}
const nomiStrumenti = (corpo) => (corpo.tools ?? []).map((t) => t.function?.name);
const esitoDellaChiamata = (corpo, id = 'c1') => corpo.messages.find((m) => m.role === 'tool' && m.tool_call_id === id)?.content;

test('PASSI-01 senza `listaPassi` strumenti e primo messaggio restano identici, byte per byte', async () => {
  const assente = (await giro({ _giriMassimiInterno: 1 })).corpi[0];
  const spenta = (await giro({ listaPassi: false, _giriMassimiInterno: 1 })).corpi[0];
  assert.deepEqual(nomiStrumenti(spenta), nomiStrumenti(assente));
  assert.equal(nomiStrumenti(assente).includes(NOME_PASSI), false);
  assert.equal(spenta.messages[0].content, assente.messages[0].content);
  assert.equal(nomiStrumenti((await giro({ listaPassi: null, _giriMassimiInterno: 1 })).corpi[0]).includes(NOME_PASSI), false, 'solo `true` lo accende');
  const acceso = (await giro({ listaPassi: true, _giriMassimiInterno: 1 })).corpi[0];
  assert.equal(nomiStrumenti(acceso).includes(NOME_PASSI), true);
  assert.equal(acceso.messages[0].content, assente.messages[0].content, 'lo strumento si dice nello schema, non nel primo messaggio');
});

test('PASSI-02 forma sbagliata: errore per il modello e la lista vecchia resta; oltre i tetti si taglia e si dice', () => {
  for (const storto of [null, 'x', {}, { steps: 'x' }, { steps: [null] }, { steps: [{ text: '', status: 'pending' }] }, { steps: [{ text: 'a', status: 'quasi' }] }, { steps: [{ text: 7, status: 'pending' }] }]) {
    const letto = leggiArgomentiPassi(storto);
    assert.equal(letto.ok, false, JSON.stringify(storto));
    assert.match(letto.messaggio, /steps/u);
  }
  const lunga = leggiArgomentiPassi({ steps: Array.from({ length: TETTI_PASSI.voci + 3 }, (_, i) => ({ text: `${i}`.repeat(TETTI_PASSI.testo), status: 'pending' })) });
  assert.equal(lunga.ok, true);
  assert.equal(lunga.voci.length, TETTI_PASSI.voci);
  assert.ok(lunga.voci.every((v) => v.testo.length <= TETTI_PASSI.testo));
  assert.equal(lunga.cambiata, true);
  assert.equal(TETTI_PASSI.voci, 20);
  assert.equal(TETTI_PASSI.testo, 120);
});

test('PASSI-02b nel nucleo: l\'errore arriva al modello e nessun evento parte', async () => {
  const eventi = [];
  const { corpi } = await giro({ listaPassi: true, onPassi: (s) => eventi.push(s) }, [() => chiamata([NOME_PASSI, { steps: 'rotta' }])]);
  assert.match(esitoDellaChiamata(corpi[1]), /steps/u);
  assert.equal(eventi.length, 0);
});

test('PASSI-03 due `in_progress`: resta il primo', () => {
  const letto = leggiArgomentiPassi({ steps: [{ text: 'a', status: 'in_progress' }, { text: 'b', status: 'in_progress' }] });
  assert.deepEqual(letto.voci.map((v) => v.stato), ['in_progress', 'pending']);
  assert.equal(letto.cambiata, true);
});

test('PASSI-04 gli orari li mette il server e reggono se il testo non cambia', () => {
  const uno = applicaPassi(statoPassiVuoto(), leggiArgomentiPassi({ steps: [{ text: 'a', status: 'in_progress' }, { text: 'b', status: 'pending' }] }), 100);
  assert.equal(uno.stato.voci[0].iniziatoAl, 100);
  assert.equal(Object.hasOwn(uno.stato.voci[1], 'iniziatoAl'), false);
  const due = applicaPassi(uno.stato, leggiArgomentiPassi({ steps: [{ text: 'a', status: 'completed' }, { text: 'b', status: 'in_progress' }] }), 200);
  assert.deepEqual(due.stato.voci[0], { testo: 'a', stato: 'completed', iniziatoAl: 100, finitoAl: 200 });
  assert.equal(due.stato.voci[1].iniziatoAl, 200);
  const tre = applicaPassi(due.stato, leggiArgomentiPassi({ steps: [{ text: 'a riscritto', status: 'in_progress' }] }), 300);
  assert.equal(tre.stato.voci[0].iniziatoAl, 300, 'testo nuovo, passo nuovo');
  const avanti = applicaPassi(due.stato, leggiArgomentiPassi({ steps: [{ text: 'a', status: 'completed' }, { text: 'b', status: 'in_progress' }, { text: 'c', status: 'pending' }] }), 900);
  assert.equal(avanti.stato.voci[0].finitoAl, 200, 'una voce finita tiene il suo orario');
  assert.equal(avanti.stato.voci[1].iniziatoAl, 200, 'la voce in corso tiene il suo inizio');
  const ora = leggiArgomentiPassi({ steps: [{ text: 'x', status: 'in_progress', iniziatoAl: 1, finitoAl: 2 }] });
  assert.deepEqual(Object.keys(ora.voci[0]).sort(), ['stato', 'testo'], 'il modello non dà orari');
});

test('PASSI-05 lista uguale, nessun cambio; lista diversa, revisione +1', () => {
  const letto = leggiArgomentiPassi({ steps: LISTA });
  const uno = applicaPassi(statoPassiVuoto(), letto, 1);
  assert.equal(uno.cambiata, true);
  assert.equal(uno.stato.revisione, 1);
  const uguale = applicaPassi(uno.stato, letto, 2);
  assert.equal(uguale.cambiata, false);
  assert.equal(uguale.stato, uno.stato);
  assert.equal(applicaPassi(uno.stato, leggiArgomentiPassi({ steps: [{ text: 'altro', status: 'pending' }] }), 3).stato.revisione, 2);
});

test('PASSI-05b nel nucleo una lista uguale non riparte verso chi ospita', async () => {
  const eventi = [];
  await giro({ listaPassi: true, onPassi: (s) => eventi.push(s) }, [() => chiamata([NOME_PASSI, { steps: LISTA }]), () => chiamata([NOME_PASSI, { steps: LISTA }])]);
  assert.equal(eventi.length, 1);
});

test('PASSI-05c le voci annullate non contano in «3 di 7»', () => {
  const stato = { revisione: 1, voci: [{ testo: 'a', stato: 'completed' }, { testo: 'b', stato: 'cancelled' }, { testo: 'c', stato: 'pending' }] };
  assert.deepEqual(riassuntoPassi(stato), { fatti: 1, totale: 2 });
  assert.equal(riassuntoPassi(statoPassiVuoto()), null);
});

function scena(t, opzioni = {}) {
  const giri = [];
  const cartellaStore = opzioni.cartellaStore ?? mkdtempSync(join(tmpdir(), 'talos-passi-store-'));
  const registro = createSessionRegistry({
    cartellaStore, modello: 'chatgpt:gpt-prova', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    avviaSessioneFn: (input) => new Promise((risolvi) => { giri.push({ input, risolvi }); }),
    listaPassi: true,
    ...opzioni,
  });
  t.after(async () => { for (const g of giri) g.risolvi({ comeFinita: 'concluso' }); await registro.chiudi?.(); await new Promise((f) => setTimeout(f, 30)); });
  return { registro, giri, cartellaStore };
}
const attesa = (ms = 30) => new Promise((f) => setTimeout(f, ms));

test('PASSI-06 l\'evento è durevole, una lista per aggiornamento, e dopo un riavvio la lista torna dal giornale', async (t) => {
  const prima = scena(t);
  const { sessionId } = prima.registro.avvia('task');
  await attesa();
  const stato = applicaPassi(statoPassiVuoto(), leggiArgomentiPassi({ steps: LISTA }), Date.now()).stato;
  await prima.giri[0].input.onPassi(stato);
  await attesa();
  const eventi = prima.registro.esporta(sessionId).eventi.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO_PASSI);
  assert.equal(eventi.length, 1);
  assert.deepEqual(eventi[0].value, stato);
  assert.deepEqual(passiDaEventi(prima.registro.esporta(sessionId).eventi), stato);
  assert.deepEqual(riassuntoPassi(stato), { fatti: 1, totale: 3 });
  assert.deepEqual(prima.registro.elenca().find((s) => s.sessionId === sessionId)?.passi, { fatti: 1, totale: 3 });
});

test('PASSI-06b il giro dopo riceve la lista di prima', async (t) => {
  const { registro, giri } = scena(t);
  const { sessionId } = registro.avvia('task');
  await attesa();
  const stato = applicaPassi(statoPassiVuoto(), leggiArgomentiPassi({ steps: LISTA }), 5).stato;
  await giri[0].input.onPassi(stato);
  giri[0].input.onEvento?.({ type: 'RunFinished', threadId: 't', runId: 'r1' });
  giri[0].risolvi({ comeFinita: 'concluso' });
  await attesa();
  registro.resume(sessionId, 'avanti');
  await attesa();
  assert.deepEqual(giri[1].input.passiIniziali, stato);
});

test('PASSI-07 dopo la compattazione tornano le voci non concluse, con «+N» se non ci stanno', () => {
  const stato = applicaPassi(statoPassiVuoto(), leggiArgomentiPassi({ steps: LISTA }), 1).stato;
  const testo = testoPassiDopoCompattazione(stato);
  assert.match(testo, /Scrivo la cura/u);
  assert.match(testo, /Lancio le prove/u);
  assert.doesNotMatch(testo, /Leggo i file/u);
  const lunga = applicaPassi(statoPassiVuoto(), leggiArgomentiPassi({ steps: Array.from({ length: 20 }, (_, i) => ({ text: `${i} `.padEnd(120, 'x'), status: 'pending' })) }), 1).stato;
  const tagliata = testoPassiDopoCompattazione(lunga);
  assert.ok(tagliata.length <= TETTI_PASSI.dopoCompattazione, String(tagliata.length));
  assert.match(tagliata, /\+\d+ more/u);
  assert.equal(testoPassiDopoCompattazione(statoPassiVuoto()), '');
  assert.equal(testoPassiDopoCompattazione(applicaPassi(statoPassiVuoto(), leggiArgomentiPassi({ steps: [{ text: 'a', status: 'completed' }] }), 1).stato), '');
});

test('PASSI-08 figlia e modello locale non ricevono lo strumento; il registro non lo chiede senza persona o su una strada senza parallele', async (t) => {
  for (const ingresso of [{ agentRole: 'child' }, { modello: 'local:qualcosa' }, { modello: 'lmstudio:qualcosa' }]) {
    assert.equal(nomiStrumenti((await giro({ listaPassi: true, _giriMassimiInterno: 1, ...ingresso })).corpi[0]).includes(NOME_PASSI), false, JSON.stringify(ingresso));
  }
  const acceso = scena(t);
  acceso.registro.avvia('task');
  await attesa();
  assert.equal(acceso.giri[0].input.listaPassi, true);
  const senzaNessuno = scena(t);
  senzaNessuno.registro.avvia('task', { senzaInterfaccia: true });
  await attesa();
  assert.equal(Object.hasOwn(senzaNessuno.giri[0].input, 'listaPassi'), false);
  const spento = scena(t, { listaPassi: false });
  spento.registro.avvia('task');
  await attesa();
  assert.equal(Object.hasOwn(spento.giri[0].input, 'listaPassi'), false);
});

test('PASSI-09 nessuna carta e nessun permesso, ammesso anche in Piano', async () => {
  const carte = [];
  const eventi = [];
  const { corpi } = await giro({
    listaPassi: true, modalitaOperativa: 'piano', livelloAccesso: 'read-only', onPassi: (s) => eventi.push(s),
    chiediApprovazioneFn: async (x) => { carte.push(x); return { decisione: 'nega' }; },
  }, [() => chiamata([NOME_PASSI, { steps: LISTA }])]);
  assert.equal(nomiStrumenti(corpi[0]).includes(NOME_PASSI), true);
  assert.equal(carte.length, 0);
  assert.equal(eventi.length, 1);
  assert.deepEqual(eventi[0].voci.map((v) => v.stato), ['completed', 'in_progress', 'pending']);
});

test('PASSI-10 con lo strumento offerto l\'esito del Piano lo chiede; senza no', () => {
  for (const decisione of ['procedi-con-conferma', 'procedi-accetta-modifiche']) {
    assert.match(esitoPianoPerIlModello({ decisione }, { conPassi: true }), /steps_update/u);
    assert.doesNotMatch(esitoPianoPerIlModello({ decisione }), /steps_update/u);
  }
  assert.doesNotMatch(esitoPianoPerIlModello({ decisione: 'conversazione-pulita' }, { conPassi: true }), /steps_update/u);
});

test('PASSI-10b nel nucleo: il piano approvato chiede la lista solo se lo strumento c\'è', async () => {
  const piano = { modalitaOperativa: 'piano', strumentiEstesi: ['present_plan'], presentaPianoFn: async () => ({ decisione: 'procedi-con-conferma' }) };
  const conLista = await giro({ ...piano, listaPassi: true }, [() => chiamata(['present_plan', { plan: '1. uno\n2. due' }])]);
  assert.match(esitoDellaChiamata(conLista.corpi[1]), /steps_update/u);
  const senza = await giro(piano, [() => chiamata(['present_plan', { plan: '1. uno\n2. due' }])]);
  assert.doesNotMatch(esitoDellaChiamata(senza.corpi[1]), /steps_update/u);
});

test('PASSI-11 risultato corto; la lista intera solo se il server l\'ha cambiata', async () => {
  const letto = leggiArgomentiPassi({ steps: LISTA });
  const stato = applicaPassi(statoPassiVuoto(), letto, 1).stato;
  assert.equal(esitoPassi(stato, letto), 'ok 1/3');
  const doppia = leggiArgomentiPassi({ steps: [{ text: 'a', status: 'in_progress' }, { text: 'b', status: 'in_progress' }] });
  const corretto = esitoPassi(applicaPassi(statoPassiVuoto(), doppia, 1).stato, doppia);
  assert.match(corretto, /^ok 0\/2/u);
  assert.match(corretto, /\[ \] b/u);
  const { corpi } = await giro({ listaPassi: true }, [() => chiamata([NOME_PASSI, { steps: LISTA }])]);
  assert.equal(esitoDellaChiamata(corpi[1]), 'ok 1/3');
});

test('PASSI-12 in mezzo a due letture `steps_update` non parte in anticipo e ogni chiamata ha il suo esito, in ordine', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-passi-letture-'));
  try {
    const coda = [() => chiamata(['leggi', { percorso: 'a.txt' }], [NOME_PASSI, { steps: LISTA }], ['leggi', { percorso: 'b.txt' }])];
    const disco = (await import('node:fs/promises'));
    await disco.writeFile(join(cartella, 'a.txt'), 'a'); await disco.writeFile(join(cartella, 'b.txt'), 'b');
    const corpi = [];
    await talosLavora({
      cartella, task: { consegna: 'ciao' }, modello: 'x', chiave: 'y', listaPassi: true,
      fetchDiRete: async (_url, init) => { corpi.push(JSON.parse(init.body)); return coda.shift()?.() ?? risposta({ role: 'assistant', content: 'fatto' }); },
    });
    assert.equal(esitoDellaChiamata(corpi[1], 'c2'), 'ok 1/3');
    assert.match(esitoDellaChiamata(corpi[1], 'c1'), /a/u);
    assert.match(esitoDellaChiamata(corpi[1], 'c3'), /b/u);
  } finally { rimuoviCartellaDiProva(cartella); }
});

test('PASSI-12b non ferma il gruppo di letture; una scrittura sì', () => {
  assert.equal(nonFermaLeLetture(NOME_PASSI), true);
  assert.equal(nonFermaLeLetture('leggi'), true);
  assert.equal(nonFermaLeLetture('scrivi'), false);
  assert.equal(nonFermaLeLetture('shell'), false);
});

test('PASSI-13 nella pulizia a regole le chiamate vecchie spariscono per prime e l\'ultima resta', () => {
  const argomenti = JSON.stringify({ steps: Array.from({ length: 20 }, (_, i) => ({ text: `passo ${i}`.padEnd(100, 'x'), status: 'pending' })) });
  const assistente = (id) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: NOME_PASSI, arguments: argomenti } }] });
  const coda = [assistente('a'), { role: 'tool', tool_call_id: 'a', content: 'ok 0/20' }, assistente('b'), { role: 'tool', tool_call_id: 'b', content: 'ok 0/20' }, { role: 'user', content: 'avanti' }];
  const { coda: ridotta } = riduciCodaSottoPressione(coda, { budgetToken: 400, stima: (l) => JSON.stringify(l).length / 4 });
  assert.equal(JSON.parse(ridotta[0].tool_calls[0].function.arguments).steps.length, 0);
  assert.equal(ridotta[2].tool_calls[0].function.arguments, argomenti);
  assert.equal(ridotta.length, coda.length, 'nessuna coppia si spezza');
});

test('PASSI-14 solo dove ci sono le chiamate parallele: piano sì, compatibile OpenAI di serie no', () => {
  assert.equal(modelloConChiamateParallele('chatgpt:gpt-6-luna'), true);
  assert.equal(modelloConChiamateParallele('z-ai/glm-5.3-flash'), false);
  assert.equal(modelloConChiamateParallele('qwen:qualcosa'), false);
  assert.equal(modelloConChiamateParallele(undefined), false);
});

test('PASSI-14b il registro guarda il modello del giro', async (t) => {
  const { registro, giri } = scena(t, { modello: 'z-ai/glm-5.3-flash' });
  registro.avvia('task');
  await attesa();
  assert.equal(Object.hasOwn(giri[0].input, 'listaPassi'), false);
});

test('PASSI-15 il contenitore porta la lista al blocco dei fatti, e il blocco è deciso una volta', async () => {
  const contenitore = creaContenitorePassi(applicaPassi(statoPassiVuoto(), leggiArgomentiPassi({ steps: LISTA }), 1).stato);
  assert.match(contenitore.testoDopoCompattazione(), /Scrivo la cura/u);
  const fatti = contenitore.testoDopoCompattazione();
  assert.equal(contenitore.testoDopoCompattazione(), fatti);
  const { corpi } = await giro({ listaPassi: true, contenitorePassi: contenitore }, [() => chiamata([NOME_PASSI, { steps: [{ text: 'solo questa', status: 'in_progress' }] }])]);
  assert.equal(corpi.length, 2);
  assert.match(contenitore.testoDopoCompattazione(), /solo questa/u);
});

/* Decisione 143 (owner 04/11/2026): i Passi accesi di serie sul PC. Condizioni delle sessioni (04/11): il valore di serie del REGISTRO resta
   spento (CLI); li accende l'ospite del PC, mai il server dell'app del telefono, che gira lo stesso registro (Mobile); TALOS_PASSI=0 li spegne. */
const nomiDelGiro = async (input) => nomiStrumenti((await giro({ listaPassi: input.listaPassi, _giriMassimiInterno: 1 })).corpi[0]);

test('PASSI-17 decisione 143: l\'ospite del PC li accende di serie, TALOS_PASSI=0 li spegne, il server del telefono mai', async (t) => {
  const { listaPassiDelServer } = await import('../src/passi-del-server.mjs');
  assert.equal(listaPassiDelServer({}), true, 'di serie accesi sul PC');
  assert.equal(listaPassiDelServer({ TALOS_PASSI: '1' }), true);
  assert.equal(listaPassiDelServer({ TALOS_PASSI: '0' }), false, 'la variabile a 0 li spegne');
  assert.equal(listaPassiDelServer({}, { telefono: true }), false, 'il motore del telefono resta spento');
  assert.equal(listaPassiDelServer({ TALOS_PASSI: '1' }, { telefono: true }), false, 'nemmeno la variabile li accende sul telefono');
  const { readFileSync } = await import('node:fs');
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(server, /listaPassi: listaPassiDelServer\(process\.env, \{ telefono: accessoLocaleOspite\.attivo \}\)/u);
  assert.doesNotMatch(server, /TALOS_PASSI === '1'/u);
  // dal registro al nucleo: il PC offre `steps_update`, il motore del telefono no
  const pc = scena(t, { listaPassi: listaPassiDelServer({}) });
  pc.registro.avvia('task');
  await attesa();
  assert.equal((await nomiDelGiro(pc.giri[0].input)).includes(NOME_PASSI), true, 'PC: offerto');
  const telefono = scena(t, { listaPassi: listaPassiDelServer({}, { telefono: true }) });
  telefono.registro.avvia('task');
  await attesa();
  assert.equal(Object.hasOwn(telefono.giri[0].input, 'listaPassi'), false);
  assert.equal((await nomiDelGiro(telefono.giri[0].input)).includes(NOME_PASSI), false, 'telefono: non offerto');
});

test('PASSI-18 un registro creato senza `listaPassi` (come fa la CLI) non li offre', async (t) => {
  const giri = [];
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-passi-store-'));
  const registro = createSessionRegistry({
    cartellaStore, modello: 'chatgpt:gpt-prova', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    avviaSessioneFn: (input) => new Promise((risolvi) => { giri.push({ input, risolvi }); }),
  });
  t.after(async () => { for (const g of giri) g.risolvi({ comeFinita: 'concluso' }); await registro.chiudi?.(); await attesa(); });
  registro.avvia('task');
  await attesa();
  assert.equal(Object.hasOwn(giri[0].input, 'listaPassi'), false);
  assert.equal((await nomiDelGiro(giri[0].input)).includes(NOME_PASSI), false);
});

test('PASSI-19 (Performance, 04/11) l\'offerta si fissa alla nascita: con l\'interfaccia che va e viene gli strumenti restano identici byte per byte, tace solo l\'evento', async (t) => {
  const { registro, giri } = scena(t);
  const { sessionId } = registro.avvia('task', { senzaInterfacciaNelGiro: false });
  await attesa();
  const fine = async (i) => { giri[i].input.onEvento?.({ type: 'RunFinished', threadId: 't', runId: `r${i}` }); giri[i].risolvi({ comeFinita: 'concluso' }); await attesa(); };
  await fine(0);
  registro.resume(sessionId, 'avanti', [], { senzaInterfacciaNelGiro: true });
  await attesa();
  const stato = applicaPassi(statoPassiVuoto(), leggiArgomentiPassi({ steps: LISTA }), 7).stato;
  await giri[1].input.onPassi?.(stato);
  await fine(1);
  registro.resume(sessionId, 'ancora', [], { senzaInterfacciaNelGiro: false });
  await attesa();
  const corpi = [];
  for (const g of giri) corpi.push(JSON.stringify((await giro({ listaPassi: g.input.listaPassi, _giriMassimiInterno: 1 })).corpi[0].tools));
  assert.equal(giri.length, 3);
  assert.equal(corpi[1], corpi[0], 'senza nessuno davanti lo schema non cambia');
  assert.equal(corpi[2], corpi[0], 'e non cambia al ritorno della persona');
  assert.equal(JSON.parse(corpi[0]).some((x) => x.function?.name === NOME_PASSI), true);
  assert.equal(registro.esporta(sessionId).eventi.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO_PASSI).length, 0, 'senza nessuno davanti l\'evento tace');
  assert.deepEqual(giri[2].input.passiIniziali, stato, 'la lista resta della sessione');
});

test('PASSI-20 TALOS_PROVA_PASSI_SENZA_PERSONA=1, solo per le prove (banco di Performance): offerti ed evento anche senza nessuno davanti', async (t) => {
  const { passiSenzaPersonaPerProva } = await import('../src/passi-del-server.mjs');
  assert.equal(passiSenzaPersonaPerProva({}), false);
  assert.equal(passiSenzaPersonaPerProva({ TALOS_PROVA_PASSI_SENZA_PERSONA: 'true' }), false, 'una forma sola');
  assert.equal(passiSenzaPersonaPerProva({ TALOS_PROVA_PASSI_SENZA_PERSONA: '1' }), true);
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../server.mjs', import.meta.url), 'utf8'), /passiSenzaPersona: passiSenzaPersonaPerProva\(process\.env\)/u);
  const banco = scena(t, { passiSenzaPersona: true });
  const { sessionId } = banco.registro.avvia('task', { senzaInterfaccia: true });
  await attesa();
  assert.equal(banco.giri[0].input.listaPassi, true);
  await banco.giri[0].input.onPassi(applicaPassi(statoPassiVuoto(), leggiArgomentiPassi({ steps: LISTA }), 3).stato);
  await attesa();
  assert.equal(banco.registro.esporta(sessionId).eventi.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO_PASSI).length, 1);
  const senza = scena(t);
  senza.registro.avvia('task', { senzaInterfaccia: true });
  await attesa();
  assert.equal(Object.hasOwn(senza.giri[0].input, 'listaPassi'), false, 'senza la variabile: chi nasce senza nessuno davanti non li riceve');
});

test('PASSI-16 avviaSessione inoltra; il nucleo del PC accetta l\'ingresso', async () => {
  const ricevuti = [];
  const stato = statoPassiVuoto();
  const onPassi = () => {};
  const comune = { cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {},
    talosLavoraFn: async (input) => { ricevuti.push(input); return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [] }; } };
  await avviaSessione({ ...comune, listaPassi: true, passiIniziali: stato, onPassi });
  await avviaSessione(comune);
  assert.equal(ricevuti[0].listaPassi, true);
  assert.equal(ricevuti[0].passiIniziali, stato);
  assert.equal(ricevuti[0].onPassi, onPassi);
  assert.equal(Object.hasOwn(ricevuti[1], 'listaPassi'), false);
  assert.equal(typeof talosLavoraDesktop, 'function');
});
