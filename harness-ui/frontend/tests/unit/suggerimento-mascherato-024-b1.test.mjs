import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { argomentiMascherati } from '../../src/components/attivita-segmento.js';
import { bersaglioDelSuggerimento, bersaglioDellaRicerca } from '../../src/components/bersaglio-suggerimento.js';
import { fraseCercata } from '../../src/components/frase-cercata.js';

/*
 * 0.2.4, block 1, item 2 (known limit of 0.2.3: «the suggestion offered after a turn (for example «explain this command») can put an
 * argument, unmasked, into the suggested message»). The suggestion lives inside the IIFE of `app.js`, which is not importable: as
 * CU-RIGA-02 does, the REAL functions are cut out of the source and run on a fake state, with the real masks. Secrets are FAKE.
 * Red on bb6d3799a: SUGG-01 and SUGG-02 show the secret in the suggested message.
 */
const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

function corpoFunzione(sorgente, nome) {
  const inizio = sorgente.search(new RegExp(`(async )?function ${nome}\\s*\\(`));
  if (inizio === -1) return null;
  const apertura = sorgente.indexOf('{', inizio);
  let livello = 0;
  for (let i = apertura; i < sorgente.length; i += 1) {
    if (sorgente[i] === '{') livello += 1;
    else if (sorgente[i] === '}') { livello -= 1; if (livello === 0) return sorgente.slice(inizio, i + 1); }
  }
  return null;
}

const NOMI = ['tronca', 'argomentiDaMostrare', 'bersaglioAttrezzoNudo', 'suggerimentoDaUltimoAttrezzo'];
function banco(ultimo, ultimaDomanda = '') {
  const fonti = NOMI.map((nome) => corpoFunzione(APP, nome));
  for (const [i, fonte] of fonti.entries()) assert.ok(fonte, `app.js: function ${NOMI[i]} found`);
  const state = { realSession: { ultimoBersaglioAttrezzo: ultimo, ultimaDomanda } };
  const ambiente = { state, tr: (chiave, valori = {}) => `${chiave}: ${Object.values(valori).join(' ')}`, argomentiMascherati, bersaglioDelSuggerimento, bersaglioDellaRicerca, fraseCercata };
  const nomi = Object.keys(ambiente);
  const crea = new Function(...nomi, `${fonti.join('\n')}\nreturn { ${NOMI.join(', ')} };`);
  return crea(...nomi.map((k) => ambiente[k]));
}

const SEGRETO = 'FINTO-' + 'Kq7Zt3Xw9Pl2';
const CHIAVE = 'sk-proj-' + 'FINTO0a1b2c3d4e5f6g7h8i9';

test('SUGG-01: «explain this command» after a shell turn never carries the secret of the command', () => {
  for (const comando of [`export DB_PASSWORD='${SEGRETO}' && ./run.sh`, `curl -H "Authorization: Bearer ${CHIAVE}" https://x.test`, `mysql --password=${SEGRETO} -u root`]) {
    const s = banco({ nome: 'shell', argomenti: { comando } }).suggerimentoDaUltimoAttrezzo();
    assert.ok(s, 'there is a suggestion');
    assert.ok(!s.includes(SEGRETO) && !s.includes(CHIAVE), s);
  }
});

test('SUGG-02: a description, a search and a delegated task with a secret inside are masked too; the honest part stays', () => {
  const s1 = banco({ nome: 'shell', argomenti: { descrizione: `deploy with token=${SEGRETO}`, comando: 'x' } }).suggerimentoDaUltimoAttrezzo();
  assert.ok(!s1.includes(SEGRETO) && s1.includes('deploy with token='), s1);
  const s2 = banco({ nome: 'delega_sottotask', argomenti: { task: `log in with password: ${SEGRETO}` } }).suggerimentoDaUltimoAttrezzo();
  assert.ok(!s2.includes(SEGRETO) && s2.includes('log in with password'), s2);
  const s3 = banco({ nome: 'cerca', argomenti: { testo: `token=${SEGRETO}` } }, `find token=${SEGRETO} in the logs`).suggerimentoDaUltimoAttrezzo();
  assert.ok(s3 === null || !s3.includes(SEGRETO), String(s3));
});

test('SUGG-03: a suggestion with no secret is the same as before', () => {
  assert.equal(banco({ nome: 'shell', argomenti: { comando: 'npm test' } }).suggerimentoDaUltimoAttrezzo(), 'app.suggestion.explainCommand: npm test');
  assert.equal(banco({ nome: 'leggi', argomenti: { percorso: 'src/a.js' } }).suggerimentoDaUltimoAttrezzo(), 'app.suggestion.readMore: src/a.js');
  assert.equal(banco(null).suggerimentoDaUltimoAttrezzo(), null);
});
