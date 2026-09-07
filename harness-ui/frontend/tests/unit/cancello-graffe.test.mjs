/*
 * Il settimo controllo del cancello: le graffe che chiudono un blocco mai aperto.
 *
 * ⛔ Provato ANCHE AL VERSO CONTRARIO: un foglio sano non deve accusare niente, o il controllo
 * diventa rumore e smette di essere letto — e provato sul caso VERO del 07/9, la `}` rimasta dopo
 * una container query cancellata, che buttava via la regola della barra di selezione.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graffeOrfane, blocchiNonChiusi, fogliInterni } from '../../scripts/cancello/graffe-orfane.mjs';

test('un foglio sano non accusa niente', () => {
  const css = `.a{color:red}\n@media (min-width:10px){ .b{color:blue} }\n.c{color:green}`;
  assert.deepEqual(graffeOrfane(css), []);
  assert.equal(blocchiNonChiusi(css), 0);
});

test('la graffa orfana del 07/9: dice la riga, e la regola dopo e quella che si perde', () => {
  const css = ['.talos-sidebar{container-type:inline-size}', '}', '.talos-sidebar__selezione{display:grid}'].join('\n');
  const trovate = graffeOrfane(css);
  assert.equal(trovate.length, 1);
  assert.equal(trovate[0].riga, 2);
  assert.equal(trovate[0].intorno, '}');
});

test('una graffa dentro un commento o una stringa non conta', () => {
  assert.deepEqual(graffeOrfane('/* } una nota con la graffa } */\n.a{color:red}'), []);
  assert.deepEqual(graffeOrfane('.a{content:"}"}'), []);
});

test('un blocco lasciato aperto si vede, e non e un orfano', () => {
  assert.equal(blocchiNonChiusi('@media x{ .a{color:red}'), 1);
  assert.deepEqual(graffeOrfane('@media x{ .a{color:red}'), []);
});

test('una sola graffa persa non accusa tutto il resto del foglio', () => {
  const css = ['}', '.a{color:red}', '.b{color:blue}'].join('\n');
  assert.equal(graffeOrfane(css).length, 1);
});

test('i fogli interni di un HTML si trovano con la riga da cui partono', () => {
  const html = '<html>\n<head>\n<style>.a{color:red}</style>\n</head></html>';
  const fogli = fogliInterni(html);
  assert.equal(fogli.length, 1);
  assert.equal(fogli[0].rigaIniziale, 3);
  assert.equal(fogli[0].css, '.a{color:red}');
});
