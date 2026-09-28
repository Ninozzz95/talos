/*
 * REV-READ-BOUNDS / REV-READ-BYTES (ticket della CLI, 27/09/2026 notte; owner: tetto «1 MiB»).
 *
 * `leggi` chiamava `disco.leggi` (`kernel/dist/kernelPerIlBanco.js:39-40`, `readFile(…, "utf8")`): il file INTERO in memoria
 * e decodificato, e solo DOPO si guardava se era binario. Sonda della CLI: un PNG privato da 8.388.608 byte tornava come
 * stringa di 8.388.608 caratteri prima che il formatter lo scartasse.
 * Ora: un handle solo; i byte dal suo `stat`; un campione di 8.000 byte guardato PRIMA di decodificare (la soglia di git,
 * `xdiff-interface.c` `FIRST_FEW_BYTES`); al massimo `MAX_BYTE_LEGGI` byte letti, e il taglio si dichiara in testa.
 * Fonti: opencode `packages/opencode/src/tool/read.ts:16-18, 131-166, 301-345` (campione + lettura a flusso + taglio
 * dichiarato); Hermes `tools/file_tools.py:50` (tetto di lettura); Node 24 `FileHandle.read`/`FileHandle.stat`,
 * `TextDecoder` (`ignoreBOM: true` TIENE il BOM, come `readFile`).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BYTE_CAMPIONE_BINARIO, MAX_BYTE_LEGGI, esitoDellaLettura, leggiTestoLimitato, talosLavora, testoLeggibile,
} from '../src/kernel/talosHarness.mjs';
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
const chiamaLeggi = (percorso) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'leggi', arguments: JSON.stringify({ percorso }) } }] });
const FINE = { role: 'assistant', content: 'fatto', tool_calls: [] };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a3e2d6c20000000049454e44ae426082', 'hex');

function cartellaDiProva(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-rev-read-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}
async function esitoDiLeggi(t, nome, contenuto) {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, nome), contenuto);
  const rete = reteDiRisposte(chiamaLeggi(nome), FINE);
  await talosLavora({ cartella, task: { consegna: `leggi ${nome}` }, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch });
  return rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool').content;
}
/* Un `open` che conta i byte letti davvero e le chiusure: la misura del limite di memoria, e dell'handle chiuso. */
function apriContando({ dopoLaPrimaLettura, statFinto, leggiRotto } = {}) {
  const conto = { byteLetti: 0, letture: 0, chiusure: 0, aperture: 0 };
  const apriFn = async (percorso, flag) => {
    const handle = await open(percorso, flag);
    conto.aperture += 1;
    return {
      stat: async () => (statFinto ? { ...(await handle.stat()), ...statFinto } : handle.stat()),
      read: async (...argomenti) => {
        if (leggiRotto) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' });
        const esito = await handle.read(...argomenti);
        conto.byteLetti += esito.bytesRead;
        conto.letture += 1;
        if (conto.letture === 1) dopoLaPrimaLettura?.();
        return esito;
      },
      close: async () => { conto.chiusure += 1; return handle.close(); },
    };
  };
  return { conto, apriFn };
}

test('REV-READ-BOUNDS-01 — un file enorme SENZA a capo: si legge al massimo il tetto, e il taglio si dichiara in testa', async (t) => {
  const cartella = cartellaDiProva(t);
  const grande = MAX_BYTE_LEGGI * 8;
  writeFileSync(join(cartella, 'enorme.txt'), Buffer.alloc(grande, 0x61));
  const { conto, apriFn } = apriContando();
  const letta = await leggiTestoLimitato(cartella, 'enorme.txt', { apriFn });
  assert.equal(letta.byteSulDisco, grande);
  assert.equal(letta.troncato, true);
  assert.equal(letta.testo.length, MAX_BYTE_LEGGI, 'in memoria resta il tetto, non il file');
  assert.ok(conto.byteLetti <= MAX_BYTE_LEGGI + 1, `letti dal disco ${conto.byteLetti} byte: il tetto più uno, per sapere che c'è altro`);
  assert.equal(conto.chiusure, 1, 'l’handle si chiude');
  const esito = esitoDellaLettura(letta, 'enorme.txt');
  assert.match(esito, new RegExp(`^\\[TALOS read only the first ${MAX_BYTE_LEGGI} of ${grande} bytes of "enorme\\.txt"`, 'u'));
});

