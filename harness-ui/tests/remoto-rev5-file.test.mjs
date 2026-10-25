// Revisione a blocco 5 (24/10/2026), voce 2-ter (scambio di file): le sonde del revisore REV5-F3, REV5-F5 e REV5-M09b, tenute nella
// suite dal Desktop 9 con le cure (le altre sonde del revisore erano verdi e restano nel suo materiale).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { PEZZO_MASSIMO, creaFileDeiDispositivi } from '../src/remoto/file-dispositivi.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const b64u = (b) => Buffer.from(b).toString('base64url');

function banco(t, { eventi = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-rev5-file-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const cartellaDati = join(dir, 'dati');
  const progetto = join(dir, 'progetto');
  mkdirSync(progetto, { recursive: true });
  const sessioni = new Map([['s1', realpathSync(progetto)]]);
  const orologio = { ora: 1_800_000_000_000 };
  const registro = {
    esiste: (id) => sessioni.has(id),
    cartellaPerChatFile: async (id) => (sessioni.has(id) ? { ok: true, cartella: sessioni.get(id) } : { code: 'NOT_FOUND' }),
  };
  const crea = () => creaFileDeiDispositivi({ cartella: cartellaDati, sessionRegistry: registro, eventiDellaSessione: () => eventi, clock: () => orologio.ora });
  return { dir, cartellaDati, progetto: realpathSync(progetto), sessioni, orologio, eventi, crea, file: crea() };
}

test('REV5-F3 dispositivo dimenticato con un pezzo in volo: niente resti sul disco, il pezzo dopo dice TRANSFER_UNKNOWN', async (t) => {
  /* Desktop 9 (24/10/2026): la finestra dipende dai tempi (una corsa sola era verde anche senza la cura): si ripete con 0-11 giri
     dell'event loop fra il pezzo e il «dimentica», come REV5-COL-1 */
  const esiti = [];
  for (let giri = 0; giri < 12; giri += 1) {
    const b = banco(t);
    const contenuto = Buffer.alloc(3 * PEZZO_MASSIMO, 7);
    const avvio = await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'grande.bin', dimensione: contenuto.length, sha256: sha(contenuto) });
    await b.file.pezzo({ dispositivoId: 'dA', trasferimentoId: avvio.trasferimentoId, da: 0, dati: b64u(contenuto.subarray(0, PEZZO_MASSIMO)) });
    const inVolo = b.file.pezzo({ dispositivoId: 'dA', trasferimentoId: avvio.trasferimentoId, da: PEZZO_MASSIMO, dati: b64u(contenuto.subarray(PEZZO_MASSIMO, 2 * PEZZO_MASSIMO)) });
    for (let i = 0; i < giri; i += 1) await new Promise((x) => setImmediate(x));
    await b.file.dimenticaDispositivo('dA');
    const r = await inVolo.then((v) => ({ ok: v }), (e) => ({ code: e.code }));
    await new Promise((x) => setTimeout(x, 20));
    const resti = existsSync(join(b.cartellaDati, 'trasferimenti')) ? readdirSync(join(b.cartellaDati, 'trasferimenti'), { recursive: true }).map(String).filter((n) => /\.(part|json)$/u.test(n)) : [];
    const dopo = await b.file.pezzo({ dispositivoId: 'dA', trasferimentoId: avvio.trasferimentoId, da: 2 * PEZZO_MASSIMO, dati: b64u(contenuto.subarray(0, 10)) }).then(() => 'ok', (e) => e.code);
    const dopoRiavvio = await b.crea().pezzo({ dispositivoId: 'dA', trasferimentoId: avvio.trasferimentoId, da: 0, dati: b64u(contenuto.subarray(0, 10)) }).then((v) => `ok ${JSON.stringify(v)}`, (e) => e.code);
    esiti.push({ giri, pezzoInVolo: r, resti, dopo, dopoRiavvio });
  }
  console.log('REV5-F3', JSON.stringify(esiti));
  assert.deepEqual(esiti.filter((e) => e.resti.length), [], '⛔ resti sul disco dopo la dimenticanza');
  assert.deepEqual(esiti.filter((e) => e.dopo !== 'TRANSFER_UNKNOWN' || e.dopoRiavvio !== 'TRANSFER_UNKNOWN'), [], '⛔ il trasferimento del dispositivo dimenticato torna vivo');
});

