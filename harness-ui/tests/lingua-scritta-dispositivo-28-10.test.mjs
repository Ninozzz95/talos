/*
 * Accordo con il Mobile, 28/10/2026 notte: sul dispositivo la lingua dei messaggi la decide il dispositivo. Il server non carica MAI ELD
 * dove il riconoscitore è spento (`TALOS_HARNESS_UI_TEXT_LANGUAGE`, il profilo del dispositivo), e non lo usa per le richieste che arrivano
 * da un dispositivo collegato: se il dispositivo non sa la lingua, nessuna nota. Sul PC, per i messaggi scritti lì, resta acceso.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.mjs';
import { linguaScrittaDellaRichiesta } from '../src/http-app.mjs';
import { ORIGINE_REMOTA } from '../src/origine-remota.mjs';

const conta = () => { const chiamate = []; return { chiamate, riconosci: async (testo) => { chiamate.push(testo); return 'it'; } }; };

test('LINGUA-DISP-01 — sul PC, un messaggio scritto lì: il server la riconosce', async () => {
  const r = conta();
  assert.equal(await linguaScrittaDellaRichiesta({}, 'leggi il file e dimmi perché fallisce', { riconosci: r.riconosci }), 'it');
  assert.equal(r.chiamate.length, 1);
});

test('LINGUA-DISP-02 — AL CONTRARIO: da un dispositivo collegato il riconoscitore non si chiama nemmeno; spento, nemmeno sul PC', async () => {
  const r = conta();
  assert.equal(await linguaScrittaDellaRichiesta({ [ORIGINE_REMOTA]: { dispositivoId: 'pad' } }, 'leggi il file e dimmi perché fallisce', { riconosci: r.riconosci }), null);
  assert.equal(await linguaScrittaDellaRichiesta({}, 'leggi il file e dimmi perché fallisce', { acceso: false, riconosci: r.riconosci }), null);
  assert.equal(r.chiamate.length, 0, 'ELD non si carica: è la sua memoria che il dispositivo vuole risparmiare');
});

test('LINGUA-DISP-03 — l\'ambiente: acceso di serie; «0», «false», «off», «no» lo spengono', () => {
  const con = (valore) => loadConfig(valore === undefined ? {} : { TALOS_HARNESS_UI_TEXT_LANGUAGE: valore }).riconosciLinguaScritta;
  assert.equal(con(undefined), true);
  for (const v of ['1', 'on', '']) assert.equal(con(v), true, v);
  for (const v of ['0', 'false', 'OFF', 'no']) assert.equal(con(v), false, v);
});

test('LINGUA-DISP-04 — (riverifica blocco 14, S4) il server passa l\'interruttore dalla configurazione alle rotte: guardia sul sorgente di server.mjs', async () => {
  const { readFileSync } = await import('node:fs');
  const sorgente = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /\n\s+riconosciLinguaScritta: config\.riconosciLinguaScritta !== false,/u);
});
