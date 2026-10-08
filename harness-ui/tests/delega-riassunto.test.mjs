import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  creaSubagentOrchestrator,
  PREFISSI_STATO_DEL_KERNEL,
  riassuntoDelegaDaDetto,
  riassuntoDelegaDaEventi,
  TETTO_RIASSUNTO_DELEGA,
} from '../src/subagent-orchestrator.mjs';

/*
 * ⛔ 0.1.23 (bugfixer, 08/10/2026) — IL RESOCONTO DI UNA FIGLIA, SEPARATO DAL SUO STATO.
 *   La scheda dell'agente diceva «Che cosa ha riportato: concluso»: leggeva `esitoDelega`, uno STATO, perché il resoconto
 *   non usciva mai dal server. Hermes tiene separati `child_status` e `child_summary` (tools/delegate_tool_results.py:369).
 * `sessioni` è una Map finta, stesso schema minimo della vera (come in subagent-orchestrator.test.mjs).
 */
function vocePadre() {
  return { cartella: '/padre', profonditaDelega: 0, conclusa: false, padreId: null, modello: null, reasoning: null, permessi: null, permessiPerAttrezzo: null };
}

test('RIASSUNTO-01: solo un testo vero, ripulito, col tetto — mai il segnaposto, mai uno stato', () => {
  assert.equal(riassuntoDelegaDaDetto('  Ho creato il file.  '), 'Ho creato il file.');
  assert.equal(riassuntoDelegaDaDetto(''), null);
  assert.equal(riassuntoDelegaDaDetto('   '), null);
  assert.equal(riassuntoDelegaDaDetto(undefined), null);
  assert.equal(riassuntoDelegaDaDetto({ testo: 'no' }), null);
  const lungo = riassuntoDelegaDaDetto('x'.repeat(TETTO_RIASSUNTO_DELEGA + 50));
  assert.equal(lungo.length, TETTO_RIASSUNTO_DELEGA);
  assert.ok(lungo.endsWith('…'));
});

test('RIASSUNTO-02: dopo il riavvio si ricostruisce dal `result.detto` dell\'ultimo giro chiuso; un errore finale non ne ha', () => {
  const finito = [
    { type: 'RunStarted' }, { type: 'RunFinished', result: { detto: 'primo giro' } },
    { type: 'RunStarted' }, { type: 'RunFinished', result: { detto: 'Ho letto il README.' } },
  ];
  assert.equal(riassuntoDelegaDaEventi(finito), 'Ho letto il README.');
  assert.equal(riassuntoDelegaDaEventi([...finito, { type: 'RunStarted' }, { type: 'RunError', code: 'fermato' }]), null, 'l\'ultimo giro è fallito: niente resoconto vecchio spacciato per nuovo');
  assert.equal(riassuntoDelegaDaEventi([{ type: 'RunStarted' }]), null);
  assert.equal(riassuntoDelegaDaEventi(null), null);
});

test('RIASSUNTO-05 (review desktop): la riga di STATO che il kernel antepone non è il resoconto', () => {
  // fermata con la persona che ferma DOPO che la figlia ha scritto: resta il suo testo
  assert.equal(riassuntoDelegaDaDetto('⛔ stopped on request.\nmetà fatto', { comeFinita: 'fermato' }), 'metà fatto');
  assert.equal(riassuntoDelegaDaDetto('⛔ stopped on request: after the third file.\nho scritto due file', { comeFinita: 'fermato' }), 'ho scritto due file');
  // fermata PRIMA di scrivere: nessun resoconto, nessuna sezione
  assert.equal(riassuntoDelegaDaDetto('⛔ stopped on request.', { comeFinita: 'fermato' }), null);
  assert.equal(riassuntoDelegaDaDetto('⛔ turns exhausted: 24 of 24 used without closing the task.\nultimo passo: test', { comeFinita: 'giri-esauriti' }), 'ultimo passo: test');
  assert.equal(riassuntoDelegaDaDetto('⛔ generation stopped without an answer and without exhausting the turns.', { comeFinita: 'fermato' }), null);
  assert.equal(riassuntoDelegaDaDetto('⛔ the model asked 3 times for the very same thing in the same answer.\nquasi fatto', { comeFinita: 'ripetizione' }), 'quasi fatto');
  // al ripristino `comeFinita` non c'è: vale il riconoscimento della frase
  assert.equal(riassuntoDelegaDaEventi([{ type: 'RunStarted' }, { type: 'RunFinished', result: { detto: '⛔ stopped on request.\nmetà fatto' } }]), 'metà fatto');
  // AL CONTRARIO: un giro concluso che comincia con «⛔» di suo resta intero, e un «⛔» qualunque non è uno stato
  assert.equal(riassuntoDelegaDaDetto('⛔ stopped on request.\nresto', { comeFinita: 'concluso' }), '⛔ stopped on request.\nresto');
  assert.equal(riassuntoDelegaDaDetto('⛔ Attenzione: il file era vuoto.\nL\'ho riempito.', { comeFinita: 'fermato' }), '⛔ Attenzione: il file era vuoto.\nL\'ho riempito.');
});

