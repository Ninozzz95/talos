/*
 * Le versioni di una voce della Libreria (owner 24/10/2026: «aggiorna la stessa», «si tengono tutte», «vedere e ripristinare»;
 * contratto con la CLI in handoff `CONTRATTO-ARTIFACT-UPDATE-2026-10-24.md` §3 e §7). Disco vero in una cartella temporanea.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CARTELLA_LIBRERIA, salvaVoce, leggiVoce, elencaVoci, eliminaVoce,
  elencaVersioni, leggiVersione, aggiungiVersione, ripristinaVersione,
  rinominaVoce, leggiBytesVoce, elencaVociConTesto, // revisione a blocco 3
  riallineaContenutoVoce, // revisione a blocco 5
} from '../src/library-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-lib-versioni-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
const nuova = (c, testo = '<p>v1</p>') => salvaVoce({ cartella: c, nome: 'Chart.html', mediaType: 'text/html', origine: 'generated', modello: 'm1', sessionId: 's1', sessionNome: 'Sales', testo });

test('LIB-VER-01 — una voce di prima è alla versione 1 senza migrazione; la prima versione nuova materializza la 1 e diventa la 2', async (t) => {
  const c = cartella(t);
  const id = await nuova(c);
  const prima = await elencaVersioni({ cartella: c, id });
  assert.equal(prima.length, 1);
  assert.equal(prima[0].n, 1);
  assert.equal(prima[0].modello, 'm1');
  assert.equal((await leggiVersione({ cartella: c, id, n: 1 })).testo, '<p>v1</p>');
  assert.equal(existsSync(join(c, CARTELLA_LIBRERIA, id, 'versioni')), false, 'leggere non scrive niente');
  const esito = await aggiungiVersione({ cartella: c, id, testo: '<p>v2</p>', modello: 'm2', sessionId: 's2', sessionNome: 'Q2' });
  assert.deepEqual(esito, { id, versione: 2, totale: 2, nome: 'Chart.html' });
  const dopo = await elencaVersioni({ cartella: c, id });
  assert.deepEqual(dopo.map((v) => v.n), [1, 2]);
  assert.equal(dopo[1].sessionNome, 'Q2');
  assert.equal((await leggiVersione({ cartella: c, id, n: 1 })).testo, '<p>v1</p>');
  assert.equal((await leggiVersione({ cartella: c, id, n: 2 })).testo, '<p>v2</p>');
  assert.equal(await leggiVersione({ cartella: c, id, n: 3 }), null);
});

test('LIB-VER-02 — i lettori di oggi vedono l\'ultima: leggiVoce, elencaVoci (la CLI passa da qui)', async (t) => {
  const c = cartella(t);
  const id = await nuova(c);
  await aggiungiVersione({ cartella: c, id, testo: '<p>v2</p>' });
  await aggiungiVersione({ cartella: c, id, testo: '<p>v3</p>', nome: 'Chart v3.html' });
  assert.equal((await leggiVoce({ cartella: c, id })).testo, '<p>v3</p>');
  const voci = await elencaVoci({ cartella: c });
  assert.equal(voci.length, 1);
  assert.equal(voci[0].nome, 'Chart v3.html');
});

test('LIB-VER-03 — gli edits si applicano all\'ultima versione VERA: due aggiornamenti insieme non se ne perdono uno', async (t) => {
  const c = cartella(t);
  const id = await nuova(c, 'a');
  const [x, y] = await Promise.all([
    aggiungiVersione({ cartella: c, id, trasforma: async (s) => { await new Promise((ok) => setTimeout(ok, 30)); return `${s}b`; } }),
    aggiungiVersione({ cartella: c, id, trasforma: (s) => `${s}c` }),
  ]);
  assert.deepEqual([x.versione, y.versione], [2, 3]);
  assert.equal((await leggiVoce({ cartella: c, id })).testo, 'abc');
  assert.deepEqual((await elencaVersioni({ cartella: c, id })).map((v) => v.n), [1, 2, 3]);
});

test('LIB-VER-04 — Ripristina crea una versione NUOVA col contenuto scelto; la storia non si riscrive', async (t) => {
  const c = cartella(t);
  const id = await nuova(c);
  await aggiungiVersione({ cartella: c, id, testo: '<p>v2</p>' });
  const r = await ripristinaVersione({ cartella: c, id, n: 1, sessionId: 's9' });
  assert.equal(r.versione, 3);
  assert.equal((await leggiVoce({ cartella: c, id })).testo, '<p>v1</p>');
  const v = await elencaVersioni({ cartella: c, id });
  assert.equal(v[2].ripristinoDi, 1);
  assert.equal((await leggiVersione({ cartella: c, id, n: 2 })).testo, '<p>v2</p>', 'la v2 resta');
  assert.equal(await ripristinaVersione({ cartella: c, id, n: 7 }), null);
});

test('LIB-VER-05 — eliminaVoce toglie anche le versioni (la CLI cancella da qui)', async (t) => {
  const c = cartella(t);
  const id = await nuova(c);
  await aggiungiVersione({ cartella: c, id, testo: '<p>v2</p>' });
  assert.equal(existsSync(join(c, CARTELLA_LIBRERIA, id, 'versioni', '2')), true);
  await eliminaVoce({ cartella: c, id });
  assert.equal(existsSync(join(c, CARTELLA_LIBRERIA, id)), false);
  assert.equal(await elencaVersioni({ cartella: c, id }), null);
});

test('LIB-VER-06 — interrotta fra meta e contenuto: la versione dopo riallinea `contenuto` prima di aggiungere; nessuna versione persa', async (t) => {
  const c = cartella(t);
  const id = await nuova(c);
  await aggiungiVersione({ cartella: c, id, testo: '<p>v2</p>' });
  const percorsoContenuto = join(c, CARTELLA_LIBRERIA, id, 'contenuto');
  /* la terza scrittura della versione 3 fallisce: meta dice 3, `contenuto` è ancora la 2 */
  let rinomine = 0;
  const renameFn = async (da, a) => { if (a === percorsoContenuto && ++rinomine === 1) throw Object.assign(new Error('interrotto'), { code: 'EIO' }); return fsp.rename(da, a); };
  await assert.rejects(aggiungiVersione({ cartella: c, id, testo: '<p>v3</p>' }, { renameFn, tentativiRename: 1 }), /interrotto/u);
  assert.equal(readFileSync(percorsoContenuto, 'utf8'), '<p>v2</p>');
  /* il riallineamento avviene PRIMA della versione nuova: anche un aggiornamento che poi fallisce (un edit che non trova il testo)
     lascia `contenuto` sulla v3 vera, e i lettori di oggi non vedono più la v2 */
  await assert.rejects(aggiungiVersione({ cartella: c, id, trasforma: () => { throw new Error('edit non trovato'); } }), /edit non trovato/u);
  assert.equal(readFileSync(percorsoContenuto, 'utf8'), '<p>v3</p>');
  const r = await aggiungiVersione({ cartella: c, id, trasforma: (s) => `${s}+` });
  assert.equal(r.versione, 4);
  assert.equal((await leggiVersione({ cartella: c, id, n: 3 })).testo, '<p>v3</p>', 'la v3 c\'è');
  assert.equal((await leggiVersione({ cartella: c, id, n: 4 })).testo, '<p>v3</p>+', 'gli edits partono dalla v3 vera');
  assert.equal((await leggiVoce({ cartella: c, id })).testo, '<p>v3</p>+');
});

