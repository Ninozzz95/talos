/*
 * Anteprima nelle domande (owner 29/10/2026, bozzetto approvato; «attenzione a formattare documenti tipo pdf md html»; nota 2 della CLI).
 * Quando un'anteprima è un DOCUMENTO del progetto (una riga, un percorso relativo, un'estensione che il lettore sa mostrare), e quando no.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { percorsoDiAnteprima, htmlDiAnteprima, POLITICA_HTML_ANTEPRIMA } from '../../src/components/anteprima-domanda.js';

test('ANTEPRIMA-DOMANDA-01 — un documento del progetto: relativo, una riga, un\'estensione nota', () => {
  assert.equal(percorsoDiAnteprima('docs/report.pdf'), 'docs/report.pdf');
  assert.equal(percorsoDiAnteprima('  ./docs/piano.MD  '), 'docs/piano.MD');
  assert.equal(percorsoDiAnteprima('docs\\slide.pptx'), 'docs/slide.pptx', 'la barra rovesciata di Windows diventa /');
  for (const ext of ['docx', 'xlsx', 'html', 'htm', 'txt', 'csv', 'png', 'svg']) assert.equal(percorsoDiAnteprima(`a/b.${ext}`), `a/b.${ext}`, ext);
});

test('ANTEPRIMA-DOMANDA-02 — AL CONTRARIO: tutto ciò che non è un documento del progetto resta testo (Markdown)', () => {
  const nonDocumenti = [
    '', '# Titolo\n\n- uno', 'const x = 1;', 'docs/a.pdf\nseconda riga',
    '/etc/passwd.txt', '~/note.md', 'C:/Users/a.pdf', 'C:\\Users\\a.pdf', '\\\\server\\share\\a.pdf', 'file:///a.pdf', 'https://x.com/a.pdf',
    '../fuori.pdf', 'docs/../../fuori.pdf', 'docs//a.pdf', 'docs/./a.pdf',
    '.env', 'id_rsa', 'chiave.pem', 'docs/archivio.zip', 'script.sh', `${'a/'.repeat(250)}b.pdf`,
  ];
  for (const testo of nonDocumenti) assert.equal(percorsoDiAnteprima(testo), null, JSON.stringify(testo.slice(0, 40)));
});

test('ANTEPRIMA-DOMANDA-03 — l\'HTML di un\'anteprima porta la sua politica: niente script, file né rete', () => {
  assert.match(POLITICA_HTML_ANTEPRIMA, /^default-src 'none'/u);
  assert.doesNotMatch(POLITICA_HTML_ANTEPRIMA, /script-src|connect-src|frame-src/u);
  const html = htmlDiAnteprima('<h1>Ciao</h1>');
  assert.ok(html.startsWith('<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"'));
  assert.ok(html.endsWith('<h1>Ciao</h1>'));
});

test('ANTEPRIMA-DOMANDA-04 — i link non navigano la cornice: `<base target="_blank">` e via i `target="_self"` (revisione del blocco 19)', () => {
  const html = htmlDiAnteprima('<a href="https://x.test" target="_self">a</a><a href="https://y.test" TARGET=\'_self\'>b</a><a href="https://z.test" target="_blank">c</a>');
  assert.ok(html.includes('<base target="_blank">'));
  assert.doesNotMatch(html, /_self/iu);
  assert.ok(html.includes('target="_blank">c</a>'), 'gli altri target restano');
});
