/*
 * F-015 (audit 28/29-09, «Library usata diversamente dai nodi»), decisione owner 30/09/2026: «Artefatto sì, Libreria no».
 * Misurato il 30/09 con una sonda sul kernel a livello `lettura` (gli attrezzi di un passo di Workflow): 25 attrezzi che
 * cambiano qualcosa erano rifiutati, `artifact_create` no — l'HTML è isolato e non chiede permessi (scelta del 28/08), ma
 * `agent-service.mjs` ne salvava anche una COPIA DUREVOLE in Libreria. Una sessione in sola lettura, e ogni passo di un
 * Workflow, scriveva così nello stato condiviso; un sotto-agente in sola lettura invece non poteva (DELEGHE02).
 * Hermes non lascia scrivere i figli nello stato condiviso (`tools/delegate_tool_toolsets.py:18`,
 * `"memory",  # no writes to shared MEMORY.md`).
 * ⇒ L'artefatto resta a schermo; la copia in Libreria si fa solo fuori dalla sola lettura. Il kernel lo dice a chi salva
 *   col livello del MOMENTO (dopo un piano approvato il livello cambia nello stesso giro).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const HTML = '<!doctype html><html><body><p>grafico</p></body></html>';

function fornitoreCheCreaUnArtefatto() {
  let richieste = 0;
  return async () => {
    richieste++;
    const message = richieste === 1
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'c0', type: 'function', function: { name: 'artifact_create', arguments: JSON.stringify({ titolo: 'Grafico', html: HTML }) } }] }
      : { role: 'assistant', content: 'fatto' };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: richieste === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
}

async function chiamateAdArtefatto(livelloAccesso) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-f015-'));
  const chiamate = [];
  try {
    await talosLavora({ cartella, task: { consegna: 'Disegna un grafico.' }, modello: 'f', chiave: 'k', livelloAccesso,
      strumentiEstesi: ['artifact_create'], giriMassimi: 2, fetchDiRete: fornitoreCheCreaUnArtefatto(),
      onArtefatto: async (titolo, html, opzioni) => { chiamate.push({ titolo, html, opzioni }); return { id: 'art-1' }; } });
  } finally { rimuoviCartellaDiProva(cartella); }
  return chiamate;
}

test('F-015-KERNEL-READONLY: in sola lettura l artefatto si crea ma il kernel chiede di NON copiarlo in Libreria', async () => {
  const chiamate = await chiamateAdArtefatto('lettura');
  assert.equal(chiamate.length, 1, 'the artifact is still created: it is shown in the chat');
  assert.equal(chiamate[0].html, HTML);
  assert.deepEqual(chiamate[0].opzioni, { copiaInLibreria: false });
});

test('F-015-KERNEL-WRITE: fuori dalla sola lettura la copia in Libreria resta', async () => {
  for (const livello of ['accesso-pieno', 'su-richiesta', undefined]) {
    const chiamate = await chiamateAdArtefatto(livello);
    assert.equal(chiamate.length, 1);
    assert.deepEqual(chiamate[0].opzioni, { copiaInLibreria: true }, String(livello));
  }
});

async function avviaConArtefatto(opzioni) {
  const eventi = [];
  const salvati = [];
  const depositi = [];
  await avviaSessione({
    cartella: '/tmp/x', task: { id: 't', consegna: 'x' }, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e),
    talosLavoraFn: async (input) => {
      await input.onArtefatto('Grafico', HTML, opzioni);
      return { ok: true, esito: { comeFinita: 'concluso', detto: 'fatto' } };
    },
    salvaArtefattoFn: (id, html) => { salvati.push({ id, html }); },
    salvaVoceLibreriaFn: async (voce) => { depositi.push(voce); return 'lib-00000000-0000-4000-8000-000000000000'; },
  });
  return { evento: eventi.find((e) => e.type === 'ArtifactCreated'), salvati, depositi };
}

test('F-015-SERVICE-READONLY: copiaInLibreria:false ⇒ artefatto salvato e mostrato, NESSUNA voce in Libreria', async () => {
  const { evento, salvati, depositi } = await avviaConArtefatto({ copiaInLibreria: false });
  assert.equal(salvati.length, 1, 'the artifact itself is stored: the chat card needs it');
  assert.ok(evento, 'ArtifactCreated is still emitted');
  assert.equal(depositi.length, 0, 'read-only never writes the shared Library');
  assert.equal(evento.voceLibreriaId, undefined);
});

test('F-015-SERVICE-DEFAULT: senza opzioni (chiamanti di prima, CLI, mobile) la copia in Libreria resta', async () => {
  for (const opzioni of [undefined, {}, { copiaInLibreria: true }]) {
    const { evento, depositi } = await avviaConArtefatto(opzioni);
    assert.equal(depositi.length, 1, JSON.stringify(opzioni));
    assert.equal(evento.voceLibreriaId, 'lib-00000000-0000-4000-8000-000000000000');
  }
});
