import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { origineAvvisoPlugin } from '../../src/components/nomi-attrezzi.js';

/*
 * ⭐⭐ BC-78.4, 17/09/2026 — UN NOME TECNICO A SCHERMO, NEGLI AVVISI DELLA SCANSIONE DEI PLUGIN.
 *
 * Il caso: nel pannello Estensioni si leggeva «tool:check_notes: legge una credenziale e la manda
 * in rete nello stesso comando». Misurato alla fonte, non dedotto: il campo lo costruisce il
 * server — `harness-ui/src/session-registry.mjs`, `origine: \`tool:${t.nome}\`` e
 * `origine: \`hook:${h.id}\`` — e quella è la lane di un'altra corsia, che qui non si tocca e che
 * NON deve cambiare: `check_notes` è il nome che l'autore del plugin ha dato al suo attrezzo.
 *
 * ⇒ Si traduce dove si legge, con la regola dell'owner del 04/09: nome umano in UN posto solo, il
 *   grezzo al più come dettaglio secondario (qui: il `title` del chip).
 */

test('BC78-4: `tool:` e `hook:` diventano parole, e il nome si legge', () => {
  assert.equal(origineAvvisoPlugin('tool:check_notes'), 'attrezzo check notes');
  assert.equal(origineAvvisoPlugin('hook:pre-commit'), 'gancio pre commit');
  /* Un attrezzo che un nome nostro ce l'ha lo usa: la mappa condivisa viene prima del ripiego. */
  assert.equal(origineAvvisoPlugin('tool:web_search'), `attrezzo ${origineAvvisoPlugin('tool:web_search').replace('attrezzo ', '')}`);
  assert.ok(!origineAvvisoPlugin('tool:web_search').includes('_'), 'nessun trattino basso a schermo');
});

test('BC78-4 al contrario: niente da tradurre, niente da inventare', () => {
  assert.equal(origineAvvisoPlugin(''), '');
  assert.equal(origineAvvisoPlugin(null), '');
  assert.equal(origineAvvisoPlugin(undefined), '');
  /* Un'origine di una forma che non conosciamo non si butta e non si decora: si rende leggibile.
     ⛔ Restituire la stringa grezza rimetterebbe a schermo esattamente ciò che questa cura toglie. */
  assert.equal(origineAvvisoPlugin('qualcosa_altro'), 'qualcosa altro');
  assert.ok(!origineAvvisoPlugin('qualcosa_altro').includes('_'));
});

test('BC78-4 cancello: il pannello Estensioni non scrive più l’origine grezza nel testo', () => {
  const app = readFileSync(fileURLToPath(new URL('../../src/legacy/app.js', import.meta.url)), 'utf8');
  /* ⛔ Si cerca la FORMA del difetto — «l'origine infilata dritta in una frase a schermo» — non la
     stringa `tool:check_notes`, che è solo l'esempio che l'owner ha incontrato. */
  const crude = app.match(/\$\{a\.origine\}|\$\{avviso\.origine\}/g) || [];
  assert.deepEqual(crude, [], `l'origine grezza finisce in un testo a schermo: ${JSON.stringify(crude)}`);
  assert.ok(app.includes('origineAvvisoPlugin(a.origine)'), 'la premessa non regge: il pannello non usa la traduzione');
});