test('LIB-VER-07 — un\'immagine non ha versioni; una voce che non c\'è dà null', async (t) => {
  const c = cartella(t);
  const id = await salvaVoce({ cartella: c, nome: 'x.png', mediaType: 'image/png', base64: Buffer.from('png').toString('base64') });
  await assert.rejects(aggiungiVersione({ cartella: c, id, testo: 'x' }), /has no versions/u);
  assert.equal(await aggiungiVersione({ cartella: c, id: 'lib-00000000-0000-4000-8000-000000000000', testo: 'x' }), null);
});

/* ------------------------------------------------------------------------------------------------------------------------
 * Revisione avversaria a blocco 3 (24/10/2026, `REVISIONE-BLOCCO-3-2026-10-24.md` §2-bis): le sonde del revisore diventano prove.
 * ------------------------------------------------------------------------------------------------------------------------ */

test('LIB-VER-REV3-A1 — una rinomina a metà di un aggiornamento aspetta la fila della voce: nessuna versione persa (D-A1)', async (t) => {
  const c = cartella(t);
  const id = await nuova(c, 'A');
  await aggiungiVersione({ cartella: c, id, testo: 'B' });
  let sblocca; const barriera = new Promise((ok) => { sblocca = ok; });
  /* l'aggiornamento parte per primo e si ferma nel mezzo (dentro la fila), la rinomina arriva mentre è lì */
  const inVolo = aggiungiVersione({ cartella: c, id, trasforma: async () => { await barriera; return 'C'; } });
  await new Promise((ok) => setTimeout(ok, 20));
  const rinomina = rinominaVoce({ cartella: c, id, nome: 'Grafico.html' });
  await new Promise((ok) => setTimeout(ok, 40));
  sblocca();
  await Promise.all([inVolo, rinomina]);
  await aggiungiVersione({ cartella: c, id, testo: 'D' });
  const finale = await elencaVersioni({ cartella: c, id });
  const testi = await Promise.all(finale.map(async (v) => (await leggiVersione({ cartella: c, id, n: v.n })).testo));
  assert.deepEqual(testi, ['A', 'B', 'C', 'D'], '⛔ prima la rinomina riscriveva l\'elenco vecchio e la C spariva');
  assert.equal((await elencaVoci({ cartella: c })).find((v) => v.id === id)?.nome, 'Grafico.html', 'e la rinomina c\'è');
});

