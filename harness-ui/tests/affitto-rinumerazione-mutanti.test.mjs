import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as store from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { rinumeraGiornale } from '../src/rinumerazione-giornale.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * 13/11/2026 — pezzo 4 dell'affitto compromesso: le prove nate dai mutanti (ognuno ucciso da almeno due prove). Ognuna guarda un
 *   ramo della rinumerazione da una seconda porta: la porta dello store con le dipendenze iniettate, il telefono, i byte delle righe
 *   che non cambiano. Solo giornali FINTI nel profilo finto.
 */
const cartellaTemp = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-rinm-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const giornale = (dir, id) => join(dir, `${id}.jsonl`);
const numeriSulDisco = (percorso) => readFileSync(percorso, 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r)._sequenza).filter((n) => typeof n === 'number');
const copieAccanto = (dir) => readdirSync(dir).filter((f) => f.includes('.prima-della-rinumerazione-'));
const temporanei = (dir) => readdirSync(dir).filter((f) => f.endsWith('.rinumerazione'));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const intestazione = (id, dir) => ({ tipo: 'intestazione', schema: 1, sessionId: id, taskId: 'libero:rinm', cartella: dir, task: { consegna: 'ciao', consegnaCorta: 'ciao' },
  avviataAlle: '2026-11-13T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true });
const nota = (i, n) => JSON.stringify({ type: 'CUSTOM', name: 'talos.nota', value: { i }, _sequenza: n });
function scrivi(dir, id, numeri) {
  writeFileSync(giornale(dir, id), [JSON.stringify(intestazione(id, dir)), ...numeri.map((n, i) => nota(i, n))].map((r) => `${r}\n`).join(''));
  return giornale(dir, id);
}
function conAffitto(t, dir) {
  store.attivaAffittiArchivio(dir, { etichetta: 'test', battitoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(dir));
}

test('RIN-15a: through the store door, a second renumbering in the same millisecond never overwrites the first copy (exclusive)', async (t) => {
  const dir = cartellaTemp(t);
  const id = '15151515-1515-4515-8515-151515151515';
  conAffitto(t, dir);
  const percorso = scrivi(dir, id, [1, 2, 3, 2]);
  const ora = () => new Date('2026-11-13T16:00:00.000Z');
  const prima = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id }, { oraFn: ora });
  assert.equal(prima.rinumerato, true, JSON.stringify(prima));
  const primaCopia = readFileSync(join(dir, copieAccanto(dir)[0]));
  scrivi(dir, id, [1, 2, 3, 3]); // dirty again, same name for the copy
  const dirtyAgain = readFileSync(percorso);
  const seconda = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id }, { oraFn: ora });
  assert.equal(seconda.rinumerato, false);
  assert.equal(seconda.fase, 'copia');
  assert.ok(readFileSync(join(dir, copieAccanto(dir)[0])).equals(primaCopia), 'the first copy is untouched');
  assert.ok(readFileSync(percorso).equals(dirtyAgain), 'the journal stays');
});

test('RIN-15b: through the store door the copy check needs BOTH the size and the SHA-256 (each one alone stops it)', async (t) => {
  const fsp = await import('node:fs/promises');
  for (const [nome, deps] of [
    ['size only (the print says equal)', { improntaFn: async () => 'uguale', copyFileFn: async (s, d, m) => { await fsp.copyFile(s, d, m); const b = readFileSync(d); writeFileSync(d, b.subarray(0, b.length - 1)); } }],
    ['print only (same size)', { copyFileFn: async (s, d, m) => { await fsp.copyFile(s, d, m); const b = readFileSync(d); b[5] ^= 1; writeFileSync(d, b); } }],
  ]) {
    const dir = cartellaTemp(t);
    const id = '15b15b15-1515-4515-8515-151515151515';
    conAffitto(t, dir);
    const percorso = scrivi(dir, id, [1, 2, 3, 2]);
    const primaDi = readFileSync(percorso);
    const esito = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id }, deps);
    assert.equal(esito.rinumerato, false, nome);
    assert.equal(esito.fase, 'verifica', nome);
    assert.ok(readFileSync(percorso).equals(primaDi), nome);
    assert.deepEqual(temporanei(dir), [], nome);
    store.disattivaAffittiArchivio(dir);
  }
});

