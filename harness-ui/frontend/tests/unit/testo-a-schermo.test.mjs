/*
 * I caratteri che a schermo ingannano (`src/components/testo-a-schermo.js`): la classe del frontend è la STESSA del server
 * (`harness-ui/src/attivita-figlia.mjs`), carattere per carattere; e nessuno dei due sorgenti li porta crudi.
 * 13/10/2026, cura della seconda passata del bugfixer (SECONDA-NOME-03, SECONDA-FILE-01).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CARATTERI_CHE_INGANNANO, CODICI_CHE_INGANNANO, senzaInganni, senzaInganniSuPiuRighe, suUnaRiga } from '../../src/components/testo-a-schermo.js';

const car = (codice) => String.fromCodePoint(codice);
const SERVER = new URL('../../../src/attivita-figlia.mjs', import.meta.url);
const FRONTEND = new URL('../../src/components/testo-a-schermo.js', import.meta.url);
const inganna = (c) => { CARATTERI_CHE_INGANNANO.lastIndex = 0; return CARATTERI_CHE_INGANNANO.test(c); };

test('TESTO-A-SCHERMO-01 — la classe del frontend e quella del server dicono la stessa cosa di ogni carattere (da U+0000 a U+FFFF)', () => {
  const sorgente = readFileSync(SERVER, 'utf8');
  const trovata = sorgente.match(/const CARATTERI_CHE_INGANNANO = \/(.+)\/u;/u);
  assert.ok(trovata, 'la premessa: il server dichiara ancora la sua classe con quel nome');
  const delServer = new RegExp(trovata[1], 'u');
  const diversi = [];
  for (let codice = 0; codice <= 0xFFFF; codice += 1) {
    if (codice >= 0xD800 && codice <= 0xDFFF) continue; // le metà di una coppia surrogata non sono caratteri
    if (delServer.test(car(codice)) !== inganna(car(codice))) diversi.push(`U+${codice.toString(16).toUpperCase().padStart(4, '0')}`);
  }
  assert.deepEqual(diversi, [], 'caratteri su cui le due classi non sono d’accordo');
  // il controllo positivo: la classe non è vuota, e un carattere qualunque non inganna
  assert.equal(inganna(car(0x202E)), true);
  assert.equal(inganna('a'), false);
  assert.equal(inganna(car(0x00E8)), false, 'una lettera accentata non è un controllo');
  assert.equal(CODICI_CHE_INGANNANO.reduce((n, [da, a]) => n + (a - da + 1), 0), 32 + 33 + 1 + 2 + 5 + 4);
});

test('TESTO-A-SCHERMO-02 — `senzaInganni` toglie quei caratteri e lascia il resto com’è; AL CONTRARIO un testo pulito non cambia', () => {
  assert.equal(senzaInganni(`immagini/foto${car(0x202E)}gpj.exe`), 'immagini/fotogpj.exe');
  assert.equal(senzaInganni(`a${car(0x2066)}b${car(0x2069)}c${car(0x200F)}`), 'abc');
  assert.equal(senzaInganni(`riga${car(0x0007)}una`), 'rigauna');
  const pulito = 'Correggi i prezzi — più “virgolette”, è, 日本語, עברית';
  assert.equal(senzaInganni(pulito), pulito, 'lettere di ogni scrittura restano: si tolgono solo i controlli');
  assert.equal(senzaInganni(null), '');
  assert.equal(senzaInganni(12), '');
  // due volte di fila: la classe è «globale», e il suo indice non deve restare a metà
  assert.equal(senzaInganni(`x${car(0x202E)}`), 'x');
  assert.equal(senzaInganni(`${car(0x202E)}x`), 'x');
});

test('TESTO-A-SCHERMO-03 — nessuno dei due sorgenti porta quei caratteri crudi (in un sorgente non si vedono)', () => {
  const versi = CODICI_CHE_INGANNANO.filter(([da]) => da >= 0x061C).flatMap(([da, a]) => Array.from({ length: a - da + 1 }, (_, i) => car(da + i)));
  for (const file of [SERVER, FRONTEND]) {
    const testo = readFileSync(file, 'utf8');
    const crudi = versi.filter((c) => testo.includes(c)).map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase()}`);
    assert.deepEqual(crudi, [], `caratteri che cambiano il verso della scrittura, crudi in ${file.pathname.split('/').at(-1)}`);
  }
});

test('TESTO-A-SCHERMO-04 — `suUnaRiga`: spazi e a capo diventano UNO spazio (non spariscono), poi via i caratteri che ingannano; `senzaInganniSuPiuRighe` tiene a capo e tabulazioni', () => {
  const NL = car(0x0A); const TAB = car(0x09); const CR = car(0x0D);
  assert.equal(suUnaRiga(`Riga uno${NL}${NL}riga   due${TAB}tre`), 'Riga uno riga due tre', 'gli a capo sono controlli: prima diventano spazi');
  assert.equal(suUnaRiga(`  Leggi foto${car(0x202E)}gpj.exe e riassumi  `), 'Leggi fotogpj.exe e riassumi');
  assert.equal(suUnaRiga(`a ${car(0x200F)} b`), 'a b', 'tolto il carattere non restano due spazi');
  assert.equal(suUnaRiga(`${NL}${TAB}  `), '');
  assert.equal(suUnaRiga(null), '');
  // su più righe: la struttura resta
  const consegna = `Sei un agente.${CR}${NL}${TAB}Leggi foto${car(0x202E)}gpj.exe${NL}poi${car(0x0007)} riassumi`;
  assert.equal(senzaInganniSuPiuRighe(consegna), `Sei un agente.${CR}${NL}${TAB}Leggi fotogpj.exe${NL}poi riassumi`);
  assert.equal(senzaInganniSuPiuRighe(undefined), '');
});