test('REV-READ-BOUNDS-02 — dal kernel vero: il modello legge PRIMA di tutto che il file è stato tagliato', async (t) => {
  const esito = await esitoDiLeggi(t, 'enorme.log', Buffer.alloc(MAX_BYTE_LEGGI * 3, 0x62));
  assert.match(esito, /^\[TALOS read only the first \d+ of \d+ bytes of "enorme\.log"/u, 'una lettura incompleta non si presenta come completa');
  assert.match(esito, /the rest was not read/u);
});

test('REV-READ-BOUNDS-04 — due `leggi` nella stessa risposta (sul desktop la seconda parte in anticipo): il tetto vale per tutte e due', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'piccolo.txt'), 'piccolo');
  writeFileSync(join(cartella, 'enorme.log'), Buffer.alloc(MAX_BYTE_LEGGI * 3, 0x62));
  const due = { role: 'assistant', content: null, tool_calls: ['piccolo.txt', 'enorme.log'].map((percorso, i) => ({ id: `call_${i}`, function: { name: 'leggi', arguments: JSON.stringify({ percorso }) } })) };
  const rete = reteDiRisposte(due, FINE);
  await talosLavora({ cartella, task: { consegna: 'leggi' }, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch });
  const [primo, secondo] = rete.chiamate[1].corpo.messages.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.equal(primo, 'piccolo');
  assert.match(secondo, /^\[TALOS read only the first \d+ of \d+ bytes of "enorme\.log"/u);
});

test('REV-READ-BOUNDS-03 — un file cresciuto dopo lo stat: il tetto vale lo stesso, e lo si dice', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'cresce.txt'), 'x'.repeat(100));
  const { conto, apriFn } = apriContando({ statFinto: { size: 10 } });
  const letta = await leggiTestoLimitato(cartella, 'cresce.txt', { apriFn, tetto: 40 });
  assert.equal(letta.testo, 'x'.repeat(40));
  assert.equal(letta.troncato, true);
  assert.ok(conto.byteLetti <= 41);
  assert.match(esitoDellaLettura(letta, 'cresce.txt'), /grew while it was read/u);
});

test('REV-READ-BYTES-01 — un PNG: si guarda solo il campione, non si decodifica niente, il peso VERO viene dallo stesso handle', async (t) => {
  const cartella = cartellaDiProva(t);
  const grande = Buffer.concat([PNG, Buffer.alloc(MAX_BYTE_LEGGI * 2, 0x41)]);
  writeFileSync(join(cartella, 'foto.png'), grande);
  const { conto, apriFn } = apriContando();
  const letta = await leggiTestoLimitato(cartella, 'foto.png', { apriFn });
  assert.equal(letta.binario, true);
  assert.equal(letta.testo, null, 'niente decodificato');
  assert.ok(conto.byteLetti <= BYTE_CAMPIONE_BINARIO, `letti ${conto.byteLetti} byte: solo il campione`);
  assert.equal(conto.chiusure, 1);
  assert.match(esitoDellaLettura(letta, 'foto.png'), new RegExp(`is a binary file \\(\\.png\\), ${grande.length} bytes on disk:`, 'u'));
});

test('REV-READ-BYTES-02 — dal kernel vero: nome, tipo e peso sul disco, nessun byte del file (P19-LEGGI-01)', async (t) => {
  const esito = await esitoDiLeggi(t, 'ScreenShot Tool -20260925194728.png', PNG);
  assert.match(esito, new RegExp(`is a binary file \\(\\.png\\), ${PNG.length} bytes on disk:`, 'u'));
  assert.ok(!esito.includes('\u0000') && !esito.includes('IHDR'));
});

test('REV-READ-BYTES-03 — senza il peso del disco nessun numero (P19-LEGGI-03): la chiamata a due argomenti resta valida', () => {
  const decodificato = PNG.toString('utf8');
  assert.match(testoLeggibile(decodificato, 'foto.png'), /is a binary file \(\.png\): leggi reads text files only/u);
  assert.doesNotMatch(testoLeggibile(decodificato, 'foto.png'), /\d+ bytes/u);
  assert.match(testoLeggibile(decodificato, 'foto.png', () => null), /is a binary file \(\.png\): /u);
  assert.match(testoLeggibile(decodificato, 'foto.png', 70), /, 70 bytes on disk: .*name and size/u);
});

