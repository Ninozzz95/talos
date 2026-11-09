/*
 * Visto dall'agente delle cure del 03/11 pomeriggio (rapporto CURE-REVISIONE-03-11-POMERIGGIO, «Visto ma non curato») e confermato
 *   nel codice dal Desktop: un comando `shell` che il NUCLEO rifiuta risponde `REFUSED. Nothing was run: …` SENZA l'intestazione
 *   `exit N` (`guardie-attese-e-lavoro.mjs:316`, `messaggioLavoroProtetto`). La regola dello shell leggeva solo il contratto del
 *   comando (`leggiEsitoComando`): niente intestazione ⇒ «non è un esito di comando» ⇒ VERDE, in chat e nel pannello della figlia.
 *   Gli altri attrezzi lo vedono già rosso (`INIZIO_FALLITO`, H-05: REFUSED è un no del nucleo, mai un pallino verde).
 *   Una regola sola per tutte e due le viste: `comandoShellFallito` in `esito-comando.js`.
 *   ⛔ AL CONTRARIO: il no della PERSONA (DECLINED) resta neutro, un comando fermato resta fermato, un comando riuscito resta verde.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { comandoShellFallito, esitoDettoNo } from '../../src/components/esito-comando.js';
import { esitoDaContenuto } from '../../src/components/conversazione-figlia.js';

/* il testo vero del nucleo, copiato dal sorgente (`messaggioLavoroProtetto`), con un file d'esempio */
const RIFIUTATO = 'REFUSED. Nothing was run: `git checkout -- .` would discard changes you did not make in this session — 1 file(s) the person changed and has not committed: a.txt. Do not hide, overwrite or discard the person\'s work.';
const DETTO_NO = 'DECLINED. The person said no to this. Do not ask again for it, by a card or a question, unless the person brings it up.';

test('SHELL-RIF-01 un comando rifiutato dal nucleo, senza intestazione, è un fallimento: mai verde', () => {
  assert.equal(comandoShellFallito(RIFIUTATO), true);
  assert.equal(esitoDaContenuto('shell', RIFIUTATO), 'error', 'il pannello della figlia');
});

test('SHELL-RIF-02 AL CONTRARIO: riuscito, fermato e il no della persona non diventano rossi', () => {
  assert.equal(comandoShellFallito('exit 0\nfatto'), false);
  assert.equal(comandoShellFallito('exit 1\nerrore'), true);
  assert.equal(comandoShellFallito('exit 130\nfermato'), false, 'lo Stop non è un fallimento (02/10)');
  assert.equal(comandoShellFallito('solo testo, nessuna intestazione'), false, 'un testo qualunque non è un esito di comando');
  assert.equal(comandoShellFallito(DETTO_NO), false, 'il no della persona non è un guasto');
  assert.equal(esitoDaContenuto('shell', DETTO_NO), 'declined');
  assert.equal(esitoDaContenuto('shell', 'exit 0\nfatto'), 'success');
});

test('SHELL-RIF-04 il no della persona si legge solo in TESTA: un DECLINED citato dentro un output non lo è (revisione CLI, R2)', () => {
  assert.equal(esitoDettoNo(DETTO_NO), true);
  assert.equal(esitoDettoNo(`  ${DETTO_NO}`), true, 'gli spazi in testa non contano');
  assert.equal(esitoDettoNo(`exit 1\n${DETTO_NO}`), false, 'un comando che stampa la parola non è un no della persona');
  assert.equal(esitoDettoNo(`grep trovato: ${DETTO_NO}`), false);
  assert.equal(comandoShellFallito(`exit 1\n${DETTO_NO}`), true, 'resta il suo fallimento');
});

test('SHELL-RIF-03 la chat usa la stessa regola: nessuna strada dello shell che dica «niente intestazione ⇒ mai rosso»', () => {
  const sorgente = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const inizio = sorgente.indexOf('function esitoAttrezzoFallito(');
  assert.ok(inizio > 0, 'esitoAttrezzoFallito esiste');
  const corpo = sorgente.slice(inizio, sorgente.indexOf('\n  }\n', inizio));
  const ramoShell = corpo.slice(corpo.indexOf("if (nome === 'shell')"));
  assert.match(ramoShell, /return comandoShellFallito\(testo\);/u);
  assert.doesNotMatch(ramoShell, /if \(!esito\.verdetto\) return false/u);
});
