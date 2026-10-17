// 15/10/2026 — foto del 4174 dopo la fusione del lotto 3B: in «Riprendi il lavoro» una sessione si chiamava
// «…dimmi se la mia idea e concettualmen», tagliata a 80 caratteri secchi a metà parola e senza puntini, accanto a
// nomi del server che ne hanno. La regola ora è una, in `session-item.js`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titoloDalPrimoMessaggio } from '../../src/components/session-item.js';

const VERO = 'ciao leggi i due documenti nella cartella , dimmi se la mia idea e concettualmente valida e se ha senso proseguire';

test('TITOLO-01 — la frase vera della foto: si ferma all\'ultima parola intera e chiude con «…», mai a metà parola', () => {
  const titolo = titoloDalPrimoMessaggio(VERO);
  assert.equal(titolo, 'ciao leggi i due documenti nella cartella , dimmi se la mia idea e…');
  assert.ok([...titolo].length <= 80, `${[...titolo].length} caratteri`);
  assert.doesNotMatch(titolo, /concettualmen/u);
});

test('TITOLO-02 — AL CONTRARIO: un testo che ci sta resta com\'è, solo con gli spazi raccolti, e senza «…»', () => {
  assert.equal(titoloDalPrimoMessaggio('  ciao!\n\n  come   stai?  '), 'ciao! come stai?');
  assert.equal(titoloDalPrimoMessaggio('x'.repeat(80)), 'x'.repeat(80));
  assert.equal(titoloDalPrimoMessaggio(''), '');
  assert.equal(titoloDalPrimoMessaggio(null), '');
});

test('TITOLO-03 — una parola sola lunghissima (un percorso, un indirizzo) si taglia lo stesso, con «…», entro il tetto', () => {
  const titolo = titoloDalPrimoMessaggio(`apri C:/${'cartella/'.repeat(20)}file.txt`);
  assert.ok(titolo.endsWith('…'));
  assert.equal([...titolo].length, 80);
});

test('TITOLO-04 — si conta per carattere vero: un\'emoji al confine non si spezza, e la punteggiatura prima dei puntini si toglie', () => {
  const conEmoji = `${'parola '.repeat(11)}🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀`;
  const titolo = titoloDalPrimoMessaggio(conEmoji);
  assert.ok([...titolo].length <= 80);
  assert.ok(!titolo.includes('\uFFFD') && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u.test(titolo), 'nessuna metà di emoji');
  assert.equal(titoloDalPrimoMessaggio(`${'abc '.repeat(15)}fine, ${'x'.repeat(40)}`), `${'abc '.repeat(15)}fine…`);
});

test('TITOLO-05 — le emoji contano uno: 50 razzi stanno negli 80 caratteri e non si tagliano; 100 si tagliano fra due razzi, mai dentro', () => {
  const corto = `ab ${'🚀'.repeat(50)}`;
  assert.equal(titoloDalPrimoMessaggio(corto), corto, 'in unità di codice sarebbero 103: il conteggio giusto è 53');
  const lungo = titoloDalPrimoMessaggio(`${'x'.repeat(10)}${'🚀'.repeat(100)}`);
  assert.equal([...lungo].length, 80);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u.test(lungo), 'nessuna metà di emoji');
});
