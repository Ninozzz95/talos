/*
 * Revisione avversaria di b8def0422 (16/10/2026, «Chiedi, ma non in Full access»): le ALTRE porte di scrittura. `document_create`
 * sceglie il nome del file dal titolo e dal formato (`credentials` + `json` = `credentials.json`), e con `mode:"append"` aggiunge in
 * coda a un file che esiste. Il cancello del kernel per `document_create` riceve solo `{ tipo, formato }` (talosHarness.mjs, la
 * chiamata a `verificaPermessoConBarriera`): non sa quale file toccherà, quindi la domanda «questo file può contenere chiavi» non
 * può partire; e `onDocumento` (agent-service.mjs) non la fa. Con `scrivi` lo stesso file chiede (Workspace write).
 *
 * Generatore, verifica e scrittura VERI (document-generator, workspace-files) in un progetto temporaneo; il kernel è il finto
 * di agent-service.test.mjs (chiama `onDocumento` come farebbe il vero dopo il cancello). Nessuna rete, nessuna casa toccata.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avviaSessione } from '../src/agent-service.mjs';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function kernelFinto(documenti) {
  return async (input) => {
    for (const d of documenti) d.esito = await input.onDocumento?.(d.argomenti);
    return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], usage: {} };
  };
}

test('SEG-DOC-REV-01 — document_create in coda a un credentials.json che esiste: [CURATO] il segreto NON cambia senza una domanda', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'seg-doc-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const segreto = '{"api_key":"sk-vero-da-non-toccare"}\n';
  writeFileSync(join(cartella, 'credentials.json'), segreto);
  // premessa: con `scrivi` lo stesso file chiede in Workspace write; con document_create il cancello non sa il nome e non chiede
  const domande = [];
  const chiedi = async (a) => { domande.push(a.tipo); return true; };
  assert.equal((await verificaPermessoScrittura({ tipo: 'scrivi', percorso: 'credentials.json' }, { livelloAccesso: 'Workspace write', chiediApprovazioneFn: chiedi, cartella })).consentito, true);
  assert.deepEqual(domande, ['scrivi'], 'premessa: scrivi chiede');
  assert.equal((await verificaPermessoScrittura({ tipo: 'document_create', formato: 'json' }, { livelloAccesso: 'Workspace write', chiediApprovazioneFn: chiedi, cartella })).consentito, true);
  assert.deepEqual(domande, ['scrivi'], 'premessa: document_create passa senza domanda');

  const documenti = [{ argomenti: { format: 'json', title: 'credentials', body: '{"aggiunto":true}', mode: 'append' } }];
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn: kernelFinto(documenti),
    salvaVoceLibreriaFn: async () => ({ id: 'lib-finto' }) });
  const dopo = readFileSync(join(cartella, 'credentials.json'), 'utf8');
  assert.equal(dopo, segreto, `il file segreto è cambiato senza una domanda (esito: ${JSON.stringify(documenti[0].esito)?.slice(0, 160)})`);
});

test('SEG-DOC-REV-01, la cura — il modello sa cosa fare (scrivi, che chiede); AL CONTRARIO in Full access il documento si accoda, e un file qualunque si accoda come prima', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'seg-doc-cura-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'credentials.json'), '{"a":1}\n');
  writeFileSync(join(cartella, 'note.md'), '# Note\n');
  const rifiutato = [{ argomenti: { format: 'json', title: 'credentials', body: '{"b":2}', mode: 'append' } }];
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn: kernelFinto(rifiutato),
    salvaVoceLibreriaFn: async () => ({ id: 'lib-finto' }) });
  assert.equal(rifiutato[0].esito?.ok, false);
  assert.match(String(rifiutato[0].esito?.esito), /may hold keys or passwords.*Use scrivi with the same path/su);
  const normale = [{ argomenti: { format: 'md', title: 'note', body: 'riga nuova', mode: 'append' } }];
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn: kernelFinto(normale),
    salvaVoceLibreriaFn: async () => ({ id: 'lib-finto' }) });
  assert.equal(normale[0].esito?.ok, true, JSON.stringify(normale[0].esito)?.slice(0, 200));
  assert.match(readFileSync(join(cartella, 'note.md'), 'utf8'), /riga nuova/u);
  const pieno = [{ argomenti: { format: 'json', title: 'credentials', body: '{"b":2}', mode: 'append' } }];
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', livelloAccesso: 'accesso-pieno', onEvento: () => {}, talosLavoraFn: kernelFinto(pieno),
    salvaVoceLibreriaFn: async () => ({ id: 'lib-finto' }) });
  assert.equal(pieno[0].esito?.ok, true, `Full access never asks (owner 12/10): ${JSON.stringify(pieno[0].esito)?.slice(0, 200)}`);
  assert.match(readFileSync(join(cartella, 'credentials.json'), 'utf8'), /"b":2/u);
});
