import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as kernel from '../src/kernel/talosHarness.mjs';
import { creaCasaLinuxSessione } from '../src/kernel/casa-linux.mjs';
import { verificaCasaLinux } from '../src/casa-linux-binari.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { talosLavora, ambienteSenzaCredenziali, convertiPercorsoWsl } = kernel;

/*
 * ⛔⛔ F4-01 / F4-04 (audit v4, owner 01/10/2026): `file_edit` decodificava il file in UTF-8 CON SOSTITUZIONE e lo riscriveva:
 *   su un file Windows-1252 le virgolette curve (`0x92 0x93 0x94`) diventavano `EF BF BD` per sempre, 27 → 36 byte, e l'esito
 *   diceva «the file is now 28 characters. The rest of the file is untouched». Riprodotto prima della cura
 *   (`scratchpad/riproduci-f4-01.mjs`). Decisioni dell'owner: `file_edit` RIFIUTA un file che non è UTF-8 valido (come Codex,
 *   `codex-rs/file-system/src/lib.rs:649-659`, `String::from_utf8` → `InvalidData`), e gli esiti di scrittura contano i BYTE
 *   sul disco — anche quelli di `scrivi`.
 */

const CP1252 = Buffer.from([...Buffer.from('Ciao '), 0x92, ...Buffer.from('mondo'), 0x93, ...Buffer.from(' e '), 0x94, ...Buffer.from('citazione'), 0x94, 0x0a]);
const CON_NUL = Buffer.from([...Buffer.from('PRE'), 0x00, ...Buffer.from('MID'), 0xff, ...Buffer.from('POST')]);
const UTF16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Ciao mondo\n', 'utf16le')]);

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-utf8-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } });

async function giro(cartellaProgetto, chiamate, extra = {}) {
  let n = 0;
  const domande = [];
  const risultato = await talosLavora({
    cartella: cartellaProgetto, task: { consegna: 'Correggi il file.' }, modello: 'test', chiave: 'test', livelloAccesso: 'accesso-pieno',
    chiediApprovazioneFn: async (azione) => { domande.push(azione); return true; },
    fetchDiRete: async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({
      choices: [{ message: n++ === 0 ? { role: 'assistant', content: null, tool_calls: chiamate } : { role: 'assistant', content: 'Fatto.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }) }),
    ...extra,
  });
  return { esito: (id) => risultato.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '', domande };
}

test('UTF8-01: file_edit su un file Windows-1252 si RIFIUTA, i byte restano identici, e l esito dice dove sta il primo byte non valido', async (t) => {
  const c = cartella(t);
  writeFileSync(join(c, 'cp1252.txt'), CP1252);
  const { esito, domande } = await giro(c, [chiama('e', 'file_edit', { percorso: 'cp1252.txt', old_string: 'Ciao', new_string: 'salve' })]);
  assert.deepEqual(readFileSync(join(c, 'cp1252.txt')), CP1252, 'nessun byte cambiato');
  assert.match(esito('e'), /^REFUSED\. Nothing was changed: cp1252\.txt is not valid UTF-8 text/);
  assert.match(esito('e'), /byte 5 \(0x92\)/, 'il primo byte non valido, col suo valore');
  assert.match(esito('e'), /leggi format:"hex"/, 'dice come guardarlo senza rovinarlo');
  assert.equal(domande.length, 0, 'una modifica che non può applicarsi non disturba la persona');
});

test('UTF8-02: anche un file col NUL e un UTF-16 si rifiutano, senza toccarli', async (t) => {
  const c = cartella(t);
  // `.raw` e non `.bin`: un'estensione binaria nota la ferma prima la guardia di F-001 (rev-scrittura-su-binari); qui si
  // prova il riconoscimento dal CONTENUTO (il NUL), quello che vale per i nomi che nessuna lista conosce.
  writeFileSync(join(c, 'b3.raw'), CON_NUL);
  writeFileSync(join(c, 'utf16.txt'), UTF16);
  const { esito } = await giro(c, [
    chiama('b', 'file_edit', { percorso: 'b3.raw', old_string: 'MID', new_string: 'Q' }),
    chiama('u', 'file_edit', { percorso: 'utf16.txt', old_string: 'Ciao', new_string: 'salve' }),
  ]);
  assert.deepEqual(readFileSync(join(c, 'b3.raw')), CON_NUL);
  assert.deepEqual(readFileSync(join(c, 'utf16.txt')), UTF16);
  assert.match(esito('b'), /^REFUSED\. Nothing was changed: b3\.raw is a binary file/);
  assert.match(esito('u'), /^REFUSED\. Nothing was changed: utf16\.txt is a binary file/);
});

test('UTF8-03: AL CONTRARIO — un UTF-8 valido con accenti, emoji e BOM si modifica, il BOM resta, e l esito dice i BYTE sul disco', async (t) => {
  const c = cartella(t);
  const testo = '﻿perché 🚀 caffè\nseconda riga\n';
  writeFileSync(join(c, 'ok.txt'), testo, 'utf8');
  const { esito } = await giro(c, [chiama('e', 'file_edit', { percorso: 'ok.txt', old_string: 'caffè', new_string: 'tè' })]);
  const dopo = readFileSync(join(c, 'ok.txt'));
  assert.equal(dopo.toString('utf8'), '﻿perché 🚀 tè\nseconda riga\n');
  assert.deepEqual([...dopo.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'il BOM resta');
  assert.equal(esito('e'), `edited: ok.txt (1 occurrence replaced; the file is now ${statSync(join(c, 'ok.txt')).size} bytes). The rest of the file is untouched.`);
});

test('UTF8-04: scrivi conta i byte — un aggiunta e la sostituzione di un file Windows-1252 dicono i byte VERI del disco', async (t) => {
  const c = cartella(t);
  writeFileSync(join(c, 'note.txt'), 'già scritto\n', 'utf8');
  writeFileSync(join(c, 'vecchio.txt'), CP1252);
  const { esito } = await giro(c, [
    chiama('a', 'scrivi', { percorso: 'note.txt', contenuto: 'però ancora\n', mode: 'append' }),
    chiama('l', 'leggi', { percorso: 'vecchio.txt' }),
    chiama('s', 'scrivi', { percorso: 'vecchio.txt', contenuto: 'Nuovo testo\n' }),
  ]);
  assert.equal(esito('a'), `appended to: note.txt (+${Buffer.byteLength('però ancora\n')} bytes; the file is now ${statSync(join(c, 'note.txt')).size} bytes). Call \`scrivi\` again with mode:"append" on this same path for the next part.`);
  assert.equal(esito('s'), `written: vecchio.txt (replaced an existing file of ${CP1252.length} bytes)`, 'i byte del file che c era, non i caratteri della sua lettura con «�»');
});

test('UTF8-06: un aggiunta a un file Windows-1252 non tocca i suoi byte e dice la misura del DISCO, non quella della lettura con «�»', async (t) => {
  const c = cartella(t);
  writeFileSync(join(c, 'log.txt'), CP1252);
  const { esito } = await giro(c, [chiama('a', 'scrivi', { percorso: 'log.txt', contenuto: 'fine\n', mode: 'append' })]);
  const dopo = readFileSync(join(c, 'log.txt'));
  assert.deepEqual(dopo.subarray(0, CP1252.length), CP1252, 'la parte che c era resta byte per byte');
  assert.equal(dopo.length, CP1252.length + 5);
  assert.match(esito('a'), new RegExp(`^appended to: log\\.txt \\(\\+5 bytes; the file is now ${CP1252.length + 5} bytes\\)`));
});

/* La casa Linux (fase B): la lettura passa dal servente; il controllo deve valere anche lì. WSL vero, o la prova si salta. */
const binari = process.platform === 'win32' ? await verificaCasaLinux() : { pronta: false, motivo: 'non è Windows' };
const wsl = process.platform === 'win32' ? spawnSync('wsl.exe', ['--exec', 'sh', '-c', 'echo ok'], { encoding: 'utf8', timeout: 15_000, windowsHide: true }) : null;
const vero = { skip: !binari.pronta ? `casa Linux non preparata: ${binari.motivo}` : wsl?.status === 0 ? false : 'WSL non disponibile' };

test('UTF8-05 (WSL vero): nella casa Linux file_edit rifiuta il Windows-1252 e conta i byte dell UTF-8', vero, async (t) => {
  const c = cartella(t);
  const sessione = creaCasaLinuxSessione({ node: binari.node, rg: binari.rg, env: ambienteSenzaCredenziali() });
  t.after(() => { sessione.chiudi(); spawnSync('wsl.exe', ['--exec', 'rm', '-rf', '--', convertiPercorsoWsl(c)], { windowsHide: true }); });
  writeFileSync(join(c, 'cp1252.txt'), CP1252);
  writeFileSync(join(c, 'ok.txt'), 'perché caffè\n', 'utf8');
  const { esito } = await giro(c, [
    chiama('e', 'file_edit', { percorso: 'cp1252.txt', old_string: 'Ciao', new_string: 'salve' }),
    chiama('o', 'file_edit', { percorso: 'ok.txt', old_string: 'caffè', new_string: 'tè' }),
  ], { casaLinuxSessione: sessione, ambienteComandiFn: async () => ({ dove: null, revisione: 0 }) });
  assert.deepEqual(readFileSync(join(c, 'cp1252.txt')), CP1252);
  assert.match(esito('e'), /^REFUSED\. Nothing was changed: .*cp1252\.txt is not valid UTF-8 text.*byte 5 \(0x92\)/s);
  assert.match(esito('o'), new RegExp(`the file is now ${statSync(join(c, 'ok.txt')).size} bytes\\)`));
});

/* Revisione Codex 01/10/2026, rilievo 4 (verificato): se il file cambia mentre la carta di approvazione è aperta, file_edit lo
   sovrascriveva col testo calcolato dal file di PRIMA — il contenuto nuovo spariva, e l'esito diceva «edited». */
test('UTF8-07: un file che cambia mentre si aspetta il sì non si sovrascrive col testo vecchio — rifiuto, e i byte nuovi restano', async (t) => {
  const c = cartella(t);
  writeFileSync(join(c, 'a.txt'), 'Ciao mondo\n');
  const nuovo = Buffer.from([...Buffer.from('Nuovo '), 0x92, ...Buffer.from('testo\n')]);
  const ricevute = [];
  const { esito } = await giro(c, [chiama('e', 'file_edit', { percorso: 'a.txt', old_string: 'Ciao', new_string: 'Salve' })], {
    livelloAccesso: 'su-richiesta', chiediApprovazioneFn: async () => { writeFileSync(join(c, 'a.txt'), nuovo); return true; },
    onGiro: (e) => { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta); },
  });
  assert.deepEqual(ricevute.map((r) => r.status), ['failed'], 'la ricevuta firmata non dice «succeeded» per una modifica che non c è stata');
  assert.deepEqual(readFileSync(join(c, 'a.txt')), nuovo, 'il contenuto scritto da altri durante la domanda resta');
  assert.match(esito('e'), /^REFUSED\. Nothing was changed: a\.txt changed while waiting for approval/);
});