test('LIB-VER-REV3-A2 — eliminare durante un aggiornamento: l\'aggiornamento finisce, poi la voce sparisce (niente ENOENT a metà)', async (t) => {
  const c = cartella(t);
  const id = await nuova(c, 'A');
  let sblocca; const barriera = new Promise((ok) => { sblocca = ok; });
  const aggiorna = aggiungiVersione({ cartella: c, id, trasforma: async (s) => { await barriera; return `${s}+`; } });
  await new Promise((ok) => setTimeout(ok, 20));
  const via = eliminaVoce({ cartella: c, id });
  sblocca();
  const [esito, eliminata] = await Promise.all([aggiorna, via]);
  assert.equal(esito.versione, 2);
  assert.equal(eliminata.id, id);
  assert.equal((await elencaVoci({ cartella: c })).length, 0, 'la voce eliminata non rinasce');
});

test('LIB-VER-REV3-A3 — interrotta fra meta e contenuto: lettura, scarico e ricerca danno l\'ULTIMA dell\'elenco anche prima del riallineamento (D-A3)', async (t) => {
  const c = cartella(t);
  const id = await nuova(c, 'A');
  await aggiungiVersione({ cartella: c, id, testo: 'B' });
  const percorsoContenuto = join(c, CARTELLA_LIBRERIA, id, 'contenuto');
  const renameFn = async (da, a) => { if (a === percorsoContenuto) throw Object.assign(new Error('interrotto'), { code: 'EIO' }); return fsp.rename(da, a); };
  await assert.rejects(aggiungiVersione({ cartella: c, id, testo: 'C cercabile' }, { renameFn, tentativiRename: 1 }), /interrotto/u);
  assert.equal(readFileSync(percorsoContenuto, 'utf8'), 'B', 'la copia è rimasta indietro');
  assert.equal((await leggiVoce({ cartella: c, id })).testo, 'C cercabile', '⛔ prima leggiVoce dava la B');
  assert.equal((await leggiBytesVoce({ cartella: c, id })).bytes.toString('utf8'), 'C cercabile', 'lo scarico (e le pagine) danno l\'ultima');
  const conTesto = await elencaVociConTesto({ cartella: c });
  assert.equal(conTesto.find((v) => v.id === id)?.testoEstratto, 'C cercabile', 'la ricerca trova l\'ultima');
});

/* ------------------------------------------------------------------------------------------------------------------------
 * Revisione avversaria a blocco 4 (24/10/2026, `REVISIONE-BLOCCO-4-2026-10-24.md` §1): REV4-A1 e REV4-A2.
 * ------------------------------------------------------------------------------------------------------------------------ */