/* REV5-F3, l'avvio (Desktop 9, 24/10/2026): un `.json` rimasto senza `.part` (lasciato dalle versioni di prima) si toglie all'avvio. */
test('REV5-F3b all\'avvio un `.json` di trasferimento senza `.part` si cancella', async (t) => {
  const b = banco(t);
  const avvio = await b.file.inizia({ dispositivoId: 'dA', sessionId: 's1', nome: 'a.bin', dimensione: 10, sha256: sha(Buffer.alloc(10)) });
  const sotto = readdirSync(join(b.cartellaDati, 'trasferimenti'))[0];
  const json = join(b.cartellaDati, 'trasferimenti', sotto, `${avvio.trasferimentoId}.json`);
  const part = join(b.cartellaDati, 'trasferimenti', sotto, `${avvio.trasferimentoId}.part`);
  assert.ok(existsSync(json) && existsSync(part), 'il trasferimento è sul disco');
  rmSync(part);
  b.crea(); // un riavvio
  assert.equal(existsSync(json), false, '⛔ il `.json` orfano resta sul disco per sempre');
});

test('REV5-F5 file riscritto con la STESSA dimensione e lo STESSO mtime (un disco FAT/exFAT a 2 s, o un programma che lo rimette): la versione cambia?', async (t) => {
  const b = banco(t);
  const p = join(b.progetto, 'y.txt');
  writeFileSync(p, 'AAAAAAAAAA');
  /* Desktop 9: l'mtime si fissa a un secondo intero, così il «rimetterlo» non dipende dall'arrotondamento di `st.mtime` (un Date al
     millisecondo, da un mtime che ne ha la frazione): con l'mtime del momento la sonda era verde o rossa a seconda dell'istante */
  const fisso = new Date('2026-10-24T20:00:00.000Z');
  utimesSync(p, fisso, fisso);
  const st0 = statSync(p);
  b.eventi.push({ type: 'RunStarted' }, { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'scrivi' },
    { type: 'ToolCallArgs', toolCallId: 'c1', delta: JSON.stringify({ percorso: 'y.txt' }) }, { type: 'ToolCallResult', toolCallId: 'c1' });
  const [riga] = (await b.file.elenco({ dispositivoId: 'dA', sessionId: 's1' })).items;
  const primo = await b.file.leggi({ dispositivoId: 'dA', sessionId: 's1', fileId: riga.fileId, versione: riga.versione, da: 0, quanti: 5 });
  writeFileSync(p, 'BBBBBBBBBB'); // stesso inode, stessa dimensione
  utimesSync(p, fisso, fisso); // stesso mtime
  assert.equal(statSync(p).mtimeMs, st0.mtimeMs, 'la prova rimette davvero lo stesso mtime');
  const secondo = await b.file.leggi({ dispositivoId: 'dA', sessionId: 's1', fileId: riga.fileId, versione: riga.versione, da: 5, quanti: 5 }).then((v) => v, (e) => ({ code: e.code }));
  const misto = Buffer.from(primo.dati, 'base64url').toString() + (secondo.dati ? Buffer.from(secondo.dati, 'base64url').toString() : `<${secondo.code}>`);
  console.log('REV5-F5 il dispositivo ricompone:', misto);
  assert.equal(secondo.code, 'FILE_GONE', `⛔ il dispositivo ha ricomposto «${misto}»: metà vecchio, metà nuovo`);
});

test('REV5-M09b file accorciato dopo l\'elenco: FILE_GONE', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-rev5-m09b-')); t.after(() => rimuoviCartellaDiProva(dir));
  const progetto = join(dir, 'p'); mkdirSync(progetto);
  const reg = { esiste: () => true, cartellaPerChatFile: async () => ({ cartella: realpathSync(progetto) }) };
  const eventi = [{ type: 'RunStarted' }, { type: 'ToolCallStart', toolCallId: 'c', toolCallName: 'scrivi' }, { type: 'ToolCallArgs', toolCallId: 'c', delta: '{"percorso":"z.txt"}' }, { type: 'ToolCallResult', toolCallId: 'c' }];
  writeFileSync(join(progetto, 'z.txt'), 'x'.repeat(2000));
  const f = creaFileDeiDispositivi({ cartella: join(dir, 'dati'), sessionRegistry: reg, eventiDellaSessione: () => eventi });
  const [r] = (await f.elenco({ dispositivoId: 'd', sessionId: 's' })).items;
  writeFileSync(join(progetto, 'z.txt'), 'y'.repeat(500));
  const code = await f.leggi({ dispositivoId: 'd', sessionId: 's', fileId: r.fileId, versione: r.versione, da: 1000, quanti: 100 }).then(() => 'ok', (e) => e.code);
  console.log('REV5-M09b', code);
  assert.equal(code, 'FILE_GONE');
});
