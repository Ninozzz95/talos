import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/*
 * ⛔ 12/09 — il giro vero L8 ha mostrato «research_deposit…» a schermo: un attrezzo NUOVO del
 * kernel senza nome umano viola la regola dell'owner del 04/09 («niente nomi tecnici nella UI»).
 * Qui si legge la lista degli attrezzi dichiarati dal kernel (i `name: '…'` dello schema) e si
 * pretende che ognuno abbia un nome umano in `nomi-attrezzi.js`: un attrezzo nuovo senza nome fa
 * rosso questo test, non lo schermo dell'owner. Verso contrario: un nome inventato non è nella mappa.
 */
const qui = path.dirname(fileURLToPath(import.meta.url));
const kernel = readFileSync(path.join(qui, '../../../src/kernel/talosHarness.mjs'), 'latin1');
const nomiAttrezzi = readFileSync(path.join(qui, '../../src/components/nomi-attrezzi.js'), 'utf8');
const dichiarati = [...new Set([...kernel.matchAll(/^\s{4,12}name: '([a-z_]+)',\s*$/gm)].map((m) => m[1]))].filter((n) => /^(research|notes|tasks|memory|library|document|generate|tool)_/.test(n));

test('NOMI-ATTREZZI · il kernel dichiara attrezzi di ricerca/note/attività/memoria/libreria e sono più di zero', () => {
  assert.ok(dichiarati.length >= 8, `trovati ${dichiarati.length}: ${dichiarati.join(', ')}`);
});

for (const nome of dichiarati) {
  test(`NOMI-ATTREZZI · «${nome}» ha un nome umano`, () => {
    // ⛔ niente `\s`: una barra rovescia che attraversa bash o un heredoc non sopravvive (lezione già pagata il 02/09)
    assert.ok(new RegExp('^[ \\t]*' + nome + ":[ \\t]*'", 'm').test(nomiAttrezzi), `manca ${nome} in nomi-attrezzi.js`);
  });
}

test('NOMI-ATTREZZI · verso contrario: un attrezzo inventato non ha un nome umano', () => {
  assert.equal(/^[ \t]*attrezzo_inventato:[ \t]*'/m.test(nomiAttrezzi), false);
});
