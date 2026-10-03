/*
 * P19 sul desktop (lane CLI, commit `1568388d4`; owner 27/09 «P19 ora»). Il disco del kernel legge ogni file come UTF-8
 * (`kernel/dist/kernelPerIlBanco.js:39-40`, lo stesso del desktop e della CLI): `leggi` su una foto metteva nella
 * conversazione i suoi BYTE come testo. Qui la prova passa dal kernel vero, con un PNG vero sul disco: il modello riceve
 * nome, tipo e peso, mai un byte nullo; un file di testo passa identico.
 */
import assert from 'node:assert/strict';
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { talosLavora, testoLeggibile } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function reteDiRisposte(...risposte) {
  const chiamate = [];
  return {
    chiamate,
    fetch: async (url, opzioni) => {
      const indice = chiamate.length;
      chiamate.push({ url, corpo: JSON.parse(opzioni.body) });
      const scelta = risposte[Math.min(indice, risposte.length - 1)];
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' };
    },
  };
}
const leggi = (percorso) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'leggi', arguments: JSON.stringify({ percorso }) } }] });
const FINE = { role: 'assistant', content: 'fatto', tool_calls: [] };

/* Le prime righe di un PNG vero: firma, IHDR 1×1, IDAT, IEND — con i byte nulli che ogni PNG ha nell'intestazione. */
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a3e2d6c20000000049454e44ae426082', 'hex');

async function esitoDiLeggi(t, nome, contenuto) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-p19-leggi-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, nome), contenuto);
  const rete = reteDiRisposte(leggi(nome), FINE);
  await talosLavora({ cartella, task: { consegna: `leggi ${nome}` }, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch });
  return togliConfiniDati(rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool').content);
}

test('P19-LEGGI-01 — leggi su un PNG vero: il modello riceve nome, tipo e peso VERO sul disco, nessun byte del file', async (t) => {
  const esito = await esitoDiLeggi(t, 'ScreenShot Tool -20260925194728.png', PNG);
  /* il peso del FILE, non del testo decodificato (giro vero sul 4174: 869.664 byte detti «about 1571341») */
  assert.match(esito, new RegExp(`is a binary file \\(\\.png\\), ${PNG.length} bytes on disk:`, 'u'));
  assert.match(esito, /do not try to read it again/u);
  assert.ok(!esito.includes('\u0000'), 'nessun byte nullo arriva al modello');
  assert.ok(!esito.includes('IHDR'), 'nessun pezzo del file arriva al modello');
});

test('P19-LEGGI-03 — senza il peso del disco nessun numero: mai uno contato sul testo decodificato', () => {
  const decodificato = PNG.toString('utf8');
  const senza = testoLeggibile(decodificato, 'foto.png');
  assert.match(senza, /is a binary file \(\.png\): leggi reads text files only/u);
  assert.doesNotMatch(senza, /\d+ bytes/u);
  assert.doesNotMatch(senza, /name and size/u, 'non chiede di dire un peso che non ha');
  assert.match(testoLeggibile(decodificato, 'foto.png', () => null), /is a binary file \(\.png\): /u, 'uno stat fallito: come senza');
  assert.match(testoLeggibile(decodificato, 'foto.png', 70), /, 70 bytes on disk: .*name and size/u);
});

test('P19-LEGGI-02 — al contrario: un file di testo passa identico, accenti e righe compresi', async (t) => {
  const testo = 'prima riga\nseconda riga con è e ù\n';
  assert.equal(await esitoDiLeggi(t, 'note.md', testo), testo);
});
