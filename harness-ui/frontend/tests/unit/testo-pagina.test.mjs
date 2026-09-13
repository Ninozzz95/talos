import test from 'node:test';
import assert from 'node:assert/strict';
import { testoLeggibile, sembraHtml, riassuntoPulizia } from '../../src/components/testo-pagina.js';

// 06/09 — O-28: nella vista Browser si vedeva il sorgente della pagina invece del testo.

const PAGINA = `HTTP 200 · https://docs.python.org/3/whatsnew/3.12.html
<!DOCTYPE html>
<html lang="en" data-content-root="../">
  <head>
    <meta charset="utf-8" />
    <meta property="og:title" content="What's New In Python 3.12" />
    <style>body{color:red}</style>
    <script>var x = 1 < 2;</script>
  </head>
  <body>
    <nav class="related"><h3>Navigation</h3><ul><li><a href="../genindex.html">index</a></li></ul></nav>
    <h1>What&#8217;s New In Python 3.12</h1>
    <p>Editor, <b>Adam Turner</b>.</p>
    <p>Released on October&nbsp;2, 2023.</p>
    <footer>&copy; Python Software Foundation</footer>
  </body>
</html>`;

test('PAGINA-RICONOSCE: un sorgente si riconosce, una nota no', () => {
  assert.equal(sembraHtml(PAGINA), true);
  assert.equal(sembraHtml('<html><body><p>ciao</p></body></html>'), true);
  // AL CONTRARIO: il testo già pulito non va toccato
  assert.equal(sembraHtml('Registro dei processi\n\nTre righe di testo normale.'), false);
  assert.equal(sembraHtml('una frase con un < e un > dentro'), false);
  assert.equal(sembraHtml(''), false);
});

test('PAGINA-LEGGIBILE: restano le parole, spariscono codice, testa e navigazione', () => {
  const t = testoLeggibile(PAGINA);
  assert.match(t, /What’s New In Python 3\.12/); // l'entità numerica torna un apostrofo vero
  assert.match(t, /Editor, Adam Turner\./);
  assert.match(t, /Released on October 2, 2023\./); // &nbsp; diventa uno spazio normale
  // via ciò che non è contenuto
  assert.doesNotMatch(t, /<!DOCTYPE/i);
  assert.doesNotMatch(t, /og:title/);
  assert.doesNotMatch(t, /body\{color:red\}/);
  assert.doesNotMatch(t, /var x = 1/);
  assert.doesNotMatch(t, /genindex\.html/); // la navigazione è un blocco «improbabile» per costruzione
  assert.doesNotMatch(t, /<[a-z]/i); // nessun tag sopravvive
  // e nessuna riga vuota tripla
  assert.doesNotMatch(t, /\n{3,}/);
});

test('PAGINA-INTATTO: ciò che non è HTML esce identico', () => {
  const nota = 'Registro dei processi\n\n12 processi attivi, 3 in attesa.';
  assert.equal(testoLeggibile(nota), nota);
  assert.equal(testoLeggibile(''), '');
  assert.equal(testoLeggibile(null), '');
});

test('PAGINA-RIASSUNTO: dice quanto è stato tolto, e tace quando non c’è niente da togliere', () => {
  const r = riassuntoPulizia(PAGINA);
  assert.ok(r.caratteriPrima > r.caratteriDopo);
  assert.ok(r.righe >= 3);
  assert.equal(riassuntoPulizia('testo normale'), null);
});