test('RIASSUNTO-06: le frasi di stato riconosciute sono ancora quelle che il kernel scrive (se cambiano lì, questa diventa rossa)', () => {
  const kernel = readFileSync(new URL('../src/kernel/talosHarness.mjs', import.meta.url), 'utf8');
  assert.match(kernel, /ultimoTesto = `\$\{comeFinita\.detto\}\\n\$\{ultimoTesto\}`/u, 'premessa: il kernel antepone ancora la riga di stato');
  for (const prefisso of PREFISSI_STATO_DEL_KERNEL) assert.ok(kernel.includes(prefisso), `il kernel non scrive più «${prefisso}»`);
});

test('RIASSUNTO-03: a figlia conclusa lo snapshot porta resoconto E stato, separati', async () => {
  const sessioni = new Map([['padre-1', vocePadre()]]);
  let concludi;
  const orch = creaSubagentOrchestrator({
    sessioni,
    cartellaEsisteFn: () => true,
    avviaESeguiFn: (opzioni) => {
      sessioni.set('figlio-1', { padreId: 'padre-1', conclusa: false, eventi: [], task: { consegna: 'leggi il README' }, avviataAlle: '2026-10-08T10:00:00.000Z' });
      concludi = opzioni.onConclusioneFn;
      return { sessionId: 'figlio-1' };
    },
  });
  await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'leggi il README', cartella: '/figlio', modalita: 'lettura' });
  assert.equal(orch.elencaFigli('padre-1')[0].riassuntoDelega, null, 'prima della fine nessun resoconto');
  concludi({ ok: true, esito: { detto: 'Il README descrive un progetto di prova.', comeFinita: 'concluso' } });
  await new Promise((r) => setImmediate(r));
  const [figlia] = orch.elencaFigli('padre-1');
  assert.equal(figlia.riassuntoDelega, 'Il README descrive un progetto di prova.');
  assert.equal(figlia.esitoDelega, 'concluso');
  assert.notEqual(figlia.riassuntoDelega, figlia.esitoDelega);
});

test('RIASSUNTO-04: AL CONTRARIO — una figlia che chiude senza testo non riceve il segnaposto del modello', async () => {
  const sessioni = new Map([['padre-1', vocePadre()]]);
  let concludi;
  const orch = creaSubagentOrchestrator({
    sessioni,
    cartellaEsisteFn: () => true,
    avviaESeguiFn: (opzioni) => {
      sessioni.set('figlio-1', { padreId: 'padre-1', conclusa: false, eventi: [], task: { consegna: 'x' }, avviataAlle: '2026-10-08T10:00:00.000Z' });
      concludi = opzioni.onConclusioneFn;
      return { sessionId: 'figlio-1' };
    },
  });
  await orch.delegaSottoTask({ sessionPadreId: 'padre-1', task: 'x', cartella: '/figlio', modalita: 'lettura' });
  concludi({ ok: true, esito: { detto: '', comeFinita: 'concluso' } });
  await new Promise((r) => setImmediate(r));
  assert.equal(orch.elencaFigli('padre-1')[0].riassuntoDelega, null);
});
