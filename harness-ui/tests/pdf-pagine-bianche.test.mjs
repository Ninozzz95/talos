import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { buildTalosReportDefinition } from '../src/document-report.mjs';

/*
 * BIANCHE-01..06 (CHAT-141 sul desktop, 29/10/2026). Il Mobile ha trovato sull'audit v2 dell'owner un PDF di 6 pagine con la 5
 * interamente bianca (12fbf5285); il costruttore del desktop è lo stesso. Il `pb` era un nodo `{ text: '', pageBreak: 'after' }` che
 * occupa una riga, e i margini erano tutti INFERIORI: una sezione che finisce negli ultimi punti della pagina apre una pagina col solo
 * piè di pagina, e un `pb` in coda ne lascia una alla fine.
 *
 * Il PDF è vero: lo stesso `buildTalosReportDefinition` del server, pdfmake 0.3.11 coi Roboto del pacchetto, testo per pagina letto con
 * pdfjs-dist. Le soglie si SCANSIONANO invece di fissarle, perché il carattere può spostarle di qualche riga. Stesse prove del Mobile.
 */
const require = createRequire(import.meta.url);
const { default: pdfmake } = await import('pdfmake');
const roboto = dirname(require.resolve('pdfmake/build/fonts/Roboto/Roboto-Regular.ttf'));
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((percorso) => percorso.startsWith(roboto));
pdfmake.setFonts({ Roboto: {
  normal: join(roboto, 'Roboto-Regular.ttf'), bold: join(roboto, 'Roboto-Medium.ttf'),
  italics: join(roboto, 'Roboto-Italic.ttf'), bolditalics: join(roboto, 'Roboto-Medium.ttf'),
} });
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

/** Il testo di ogni pagina senza il piè di pagina «F n / N»: una pagina è bianca se non resta niente. */
async function pagine(blocks) {
  const def = buildTalosReportDefinition({ meta: { title: 'T' }, footer: { text: 'F', pageNo: true }, blocks });
  const buf = await pdfmake.createPdf(def).getBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false }).promise;
  const testi = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const t = await (await doc.getPage(i)).getTextContent();
    const testo = t.items.map((x) => ('str' in x ? x.str : '')).join(' ').replace(/\s+/gu, ' ').trim();
    testi.push(testo.replace(/F?\s*\d+\s*\/\s*\d+\s*$/u, '').replace(/^F\s*/u, '').trim());
  }
  await doc.cleanup?.();
  return testi;
}

const bianche = (testi) => testi.flatMap((t, i) => (t === '' ? [i + 1] : []));
const para = (i) => ({ t: 'p', x: `Paragrafo numero ${i} con un testo abbastanza lungo da occupare una riga piena della pagina A4.` });
const riga = (i) => [`Negozio ${i}`, `${1000 + i}`, `${i}%`];

test('BIANCHE-01 n paragrafi + pb + titolo: nessuna pagina col solo piè di pagina, per ogni n da 25 a 45', { timeout: 120_000 }, async () => {
  const difetti = [];
  for (let n = 25; n <= 45; n += 1) {
    const b = bianche(await pagine([...Array.from({ length: n }, (_, i) => para(i)), { t: 'pb' }, { t: 'h', lvl: 1, x: 'Sezione dopo' }]));
    if (b.length) difetti.push(`n=${n}: bianche ${b.join(',')}`);
  }
  assert.deepEqual(difetti, []);
});

test('BIANCHE-02 tabella di r righe + pb + titolo: nessuna pagina bianca, per ogni r da 20 a 60', { timeout: 240_000 }, async () => {
  const difetti = [];
  for (let r = 20; r <= 60; r += 1) {
    const b = bianche(await pagine([
      { t: 'h', lvl: 1, x: 'Tabella' },
      { t: 'table', head: ['Negozio', 'Ricavi', 'Var'], rows: Array.from({ length: r }, (_, i) => riga(i)) },
      { t: 'pb' },
      { t: 'h', lvl: 1, x: 'Sezione dopo' },
    ]));
    if (b.length) difetti.push(`r=${r}: bianche ${b.join(',')}`);
  }
  assert.deepEqual(difetti, []);
});

test('BIANCHE-03 un pb come ultimo blocco non apre una pagina vuota', async () => {
  assert.equal((await pagine([{ t: 'p', x: 'Contenuto.' }, { t: 'pb' }])).length, 1);
});

test('BIANCHE-04 pb + spazio + pb vale un salto solo', async () => {
  const testi = await pagine([{ t: 'p', x: 'Prima.' }, { t: 'pb' }, { t: 'spacer' }, { t: 'pb' }, { t: 'p', x: 'Dopo.' }]);
  assert.equal(testi.length, 2);
  assert.deepEqual(bianche(testi), []);
});

test('BIANCHE-05 solo paragrafi: nessuna pagina bianca in coda, per ogni n da 25 a 45', { timeout: 120_000 }, async () => {
  const difetti = [];
  for (let n = 25; n <= 45; n += 1) {
    const b = bianche(await pagine(Array.from({ length: n }, (_, i) => para(i))));
    if (b.length) difetti.push(`n=${n}: bianche ${b.join(',')}`);
  }
  assert.deepEqual(difetti, []);
});

test('BIANCHE-06 il salto resta un salto: due sezioni separate da pb stanno su due pagine', async () => {
  const testi = await pagine([{ t: 'h', lvl: 1, x: 'Uno' }, { t: 'p', x: 'Testo uno.' }, { t: 'pb' }, { t: 'h', lvl: 1, x: 'Due' }, { t: 'p', x: 'Testo due.' }]);
  assert.equal(testi.length, 2);
  assert.match(testi[1], /^Due/u);
});

test('BIANCHE-07 un pb in testa (anche dopo uno spazio) non apre una prima pagina vuota', async () => {
  for (const blocks of [[{ t: 'pb' }, { t: 'h', lvl: 1, x: 'Uno' }], [{ t: 'spacer' }, { t: 'pb' }, { t: 'p', x: 'Uno.' }]]) {
    const testi = await pagine(blocks);
    assert.deepEqual(bianche(testi), [], JSON.stringify(blocks));
    assert.equal(testi.length, 1, JSON.stringify(blocks));
  }
});
