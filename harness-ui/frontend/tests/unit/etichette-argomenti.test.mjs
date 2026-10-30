import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { etichettaArgomento } from '../../src/components/etichette-argomenti.js';
import { impostaLingua } from '../../src/components/lingua.js';
import testiApp from '../../src/i18n/testi/app.js';

/*
 * 27/10/2026 (parità col Mobile, T8): il nome di un argomento d'attrezzo nel corpo dell'attività si dice nella lingua dell'interfaccia.
 * I campi si leggono dagli SCHEMI DEL KERNEL (ogni `nome: { type: '…'` di talosHarness.mjs): un campo nuovo senza voce fa diventare
 * rossa questa prova invece di comparire grezzo a schermo. Al contrario: un campo che il kernel non ha (MCP) resta il suo nome.
 */
const kernel = readFileSync(new URL('../../../src/kernel/talosHarness.mjs', import.meta.url), 'utf8');
const CAMPI = [...new Set([...kernel.matchAll(/^\s+([A-Za-z_][A-Za-z0-9_]*): \{ ?type: '/gmu)].map((m) => m[1]))].sort();

test('ARG-ETICHETTE-01 ogni campo degli schemi del kernel ha la sua voce, in inglese e in italiano', () => {
  assert.ok(CAMPI.length >= 100, `premessa: dagli schemi escono ${CAMPI.length} campi, attesi oltre 100 (la lettura degli schemi è rotta?)`);
  for (const lingua of ['en', 'it']) {
    const mancanti = CAMPI.filter((c) => typeof testiApp[lingua][`activity.arg.${c}`] !== 'string' || !testiApp[lingua][`activity.arg.${c}`].trim());
    assert.deepEqual(mancanti, [], `${lingua}: campi del kernel senza la voce app.activity.arg.<campo>`);
  }
});

test('ARG-ETICHETTE-02 il campo si dice nella lingua scelta, qualunque sia la lingua del suo nome', () => {
  impostaLingua('en');
  assert.equal(etichettaArgomento('percorso'), 'path');
  assert.equal(etichettaArgomento('comando'), 'command');
  assert.equal(etichettaArgomento('path'), 'path');
  impostaLingua('it');
  assert.equal(etichettaArgomento('path'), 'percorso');
  assert.equal(etichettaArgomento('contenuto'), 'contenuto');
  assert.equal(etichettaArgomento('phone'), 'dispositivo', 'mai «telefono» (owner 22/10)');
  impostaLingua('en');
});

test('ARG-ETICHETTE-03 AL CONTRARIO: un campo che il kernel non ha (un server MCP) resta il suo nome, mai una chiave grezza', () => {
  impostaLingua('it');
  assert.equal(etichettaArgomento('repo_owner'), 'repo_owner');
  assert.equal(etichettaArgomento('a-b'), 'a-b');
  assert.equal(etichettaArgomento(''), '');
  assert.ok(!/^app\./u.test(etichettaArgomento('qualcosaDiNuovo')));
  impostaLingua('en');
});
