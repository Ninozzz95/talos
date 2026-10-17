import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { root } from './support.mjs';

/*
 * Owner 12/10/2026, «Sì, segue il sistema». Il guscio forzava Chromium in italiano (`appendSwitch('lang', 'it')`): l'interfaccia,
 * che senza una scelta salvata negozia la lingua da `navigator.languages`, partiva in italiano anche su un Windows inglese.
 * La prova vera è dal vivo (una copia dell'app avviata con `--lang=en-US` e con `--lang=it`); qui il pezzo che la riporterebbe
 * indietro senza un rosso: una lingua imposta a Chromium dal codice del guscio.
 */
const codice = (file) => readFileSync(join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').split('\n').filter((riga) => !/^\s*\/\//u.test(riga)).join('\n');

test('LINGUA-SISTEMA-01 — il guscio non impone una lingua a Chromium: la sceglie Windows', () => {
  for (const file of ['main.mjs', 'runtime.mjs', 'lifecycle.mjs', 'barra-finestra.mjs']) {
    const sorgente = codice(file);
    assert.doesNotMatch(sorgente, /appendSwitch\(\s*['"`]lang['"`]/u, `${file}: una lingua forzata con appendSwitch`);
    assert.doesNotMatch(sorgente, /appendArgument\(\s*['"`]--lang/u, `${file}: una lingua forzata con appendArgument`);
    assert.doesNotMatch(sorgente, /['"`]--lang=/u, `${file}: un argomento --lang= scritto nel guscio`);
  }
});

test('LINGUA-SISTEMA-02 — AL CONTRARIO: gli altri interruttori del guscio restano (la prova non è cieca)', () => {
  assert.match(codice('main.mjs'), /appendSwitch\('ignore-gpu-blocklist'\)/u);
});
