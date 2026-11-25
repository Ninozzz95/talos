import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CARTELLA_AFFITTI } from '../src/session-lease.mjs';
import * as store from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rinumeraGiornale } from '../src/rinumerazione-giornale.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⭐ 13/11/2026 — la rinumerazione REGGE UN CRASH (cura del revisore affitto 1 di 3, giudice v1804 punti 2 e 3, limite v1805):
 *   · la riga «recuperata» e la soglia dei cursori: prima nascevano DOPO il rename (in memoria e con una scrittura a parte), e un crash
 *     fra il rename e la riga le perdeva per sempre (0 su 24 nel revisore). Ora la riga sta DENTRO il giornale rinumerato, scritta nel
 *     temporaneo prima del fsync e del rename: diventa visibile insieme al giornale, mai dopo; la soglia sta nella riga;
 *   · al ripristino si riconoscono i temporanei `<id>.jsonl.<uuid>.rinumerazione` rimasti (li toglie il codice, SOLO col nome esatto e
 *     SOLO con l'affitto in mano), le copie interrotte e le copie a metà: mai prese per giornali né per copie buone, mai tolte;
 *   · il conteggio della riga «{n} lines written at the same time by another TALOS»: solo le righe che hanno RIUSATO un numero.
 *   Crash VERI: figli avviati qui (`fixtures/rinumerazione-crash-figlio.mjs`), uccisi con SIGKILL (TerminateProcess), contati.
 *   Disco pieno SOLO iniettato (ENOSPC nel processo sotto prova). Solo giornali FINTI in cartelle temporanee del profilo finto.
 */
const cartellaTemp = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-crash-rin-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const giornale = (dir, id) => join(dir, `${id}.jsonl`);
const sha = (percorso) => createHash('sha256').update(readFileSync(percorso)).digest('hex');
const righe = (percorso) => readFileSync(percorso, 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r));
const numeriSulDisco = (percorso) => righe(percorso).map((r) => r._sequenza).filter((n) => typeof n === 'number');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const COPIA_BUONA = (id) => new RegExp(`^${id}\\.jsonl\\.prima-della-rinumerazione-\\d{4}-\\d\\d-\\d\\dT\\d\\d-\\d\\d-\\d\\d-\\d{3}Z$`);
const copieBuone = (dir, id) => readdirSync(dir).filter((f) => COPIA_BUONA(id).test(f));
const copieTutte = (dir) => readdirSync(dir).filter((f) => f.includes('.prima-della-rinumerazione-'));
const temporanei = (dir) => readdirSync(dir).filter((f) => f.endsWith('.rinumerazione'));
const note = (eventi) => eventi.filter((e) => e.name === 'talos.journal-riparato' && Number.isSafeInteger(e.value?.rinumerate));

