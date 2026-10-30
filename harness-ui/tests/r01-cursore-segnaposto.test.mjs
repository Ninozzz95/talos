/*
 * R-01 (Performance 29/10/2026, glm-5.3-flash su un compito vero; OK della CLI lo stesso giorno) — il modello ha paginato `cerca` con
 *   `continua:"undefined"`, la PAROLA, e ha ricevuto «NOT FOUND. There is no search "undefined"» senza una via d'uscita: cinque chiamate
 *   identiche e il giro fermato dalla guardia. I cursori e gli id delle ricerche sono generati e opachi: nessuno vale «undefined», «null»
 *   o soli spazi. ⇒ Valgono come assenti (la prima pagina) e una nota lo dice; la stringa vuota resta assente in silenzio, com'era; un
 *   cursore vero sconosciuto rifiuta ancora, ma dice come ripartire. Ogni prova ha il suo verso contrario.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { cercaNelProgetto, decisioneDiSfogliamento, elencaDaCartella, parametriDiElenca } from '../src/kernel/talosHarness.mjs';
import { creaRegistroRicerche } from '../src/kernel/ricerche-in-corso.mjs';
import { codificaCursore, cursoreSegnaposto, leggiParametriElenco } from '../src/elenco-paginato.mjs';
import { trovaNote } from '../src/letture-delle-sezioni.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-r01-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  mkdirSync(join(radice, 'src'), { recursive: true });
  writeFileSync(join(radice, 'src', 'modulo.mjs'), 'export const AGO_R01 = 1;\n');
  writeFileSync(join(radice, 'leggimi.md'), 'niente\n');
  const disco = {
    async elenca(dentro = '') {
      const voci = await readdir(dentro ? join(radice, dentro) : radice, { withFileTypes: true });
      return voci.map((v) => ({ nome: v.name, cartella: v.isDirectory(), byte: 0 }));
    },
    async leggi(percorso) { return readFile(join(radice, ...percorso.split('/')), 'utf8'); },
  };
  return { radice, disco };
}

const NOTA = /^NOTE: "continua" was "\s*(undefined|null)?\s*": that is not a search id, so it was ignored\./iu;

test('R01-01 cerca: continua "undefined" e "null" (anche in maiuscolo) cercano davvero, con la nota in testa', async (t) => {
  const { radice, disco } = progetto(t);
  const ricerche = creaRegistroRicerche();
  const senza = await cercaNelProgetto(disco, { testo: 'AGO_R01' }, { radice, ricerche });
  assert.match(senza, /src\/modulo\.mjs/u, 'premessa: la ricerca normale trova il file');
  for (const continua of ['undefined', 'null', 'NULL', ' undefined ']) {
    const esito = await cercaNelProgetto(disco, { testo: 'AGO_R01', continua }, { radice, ricerche });
    assert.match(esito, NOTA, `nota per ${JSON.stringify(continua)}`);
    assert.equal(esito.split('\n').slice(1).join('\n'), senza, 'dopo la nota, la stessa risposta di una ricerca senza continua');
    assert.doesNotMatch(esito, /NOT FOUND/u);
  }
});

test('R01-02 cerca: «continua» segnaposto senza testo né nome dice cosa passare, non «NOT FOUND»', async (t) => {
  const { radice, disco } = progetto(t);
  const esito = await cercaNelProgetto(disco, { dentro: 'src', offset: 0, continua: 'undefined' }, { radice, ricerche: creaRegistroRicerche() });
  assert.match(esito, NOTA);
  assert.match(esito, /give at least one of "testo" or "nome"\./u);
  assert.doesNotMatch(esito, /NOT FOUND/u);
});

test('R01-03 AL CONTRARIO: la stringa vuota resta assente in silenzio, e un id vero sconosciuto rifiuta dicendo come ripartire', async (t) => {
  const { radice, disco } = progetto(t);
  const ricerche = creaRegistroRicerche();
  const vuota = await cercaNelProgetto(disco, { testo: 'AGO_R01', continua: '' }, { radice, ricerche });
  assert.equal(vuota, await cercaNelProgetto(disco, { testo: 'AGO_R01' }, { radice, ricerche }), 'nessuna nota per la stringa vuota');
  const ignoto = await cercaNelProgetto(disco, { continua: 'r9' }, { radice, ricerche });
  assert.match(ignoto, /^NOT FOUND\. There is no search "r9" in this session/u, 'un id non segnaposto si prende ancora per id');
  assert.match(ignoto, /run the search again with "testo" or "nome", without "continua"\.$/u);
});

test('R01-04 il cursore C5 degli elenchi (notes_find, library_find, tasks_find, memory_find, list_children, automazioni): segnaposto = prima pagina con nota', () => {
  for (const cursor of ['undefined', 'null', 'Undefined', '   ']) {
    const p = leggiParametriElenco({ cursor });
    assert.equal(p.cursore, null, `${JSON.stringify(cursor)} non è un cursore`);
    assert.deepEqual(p.note, [`cursor ${JSON.stringify(cursor)} is not a cursor, so it was ignored: this is the first page. Use only the next_cursor a previous page gave you.`]);
  }
  // al contrario: la stringa vuota senza nota, e un cursore vero passa intatto
  assert.deepEqual(leggiParametriElenco({ cursor: '' }), { ...leggiParametriElenco({}), cursore: null });
  const vero = codificaCursore({ attrezzo: 'notes_find', chiave: ['x'], filtri: {} });
  assert.equal(leggiParametriElenco({ cursor: vero }).cursore, vero);
  assert.deepEqual(leggiParametriElenco({ cursor: vero }).note, []);
  assert.equal(cursoreSegnaposto(vero), false);
});

test('R01-05 notes_find dal capo all\'esito: cursor "undefined" dà la prima pagina e la nota, non «not valid»', () => {
  const note = Array.from({ length: 25 }, (_, i) => ({ id: `n${i}`, titolo: `Nota ${i}`, contenuto: 'x', aggiornataAlle: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z` }));
  const prima = trovaNote(note, {});
  const conSegnaposto = trovaNote(note, { cursor: 'undefined' });
  assert.match(conSegnaposto, /cursor "undefined" is not a cursor, so it was ignored: this is the first page\./u);
  assert.doesNotMatch(conSegnaposto, /not valid/u);
  assert.deepEqual(conSegnaposto.split('\n').filter((r) => r.startsWith('- ')), prima.split('\n').filter((r) => r.startsWith('- ')), 'le stesse voci della prima pagina');
  // al contrario: un cursore inventato (non segnaposto) rifiuta ancora
  assert.match(trovaNote(note, { cursor: 'abc' }), /not valid/u);
});

test('R01-06 elenca: cursor "null" → prima pagina con la nota; soli spazi restano silenziosi come prima', async (t) => {
  const { disco } = progetto(t);
  const p = parametriDiElenca({ cursor: 'null' });
  assert.equal(p.cursore, null);
  assert.equal(p.note.length, 1);
  const esito = await elencaDaCartella(disco, '', p);
  assert.match(esito, /cursor "null" is not a cursor, so it was ignored/u);
  assert.doesNotMatch(esito, /not valid/u);
  assert.deepEqual(parametriDiElenca({ cursor: '   ' }), parametriDiElenca({}), 'soli spazi: com\'era');
});

test('R01-07 il freno delle pagine: un segnaposto non è «già servito» — due elenca con cursor "undefined" sono due prime pagine, non un rifiuto', () => {
  const registro = new Map();
  const uno = decisioneDiSfogliamento({ nome: 'elenca', argomenti: { cursor: 'undefined' }, registro });
  const due = decisioneDiSfogliamento({ nome: 'elenca', argomenti: { cursor: 'undefined' }, registro });
  assert.doesNotMatch(String(uno.messaggio ?? ''), /already served/u);
  assert.doesNotMatch(String(due.messaggio ?? ''), /already served/u);
  // al contrario: un cursore vero servito due volte si rifiuta ancora
  const vero = codificaCursore({ attrezzo: 'elenca', chiave: ['a'], filtri: {} });
  const reg2 = new Map();
  decisioneDiSfogliamento({ nome: 'elenca', argomenti: { cursor: vero }, registro: reg2 });
  assert.match(decisioneDiSfogliamento({ nome: 'elenca', argomenti: { cursor: vero }, registro: reg2 }).messaggio, /already served/u);
});