test('REV-READ-UTF8 — un carattere spezzato dal tetto o fra due blocchi non diventa «�»; il BOM resta come in readFile', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'accenti.txt'), 'àààà€€€');
  const tagliata = await leggiTestoLimitato(cartella, 'accenti.txt', { tetto: 5 });
  assert.equal(tagliata.testo, 'àà', 'il tetto cade a metà della terza «à»: si tiene quello che è intero');
  assert.equal(tagliata.troncato, true);
  const aBlocchi = await leggiTestoLimitato(cartella, 'accenti.txt', { blocco: 3, campione: 3 });
  assert.equal(aBlocchi.testo, 'àààà€€€', 'blocchi da 3 byte tagliano ogni carattere: la decodifica a flusso li ricuce');
  writeFileSync(join(cartella, 'bom.txt'), '﻿ciao');
  assert.equal((await leggiTestoLimitato(cartella, 'bom.txt')).testo, '﻿ciao');
  const rotto = Buffer.from([0x61, 0xff, 0x62, 0xe2, 0x82, 0x63]);
  writeFileSync(join(cartella, 'rotto.txt'), rotto);
  assert.equal((await leggiTestoLimitato(cartella, 'rotto.txt')).testo, rotto.toString('utf8'), 'le sequenze non valide come readFile');
});

test('REV-READ-EDGE — vuoto, mancante, cartella, percorso assoluto: come prima', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'vuoto.txt'), '');
  const vuoto = await leggiTestoLimitato(cartella, 'vuoto.txt');
  assert.deepEqual([vuoto.testo, vuoto.troncato, vuoto.byteSulDisco], ['', false, 0]);
  assert.equal(esitoDellaLettura(vuoto, 'vuoto.txt'), '');
  await assert.rejects(leggiTestoLimitato(cartella, 'manca.txt'), { code: 'ENOENT' });
  mkdirSync(join(cartella, 'sotto'));
  await assert.rejects(leggiTestoLimitato(cartella, 'sotto'));
  writeFileSync(join(cartella, 'sotto', 'a.txt'), 'assoluto');
  assert.equal((await leggiTestoLimitato(cartella, join(cartella, 'sotto', 'a.txt'))).testo, 'assoluto');
});

test('REV-READ-PERMESSO — un permesso negato dal sistema esce com’è, e l’handle aperto si chiude anche su un errore di lettura', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'a.txt'), 'a');
  const negato = async () => { throw Object.assign(new Error('EACCES: permission denied, open'), { code: 'EACCES' }); };
  await assert.rejects(leggiTestoLimitato(cartella, 'a.txt', { apriFn: negato }), { code: 'EACCES' });
  const { conto, apriFn } = apriContando({ leggiRotto: true });
  await assert.rejects(leggiTestoLimitato(cartella, 'a.txt', { apriFn }), { code: 'EIO' });
  assert.equal(conto.chiusure, 1);
});

test('REV-READ-STOP — lo Stop a metà lettura: si ferma, chiude l’handle; una lettura dopo riparte da capo intera', async (t) => {
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'lungo.txt'), 'z'.repeat(50_000));
  const stop = new AbortController();
  const { conto, apriFn } = apriContando({ dopoLaPrimaLettura: () => stop.abort() });
  await assert.rejects(leggiTestoLimitato(cartella, 'lungo.txt', { apriFn, segnale: stop.signal, blocco: 1_000 }), { name: 'AbortError' });
  assert.equal(conto.chiusure, 1, 'l’handle si chiude anche sullo Stop');
  assert.ok(conto.byteLetti < 50_000, 'e non si è letto fino in fondo');
  assert.equal((await leggiTestoLimitato(cartella, 'lungo.txt')).testo.length, 50_000, 'la ripresa legge tutto');
});

test('REV-READ-PARITA — un file di testo normale arriva al modello identico', async (t) => {
  const testo = 'export const a = 1\n// è un commento\n';
  assert.equal(await esitoDiLeggi(t, 'app.js', testo), testo);
});