test('RIN-15c: a transient rename refusal (EPERM once, an antivirus) is retried and the renumbering succeeds; a write failure leaves no temporary', async (t) => {
  const fsp = await import('node:fs/promises');
  const dir = cartellaTemp(t);
  const id = '15c15c15-1515-4515-8515-151515151515';
  conAffitto(t, dir);
  const percorso = scrivi(dir, id, [1, 2, 3, 2]);
  let tentativi = 0;
  const esito = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id }, {
    renameFn: async (a, b) => { tentativi += 1; if (tentativi === 1) throw Object.assign(new Error('EPERM: held'), { code: 'EPERM' }); await fsp.rename(a, b); },
  });
  assert.equal(esito.rinumerato, true, JSON.stringify(esito));
  assert.equal(tentativi, 2);
  assert.deepEqual(numeriSulDisco(percorso), [1, 2, 3, 4]);
  scrivi(dir, id, [1, 2, 3, 3]);
  const primaDi = readFileSync(percorso);
  const guasto = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id }, {
    oraFn: () => new Date('2026-11-13T17:00:00.000Z'), scriviFn: async () => { throw Object.assign(new Error('ENOSPC: full'), { code: 'ENOSPC' }); },
  });
  assert.equal(guasto.fase, 'scrittura');
  assert.ok(readFileSync(percorso).equals(primaDi));
  assert.deepEqual(temporanei(dir), [], 'our temporary removed');
});

test('RIN-15d: lines that do not change keep their OWN bytes (spaces, \\u escapes, CR, an unterminated last line); only renumbered lines are re-serialized', async (t) => {
  const dir = cartellaTemp(t);
  const percorso = join(dir, 'g.jsonl');
  const strana = '{"type": "CUSTOM",  "name":"talos.nota", "value":{"t":"caff\\u00e8"}, "_sequenza": 1}';
  const conCr = `${nota('cr', 2)}\r`;
  const senzaNumero = '{"tipo":"nota-senza-numero",  "t":"\\u00e8"}';
  const ultima = '{"type":"CUSTOM","name":"talos.nota","value":{"i":"ultima"},"_sequenza":2}'; // a duplicate, without its newline
  writeFileSync(percorso, `${strana}\n${conCr}\n${senzaNumero}\n${nota('x', 3)}\n${ultima}`);
  const esito = await rinumeraGiornale(percorso);
  assert.equal(esito.rinumerato, true, JSON.stringify(esito));
  const dopo = readFileSync(percorso, 'utf8');
  const righe = dopo.split('\n');
  assert.equal(righe[0], strana, 'a line before the first duplicate, byte for byte');
  assert.equal(righe[1], conCr, 'its CR too');
  assert.equal(righe[2], senzaNumero, 'a line without a number, byte for byte');
  assert.equal(righe[3], nota('x', 3));
  assert.equal(righe[4], '{"type":"CUSTOM","name":"talos.nota","value":{"i":"ultima"},"_sequenza":4}', 'the renumbered last line keeps having no newline');
  assert.equal(righe.length, 5);
  assert.equal(esito.righeRinumerate, 1);
  assert.equal(esito.sogliaVecchia, 2);
  assert.equal(esito.primoNuovo, 4);
});

test('RIN-16 (the phone, mai riscrivere): on a journal [1..7,3,4] that is never rewritten, the phone reconnecting with after=3 or after=7 gets exactly the lines above, in the numbers of the reading', async (t) => {
  const dir = cartellaTemp(t);
  const id = '16161616-1616-4616-8616-161616161616';
  scrivi(dir, id, [1, 2, 3, 4, 5, 6, 7, 3, 4]);
  conAffitto(t, dir);
  const registro = createSessionRegistry({ cartellaStore: dir, affittoFraProcessi: { etichetta: 'test' }, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  await registro.ripristina();
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry: registro, iscriviConRigiocata, ogni: () => null, smetti: () => {} });
  const apri = async (after, sub) => {
    const ricevuti = [];
    const contesto = { dispositivo: { id: 'pad-rin', nome: 'Pad' }, iscrizioni: new Map(),
      iscrivi(s, chiudi) { contesto.iscrizioni.set(s, chiudi); return (data) => { ricevuti.push(data); return Promise.resolve(); }; } };
    await operazioni.esegui('session.events', { sessionId: id, sub, after }, contesto);
    await pausa(50);
    for (const chiudi of contesto.iscrizioni.values()) { try { chiudi(); } catch { /* chiusa */ } }
    return ricevuti;
  };
  const note = (ricevuti) => ricevuti.filter((e) => e?.name === 'talos.nota').map((e) => `${e.value.i}:${e._sequenza}`);
  /* 14/11/2026 (mai riscrivere): il diario non si riscrive; il telefono riceve esattamente le righe sopra il suo `after`, coi numeri
     della lettura (le due righe che riusavano 3 e 4 sono 8 e 9); nessuna riga «recuperata» (niente è cambiato) */
  assert.deepEqual(note(await apri(3, 'a')), ['3:4', '4:5', '5:6', '6:7', '7:8', '8:9'], 'after=3: what comes after 3');
  assert.deepEqual(note(await apri(7, 'b')), ['7:8', '8:9'], 'after=7: the two lines it does not have');
  assert.deepEqual(note(await apri(2, 'c')), ['2:3', '3:4', '4:5', '5:6', '6:7', '7:8', '8:9'], 'after=2');
  const tutti = await apri(0, 'd');
  assert.equal(note(tutti).length, 9, 'after=0: all nine lines');
  assert.equal(tutti.filter((e) => e?.name === 'talos.journal-riparato').length, 0, 'no «recovered» line: nothing was changed');
});

