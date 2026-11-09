/* Decisione 69 (03/11/2026): le fissate dal server; un server vecchio (senza il campo) lascia valere questo PC; le locali passano una volta. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { daPassareAlServer, fissateDalServer } from '../../src/components/sessioni-fissate.js';

test('FISS-UI-01 il server dice le fissate; AL CONTRARIO un server vecchio senza il campo dà null e vale il PC', () => {
  assert.deepEqual([...fissateDalServer([{ sessionId: 'a', fissata: true }, { sessionId: 'b', fissata: false }])], ['a']);
  assert.equal(fissateDalServer([{ sessionId: 'a' }, { sessionId: 'b', fissata: true }]), null, 'una voce senza il campo: server vecchio');
  assert.equal(fissateDalServer([]), null, 'elenco vuoto: non si sa');
});

test('FISS-UI-02 passano al server solo le fissate locali che il server conosce e non ha ancora', () => {
  const voci = [{ sessionId: 'a', fissata: false }, { sessionId: 'b', fissata: true }];
  assert.deepEqual(daPassareAlServer(new Set(['a', 'b', 'sparita']), voci), ['a']);
  assert.deepEqual(daPassareAlServer(new Set(), voci), []);
});

test('FISS-UI-03 la barra scrive sul server con la rotta /pin e legge le fissate dall elenco', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /apiPost\(`\/api\/v1\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/pin`, \{ fissata \}\)/u);
  assert.match(app, /riceviFissateDalServer\(elenco\);/u);
  assert.match(app, /const sessioniFissate = \(\) => fissateSulServer \?\? leggiFissate\(window\.localStorage\);/u);
});