function intestazione(id, dir) {
  return { tipo: 'intestazione', schema: 1, sessionId: id, taskId: 'libero:crash', cartella: dir, task: { consegna: 'ciao', consegnaCorta: 'ciao' },
    avviataAlle: '2026-11-13T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true };
}
function scriviGiornale(dir, id, numeri) {
  const corpo = numeri.map((n, i) => ({ type: 'CUSTOM', name: 'talos.nota', value: { i, testo: `riga ${i} (numero vecchio ${n})` }, _sequenza: n }));
  writeFileSync(giornale(dir, id), [intestazione(id, dir), ...corpo].map((r) => `${JSON.stringify(r)}\n`).join(''));
  return giornale(dir, id);
}
function registroConAffitto(t, dir, extra = {}) {
  store.attivaAffittiArchivio(dir, { etichetta: 'test', battitoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(dir));
  const registro = createSessionRegistry({ cartellaStore: dir, affittoFraProcessi: { etichetta: 'test' }, avviaSessioneFn: async () => ({ ok: true }),
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', ...extra });
  t.after(() => registro.chiudi({ attesaMassimaMs: 500 }));
  return registro;
}
const rigioca = (registro, id, cursore) => {
  const visti = [];
  const smetti = registro.iscriviti(id, (e) => { visti.push(e); }, cursore);
  smetti();
  return visti.filter((e) => e.name === 'talos.nota').map((e) => `${e.value.i}:${e._sequenza}`);
};

/* il figlio VERO col suo ripristino: avviato qui, atteso fino all'uscita, contato */
const FIGLIO = fileURLToPath(new URL('./fixtures/rinumerazione-crash-figlio.mjs', import.meta.url));
const contati = { avviati: 0, uccisi: 0, finitiDaSoli: 0 };
const SPORCO = [1, 2, 3, 4, 5, 6, 7, 3, 4];

/* ⭐ 14/11/2026 (terzo giro, «mai riscrivere»): il ripristino non riscrive più il diario, quindi i tre punti del pezzo 4 (la copia
   accanto, il temporaneo, il rename) non esistono più. CRASH-01..03 ora avviano lo STESSO figlio vero col suo ripristino vero e
   controllano che finisca da solo senza arrivare al punto, senza lasciare niente accanto e col diario byte per byte; poi il riavvio qui
   legge gli stessi numeri (regola V). I crash veri DENTRO una scrittura o un ripristino del terzo giro stanno in
   `affitto-mai-riscrivere.test.mjs` (MR-05, MR-06). */
async function figlioSenzaPunto(dir, punto) {
  const figlio = spawn(process.execPath, [FIGLIO, dir, punto], { stdio: ['ignore', 'pipe', 'pipe'] });
  contati.avviati += 1;
  let uscita = '';
  let arrivato = false;
  figlio.stdout.on('data', (d) => {
    uscita += d;
    if (!arrivato && uscita.includes(`PUNTO ${punto}`)) { arrivato = true; figlio.kill('SIGKILL'); contati.uccisi += 1; } // fermo nel punto: si uccide
  });
  figlio.stderr.on('data', (d) => { uscita += d; });
  const esito = await new Promise((ok) => figlio.once('exit', (code, segnale) => ok({ code, segnale })));
  if (arrivato) throw new Error(`the child reached the point ${punto}: the restore rewrote the journal`);
  contati.finitiDaSoli += 1;
  return { uscita, esito };
}

for (const [nome, punto] of [['CRASH-01', 'dopo-rename'], ['CRASH-02', 'durante-copia'], ['CRASH-03', 'dopo-temporaneo']]) {
  test(`${nome} (mai riscrivere): a real child restoring [1..7,3,4] never reaches «${punto}»: it ends by itself, the journal byte for byte, nothing beside; the restart reads [1..9]`, async (t) => {
    const dir = cartellaTemp(t);
    const id = randomUUID();
    const percorso = scriviGiornale(dir, id, SPORCO);
    const shaPrima = sha(percorso);
    const { uscita, esito } = await figlioSenzaPunto(dir, punto);
    assert.match(uscita, /FINITO senza punto/, uscita);
    assert.equal(esito.code, 3, 'the child ended by itself after its whole restore');
    assert.equal(sha(percorso), shaPrima, 'not one byte changed');
    assert.deepEqual(copieTutte(dir), [], 'no copy beside');
    assert.deepEqual(temporanei(dir), [], 'no temporary');
    const registro = registroConAffitto(t, dir);
    await registro.ripristina();
    assert.deepEqual(rigioca(registro, id, 0).map((x) => Number(x.split(':')[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(note(registro.esporta(id).eventi).length, 0, 'no «recovered» line: nothing was changed');
    assert.equal(sha(percorso), shaPrima);
  });
}

test('CRASH-CONTA: the children of this file were all started here and all ended here (killed, or by themselves)', () => {
  assert.equal(contati.uccisi + contati.finitiDaSoli, contati.avviati);
  assert.equal(contati.avviati, 3);
});

/* ───────────── il riconoscimento al ripristino, nello stesso processo ───────────── */

test('RIC-01: the restore removes ONLY a temporary with the exact name <id>.jsonl.<uuid>.rinumerazione, ONLY with the lease in hand, also on a clean journal', async (t) => {
  const dir = cartellaTemp(t);
  const id = randomUUID();
  const percorso = scriviGiornale(dir, id, [1, 2, 3]);
  const nostro = `${percorso}.${randomUUID()}.rinumerazione`;
  const nonNostri = [`${percorso}.non-mio.rinumerazione`, `${percorso}.${randomUUID()}.rinumerazione.bak`, join(dir, `altro-${randomUUID()}.rinumerazione`)];
  for (const p of [nostro, ...nonNostri]) writeFileSync(p, 'avanzo');
  const registro = registroConAffitto(t, dir);
  await registro.ripristina();
  assert.equal(existsSync(nostro), false, 'ours removed');
  for (const p of nonNostri) assert.equal(existsSync(p), true, `not ours, kept: ${p}`);
  assert.equal(registro.avanziDellaRinumerazione?.(id)?.temporaneiTolti, 1);
});

test('RIC-02: with the lease held by ANOTHER live process the restore removes nothing (the temporary may be its renumbering under way)', async (t) => {
  const dir = cartellaTemp(t);
  const id = randomUUID();
  const percorso = scriviGiornale(dir, id, [1, 2, 3]);
  const suo = `${percorso}.${randomUUID()}.rinumerazione`;
  writeFileSync(suo, 'in corso');
  mkdirSync(join(dir, CARTELLA_AFFITTI), { recursive: true });
  writeFileSync(join(dir, CARTELLA_AFFITTI, `${id}.json`), JSON.stringify({ istanza: '99999999-9999-4999-8999-999999999999', pid: process.pid, host: hostname(),
    avviatoIl: '2026-11-08T00:00:00.000Z', presoIl: '2026-11-08T00:01:00.000Z', etichetta: 'the TALOS CLI' }));
  const registro = registroConAffitto(t, dir);
  await registro.ripristina();
  assert.equal(existsSync(suo), true, 'kept');
  assert.equal(registro.avanziDellaRinumerazione?.(id)?.temporaneiRimasti, 1, `declared (${JSON.stringify(registro.avanziDellaRinumerazione?.(id))})`);
});

test('RIC-03: ENOSPC injected in the middle of the copy: the half copy is MARKED (never the good name), declared in the outcome, never removed; the journal is the one of before', async (t) => {
  const dir = cartellaTemp(t);
  const percorso = scriviGiornale(dir, 'g', SPORCO);
  const prima = readFileSync(percorso);
  const esito = await rinumeraGiornale(percorso, {
    copyFileFn: async (sorgente, destinazione) => {
      const tutto = readFileSync(sorgente);
      writeFileSync(destinazione, tutto.subarray(0, tutto.length >> 1), { flag: 'wx' });
      throw Object.assign(new Error('ENOSPC: injected'), { code: 'ENOSPC' });
    },
  });
  t.diagnostic(JSON.stringify(esito));
  assert.equal(esito.rinumerato, false);
  assert.equal(esito.fase, 'copia');
  assert.ok(readFileSync(percorso).equals(prima), 'the journal of before');
  assert.equal(copieBuone(dir, 'g').length, 0, 'no file carries the good name');
  assert.equal(typeof esito.copiaAMeta, 'string', 'the half copy is declared in the outcome');
  assert.ok(esito.copiaAMeta.endsWith('.a-meta'), esito.copiaAMeta);
  assert.equal(readFileSync(esito.copiaAMeta).length, prima.length >> 1, 'kept as it is');
  assert.deepEqual(temporanei(dir), []);
});

test('RIC-04: the restore declares the copies beside a journal (good, interrupted, half) and takes none of them for a journal', async (t) => {
  const dir = cartellaTemp(t);
  const id = randomUUID();
  const percorso = scriviGiornale(dir, id, [1, 2, 3]);
  writeFileSync(`${percorso}.prima-della-rinumerazione-2026-11-13T16-00-00-000Z`, readFileSync(percorso));
  writeFileSync(`${percorso}.prima-della-rinumerazione-2026-11-13T16-00-01-000Z.da-verificare`, 'met');
  writeFileSync(`${percorso}.prima-della-rinumerazione-2026-11-13T16-00-02-000Z.a-meta`, 'me');
  const registro = registroConAffitto(t, dir);
  const esito = await registro.ripristina();
  assert.equal(esito.ripristinate, 1, 'one chat, no copy taken for a chat');
  const avanzi = registro.avanziDellaRinumerazione?.(id);
  assert.deepEqual([avanzi?.copie?.length, avanzi?.copieDaVerificare?.length, avanzi?.copieAMeta?.length], [1, 1, 1], JSON.stringify(avanzi));
  assert.equal(copieTutte(dir).length, 3, 'none removed');
});

/* ───────────── la riga dentro il giornale, la soglia, il conteggio ───────────── */

test('LINEA-01: the «recovered» line is written INTO the temporary before the fsync and the rename (it becomes visible with the journal, never after)', async (t) => {
  const dir = cartellaTemp(t);
  const percorso = scriviGiornale(dir, 'g', SPORCO);
  let nelTemporaneo = null;
  const esito = await rinumeraGiornale(percorso, {
    renameFn: async (da, a) => { nelTemporaneo = readFileSync(da, 'utf8'); await fsp.rename(da, a); },
  }, { rigaFinale: (r) => ({ type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: true, rinumerate: r.righeRinumerate, doppie: r.righeDoppie } }) });
  assert.equal(esito.rinumerato, true, JSON.stringify(esito));
  const ultima = JSON.parse(nelTemporaneo.trim().split('\n').at(-1));
  assert.equal(ultima.name, 'talos.journal-riparato', 'the line is already in the temporary when it is renamed');
  assert.equal(ultima._sequenza, 10, 'with the next number');
  assert.deepEqual(numeriSulDisco(percorso), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(esito.ultimaSequenza, 10);
});

/* ⭐ 14/11/2026 (terzo giro, «mai riscrivere»): niente più soglia dei cursori né riga «recuperata» per un diario coi doppi: il
   diario non si riscrive e i numeri li dà la lettura (regola V), gli stessi in ogni processo e dopo ogni riavvio. SOGLIA-01..03 e
   CONTA-01 ora dicono questo. */
test('SOGLIA-01 (mai riscrivere): after a restart a window that held number 7 gets exactly the two lines above it (the numbers of the reading are the same)', async (t) => {
  const dir = cartellaTemp(t);
  const id = randomUUID();
  scriviGiornale(dir, id, SPORCO);
  const registro = registroConAffitto(t, dir);
  await registro.ripristina();
  const primaDelRiavvio = rigioca(registro, id, 0);
  await registro.chiudi({ attesaMassimaMs: 500 });
  store.disattivaAffittiArchivio(dir);
  const riavviato = registroConAffitto(t, dir);
  await riavviato.ripristina();
  assert.deepEqual(rigioca(riavviato, id, 0), primaDelRiavvio, 'the same numbers after the restart');
  assert.deepEqual(rigioca(riavviato, id, 7), ['7:8', '8:9']);
  assert.deepEqual(rigioca(riavviato, id, 2), ['2:3', '3:4', '4:5', '5:6', '6:7', '7:8', '8:9']);
});

test('SOGLIA-02 (mai riscrivere): in the same process no «recovered» line is written and the journal stays byte for byte; cursor 9 nothing, cursor 8 the last line', async (t) => {
  const dir = cartellaTemp(t);
  const id = randomUUID();
  const percorso = scriviGiornale(dir, id, SPORCO);
  const shaPrima = sha(percorso);
  const registro = registroConAffitto(t, dir);
  await registro.ripristina();
  assert.equal(righe(percorso).filter((r) => r.name === 'talos.journal-riparato').length, 0);
  assert.equal(sha(percorso), shaPrima);
  assert.deepEqual(rigioca(registro, id, 9), []);
  assert.deepEqual(rigioca(registro, id, 8), ['8:9']);
});

test('SOGLIA-03 (mai riscrivere): after a restart a cursor at or above the highest number gets nothing', async (t) => {
  const dir = cartellaTemp(t);
  const id = randomUUID();
  scriviGiornale(dir, id, SPORCO);
  const registro = registroConAffitto(t, dir);
  await registro.ripristina();
  await registro.chiudi({ attesaMassimaMs: 500 });
  store.disattivaAffittiArchivio(dir);
  const riavviato = registroConAffitto(t, dir);
  await riavviato.ripristina();
  assert.deepEqual(rigioca(riavviato, id, 9), []);
  assert.deepEqual(rigioca(riavviato, id, 14), []);
});

test('RIC-05: the store alone, the lease held by ANOTHER live process: our exact-named temporary is NOT removed, counted as remaining', async (t) => {
  const dir = cartellaTemp(t);
  const id = randomUUID();
  const percorso = scriviGiornale(dir, id, [1, 2, 3]);
  const suo = `${percorso}.${randomUUID()}.rinumerazione`;
  writeFileSync(suo, 'in corso');
  mkdirSync(join(dir, CARTELLA_AFFITTI), { recursive: true });
  writeFileSync(join(dir, CARTELLA_AFFITTI, `${id}.json`), JSON.stringify({ istanza: '88888888-8888-4888-8888-888888888888', pid: process.pid, host: hostname(),
    avviatoIl: '2026-11-08T00:00:00.000Z', presoIl: '2026-11-08T00:01:00.000Z', etichetta: 'the TALOS CLI' }));
  store.attivaAffittiArchivio(dir, { etichetta: 'test', battitoMs: 0 });
  t.after(() => store.disattivaAffittiArchivio(dir));
  const nomi = store.avanziDellArchivio({ cartellaStore: dir }).get(id);
  const esito = await store.avanziDellaRinumerazione({ cartellaStore: dir, sessionId: id, nomi });
  assert.deepEqual([esito.temporaneiTolti, esito.temporaneiRimasti], [0, 1], JSON.stringify(esito));
  assert.equal(existsSync(suo), true, 'kept: it may be the renumbering under way of whoever holds the lease');
});

test('CONTA-02: the count of lines that reused a number is the same in the outcome and in the line ON DISK (not only in memory)', async (t) => {
  for (const [numeri, doppie] of [[SPORCO, 2], [[1, 2, 3, 4, 5, 3, 4, 5, 6, 7, 8], 3], [[1, 1, 1, 1], 3]]) {
    const dir = cartellaTemp(t);
    const percorso = scriviGiornale(dir, 'g', numeri);
    const esito = await rinumeraGiornale(percorso, {}, { rigaFinale: (r) => ({ type: 'CUSTOM', name: 'talos.journal-riparato', value: { doppie: r.righeDoppie } }) });
    assert.equal(esito.righeDoppie, doppie, `${JSON.stringify(numeri)} in the outcome`);
    assert.equal(righe(percorso).at(-1).value.doppie, doppie, `${JSON.stringify(numeri)} on disk`);
  }
});

test('CONTA-01 (mai riscrivere): a journal with numbers used twice gets no «recovered» line (nothing is changed) and reads with the numbers of the reading', async (t) => {
  for (const [numeri, vista] of [[SPORCO, [1, 2, 3, 4, 5, 6, 7, 8, 9]], [[1, 2, 3, 4, 5, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]], [[1, 2, 4, 3, 5, 3, 4], [1, 2, 4, 3, 5, 6, 7]]]) {
    const dir = cartellaTemp(t);
    const id = randomUUID();
    const percorso = scriviGiornale(dir, id, numeri);
    const shaPrima = sha(percorso);
    const registro = registroConAffitto(t, dir);
    await registro.ripristina();
    await pausa(10);
    assert.equal(note(registro.esporta(id).eventi).length, 0, JSON.stringify(numeri));
    assert.deepEqual(new Map(registro.esporta(id).eventi.filter((e) => e.name === 'talos.nota').map((e) => [e.value.i, e._sequenza])), new Map(vista.map((n, i) => [i, n])), JSON.stringify(numeri));
    assert.equal(sha(percorso), shaPrima);
    await registro.chiudi({ attesaMassimaMs: 500 });
    store.disattivaAffittiArchivio(dir);
  }
});