test('LIB-VER-REV4-A1 — `meta.json` elenca un file che manca: la voce resta leggibile, scaricabile, cercabile e aggiornabile', async (t) => {
  const c = cartella(t);
  const id = await nuova(c, 'A');
  await aggiungiVersione({ cartella: c, id, testo: 'B' });
  await aggiungiVersione({ cartella: c, id, testo: 'C' });
  /* l'ultimo file sparisce (una sincronizzazione a metà, un ripristino da copia, un antivirus): l'elenco dice [1,2,3], il disco ha
     1 e 2, e `contenuto` ha ancora la C */
  await fsp.rm(join(c, CARTELLA_LIBRERIA, id, 'versioni', '3'));
  assert.equal((await leggiVoce({ cartella: c, id })).testo, 'C', '⛔ prima: LIBRARY_READ_FAILED con `contenuto` lì accanto');
  assert.equal((await leggiBytesVoce({ cartella: c, id })).bytes.toString('utf8'), 'C', 'lo scarico');
  assert.equal((await elencaVociConTesto({ cartella: c })).find((v) => v.id === id)?.testoEstratto, 'C', 'la ricerca');
  assert.equal((await leggiVersione({ cartella: c, id, n: 3 })).testo, 'C', 'la v3 nel pannello delle versioni');
  const r = await aggiungiVersione({ cartella: c, id, trasforma: (s) => `${s}+D` });
  assert.equal(r?.versione, 4, '⛔ prima: ENOENT, la voce non si aggiornava più');
  const testi = await Promise.all((await elencaVersioni({ cartella: c, id })).map(async (v) => (await leggiVersione({ cartella: c, id, n: v.n }))?.testo));
  assert.deepEqual(testi, ['A', 'B', 'C', 'C+D'], 'la v3 torna ad avere il suo file: ogni riga dell\'elenco ha un file');
});

/* ⛔ Revisione a blocco 5 (24/10/2026, REV5-A1, S3): questa prova FISSAVA il comportamento sbagliato («l'ultima versione che è ancora
   sul disco»): senza l'ultima e senza `contenuto` si leggeva la v2 come se fosse l'ultima, e `artifact_update` costruiva la v4 sulla v2
   perdendo la v3 in silenzio. Cambiata con la cura: la fila si ferma a `[ultima, contenuto]`, oltre c'è un errore che si capisce, e
   l'aggiornamento si rifiuta senza base. Una versione vecchia resta leggibile SOLO per numero. */
test('LIB-VER-REV4-A1b — manca anche `contenuto`: errore leggibile che nomina la versione da ripristinare; nessun aggiornamento senza base', async (t) => {
  const c = cartella(t);
  const id = await nuova(c, 'A');
  await aggiungiVersione({ cartella: c, id, testo: 'B' });
  await aggiungiVersione({ cartella: c, id, testo: 'C' });
  const cartellaVoce = join(c, CARTELLA_LIBRERIA, id);
  await fsp.rm(join(cartellaVoce, 'versioni', '3'));
  await fsp.rm(join(cartellaVoce, 'contenuto'));
  const leggibile = (e) => e.code === 'LIBRARY_READ_FAILED' && /latest version \(v3\) is not on disk; v2 is: restore it/u.test(e.message);
  await assert.rejects(leggiVoce({ cartella: c, id }), leggibile, '⛔ prima: la v2 letta come se fosse l\'ultima');
  await assert.rejects(leggiBytesVoce({ cartella: c, id }), leggibile, 'lo scarico dice lo stesso');
  await assert.rejects(riallineaContenutoVoce({ cartella: c, id }), leggibile, '«Apri» non consegna la v2 al posto della v3');
  await assert.rejects(aggiungiVersione({ cartella: c, id, trasforma: (s) => `${s}+D` }), leggibile, '⛔ prima: v4 = v2 + D, la v3 persa');
  assert.deepEqual((await elencaVersioni({ cartella: c, id })).map((v) => v.n), [1, 2, 3], 'nessuna versione nuova nata senza base');
  assert.equal((await leggiVersione({ cartella: c, id, n: 2 })).testo, 'B', 'la v2 si legge per numero, per ripristinarla');
  assert.equal(await leggiVersione({ cartella: c, id, n: 3 }), null, 'la v3 non c\'è: non si inventa');
  /* il rimedio che il messaggio consiglia funziona: il ripristino è un testo intero, non usa la base */
  assert.equal((await ripristinaVersione({ cartella: c, id, n: 2 }))?.versione, 4, '«ripristinala» deve riuscire');
  assert.equal((await leggiVoce({ cartella: c, id })).testo, 'B', 'dopo il ripristino la voce si legge di nuovo');
  assert.equal((await aggiungiVersione({ cartella: c, id, trasforma: (s) => `${s}+E` }))?.versione, 5, 'e si aggiorna sulla v4');
  for (const n of ['4', '5']) await fsp.rm(join(cartellaVoce, 'versioni', n));
  await fsp.rm(join(cartellaVoce, 'contenuto'));
  for (const n of ['1', '2']) await fsp.rm(join(cartellaVoce, 'versioni', n)); // file per file: nessun file resta
  await assert.rejects(leggiVoce({ cartella: c, id }), (e) => e.code === 'LIBRARY_READ_FAILED' && /no older version is either/u.test(e.message), 'nessun file: lo stato rotto si dice');
});

