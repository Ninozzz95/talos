/*
 * NOMI2-REV-03, spostata qui il 16/10/2026 da `nomi-doppi-dal-server-revisione-2.test.mjs` (richiesta della CLI): legge
 * `nomeAutomaticoDiDelega` del frontend desktop, che nell'albero della CLI non c'è; il resto del file resta comune.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { nomeAutomaticoDiDelega } from '../frontend/src/components/session-item.js';

test('NOMI2-REV-03 — [CURATO 16/10, era S5] `nomeAutomaticoDiDelega` scambia per automatico un nome SCELTO dalla persona che è un prefisso del compito più «-N»: «Fix-2» su «Fix the build» perde contro il nome distintivo', () => {
  assert.equal(nomeAutomaticoDiDelega({ padreId: 'm', nome: 'Controlla i test della cartella src-2', taskDelega: 'Controlla i test della cartella src' }), true, 'premessa: il nome automatico col numero si riconosce');
  assert.equal(nomeAutomaticoDiDelega({ padreId: 'm', nome: 'Fix-2', taskDelega: 'Fix the build on Windows' }), false,
    'session-item.js, `nomeAutomaticoDiDelega`: `compito.startsWith(numerato[1])` accetta qualunque PREFISSO del compito, anche a metà parola o di una parola sola: un nome automatico è il compito intero (o il suo taglio con «…») più il numero');
});
