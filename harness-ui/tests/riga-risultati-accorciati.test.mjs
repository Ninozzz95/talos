/*
 * Riga dei risultati accorciati (owner 01/11/2026, FE-049): una risposta può poggiare su dati accorciati senza dirlo, e nessun testo al modello lo chiude. Il server lo dice alla
 * persona: un evento durevole col solo numero, il massimo del giro, prima di `RunFinished`, solo se il giro chiude con una risposta.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionRegistry, EVENTO_RISULTATI_ACCORCIATI } from '../src/session-registry.mjs';
import { usciteAccorciateDellaRichiesta } from '../src/kernel/compattazione-desktop.mjs';
import { avviaSessione } from '../src/agent-service.mjs';

const prepara = (taskId) => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } });
async function scena(t) {
  const visti = [];
  let onEvento = null;
  const registro = createSessionRegistry({ preparaEsecuzioneFn: prepara, modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => { onEvento = input.onEvento; onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1' }); await new Promise(() => {}); } });
  t.after?.(() => {});
  const { sessionId } = registro.avvia('task-vero');
  registro.iscriviti(sessionId, (e) => visti.push(e));
  await new Promise((r) => setTimeout(r, 0));
  return { registro, sessionId, visti, evento: (e) => onEvento(e) };
}
const fine = (tipo = 'success') => ({ type: 'RunFinished', threadId: 't', runId: 'r1', outcome: { type: tipo } });
const righe = (visti) => visti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO_RISULTATI_ACCORCIATI);

test('RIGA-ACCORCIATI-03: il massimo del giro, una volta, prima di RunFinished, col solo numero', async (t) => {
  const s = await scena(t);
  for (const n of [1, 3, 2]) s.registro.annotaPreparazioneContesto({ sessionId: s.sessionId, level1: { cleared: 0, shortened: 1, accorciateRichiesta: n } });
  s.evento(fine());
  const r = righe(s.visti);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].value, { numero: 3, runId: 'r1' });
  assert.ok(s.visti.indexOf(r[0]) < s.visti.findIndex((e) => e.type === 'RunFinished'), 'prima di RunFinished, così la riga sta nel giro che riguarda');
});

test('RIGA-ACCORCIATI-04 — AL CONTRARIO: niente riga con zero, e niente su un giro non concluso con una risposta', async (t) => {
  const zero = await scena(t);
  zero.registro.annotaPreparazioneContesto({ sessionId: zero.sessionId, level1: { cleared: 2, shortened: 2, accorciateRichiesta: 0 } });
  zero.evento(fine());
  assert.equal(righe(zero.visti).length, 0);
  const altro = await scena(t);
  altro.registro.annotaPreparazioneContesto({ sessionId: altro.sessionId, level1: { cleared: 0, shortened: 1, accorciateRichiesta: 2 } });
  altro.evento(fine('interrupt'));
  assert.equal(righe(altro.visti).length, 0);
});

test('RIGA-ACCORCIATI-05: il giro dopo riparte da zero, e un conteggio assurdo non conta', async (t) => {
  const s = await scena(t);
  s.registro.annotaPreparazioneContesto({ sessionId: s.sessionId, level1: { cleared: 0, shortened: 1, accorciateRichiesta: 4 } });
  s.evento({ type: 'RunStarted', threadId: 't', runId: 'r2' });
  s.registro.annotaPreparazioneContesto({ sessionId: s.sessionId, level1: { cleared: 0, shortened: 1, accorciateRichiesta: 'tante' } });
  s.evento(fine());
  assert.equal(righe(s.visti).length, 0);
});

test('RIGA-ACCORCIATI-06: la compattazione semplice porta lo stesso numero nella sua riga, e il registro tiene il massimo', async (t) => {
  const s = await scena(t);
  s.registro.annotaPreparazioneContesto({ sessionId: s.sessionId, level1: { cleared: 0, shortened: 1, accorciateRichiesta: 1 } });
  s.evento({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', giro: 2, compattato: true, accorciateRichiesta: 4 } });
  s.evento(fine());
  assert.equal(righe(s.visti)[0].value.numero, 4);
});

test('RIGA-ACCORCIATI-07: contano le uscite cambiate dopo l ultima richiesta della persona, non quelle prima', () => {
  const m = (role, t) => ({ role, content: t });
  const coda = [m('tool', 'vecchia'), m('assistant', 'ok'), m('user', 'domanda'), m('assistant', ''), m('tool', 'a'), m('tool', 'b')];
  const dopo = [...coda];
  dopo[0] = m('tool', 'accorciata');
  assert.equal(usciteAccorciateDellaRichiesta(coda, dopo), 0, 'solo una vecchia: zero');
  dopo[4] = m('tool', 'accorciata');
  assert.equal(usciteAccorciateDellaRichiesta(coda, dopo), 1);
});

test('RIGA-ACCORCIATI-08: una nota in coda fra due esiti non è una richiesta nuova', () => {
  const m = (role, t) => ({ role, content: t });
  const coda = [m('user', 'domanda'), m('tool', 'a'), m('user', 'una nota in coda'), m('tool', 'b')];
  const dopo = [...coda];
  dopo[1] = m('tool', 'accorciata');
  assert.equal(usciteAccorciateDellaRichiesta(coda, dopo), 1);
});

test('RIGA-ACCORCIATI-09: se la richiesta comincia nel tratto riassunto, contano anche le sue uscite coperte', () => {
  const m = (role, t) => ({ role, content: t });
  const mezzo = [m('tool', 'vecchia'), m('assistant', 'ok'), m('user', 'domanda'), m('tool', 'x'), m('tool', 'y')];
  const coda = [m('assistant', ''), m('tool', 'z')];
  assert.equal(usciteAccorciateDellaRichiesta(coda, coda, mezzo), 2);
  assert.equal(usciteAccorciateDellaRichiesta(coda, coda, []), 0);
});

test('RIGA-ACCORCIATI-10: lungo il filo: il numero del kernel arriva nell evento della compattazione, e uno zero non viaggia', async () => {
  const eventi = [];
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async (input) => {
      const record = { tokenPrima: 9_000, tokenDopo: 6_000 };
      input.onGiro({ giro: 1, tipo: 'compattazione-fine', compattato: true, record, soloCoda: true, ridotti: 3, accorciateRichiesta: 2 });
      input.onGiro({ giro: 2, tipo: 'compattazione-fine', compattato: true, record, soloCoda: true, ridotti: 3 });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [] };
    },
  });
  const fini = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine').map((e) => e.value);
  assert.equal(fini[0].accorciateRichiesta, 2);
  assert.equal('accorciateRichiesta' in fini[1], false);
});