test('RIN-17 (mai riscrivere): a later reload (another process appends a normal line) gives the same numbers of the reading: a cursor gets exactly what is above it', async (t) => {
  const dir = cartellaTemp(t);
  const id = '17171717-1717-4717-8717-171717171717';
  const percorso = scrivi(dir, id, [1, 2, 3, 4, 5, 6, 7, 3, 4]);
  conAffitto(t, dir);
  const registro = createSessionRegistry({ cartellaStore: dir, affittoFraProcessi: { etichetta: 'test' }, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  await registro.ripristina();
  await pausa(50);
  store.affittiDellArchivio(dir).rilascia(id);
  const { appendFileSync } = await import('node:fs');
  appendFileSync(percorso, `${nota('dopo', 11)}\n`); // the other process, with a number nobody used
  const allineamento = await registro.allineaSessione(id, { scrivere: false });
  assert.equal(allineamento.ricaricata, true);
  const rigioca = (cursore) => { const visti = []; const smetti = registro.iscriviti(id, (e) => { visti.push(e); }, cursore); smetti(); return visti.filter((e) => e.name === 'talos.nota').map((e) => `${e.value.i}:${e._sequenza}`); };
  /* 14/11/2026 (mai riscrivere): dopo la ricarica gli stessi numeri della lettura, e la riga nuova col suo numero */
  assert.deepEqual(rigioca(3), ['3:4', '4:5', '5:6', '6:7', '7:8', '8:9', 'dopo:11'], 'cursor 3 after the reload');
  assert.deepEqual(rigioca(7), ['7:8', '8:9', 'dopo:11'], 'cursor 7 after the reload');
  assert.deepEqual(rigioca(9), ['dopo:11'], 'cursor 9: only the new line');
});

test('RIN-18: the same safety through the other door (the module directly, or the store door): size alone, the journal changing, a rename busy twice, the last line without newline', async (t) => {
  const fsp = await import('node:fs/promises');
  const { appendFileSync } = await import('node:fs');
  // (a) size alone stops it, called directly
  {
    const dir = cartellaTemp(t);
    const percorso = scrivi(dir, 'a', [1, 2, 3, 2]);
    const primaDi = readFileSync(percorso);
    const esito = await rinumeraGiornale(percorso, { improntaFn: async () => 'uguale', copyFileFn: async (s, d, m) => { await fsp.copyFile(s, d, m); appendFileSync(d, ' '); } });
    assert.equal(esito.fase, 'verifica');
    assert.ok(readFileSync(percorso).equals(primaDi));
  }
  // (b) the journal grows while the temporary is written: no rename, through the store door
  {
    const dir = cartellaTemp(t);
    const id = '18b18b18-1818-4818-8818-181818181818';
    conAffitto(t, dir);
    const percorso = scrivi(dir, id, [1, 2, 3, 2]);
    const esito = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id }, { scriviFn: async (fh, buf, p) => { await fh.write(buf); appendFileSync(p, `${nota('altro', 9)}\n`); } });
    assert.equal(esito.fase, 'cambiato');
    assert.deepEqual(numeriSulDisco(percorso), [1, 2, 3, 2, 9], 'the other line stays, nothing of ours replaced it');
    assert.deepEqual(temporanei(dir), []);
    store.disattivaAffittiArchivio(dir);
  }
  // (c) EBUSY twice then free, called directly: renumbered
  {
    const dir = cartellaTemp(t);
    const percorso = scrivi(dir, 'c', [1, 2, 3, 2]);
    let n = 0;
    const esito = await rinumeraGiornale(percorso, { renameFn: async (a, b) => { n += 1; if (n <= 2) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); await fsp.rename(a, b); } });
    assert.equal(esito.rinumerato, true, JSON.stringify(esito));
    assert.equal(n, 3);
  }
  // (d) the last line without newline stays without, through the store door
  {
    const dir = cartellaTemp(t);
    const id = '18d18d18-1818-4818-8818-181818181818';
    conAffitto(t, dir);
    writeFileSync(giornale(dir, id), `${JSON.stringify(intestazione(id, dir))}\n${nota(0, 1)}\n${nota(1, 1)}`);
    const esito = await store.rinumeraDoppiDelGiornale({ cartellaStore: dir, sessionId: id });
    assert.equal(esito.rinumerato, true, JSON.stringify(esito));
    const testo = readFileSync(giornale(dir, id), 'utf8');
    assert.equal(testo.endsWith('}'), true, 'no newline added at the end');
    assert.deepEqual(numeriSulDisco(giornale(dir, id)), [1, 2]);
  }
});
