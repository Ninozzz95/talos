import test from 'node:test';
import assert from 'node:assert/strict';

import { argomentiGrezziDellaRiga, leggiArgomentiDellaRiga } from '../../src/components/carta-dal-testo.js';
import { oscuraFormeDiSegreto, oscuraPerStruttura } from '../../../src/forme-di-segreto.mjs';

/*
 * 0.2.4, block 1, item 5 (list item 1, the «first item» of 0.2.3 left half done): while the arguments arrive in pieces, a secret split
 * between two pieces must never show, not even for one frame. The test cuts the stream at EVERY character (the output must not depend on
 * where a piece ends, as the stream guards do). Fake secrets only. Red on bb6d3799a: FLUSSO-01 shows «sk-proj-FINTO…» and «FINTO…» halves.
 */
const CHIAVE = 'sk-proj-' + 'FINTO0a1b2c3d4e5f6g7h8i9j0k1l2';
const GETTONE = 'FINTO' + 'abcdefghij0123456789KLMN';
const TESTI = [
  `run the deploy with key ${CHIAVE} now`,
  `curl -H "Authorization: Bearer ${GETTONE}" https://x.test/api`,
  `export DB_PASSWORD=${GETTONE} && ./start.sh`,
  `aws configure set aws_access_key_id AKIA${'Q7ZT3XW9PL2MN8RB'} and go`,
];

test('FLUSSO-01: a raw (non JSON) argument cut at every character never shows a piece of a secret', () => {
  for (const testo of TESTI) {
    for (let n = 1; n <= testo.length; n += 1) {
      const fuori = argomentiGrezziDellaRiga(testo.slice(0, n));
      assert.ok(!fuori.includes('FINTO') && !fuori.includes('Q7ZT3X'), `cut at ${n}: ${fuori}`);
    }
  }
});

test('FLUSSO-02: when the text is whole and ends with a separator, the row is the same as the masked text (nothing held back)', () => {
  for (const testo of ['npm test --watch ', 'ls -la\n', 'echo hello world.']) assert.equal(argomentiGrezziDellaRiga(testo), oscuraFormeDiSegreto(testo));
  assert.equal(argomentiGrezziDellaRiga('git status'), 'git status', 'an honest last word is shown');
  assert.equal(argomentiGrezziDellaRiga('use the key sk-pro'), 'use the key …', 'the start of a key is held');
  assert.equal(argomentiGrezziDellaRiga('use the key AKI'), 'use the key …', 'M19: a word that is still the start of a key form is held too');
  assert.equal(argomentiGrezziDellaRiga('{"a": 1}'), '', 'JSON goes the other way, as before');
});

test('FLUSSO-03: the live JSON row with memory gives exactly the same masks as without it, frame after frame', () => {
  /* texts of 64 characters or more are remembered: the long command with a secret is masked on EVERY frame after it closes, not only the first */
  const tutto = JSON.stringify({ comando: `export API_TOKEN=${GETTONE} && ./deploy.sh --region eu-west-1 --verbose`, note: 'x'.repeat(300),
    elenco: [`${CHIAVE} trailing and more words so that it is long enough to be remembered`, 'ok'.repeat(50)] });
  let disegni = 0;
  for (let n = 2; n <= tutto.length; n += 7) {
    const letti = leggiArgomentiDellaRiga(tutto.slice(0, n));
    if (letti.mostrati === null) continue;
    disegni += 1;
    assert.ok(!JSON.stringify(letti.mostrati).includes('FINTO'), `cut at ${n}`);
  }
  assert.ok(disegni > 20);
  const intero = leggiArgomentiDellaRiga(tutto);
  assert.deepEqual(intero.mostrati, oscuraPerStruttura(JSON.parse(tutto)));
});
