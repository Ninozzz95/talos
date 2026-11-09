/*
 * FE-003 (forma del 03/11/2026): il gesto su un blocco nel giornale. `bolla.blocco` viaggia col messaggio; il server lo tiene solo con la sua
 * forma, ne fa UN evento durevole `talos.blocco.azione.v1`, e il modello non lo vede mai.
 * ⛔ Il campo non dà nessun permesso: il messaggio resta un messaggio normale.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { bollaPerLaConsegna, bollaValida, TETTI_BOLLA } from '../src/bolla-della-persona.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry, EVENTO_AZIONE_DEL_BLOCCO } from '../src/session-registry.mjs';
import { EVENTO_AZIONE } from '../frontend/src/components/blocchi/azione.js';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BLOCCO = { idBlocco: 'prossimo', tipo: 'scelte', chiave: 's1:1peymrq#prossimo', titolo: 'Come procedere' };
const BOLLA = { testo: 'Continua', allegati: [], blocco: BLOCCO };

test('BOLLA-BLOCCO-01 il campo resta solo con la sua forma; fuori forma cade e il messaggio parte', () => {
  assert.deepEqual(bollaValida(BOLLA), BOLLA);
  const { titolo: _titolo, ...senzaTitolo } = BLOCCO;
  assert.deepEqual(bollaValida({ testo: 'x', blocco: senzaTitolo }).blocco, senzaTitolo);
  assert.deepEqual(bollaValida({ testo: 'x', blocco: { ...BLOCCO, intruso: 1 } }).blocco, BLOCCO, 'i campi sconosciuti cadono');
  assert.equal(bollaValida({ testo: 'x', blocco: { ...BLOCCO, titolo: 'a'.repeat(1000) } }).blocco.titolo.length, 300);
  for (const storto of [
    null, 'scelte', [], {},
    { ...BLOCCO, tipo: 'tabella' }, { ...BLOCCO, tipo: 'consenso' }, { ...BLOCCO, tipo: undefined },
    { ...BLOCCO, idBlocco: '' }, { ...BLOCCO, idBlocco: 7 }, { ...BLOCCO, idBlocco: 'x'.repeat(TETTI_BOLLA.nome + 1) },
    { ...BLOCCO, chiave: '' }, { ...BLOCCO, chiave: 'senza-forma' }, { ...BLOCCO, chiave: 's1:abc#altro' },
    { ...BLOCCO, chiave: `s1:${'x'.repeat(TETTI_BOLLA.chiave)}#prossimo` },
  ]) {
    const bolla = bollaValida({ testo: 'x', allegati: [], blocco: storto });
    assert.equal(bolla.testo, 'x', 'il messaggio resta');
    assert.equal(Object.hasOwn(bolla, 'blocco'), false, JSON.stringify(storto)?.slice(0, 60));
  }
  assert.deepEqual(bollaValida({ testo: 'x', allegati: [] }), { testo: 'x', allegati: [] }, 'AL CONTRARIO: senza campo, nessuna chiave');
});

test('BOLLA-BLOCCO-01b la consegna tiene il campo, e un testo diverso da quello mostrato non passa', () => {
  assert.deepEqual(bollaPerLaConsegna(BOLLA, 'Continua'), BOLLA);
  assert.equal(bollaPerLaConsegna(BOLLA, 'Fai altro'), null);
});

function scena(t) {
  const giri = [];
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-bolla-blocco-'));
  const registro = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    avviaSessioneFn: (input) => new Promise((risolvi) => {
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}`, input: input.task });
    }),
  });
  const finisci = (i) => { giri[i].input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${i + 1}` }); giri[i].risolvi({ comeFinita: 'concluso' }); };
  t.after(async () => { giri.forEach((_, i) => { try { finisci(i); } catch { /* già chiuso */ } }); await registro.chiudi?.(); await new Promise((f) => setTimeout(f, 30)); rimuoviCartellaDiProva(cartellaStore); });
  return { registro, giri, finisci };
}
const attesa = (ms = 30) => new Promise((f) => setTimeout(f, ms));
const azioni = (registro, id) => registro.esporta(id).eventi.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO_AZIONE_DEL_BLOCCO);

test('BOLLA-BLOCCO-02 un evento solo, durevole, senza il valore; lo stesso nome del client', async (t) => {
  assert.equal(EVENTO_AZIONE_DEL_BLOCCO, EVENTO_AZIONE);
  const { registro, finisci } = scena(t);
  const { sessionId } = registro.avvia('task');
  await attesa(); finisci(0); await attesa();
  assert.equal(registro.resume(sessionId, 'Continua', [], { bolla: BOLLA }).erroreAvvio, undefined);
  await attesa();
  const eventi = azioni(registro, sessionId);
  assert.equal(eventi.length, 1);
  assert.deepEqual(eventi[0].value, { idBlocco: 'prossimo', tipo: 'scelte', chiave: BLOCCO.chiave }, 'il valore è già il testo del messaggio');
  assert.equal(Number.isSafeInteger(eventi[0]._sequenza), true, 'sta nel giornale, quindi torna nella rigiocata');
  finisci(1); await attesa();
  assert.equal(registro.resume(sessionId, 'Continua', [], { bolla: BOLLA }).erroreAvvio, undefined);
  await attesa();
  assert.equal(azioni(registro, sessionId).length, 1, 'la stessa chiave non si annuncia due volte');
});

test('BOLLA-BLOCCO-02b anche un messaggio passato dalla coda arriva nel giornale; senza campo nessun evento', async (t) => {
  const { registro, giri } = scena(t);
  const { sessionId } = registro.avvia('task');
  await attesa();
  assert.equal(registro.accodaMessaggio(sessionId, 'messaggio normale', []).ok, true);
  assert.equal(registro.accodaMessaggio(sessionId, 'Continua', [], { bolla: BOLLA }).ok, true);
  giri[0].input.codaMessaggiFn(); // la consegna dal vivo, dal nucleo
  await attesa();
  assert.equal(azioni(registro, sessionId).length, 0, 'AL CONTRARIO: un messaggio senza campo non annuncia niente');
  giri[0].input.codaMessaggiFn();
  await attesa();
  assert.deepEqual(azioni(registro, sessionId).map((e) => e.value.chiave), [BLOCCO.chiave]);
});

test('BOLLA-BLOCCO-03 il campo non arriva mai al modello', async () => {
  let corpo = '';
  const cartella = mkdtempSync(join(tmpdir(), 'talos-bolla-blocco-modello-'));
  try {
    await talosLavora({
      cartella, task: { consegna: 'Continua', bolla: BOLLA }, modello: 'x', chiave: 'y', _giriMassimiInterno: 1,
      fetchDiRete: async (_url, init) => {
        corpo += String(init.body);
        return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
      },
    });
  } finally { rimuoviCartellaDiProva(cartella); }
  assert.ok(corpo.includes('Continua'), 'la prova deve guardare il corpo vero');
  for (const dentro of [BLOCCO.chiave, BLOCCO.titolo, 'idBlocco']) assert.equal(corpo.includes(dentro), false, dentro);
});
