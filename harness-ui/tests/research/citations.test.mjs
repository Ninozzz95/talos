import test from 'node:test';
import assert from 'node:assert/strict';
import { talosResearchBibtex, talosResearchRis } from '../../src/research/citations.mjs';

/*
 * TRADOTTO da AVM/mobile/tests/unit/research/researchCitationExport.test.ts (vitest → node:test).
 * Stessi casi, stesso ordine, stesse attese.
 *
 * ⛔⛔ EXPORT-06 — le fonti escono in un formato che un gestore sa leggere.
 *
 * Il rapporto esce in Markdown e PDF, che sono per una persona. Chi fa un
 * lavoro serio con delle fonti le mette in Zotero, Mendeley, EndNote — e quei
 * programmi parlano BibTeX e RIS. Senza, ogni riferimento va ricopiato a mano,
 * ed è il punto in cui una bibliografia si sporca.
 *
 * ⛔ Cosa NON esce: la query che ha trovato la pagina, il modello che l'ha
 * giudicata, l'identificativo della ricerca, la chat da cui viene. Un file di
 * bibliografia finisce in una cartella condivisa, in un allegato, in un
 * repository — il posto meno controllato in cui un dato personale possa arrivare.
 */

const FONTI = [
  {
    url: 'https://www.example.com/articolo',
    title: 'Il titolo dell’articolo',
    publishedAt: '2026-03-14',
    accessedAt: '2026-08-20',
  },
  {
    url: 'https://bbc.co.uk/news/x',
    title: 'Another headline',
    publishedAt: null,
    accessedAt: '2026-08-20',
  },
];

test('CITAZ-01 BibTeX: una voce per fonte, col tipo giusto per una pagina web', () => {
  const testo = talosResearchBibtex(FONTI);
  assert.equal(testo.match(/@misc\{/g).length, 2);
});

test('CITAZ-02 BibTeX porta i campi obbligatori: titolo, url e data di consultazione', () => {
  const testo = talosResearchBibtex(FONTI);
  assert.ok(testo.includes('title = {Il titolo dell’articolo}'));
  assert.ok(testo.includes('url = {https://www.example.com/articolo}'));
  assert.ok(testo.includes('urldate = {2026-08-20}'));
});

test('CITAZ-03 l’anno c’è quando la fonte lo dichiara, e manca quando non lo dichiara', () => {
  const testo = talosResearchBibtex(FONTI);
  assert.ok(testo.includes('year = {2026}'));
  // La seconda non ha data di pubblicazione: non se ne inventa una.
  assert.equal(testo.match(/year = \{/g).length, 1);
});

test('CITAZ-04 ⛔ le chiavi non si scontrano fra fonti dello stesso dominio e anno', () => {
  const testo = talosResearchBibtex([
    { url: 'https://example.com/a', title: 'A', publishedAt: '2026-01-01', accessedAt: '2026-08-20' },
    { url: 'https://example.com/b', title: 'B', publishedAt: '2026-01-01', accessedAt: '2026-08-20' },
  ]);
  const chiavi = [...testo.matchAll(/@misc\{([^,]+),/g)].map((m) => m[1]);
  assert.equal(chiavi.length, 2);
  assert.equal(new Set(chiavi).size, 2);
});

test('CITAZ-05 ⛔ le graffe nel titolo non rompono il file', () => {
  const testo = talosResearchBibtex([
    { url: 'https://example.com/a', title: 'Un {titolo} con \\graffe', publishedAt: null, accessedAt: '2026-08-20' },
  ]);
  assert.ok(!testo.includes('{titolo}'));
  assert.ok(testo.includes('title = {Un titolo con graffe}'));
});

test('CITAZ-06 ⛔ NON esce niente della persona né della ricerca', () => {
  const testo = talosResearchBibtex([{
    url: 'https://example.com/a',
    title: 'A',
    publishedAt: null,
    accessedAt: '2026-08-20',
    // Campi che il chiamante potrebbe passare per sbaglio: si ignorano.
    query: 'quanto guadagna Antonino',
    researchId: 'ric-9',
  }]);
  assert.ok(!testo.includes('Antonino'));
  assert.ok(!testo.includes('ric-9'));
});

test('CITAZ-07 RIS: ogni voce apre col tipo e chiude con ER', () => {
  const testo = talosResearchRis(FONTI);
  assert.equal(testo.match(/^TY {2}- ELEC$/gm).length, 2);
  assert.equal(testo.match(/^ER {2}- $/gm).length, 2);
});

test('CITAZ-08 RIS porta titolo, url e data di consultazione', () => {
  const testo = talosResearchRis(FONTI);
  assert.ok(testo.includes('TI  - Il titolo dell’articolo'));
  assert.ok(testo.includes('UR  - https://www.example.com/articolo'));
  assert.ok(testo.includes('Y2  - 2026/08/20'));
});

test('CITAZ-09 la data di pubblicazione c’è solo se dichiarata', () => {
  const testo = talosResearchRis(FONTI);
  assert.ok(testo.includes('PY  - 2026'));
  assert.equal(testo.match(/^PY {2}- /gm).length, 1);
});

test('CITAZ-10 ⛔ un a capo dentro un titolo non spezza il record', () => {
  const testo = talosResearchRis([
    { url: 'https://example.com/a', title: 'Prima riga\nseconda riga', publishedAt: null, accessedAt: '2026-08-20' },
  ]);
  assert.ok(testo.includes('TI  - Prima riga seconda riga'));
  assert.equal(testo.match(/^ER {2}- $/gm).length, 1);
});

test('CITAZ-11 ⛔ e al contrario: nessuna fonte produce un file VUOTO, non un record vuoto', () => {
  assert.equal(talosResearchRis([]), '');
  assert.equal(talosResearchBibtex([]), '');
});
