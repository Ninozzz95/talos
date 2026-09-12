import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { testoIstruzioniDiProgetto, trovaIstruzioniDiProgetto } from '../src/istruzioni-di-progetto.mjs';
import { analizzaSezioniIstruzioni, rimuoviCommentiHtml, SOGLIA_RIGHE_INDICE } from '../src/sezioni-istruzioni.mjs';
import { contestoDelProgetto } from '../src/contesto-del-progetto.mjs';
import { discoNode } from '../src/kernel/talosHarness.mjs';

const file = (contenuto, etichetta = 'pacchetto/AGENTS.md') => ({ contenuto, etichetta, byte: Buffer.byteLength(contenuto) });

test('BC48-A-CORTO: fino a 60 righe il file locale entra identico', () => {
  assert.equal(SOGLIA_RIGHE_INDICE, 60);
  const contenuto = '# Regole\n## Una\n' + 'Riga.\n'.repeat(58);
  const esito = testoIstruzioniDiProgetto([file(contenuto)]);
  assert.ok(esito.testo.endsWith(contenuto));
  assert.deepEqual(esito.indicizzati, []);
});

test('BC48-A-SOGLIA: 61 righe e radice sezionata anche corta producono indice', () => {
  for (const f of [file('## Area\n' + 'Regola.\n'.repeat(60)), file('## Area\nRegola.\n', 'AGENTS.md')]) {
    const esito = testoIstruzioniDiProgetto([f]);
    assert.deepEqual(esito.indicizzati, [f.etichetta]);
    assert.match(esito.testo, /## Area · righe 1-/);
  }
});

test('BC48-A-INDICE: non negoziabile intera, altre sezioni con righe e byte del disco', () => {
  const contenuto = '# Progetto\n\n## Non-Negotiable User Rule\n- Mai commit.\n- Non cancellare.\n\n## Area\n<!-- nota\nsu due righe -->\nPrima frase. Seconda frase.\n';
  const esito = testoIstruzioniDiProgetto([file(contenuto, 'AGENTS.md')]);
  const area = contenuto.slice(contenuto.indexOf('## Area'));
  assert.ok(esito.testo.includes('## Non-Negotiable User Rule\n- Mai commit.\n- Non cancellare.'));
  assert.ok(esito.testo.includes(`## Area · righe 7-10 · ${Buffer.byteLength(area)} byte · Prima frase.`));
  assert.ok(!esito.testo.includes('Seconda frase.'));
  assert.deepEqual(esito.sezioniSempre.map(s => [s.etichetta, s.titolo, s.da, s.a]), [['AGENTS.md', 'Non-Negotiable User Rule', 3, 6]]);
});

test('BC48-A-COMMENTI: HTML esterno tolto, blocchi backtick tilde e indentati preservati', () => {
  const codice = '```html\n<!-- dentro -->\n## falso\n```\n~~~\n<!-- tilde -->\n~~~\n\n    <!-- indentato -->\n';
  const contenuto = '<!-- inizio\n## nascosto\nfine -->\n## Area\nVisibile <!-- inline --> ora.\n' + codice;
  const pulito = rimuoviCommentiHtml(contenuto);
  assert.ok(pulito.endsWith(codice));
  assert.match(pulito, /Visibile  ora/);
  assert.doesNotMatch(pulito, /nascosto|inline|inizio/);
  assert.deepEqual(analizzaSezioniIstruzioni(contenuto).sezioni.map(s => [s.titolo, s.da]), [['Area', 4]]);
});

test('BC48-A-CODICE-CITATO: i commenti restano anche nei blocchi dentro citazioni ed elenchi', () => {
  for (const codice of ['> ```html\n> <!-- dentro -->\n> ```\n', '- ```html\n  <!-- dentro -->\n  ```\n', '>     <!-- dentro -->\n']) {
    assert.equal(rimuoviCommentiHtml(codice), codice);
  }
});

test('BC48-A-SEMPRE: metadati solo fuori dal codice, seconda sezione marcata intera', () => {
  const testo = '## Una\n```\n<!-- talos: sempre -->\n<!-- talos: paths: falso/** -->\n```\n\n## Due\n<!-- talos: sempre -->\nRegola obbligatoria. Dettaglio.\n';
  const sezioni = analizzaSezioniIstruzioni(testo).sezioni;
  assert.equal(sezioni[0].sempre, false);
  assert.deepEqual(sezioni[0].paths, []);
  assert.equal(sezioni[1].sempre, true);
  assert.ok(testoIstruzioniDiProgetto([file(testo, 'AGENTS.md')]).testo.includes('Regola obbligatoria. Dettaglio.'));
});

test('BC48-A-CRLF: coordinate originali e byte UTF-8 includono CRLF e commenti', () => {
  const raw = '## Uno\r\n<!-- nota -->\r\nÈ così.\r\n\r\n## Due\r\nFine.';
  const sezioni = analizzaSezioniIstruzioni(raw).sezioni;
  assert.deepEqual(sezioni.map(s => [s.da, s.a, s.byte]), [[1, 4, Buffer.byteLength(raw.slice(0, raw.indexOf('## Due')))], [5, 6, Buffer.byteLength('## Due\r\nFine.')]]);
});

test('BC48-A-TETTO: avviso entro tetto e nessun moncone di sezione', () => {
  const contenuto = '## Non-Negotiable User Rule\nINIZIO ' + 'è'.repeat(8000) + ' FINE\n## Area\nUna frase.\n';
  const esito = testoIstruzioniDiProgetto([file(contenuto, 'AGENTS.md')], { tetto: 900 });
  assert.ok(esito.byte <= 900);
  assert.match(esito.testo, /⚠ Tetto delle istruzioni/);
  assert.deepEqual(esito.omessi, ['AGENTS.md']);
  assert.doesNotMatch(esito.testo, /INIZIO|FINE|\uFFFD/);
  assert.throws(() => testoIstruzioniDiProgetto([file(contenuto)], { tetto: 2 }), /tetto/i);
});

test('BC48-A-VERO: AGENTS.md radice resta 11480 byte, 172 righe, 17 sezioni e indice esatto', async () => {
  const raw = await readFile(new URL('../../AGENTS.md', import.meta.url), 'utf8');
  assert.equal(await discoNode({ radice: fileURLToPath(new URL('../', import.meta.url)) }).leggi('../AGENTS.md'), raw);
  assert.equal(Buffer.byteLength(raw), 11480);
  const righe = raw.match(/[^\n]*\n|[^\n]+$/g);
  assert.equal(righe.length, 172);
  const titoli = righe.flatMap((r, i) => r.startsWith('## ') ? [{ titolo: r.slice(3).trim(), da: i + 1 }] : []);
  assert.equal(titoli.length, 17);
  const trovati = await trovaIstruzioniDiProgetto(fileURLToPath(new URL('../', import.meta.url)));
  const esito = testoIstruzioniDiProgetto(trovati);
  for (let i = 1; i < titoli.length; i++) {
    const { titolo, da } = titoli[i];
    const a = (titoli[i + 1]?.da ?? righe.length + 1) - 1;
    const byte = Buffer.byteLength(righe.slice(da - 1, a).join(''));
    assert.ok(esito.testo.includes(`## ${titolo} · righe ${da}-${a} · ${byte} byte · `), titolo);
  }
  assert.ok(esito.byte < 11845);
  const preambolo = await contestoDelProgetto({ cartella: fileURLToPath(new URL('../', import.meta.url)), deps: { eseguiGit: async () => null } });
  assert.deepEqual(preambolo.blocchi.istruzioni.indicizzati, ['AGENTS.md']);
  assert.deepEqual(preambolo.blocchi.istruzioni.sezioniSempre, esito.sezioniSempre);
});
